"""/api/v1/registry against the local stack, as each standing role.  py -3.11 deploy/local/verify_registry.py

Needs start.ps1 and seed.py to have run. It makes one throwaway domain and removes it. Each check is
one request and one fact; nothing is reported as passing that was not tried.
"""
import base64
import json
import pathlib
import secrets
import sys
import urllib.error
import urllib.parse
import urllib.request

HERE = pathlib.Path(__file__).parent
ENGINE = 'http://127.0.0.1:28081'
admin = json.loads((HERE / '.credentials.json').read_text())
user = json.loads((HERE / '.accounts.json').read_text())['user']
failed = 0
LAST = {}


def auth(who):
    return 'Basic ' + base64.b64encode(f"{who['username']}:{who['secret']}".encode()).decode()


def call(method, path, who=None, body=None, raw=None):
    headers = {'Accept': 'application/json'}
    if who:
        headers['Authorization'] = auth(who)
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    if data is not None:
        headers['Content-Type'] = 'application/json'
    req = urllib.request.Request(ENGINE + '/api/v1/registry' + path, method=method, headers=headers, data=data)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            LAST['type'] = r.headers.get('content-type', '')
            text = r.read()
            return r.status, (json.loads(text) if text else None)
    except urllib.error.HTTPError as e:
        LAST['type'] = e.headers.get('content-type', '')
        text = e.read()
        try:
            return e.code, json.loads(text) if text else None
        except ValueError:
            return e.code, {'raw': text.decode(errors='replace')}


def check(name, ok, detail=''):
    global failed
    print(('PASS ' if ok else 'FAIL ') + name + ('' if ok else f'  {detail}'))
    failed += not ok


def problem(b, status):
    """The same rules as the Problem contract in ui/src/lib/contract/v1.ts."""
    return (isinstance(b, dict) and isinstance(b.get('type'), str) and b['type'] and isinstance(b.get('title'), str)
            and b['title'] and b.get('status') == status and set(b) <= {'type', 'title', 'status', 'detail', 'fields'})


def purge(domain_id):
    """Removes a domain made by this check. Its DKIM keys are generated at once and block deletion (409
    objectIsLinked, which the facade reports faithfully), so they go first."""
    s, b = call('GET', '/DkimSignature?limit=500', admin)
    for key in (b.get('items', []) if s == 200 else []):
        if key.get('domainId') == domain_id:
            call('DELETE', f"/DkimSignature/{key['id']}", admin)
    accounts = call('GET', '/Account?limit=500&filter=' + urllib.parse.quote(json.dumps({'domainId': domain_id})), admin)
    for acct in (accounts[1].get('items', []) if accounts[0] == 200 else []):
        call('DELETE', f"/Account/{acct['id']}", admin)
    return call('DELETE', f'/Domain/{domain_id}', admin)


# Leftovers from an earlier run that stopped half way
s, b = call('GET', '/Domain?limit=500', admin)
for old in (b.get('items', []) if s == 200 else []):
    if old.get('name', '').startswith('reg-') and old['name'].endswith('.test'):
        purge(old['id'])

# --- who may do what: JMAP decides, the facade passes it on ---
s, b = call('GET', '/Domain')
check('anonymous: 401 problem document', s == 401 and problem(b, 401), (s, b))
s, b = call('GET', '/Domain', user)
check('plain user: cannot list domains (403 problem)', s == 403 and problem(b, 403), (s, b))
s, b = call('POST', '/Domain', user, {'name': f'nope-{secrets.token_hex(3)}.test'})
check('plain user: cannot create a domain (403 problem)', s == 403 and problem(b, 403), (s, b))

# --- routing ---
s, b = call('GET', '/NoSuchObject', admin)
check('unknown object type: 404 unknown-object', s == 404 and problem(b, 404) and b['type'] == 'unknown-object', (s, b))
s, b = call('GET', '/Mailbox', admin)
check('standard JMAP mail type is not here: 404', s == 404 and problem(b, 404), (s, b))
check('errors are application/problem+json', LAST['type'].startswith('application/problem+json'), LAST)
s, b = call('GET', '/Domain/a/b', admin)
check('too many path segments: 404', s == 404 and problem(b, 404), (s, b))
s, b = call('GET', '/Domain/bad%20id', admin)
check('an id with bad characters: 404', s == 404 and problem(b, 404), (s, b))

# --- list parameters ---
for label, query in (('limit=0', '?limit=0'), ('limit=501', '?limit=501'), ('limit=abc', '?limit=abc'),
                     ('position=abc', '?position=abc'), ('filter=notjson', '?filter=notjson'),
                     ('filter=[]', '?filter=%5B%5D')):
    s, b = call('GET', '/Domain' + query, admin)
    check(f'list {label}: 400 problem', s == 400 and problem(b, 400), (s, b))
s, b = call('GET', '/Domain?limit=1', admin)
check('list: items, position, total', s == 200 and isinstance(b.get('items'), list) and b.get('position') == 0
      and isinstance(b.get('total'), int) and len(b['items']) <= 1 and set(b) <= {'items', 'position', 'total'}, (s, b))

# --- sort ---
s, b = call('GET', '/Domain?sort=name&limit=50', admin)
asc = [i.get('name') for i in (b.get('items') or [])] if s == 200 else []
s2, b2 = call('GET', '/Domain?sort=-name&limit=50', admin)
desc = [i.get('name') for i in (b2.get('items') or [])] if s2 == 200 else []
check('sort: ascending and descending are reverses of each other', s == 200 and s2 == 200 and len(asc) > 1 and asc == sorted(asc) and desc == asc[::-1], (asc, desc))
for label, query in (('sort=', '?sort='), ('sort=-', '?sort=-'), ('sort=a b', '?sort=a%20b'), ('sort=__proto__x.y', '?sort=a.b')):
    s, b = call('GET', '/Domain' + query, admin)
    check(f'list {label}: 400 problem', s == 400 and problem(b, 400), (s, b))
s, b = call('GET', '/Domain?sort=noSuchProperty', admin)
check('sort by a property the server cannot sort by: refused with a problem, not a 500', s in (400, 422) and problem(b, s), (s, b))

# --- one throwaway domain, the whole life of a record ---
name = f'reg-{secrets.token_hex(3)}.test'
created = None
try:
    s, b = call('POST', '/Domain', admin, {'name': name, 'description': 'registry check'})
    created = b.get('id') if s == 201 and isinstance(b, dict) else None
    check('create: 201 with the new id', s == 201 and bool(created), (s, b))

    s, b = call('GET', f'/Domain/{created}', admin)
    check('get: the record, with its name', s == 200 and b.get('id') == created and b.get('name') == name, (s, b))

    s, b = call('PATCH', f'/Domain/{created}', admin, {'description': 'changed'})
    check('patch: 200 with the record as it is now', s == 200 and b.get('description') == 'changed' and b.get('id') == created, (s, b))

    s, b = call('PATCH', f'/Domain/{created}', admin, {'description': None})
    check('patch: null clears a nullable value', s == 200 and b.get('description') is None, (s, b))

    s, b = call('GET', '/Domain?filter=' + urllib.parse.quote(json.dumps({'text': name})), admin)
    found = [i for i in (b.get('items') or [])] if s == 200 else []
    check('list with a filter finds it', s == 200 and any(i.get('id') == created for i in found), (s, b))

    s, b = call('POST', '/Domain', admin, {'name': name})
    check('create the same name again: 409 conflict', s == 409 and problem(b, 409), (s, b))

    s, b = call('POST', '/Domain', admin, {'name': 5})
    check('create with a wrong-typed value: refused with a problem', s in (400, 422) and problem(b, s), (s, b))

    s, b = call('POST', '/Domain', admin, raw=b'[1,2]')
    check('create with an array body: 400 invalid-body', s == 400 and b.get('type') == 'invalid-body', (s, b))
    s, b = call('POST', '/Domain', admin, raw=b'{not json')
    check('create with invalid JSON: 400 invalid-body', s == 400 and b.get('type') == 'invalid-body', (s, b))

    s, b = call('PATCH', '/Domain/zzzzzz', admin, {'description': 'x'})
    check('patch a record that is not there: 404', s == 404 and problem(b, 404), (s, b))

    s, b = call('PUT', f'/Domain/{created}', admin, {'name': name})
    check('an unsupported verb: 405', s == 405 and problem(b, 405), (s, b))
finally:
    if created:
        s, b = call('DELETE', f'/Domain/{created}', admin)
        check('delete while DKIM keys exist: 409 objectIsLinked, as the server says', s == 409 and b.get('type') == 'objectIsLinked', (s, b))
        s, b = purge(created)
        check('delete after its keys are gone: 204 with no body', s == 204 and b is None, (s, b))
        s, b = call('GET', f'/Domain/{created}', admin)
        check('after delete: 404', s == 404 and problem(b, 404), (s, b))
        s, b = call('DELETE', f'/Domain/{created}', admin)
        check('delete again: 404', s == 404 and problem(b, 404), (s, b))

# --- a singleton: addressed by its type alone ---
s, b = call('GET', '/AccountSettings', admin)
check('singleton: get without an id', s == 200 and b.get('id') == 'singleton', (s, b))
if s == 200 and isinstance(b, dict):
    same = {k: b[k] for k in ('locale',) if k in b}
    s2, b2 = call('PATCH', '/AccountSettings', admin, same)
    check('singleton: patch the same value back', s2 == 200 and b2.get('id') == 'singleton', (s2, b2))
s, b = call('GET', '/AccountSettings/singleton', admin)
check('singleton: its explicit id works too', s == 200 and b.get('id') == 'singleton', (s, b))
s, b = call('GET', '/AccountSettings/other', admin)
check('singleton: any other id is 404', s == 404 and problem(b, 404), (s, b))
s, b = call('POST', '/AccountSettings', admin, {})
check('singleton: cannot be created (405)', s == 405 and problem(b, 405), (s, b))
s, b = call('DELETE', '/AccountSettings/singleton', admin)
check('singleton: cannot be deleted (405)', s == 405 and problem(b, 405), (s, b))

sys.exit(1 if failed else 0)
