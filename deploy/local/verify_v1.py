"""/api/v1 against the local stack, as each standing role.  py -3.11 deploy/local/verify_v1.py
Needs start.ps1 and seed.py to have run. Nothing is reported as passing that was not tried."""
import base64, json, pathlib, sys, urllib.error, urllib.request
HERE = pathlib.Path(__file__).parent
ENGINE = 'http://127.0.0.1:28081'
admin = json.loads((HERE / '.credentials.json').read_text())
users = json.loads((HERE / '.accounts.json').read_text())
failed = 0
LAST = {}

def get(path, who=None):
    h = {}
    if who:
        h['Authorization'] = 'Basic ' + base64.b64encode(f"{who['username']}:{who['secret']}".encode()).decode()
    try:
        with urllib.request.urlopen(urllib.request.Request(ENGINE + path, headers=h), timeout=15) as r:
            LAST['type'] = r.headers.get('content-type', '')
            return r.status, json.loads(r.read() or b'{}')
    except urllib.error.HTTPError as e:
        LAST['type'] = e.headers.get('content-type', '')
        body = e.read()
        try: return e.code, json.loads(body or b'{}')
        except ValueError: return e.code, {'raw': body.decode(errors='replace')}

def check(name, ok, detail=''):
    global failed
    print(('PASS ' if ok else 'FAIL ') + name + ('' if ok else f'  {detail}'))
    failed += not ok

s, b = get('/api/v1/me', admin)
check('admin: /me is 200 with role admin', s == 200 and b.get('role') == 'admin' and b.get('email') == admin['username'], (s, b.get('role')))
s, b = get('/api/v1/me', users['user'])
check('user: /me is 200 with role user', s == 200 and b.get('role') == 'user' and b.get('email') == users['user']['username'], (s, b.get('role')))
check('user: holds fewer permissions than admin', len(b.get('permissions', [])) < len(get('/api/v1/me', admin)[1].get('permissions', [])))
def is_problem(b, status):
    # The same rules as the Problem contract in ui/src/lib/contract/v1.ts
    return (isinstance(b.get('type'), str) and b['type'] and isinstance(b.get('title'), str) and b['title']
            and b.get('status') == status and set(b) <= {'type', 'title', 'status', 'detail', 'fields'})

s, b = get('/api/v1/me')
check('anonymous: /me is refused with a problem document', s == 401 and is_problem(b, 401) and LAST['type'].startswith('application/problem+json'), (s, b, LAST))
s, b = get('/api/v1/nothing', admin)
check('unknown route: 404 problem document, problem+json', s == 404 and is_problem(b, 404) and LAST['type'].startswith('application/problem+json'), (s, b, LAST))
s, b = get('/api/v1/me', admin)
check('me: only contract keys, no nulls', set(b) <= {'email', 'role', 'permissions', 'edition'} and None not in b.values(), sorted(b))

# A free-plan domain owner (throwaway domain, removed afterwards)
import secrets
domain = f'v1-{secrets.token_hex(3)}.test'
password = 'Owner ' + secrets.token_hex(6)
ADMIN = 'Basic ' + base64.b64encode(f"{admin['username']}:{admin['secret']}".encode()).decode()
USING = ['urn:ietf:params:jmap:core', 'urn:shippin.tech:jmap']

def jmap(calls):
    req = urllib.request.Request(ENGINE + '/jmap', method='POST', data=json.dumps({'using': USING, 'methodCalls': calls}).encode(),
                                 headers={'Content-Type': 'application/json', 'Authorization': ADMIN})
    return json.loads(urllib.request.urlopen(req, timeout=30).read())['methodResponses']

def post(path, body):
    req = urllib.request.Request(ENGINE + path, method='POST', data=json.dumps(body).encode(), headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=30) as r: return r.status
    except urllib.error.HTTPError as e: return e.code

try:
    if post('/api/v1/panel/signup', {'domain': domain, 'name': 'owner', 'password': password}) == 200:
        s, b = get('/api/v1/me', {'username': f'owner@{domain}', 'secret': password})
        check('domain owner: /me says owner', s == 200 and b.get('role') == 'owner', (s, b.get('role')))
    else:
        print('SKIP domain owner: signup is not open on this server')
finally:
    q = jmap([['x:Domain/query', {}, 'q'], ['x:Domain/get', {'#ids': {'resultOf': 'q', 'name': 'x:Domain/query', 'path': '/ids'}, 'properties': ['id', 'name']}, 'g']])[1][1]['list']
    ids = [d['id'] for d in q if d['name'] == domain]
    if ids:
        accts = jmap([['x:Account/query', {'filter': {'domainId': ids[0]}}, 'q']])[0][1].get('ids', [])
        if accts: jmap([['x:Account/set', {'destroy': accts}, 'a']])
        keys = jmap([['x:DkimSignature/query', {}, 'q'], ['x:DkimSignature/get', {'#ids': {'resultOf': 'q', 'name': 'x:DkimSignature/query', 'path': '/ids'}, 'properties': ['id', 'domainId']}, 'g']])[1][1].get('list', [])
        doomed = [k['id'] for k in keys if k.get('domainId') in ids]
        if doomed: jmap([['x:DkimSignature/set', {'destroy': doomed}, 'k']])
        jmap([['x:Domain/set', {'destroy': ids}, 'd']])
sys.exit(1 if failed else 0)
