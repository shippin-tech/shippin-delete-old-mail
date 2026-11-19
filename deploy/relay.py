#!/usr/bin/env python3
"""Turn a sender-domain smarthost on or off. Default is direct MX.

    python3 relay.py status
    python3 relay.py apply     # make the server match relay.env
    python3 relay.py enable    # set RELAY=on, then apply
    python3 relay.py disable   # set RELAY=off, then apply (direct MX)

The secret stays in secrets/relay/relay.key. The registry stores that path
(@type File), not the secret. Admin credentials are RELAY_ADMIN or
secrets/relay-admin (one line, address:password) and are never written into
the mail container or the registry.

RELAY_API_BASE, when set, must be http://127.0.0.1[:port] or http://localhost[:port].
"""

from __future__ import annotations

import base64
import json
import os
import re
import stat
import subprocess
import sys
import tempfile
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SECRET_FILE = ROOT / "secrets" / "relay" / "relay.key"
ADMIN_FILE = ROOT / "secrets" / "relay-admin"
CONTAINER_SECRET = "/run/secrets/relay/relay.key"
MAIL_UID = 2000

DOMAIN = re.compile(
    r"^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$"
)
ROUTE_NAME = re.compile(r"^[a-z][a-z0-9-]{0,31}$")
HOST = re.compile(
    r"^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$"
    r"|^(?:\d{1,3}\.){3}\d{1,3}$"
)
USERNAME = re.compile(r"^[A-Za-z0-9._@-]{0,128}$")
API_BASE = re.compile(r"^http://(?:127\.0\.0\.1|localhost)(?::\d+)?$")


class RelayError(Exception):
    pass


def parse_env_file(path: Path) -> dict[str, str]:
    found: dict[str, str] = {}
    if not path.is_file():
        return found
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        if key:
            found[key] = value
    return found


def truthy(value: str | None, default: bool = False) -> bool:
    if value is None or value == "":
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def setting(env: dict[str, str], key: str, default: str = "") -> str:
    if key in os.environ and os.environ[key] != "":
        return os.environ[key]
    return env.get(key, default)


def load_settings() -> dict[str, str]:
    env = parse_env_file(ROOT / "relay.env")
    if not env and (ROOT / "relay.env.example").is_file():
        env = parse_env_file(ROOT / "relay.env.example")
    return env


def write_flag(on: bool) -> None:
    path = ROOT / "relay.env"
    if not path.is_file():
        example = ROOT / "relay.env.example"
        path.write_text(example.read_text(encoding="utf-8") if example.is_file() else "RELAY=off\n", encoding="utf-8")
    lines = path.read_text(encoding="utf-8").splitlines()
    flag = "on" if on else "off"
    replaced = False
    out: list[str] = []
    for line in lines:
        if line.startswith("RELAY="):
            if not replaced:
                out.append(f"RELAY={flag}")
                replaced = True
            continue
        out.append(line)
    if not replaced:
        out.insert(0, f"RELAY={flag}")
    path.write_text("\n".join(out) + "\n", encoding="utf-8")
    os.environ["RELAY"] = flag


def domains_of(raw: str) -> list[str]:
    found: list[str] = []
    for part in raw.split(","):
        name = part.strip().lower().rstrip(".")
        if not name:
            continue
        if not DOMAIN.match(name):
            raise RelayError(f"RELAY_DOMAINS has {part.strip()!r}, which is not a domain name")
        if name not in found:
            found.append(name)
    return found


def checked(env: dict[str, str]) -> dict:
    enabled = truthy(setting(env, "RELAY"), False)
    name = setting(env, "RELAY_NAME", "relay") or "relay"
    if not ROUTE_NAME.match(name):
        raise RelayError("RELAY_NAME must be a short lowercase word (letters, digits, hyphen)")
    host = setting(env, "RELAY_HOST", "")
    port_raw = setting(env, "RELAY_PORT", "465") or "465"
    if not port_raw.isdigit() or not 1 <= int(port_raw) <= 65535:
        raise RelayError("RELAY_PORT must be a port from 1 to 65535")
    port = int(port_raw)
    tls_default = "true" if port == 465 else "false"
    implicit = truthy(setting(env, "RELAY_IMPLICIT_TLS", tls_default), port == 465)
    username = setting(env, "RELAY_USERNAME", "")
    if not USERNAME.match(username):
        raise RelayError("RELAY_USERNAME may contain only letters, digits and . _ @ -")
    domains = domains_of(setting(env, "RELAY_DOMAINS", ""))
    if enabled:
        if not host or not HOST.match(host):
            raise RelayError("RELAY_HOST must be a hostname or IPv4 address when the relay is on")
        if not domains:
            raise RelayError("RELAY_DOMAINS must name at least one sender domain when the relay is on")
        if username and not SECRET_FILE.is_file():
            raise RelayError(
                f"Paste the smarthost secret into {SECRET_FILE} (one line, mode 400, owner uid {MAIL_UID}), then run this again"
            )
        if username:
            check_secret_file()
    return {
        "enabled": enabled,
        "name": name,
        "host": host,
        "port": port,
        "implicit": implicit,
        "username": username,
        "domains": domains,
    }


def check_secret_file() -> None:
    if not SECRET_FILE.is_file():
        raise RelayError(f"missing {SECRET_FILE}")
    info = SECRET_FILE.stat()
    if info.st_mode & (stat.S_IRWXG | stat.S_IRWXO):
        raise RelayError(f"{SECRET_FILE} is readable by someone other than its owner; chmod 400")
    if SECRET_FILE.read_text(encoding="utf-8").strip() == "":
        raise RelayError(f"{SECRET_FILE} is empty")
    # RELAY_ASSUME_SECRET_READY is for the repo's fake-curl test, where this
    # process is not uid 2000. A real host should run the command as root.
    if os.environ.get("RELAY_ASSUME_SECRET_READY") == "1":
        return
    if os.geteuid() == 0:
        os.chown(SECRET_FILE, MAIL_UID, MAIL_UID)
        os.chmod(SECRET_FILE, 0o400)
        os.chmod(SECRET_FILE.parent, 0o755)
        return
    if info.st_uid != MAIL_UID:
        raise RelayError(
            f"{SECRET_FILE} must be owned by uid {MAIL_UID} so the mail process can read it (run this as root)"
        )


def quote_expr(name: str) -> str:
    return "'" + name.replace("'", "") + "'"


def sender_rule(domains: list[str], route: str) -> dict[str, str]:
    clause = " || ".join(f"sender_domain == {quote_expr(name)}" for name in domains)
    return {"if": clause, "then": quote_expr(route)}


def match_list(route: dict) -> list[dict]:
    raw = route.get("match") if isinstance(route, dict) else None
    if not isinstance(raw, dict):
        return []
    items = []
    for key in sorted(raw, key=lambda item: int(item) if str(item).isdigit() else 1_000_000):
        entry = raw[key]
        if isinstance(entry, dict) and "if" in entry and "then" in entry:
            items.append({"if": str(entry["if"]), "then": str(entry["then"])})
    return items


def is_local(rule: dict) -> bool:
    return "is_local_domain(rcpt_domain)" in rule.get("if", "") and rule.get("then") in {"'local'", "local"}


def points_at(rule: dict, route: str) -> bool:
    return rule.get("then") in {quote_expr(route), route}


def strategy_route(existing: dict | None, cfg: dict) -> dict:
    current = existing if isinstance(existing, dict) else {}
    rules = [rule for rule in match_list(current) if not points_at(rule, cfg["name"])]
    else_value = current.get("else") if isinstance(current.get("else"), str) and current.get("else") else "'mx'"
    if cfg["enabled"]:
        relay = sender_rule(cfg["domains"], cfg["name"])
        if not any(is_local(rule) for rule in rules):
            rules.insert(0, {"if": "is_local_domain(rcpt_domain)", "then": "'local'"})
        insert_at = 0
        for index, rule in enumerate(rules):
            if is_local(rule):
                insert_at = index + 1
        rules.insert(insert_at, relay)
    match = {str(index): rule for index, rule in enumerate(rules)}
    return {"match": match, "else": else_value}


def route_body(cfg: dict, include_name: bool) -> dict:
    body: dict = {
        "@type": "Relay",
        "address": cfg["host"],
        "port": cfg["port"],
        "protocol": "smtp",
        "implicitTls": cfg["implicit"],
        "allowInvalidCerts": False,
        "description": "Smarthost for the sender domains in relay.env. Other mail uses MX.",
    }
    if include_name:
        body["name"] = cfg["name"]
    if cfg["username"]:
        body["authUsername"] = cfg["username"]
        body["authSecret"] = {"@type": "File", "filePath": CONTAINER_SECRET}
    else:
        body["authUsername"] = None
        body["authSecret"] = {"@type": "None"}
    return body


def redact(value):
    if isinstance(value, dict):
        return {key: ("***" if key == "secret" else redact(item)) for key, item in value.items()}
    if isinstance(value, list):
        return [redact(item) for item in value]
    return value


def server_env() -> dict[str, str]:
    return parse_env_file(ROOT / "server.env")


def api_base() -> str:
    override = os.environ.get("RELAY_API_BASE", "").strip()
    if override:
        if not API_BASE.match(override):
            raise RelayError("RELAY_API_BASE must be http://127.0.0.1[:port] or http://localhost[:port]")
        return override.rstrip("/")
    env = server_env()
    port = env.get("HTTP_HOST_PORT") or "8080"
    if not port.isdigit():
        raise RelayError("HTTP_HOST_PORT in server.env is not a port")
    return f"http://127.0.0.1:{port}"


def credentials() -> tuple[str, str]:
    raw = os.environ.get("RELAY_ADMIN", "").strip()
    if not raw and ADMIN_FILE.is_file():
        raw = ADMIN_FILE.read_text(encoding="utf-8").strip()
    if ":" not in raw:
        raise RelayError(
            "Set RELAY_ADMIN to address:password for this command, or write that one line in "
            f"{ADMIN_FILE} (mode 600). That file is not mounted into the mail container."
        )
    user, password = raw.split(":", 1)
    if not user or not password or "\n" in password or "\r" in password:
        raise RelayError("RELAY_ADMIN must be one line, address:password")
    return user, password


def curl(method: str, path: str, body: dict | None = None) -> tuple[int, object]:
    user, password = credentials()
    token = base64.b64encode(f"{user}:{password}".encode()).decode()
    url = api_base() + path
    with tempfile.TemporaryDirectory(prefix="relay-") as tmp:
        folder = Path(tmp)
        config = folder / "curl.cfg"
        header = "Authorization: Basic " + token
        config.write_text('header = "' + header.replace("\\", "\\\\").replace('"', '\\"') + '"\n', encoding="utf-8")
        os.chmod(config, 0o600)
        cmd = [
            "curl",
            "-sS",
            "--proto",
            "=http",
            "--max-redirs",
            "0",
            "-w",
            "\n%{http_code}",
            "-X",
            method,
            "-H",
            "Accept: application/json",
            "--config",
            str(config),
            url,
        ]
        if body is not None:
            payload = folder / "body.json"
            payload.write_text(json.dumps(body), encoding="utf-8")
            cmd[1:1] = ["-H", "Content-Type: application/json", "--data-binary", f"@{payload}"]
        try:
            completed = subprocess.run(cmd, check=False, capture_output=True, text=True)
        except FileNotFoundError as exc:
            raise RelayError("curl is not installed") from exc
    if completed.returncode != 0:
        detail = (completed.stderr or completed.stdout or "curl failed").strip()
        raise RelayError(detail)
    text = completed.stdout.rstrip("\n")
    if "\n" not in text:
        raise RelayError("the registry did not answer")
    payload, _, code_text = text.rpartition("\n")
    try:
        code = int(code_text)
    except ValueError as exc:
        raise RelayError("the registry did not answer") from exc
    if payload.strip() == "":
        parsed: object = None
    else:
        try:
            parsed = json.loads(payload)
        except json.JSONDecodeError:
            parsed = {"raw": payload[:500]}
    if code >= 400:
        raise RelayError(f"HTTP {code} {method} {path}: {json.dumps(redact(parsed))}")
    return code, parsed


def list_routes() -> list[dict]:
    items: list[dict] = []
    position = 0
    while True:
        _, body = curl("GET", f"/api/v1/registry/MtaRoute?limit=500&position={position}")
        if not isinstance(body, dict):
            raise RelayError("route list was not an object")
        page = body.get("items") or []
        if not isinstance(page, list):
            raise RelayError("route list had no items")
        items.extend(item for item in page if isinstance(item, dict))
        total = body.get("total")
        position += len(page)
        if not page or not isinstance(total, int) or position >= total:
            return items


def find_route(items: list[dict], name: str) -> dict | None:
    for item in items:
        if item.get("name") == name:
            return item
    return None


def get_strategy() -> dict:
    _, body = curl("GET", "/api/v1/registry/MtaOutboundStrategy")
    if not isinstance(body, dict):
        raise RelayError("outbound strategy was not an object")
    return body


def apply_route(cfg: dict, current: dict | None) -> str:
    if current and current.get("@type") not in (None, "Relay"):
        raise RelayError(
            f"a route named {cfg['name']} already exists as {current.get('@type')}. "
            "Choose another RELAY_NAME, or remove that route in the registry first."
        )
    if current is None:
        code, created = curl("POST", "/api/v1/registry/MtaRoute", route_body(cfg, True))
        if code not in (200, 201):
            raise RelayError(f"creating the route returned HTTP {code}")
        if isinstance(created, dict) and created.get("id"):
            return str(created["id"])
        found = find_route(list_routes(), cfg["name"])
        if not found:
            raise RelayError("the route was created but has no id")
        return str(found["id"])
    route_id = str(current["id"])
    curl("PATCH", "/api/v1/registry/MtaRoute/" + urllib.parse.quote(route_id), route_body(cfg, False))
    return route_id


def apply_strategy(cfg: dict, strategy: dict) -> None:
    updated = strategy_route(strategy.get("route") if isinstance(strategy.get("route"), dict) else None, cfg)
    curl("PATCH", "/api/v1/registry/MtaOutboundStrategy", {"route": updated})


def delete_route(current: dict | None) -> None:
    if not current or not current.get("id"):
        return
    curl("DELETE", "/api/v1/registry/MtaRoute/" + urllib.parse.quote(str(current["id"])))


def describe(cfg: dict, strategy: dict, routes: list[dict]) -> str:
    route = find_route(routes, cfg["name"])
    rules = match_list(strategy.get("route") if isinstance(strategy.get("route"), dict) else {})
    relay_rules = [rule["if"] for rule in rules if points_at(rule, cfg["name"])]
    else_value = (strategy.get("route") or {}).get("else") if isinstance(strategy.get("route"), dict) else None
    lines = [
        f"relay.env: {'on' if cfg['enabled'] else 'off'}",
        f"route {cfg['name']}: "
        + (
            "absent"
            if route is None
            else f"present type={route.get('@type')} host={route.get('address')} port={route.get('port')} "
            f"implicitTls={route.get('implicitTls')} auth={auth_kind(route)}"
        ),
        "strategy: "
        + (
            "no sender-domain rule for this route"
            if not relay_rules
            else "sender rule " + " ; ".join(relay_rules)
        )
        + f"; else {else_value}",
    ]
    return "\n".join(lines)


def auth_kind(route: dict) -> str:
    secret = route.get("authSecret")
    if not isinstance(secret, dict):
        return "none"
    kind = secret.get("@type") or "none"
    if kind == "File":
        return "file"
    if kind == "EnvironmentVariable":
        return "env"
    if kind == "Value":
        return "inline"
    return kind


def status(cfg: dict) -> None:
    strategy = get_strategy()
    routes = list_routes()
    print(describe(cfg, strategy, routes))


def apply_settings(cfg: dict) -> None:
    strategy = get_strategy()
    current = find_route(list_routes(), cfg["name"])
    if cfg["enabled"]:
        apply_route(cfg, current)
        apply_strategy(cfg, strategy)
        print(f"relay on: sender domains {', '.join(cfg['domains'])} use {cfg['name']} ({cfg['host']}:{cfg['port']})")
        print("other remote mail stays on MX")
    else:
        apply_strategy(cfg, strategy)
        delete_route(current)
        print("relay off: remote mail uses MX")


def lenient(env: dict[str, str]) -> dict:
    name = setting(env, "RELAY_NAME", "relay") or "relay"
    if not ROUTE_NAME.match(name):
        raise RelayError("RELAY_NAME must be a short lowercase word (letters, digits, hyphen)")
    port_raw = setting(env, "RELAY_PORT", "465") or "465"
    port = int(port_raw) if port_raw.isdigit() else 465
    return {
        "enabled": truthy(setting(env, "RELAY"), False),
        "name": name,
        "host": setting(env, "RELAY_HOST", ""),
        "port": port,
        "implicit": truthy(setting(env, "RELAY_IMPLICIT_TLS", "true"), True),
        "username": setting(env, "RELAY_USERNAME", ""),
        "domains": domains_of(setting(env, "RELAY_DOMAINS", "")) if setting(env, "RELAY_DOMAINS", "") else [],
    }


def main(argv: list[str]) -> int:
    command = argv[1] if len(argv) > 1 else "status"
    if command in {"-h", "--help", "help"}:
        print(__doc__)
        return 0
    if command not in {"status", "apply", "enable", "disable"}:
        print(__doc__, file=sys.stderr)
        return 2
    try:
        if command == "enable":
            os.environ["RELAY"] = "on"
        if command == "disable":
            os.environ["RELAY"] = "off"
        env = load_settings()
        if command == "status":
            status(lenient(env))
            return 0
        cfg = checked(env)
        apply_settings(cfg)
        if command == "enable":
            write_flag(True)
        elif command == "disable":
            write_flag(False)
        return 0
    except RelayError as exc:
        print(f"relay: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
