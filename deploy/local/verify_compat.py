"""Compatibility checks against the local stack: the surfaces other software already speaks.

Run after start.ps1:  py -3.11 deploy/local/verify_compat.py

Each check is one standard client interaction, read-only, against the engine's test port and the
mapped mail ports. A check that cannot run says SKIP with the reason; nothing is reported as
passing that was not tried. Exit status is 1 if any check fails.
"""
import base64
import http.client
import imaplib
import json
import pathlib
import poplib
import socket
import ssl
import sys
import urllib.error
import urllib.request

HERE = pathlib.Path(__file__).parent
creds = json.loads((HERE / '.credentials.json').read_text())
USER, SECRET = creds['username'], creds['secret']
ENGINE = 'http://127.0.0.1:28081'
HOST = '127.0.0.1'
INSECURE = ssl.create_default_context()
INSECURE.check_hostname = False
INSECURE.verify_mode = ssl.CERT_NONE
AUTH = 'Basic ' + base64.b64encode(f'{USER}:{SECRET}'.encode()).decode()

results = []


def check(name):
    def wrap(fn):
        try:
            note = fn()
            if note and note.startswith('SKIP'):
                results.append(('SKIP', name, note[5:]))
            else:
                results.append(('PASS', name, note or ''))
        except Exception as err:  # noqa: BLE001 - report every failure kind
            results.append(('FAIL', name, f'{type(err).__name__}: {err}'))
        return fn
    return wrap


def http(method, path, headers=None, body=None):
    req = urllib.request.Request(ENGINE + path, data=body, method=method, headers=headers or {})

    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *a, **k):
            return None

    opener = urllib.request.build_opener(NoRedirect)
    try:
        with opener.open(req, timeout=15) as res:
            return res.status, dict(res.headers), res.read()
    except urllib.error.HTTPError as err:
        return err.code, dict(err.headers), err.read()


def get_json(path, headers=None):
    status, _, body = http('GET', path, headers)
    assert status == 200, f'{path} returned {status}'
    return json.loads(body)


@check('health: /healthz/live and /healthz/ready')
def _():
    for p in ('/healthz/live', '/healthz/ready'):
        status, _, _ = http('GET', p)
        assert status == 200, f'{p} returned {status}'


@check('JMAP discovery: /.well-known/jmap redirects to /jmap/session (RFC 8620 2.2)')
def _():
    status, headers, _ = http('GET', '/.well-known/jmap')
    assert status in (301, 302, 307, 308), f'status {status}'
    assert headers.get('Location', headers.get('location', '')).endswith('/jmap/session'), headers


@check('JMAP session with credentials: core, mail, calendars, contacts, a primary mail account')
def _():
    session = get_json('/jmap/session', {'Authorization': AUTH})
    caps = session['capabilities']
    for cap in ('urn:ietf:params:jmap:core', 'urn:ietf:params:jmap:mail',
                'urn:ietf:params:jmap:calendars', 'urn:ietf:params:jmap:contacts'):
        assert cap in caps, f'missing {cap}'
    assert session['primaryAccounts'].get('urn:ietf:params:jmap:mail'), 'no primary mail account'
    assert session['apiUrl'], 'no apiUrl'


@check('JMAP session with no credentials exposes no account')
def _():
    session = get_json('/jmap/session')
    assert not session['accounts'] and not session['primaryAccounts'], 'anonymous session shows accounts'


@check('OAuth 2.0 metadata (RFC 8414): authorization and token endpoints, PKCE S256')
def _():
    doc = get_json('/.well-known/oauth-authorization-server')
    assert doc['authorization_endpoint'] and doc['token_endpoint']
    assert 'S256' in doc.get('code_challenge_methods_supported', []), 'no S256'


@check('OpenID Connect discovery: issuer, authorization and token endpoints')
def _():
    doc = get_json('/.well-known/openid-configuration')
    for key in ('issuer', 'authorization_endpoint', 'token_endpoint'):
        assert doc.get(key), f'missing {key}'


@check('Thunderbird autoconfig: /mail/config-v1.1.xml answers with XML')
def _():
    domain = USER.split('@')[-1] if '@' in USER else 'local.test'
    status, headers, body = http('GET', f'/mail/config-v1.1.xml?emailaddress=probe@{domain}')
    assert status == 200, f'status {status}'
    assert b'<clientConfig' in body, 'not an autoconfig document'


@check('Outlook autodiscover.json (v2) answers for the local domain')
def _():
    domain = USER.split('@')[-1] if '@' in USER else 'local.test'
    status, _, body = http('GET', f'/autodiscover/autodiscover.json?Email=probe@{domain}&Protocol=AutodiscoverV1')
    assert status in (200, 400), f'status {status}'
    json.loads(body or b'{}') if status == 200 else None


@check('CalDAV and CardDAV discovery: /.well-known/caldav and /carddav redirect to /dav')
def _():
    for kind in ('caldav', 'carddav'):
        status, headers, _ = http('GET', f'/.well-known/{kind}')
        assert status in (301, 302, 303, 307, 308), f'{kind} returned {status}'
        assert '/dav' in headers.get('Location', headers.get('location', '')), f'{kind} redirects to {headers}'


@check('WebDAV: PROPFIND /dav/pal/ (principals) returns 207 Multi-Status')
def _():
    body = b'<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>'
    status, _, resp = http('PROPFIND', '/dav/pal/', {'Authorization': AUTH, 'Depth': '0', 'Content-Type': 'application/xml'}, body)
    assert status == 207, f'status {status}'
    assert b'multistatus' in resp, 'not a multistatus'


@check('IMAP over TLS: login, list mailboxes, find INBOX')
def _():
    imap = imaplib.IMAP4_SSL(HOST, 21993, ssl_context=INSECURE, timeout=15)
    try:
        imap.login(USER, SECRET)
        typ, boxes = imap.list()
        assert typ == 'OK' and any(b'INBOX' in b for b in boxes), 'no INBOX'
    finally:
        try:
            imap.logout()
        except Exception:  # noqa: BLE001
            pass


@check('POP3 over TLS: login and STAT')
def _():
    try:
        pop = poplib.POP3_SSL(HOST, 21995, context=INSECURE, timeout=15)
    except OSError as err:
        return f'SKIP port 21995 not reachable ({err}); recreate the mail container to map it'
    try:
        pop.user(USER)
        pop.pass_(SECRET)
        count, _size = pop.stat()
        assert count >= 0
    finally:
        pop.quit()


@check('ManageSieve (RFC 5804): greeting names IMPLEMENTATION and SIEVE')
def _():
    try:
        sock = socket.create_connection((HOST, 21190), timeout=10)
    except OSError as err:
        return f'SKIP port 21190 not reachable ({err}); recreate the mail container to map it'
    with sock:
        greeting = sock.recv(4096).decode('utf-8', 'replace')
    assert 'IMPLEMENTATION' in greeting and 'SIEVE' in greeting, f'greeting: {greeting[:120]!r}'


@check('SMTP submission over implicit TLS (465): AUTH offered')
def _():
    import smtplib
    smtp = smtplib.SMTP_SSL(HOST, 21465, context=INSECURE, timeout=15)
    try:
        smtp.ehlo()
        assert smtp.has_extn('auth'), 'no AUTH'
    finally:
        smtp.close()


@check('SMTP inbound (25): greets and offers STARTTLS')
def _():
    import smtplib
    smtp = smtplib.SMTP(HOST, 21025, timeout=15)
    try:
        smtp.ehlo()
        assert smtp.has_extn('starttls'), 'no STARTTLS on port 25'
    finally:
        smtp.close()


if __name__ == '__main__':
    width = max(len(name) for _, name, _ in results)
    for status, name, note in results:
        print(f'{status:4}  {name.ljust(width)}  {note}'.rstrip())
    failed = [r for r in results if r[0] == 'FAIL']
    print(f'\n{sum(r[0] == "PASS" for r in results)} passed, {len(failed)} failed, '
          f'{sum(r[0] == "SKIP" for r in results)} skipped')
    sys.exit(1 if failed else 0)
