#!/usr/bin/env bash
# relay.sh against a fake curl: the secret stays in the key file, the registry
# hears a file path, and disable returns to direct MX without dropping other rules.
# Run: bash deploy/relay.test.sh
set -euo pipefail
src=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT
cp "$src/relay.sh" "$src/relay.py" "$src/relay.env.example" "$work/"
cd "$work"
mkdir -p bin secrets/relay state
export PATH="$work/bin:$PATH" FAKE="$work/state"
export RELAY_API_BASE=http://127.0.0.1:9
export RELAY_ADMIN='owner@example.com:admin-password-value'
export RELAY_ASSUME_SECRET_READY=1
printf 'super-secret-value\n' > secrets/relay/relay.key
chmod 400 secrets/relay/relay.key

cat > bin/curl <<'EOF'
#!/usr/bin/env python3
import json, os, sys
from pathlib import Path
fake = Path(os.environ["FAKE"])
args = sys.argv[1:]
log = fake / "calls"
with log.open("a", encoding="utf-8") as fh:
    fh.write(" ".join(args) + "\n")
method, url, data = "GET", "", None
i = 0
while i < len(args):
    arg = args[i]
    if arg == "-X" and i + 1 < len(args):
        method = args[i + 1]
        i += 2
        continue
    if arg == "--data-binary" and i + 1 < len(args):
        spec = args[i + 1]
        data = Path(spec[1:]).read_text(encoding="utf-8") if spec.startswith("@") else spec
        with log.open("a", encoding="utf-8") as fh:
            fh.write("BODY " + data + "\n")
        i += 2
        continue
    if arg.startswith("http://"):
        url = arg
    i += 1
state_path = fake / "state.json"
state = json.loads(state_path.read_text(encoding="utf-8"))
path = url.split("://", 1)[-1]
path = path[path.find("/") :]
status = 200
if method == "GET" and path.startswith("/api/v1/registry/MtaRoute"):
    body = {"items": state["routes"], "position": 0, "total": len(state["routes"])}
elif method == "GET" and path.startswith("/api/v1/registry/MtaOutboundStrategy"):
    body = state["strategy"]
elif method == "POST" and path.startswith("/api/v1/registry/MtaRoute"):
    created = json.loads(data)
    created["id"] = "route1"
    state["routes"].append(created)
    body, status = created, 201
elif method == "PATCH" and path.startswith("/api/v1/registry/MtaOutboundStrategy"):
    state["strategy"]["route"] = json.loads(data)["route"]
    body = state["strategy"]
elif method == "PATCH" and "/api/v1/registry/MtaRoute/" in path:
    body = {"id": path.rsplit("/", 1)[-1]}
elif method == "DELETE" and "/api/v1/registry/MtaRoute/" in path:
    route_id = path.rsplit("/", 1)[-1]
    state["routes"] = [item for item in state["routes"] if item.get("id") != route_id]
    body, status = None, 204
else:
    body, status = {"type": "not-found"}, 404
state_path.write_text(json.dumps(state), encoding="utf-8")
if body is not None:
    sys.stdout.write(json.dumps(body))
sys.stdout.write("\n%d\n" % status)
EOF
chmod +x bin/curl

python3 - <<'PY' > state/state.json
import json, sys
json.dump({
  "routes": [
    {"id": "mx1", "@type": "Mx", "name": "mx"},
    {"id": "loc1", "@type": "Local", "name": "local"},
  ],
  "strategy": {
    "id": "singleton",
    "route": {
      "match": {
        "0": {"if": "is_local_domain(rcpt_domain)", "then": "'local'"},
        "1": {"if": "sender_domain == 'other.test'", "then": "'other-relay'"},
      },
      "else": "'mx'",
    },
  },
}, sys.stdout)
PY

expect() { if [[ "$2" == *"$1"* ]]; then echo "ok   $3"; else echo "FAIL $3"; printf '%s\n' "$2"; exit 1; fi; }
refute() { if [[ "$2" != *"$1"* ]]; then echo "ok   $3"; else echo "FAIL $3 (found $1)"; printf '%s\n' "$2"; exit 1; fi; }

example=$(cat relay.env.example)
expect "RELAY=off" "$example" "the example relay is off"
refute "re_" "$example" "the example has no provider key"
refute "smtp.resend.com" "$(grep -v '^#' relay.env.example || true)" "Resend is a comment, not a live setting"

: > state/calls
set +e
out=$(RELAY_DOMAINS="example.com' || true" bash relay.sh enable 2>&1)
rc=$?
set -e
[[ "$rc" -ne 0 ]] && echo "ok   a quote in a domain is refused" || { echo "FAIL domain injection was accepted"; exit 1; }
[[ ! -s state/calls ]] && echo "ok   a refused domain never calls the registry" || { echo "FAIL curl ran"; cat state/calls; exit 1; }

: > state/calls
set +e
out=$(RELAY_API_BASE=https://example.com bash relay.sh status 2>&1)
rc=$?
set -e
[[ "$rc" -ne 0 ]] && echo "ok   the registry URL stays on loopback" || { echo "FAIL remote base was accepted: $out"; exit 1; }
[[ ! -s state/calls ]] && echo "ok   a remote base never calls curl" || { echo FAIL; exit 1; }

cat > relay.env <<'EOF'
RELAY=off
RELAY_DOMAINS=example.com,notify.example.com
RELAY_HOST=smtp.resend.com
RELAY_PORT=465
RELAY_IMPLICIT_TLS=true
RELAY_USERNAME=resend
RELAY_NAME=relay
EOF

chmod 644 secrets/relay/relay.key
: > state/calls
set +e
out=$(bash relay.sh enable 2>&1)
rc=$?
set -e
[[ "$rc" -ne 0 ]] && echo "ok   a group-readable key is refused" || { echo "FAIL open key was accepted: $out"; exit 1; }
refute "BODY" "$(cat state/calls 2>/dev/null || true)" "a refused key is not sent"
chmod 400 secrets/relay/relay.key

: > state/calls
out=$(bash relay.sh enable 2>&1)
expect "relay on" "$out" "enable reports the relay"
expect "example.com" "$out" "enable names the sender domain"
expect "RELAY=on" "$(cat relay.env)" "enable records RELAY=on after the server accepts it"
log=$(cat state/calls)
expect "BODY" "$log" "enable writes a registry body"
expect '"@type": "File"' "$log" "the secret is a file reference"
expect '/run/secrets/relay/relay.key' "$log" "the file path is the container path"
expect "sender_domain == 'example.com'" "$log" "the strategy is scoped to the sender domain"
expect "sender_domain == 'notify.example.com'" "$log" "a second sender domain is included"
expect "'other-relay'" "$log" "an unrelated route rule is kept"
expect "is_local_domain(rcpt_domain)" "$log" "local delivery stays first"
refute "super-secret-value" "$log" "the provider key is not in the request"
refute "admin-password-value" "$log" "the admin password is not in the request"
posts=$(grep -c 'POST' <<<"$(grep ' -X POST ' state/calls || true)")
[[ "$posts" -eq 1 ]] && echo "ok   one route is created" || { echo "FAIL POST count $posts"; exit 1; }

: > state/calls
bash relay.sh apply >/dev/null
posts=$(grep -c -- '-X POST' state/calls || true)
[[ "$posts" -eq 0 ]] && echo "ok   applying twice updates the route" || { echo "FAIL second apply created again"; cat state/calls; exit 1; }
expect '"@type": "File"' "$(cat state/calls)" "the update still stores a file path"

out=$(bash relay.sh disable 2>&1)
expect "relay off" "$out" "disable reports direct MX"
expect "RELAY=off" "$(cat relay.env)" "disable records RELAY=off"
python3 - <<'PY'
import json
state = json.load(open("state/state.json"))
names = [item.get("name") for item in state["routes"]]
assert "relay" not in names, names
assert "mx" in names and "local" in names, names
rules = list(state["strategy"]["route"]["match"].values())
assert all(rule["then"] != "'relay'" for rule in rules), rules
assert any(rule["then"] == "'other-relay'" for rule in rules), rules
assert any("is_local_domain" in rule["if"] for rule in rules), rules
assert state["strategy"]["route"]["else"] == "'mx'"
print("ok   disable leaves MX, local, and the unrelated rule")
PY

out=$(bash relay.sh status 2>&1)
expect "relay.env: off" "$out" "status shows the file is off"
expect "absent" "$out" "status shows the route is gone"
refute "super-secret-value" "$out" "status does not print the key"

echo "relay.sh: all checks passed"
