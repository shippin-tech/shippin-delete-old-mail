"""Create the standing test accounts on the local stack (safe to run again).

Run after start.ps1:  py -3.11 deploy/local/seed.py

Accounts, all on the local test domain:
  admin  - the administrator made at first setup (read from .credentials.json, not changed)
  user   - a plain mailbox: mail, calendar, contacts, files, its own password and app passwords
  second - a second plain mailbox, to try sharing and delivery between two people

Passwords are generated once and kept in deploy/local/.accounts.json (ignored by git). Running
again keeps the same accounts and passwords. Use these to try every screen as the person who will
use it; verify_account.py and verify_panel.py make and remove their own throwaway domains.
"""
import base64
import json
import pathlib
import secrets
import urllib.error
import urllib.request

HERE = pathlib.Path(__file__).parent
ENGINE = 'http://127.0.0.1:28081'
USING = ['urn:ietf:params:jmap:core', 'urn:shippin.tech:jmap']
admin = json.loads((HERE / '.credentials.json').read_text())
DOMAIN = admin['username'].split('@')[-1]
STORE = HERE / '.accounts.json'
AUTH = 'Basic ' + base64.b64encode(f"{admin['username']}:{admin['secret']}".encode()).decode()


def jmap(calls):
    req = urllib.request.Request(
        ENGINE + '/jmap', method='POST',
        headers={'Content-Type': 'application/json', 'Authorization': AUTH},
        data=json.dumps({'using': USING, 'methodCalls': calls}).encode())
    try:
        with urllib.request.urlopen(req, timeout=60) as res:
            return json.loads(res.read())['methodResponses']
    except urllib.error.HTTPError as err:
        raise SystemExit(f'JMAP call failed: {err.code} {err.read().decode(errors="replace")[:300]}')


def domain_id():
    out = jmap([['x:Domain/query', {}, 'q'],
                ['x:Domain/get', {'#ids': {'resultOf': 'q', 'name': 'x:Domain/query', 'path': '/ids'},
                                  'properties': ['id', 'name']}, 'g']])[1][1]['list']
    for d in out:
        if d['name'] == DOMAIN:
            return d['id']
    raise SystemExit(f'domain {DOMAIN} not found; run start.ps1 first')


def existing_names(did):
    out = jmap([['x:Account/query', {'filter': {'domainId': did}}, 'q'],
                ['x:Account/get', {'#ids': {'resultOf': 'q', 'name': 'x:Account/query', 'path': '/ids'},
                                   'properties': ['id', 'name']}, 'g']])[1][1]['list']
    return {a['name'] for a in out}


def main():
    accounts = json.loads(STORE.read_text()) if STORE.exists() else {}
    did = domain_id()
    have = existing_names(did)
    for name in ('user', 'second'):
        if name in have and name in accounts:
            print(f'keep   {name}@{DOMAIN}')
            continue
        if name in have:
            raise SystemExit(f'{name}@{DOMAIN} exists but its password is not in {STORE.name}; remove the account and rerun')
        password = 'Test ' + secrets.token_hex(8)
        result = jmap([['x:Account/set', {'create': {'a': {
            '@type': 'User', 'name': name, 'domainId': did,
            'credentials': {'0': {'@type': 'Password', 'secret': password}},
            'description': 'Standing test account',
        }}}, 'c']])[0][1]
        if 'a' not in (result.get('created') or {}):
            raise SystemExit(f'could not create {name}: {result.get("notCreated")}')
        accounts[name] = {'username': f'{name}@{DOMAIN}', 'secret': password}
        STORE.write_text(json.dumps(accounts, indent=2))
        print(f'create {name}@{DOMAIN}')
    STORE.write_text(json.dumps(accounts, indent=2))
    print(f'\nadministrator: {admin["username"]} (deploy/local/.credentials.json)')
    print(f'users:         {", ".join(a["username"] for a in accounts.values())} (deploy/local/.accounts.json)')


main()
