#!/usr/bin/env python3
"""One command for the gates in REGRESSION.md. Records what ran, against which commit and image.

    python scripts/regression.py                 web gate + live gate (needs the local stack up)
    python scripts/regression.py --engine        also the inherited Rust suite in a Linux container
    python scripts/regression.py --only web      one gate: web, live, engine
    python scripts/regression.py --list          print the steps and exit

Rules it keeps, because REGRESSION.md demands them:
  - A step that could not run says "not-run" with the reason. It is never green.
  - Nothing is retried and no failure is skipped to make a run pass.
  - The report names the commit (and whether the tree was dirty) and the image under test.

Writes roadmap/regression-results.json and REGRESSION-RESULTS.md; full logs go to roadmap/runs/ (git-ignored).
Exit status is 0 only when every step that was selected passed.
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
UI = ROOT / "ui"
OUT_JSON = ROOT / "roadmap" / "regression-results.json"
OUT_MD = ROOT / "REGRESSION-RESULTS.md"
RUNS = ROOT / "roadmap" / "runs"
ENGINE_URL = os.environ.get("ENGINE", "http://127.0.0.1:28081")
WIN = os.name == "nt"
NPM = shutil.which("npm.cmd" if WIN else "npm") or "npm"
NPX = shutil.which("npx.cmd" if WIN else "npx") or "npx"
BASH = shutil.which("bash") or "bash"
PY = sys.executable


@dataclass
class Step:
    id: str
    gate: str  # web | live | engine
    title: str
    argv: list[str]
    cwd: Path = ROOT
    needs_stack: bool = False
    timeout: int = 900
    env: dict[str, str] = field(default_factory=dict)


def web_steps() -> list[Step]:
    n = ["node"]
    return [
        Step("web.brand", "web", "Brand sources valid, generated files current", [*n, "scripts/brand-sync.mjs", "--check"]),
        Step("web.brand-test", "web", "Brand sync tests", [*n, "--test", "scripts/brand-sync.test.mjs"]),
        Step("web.api-coverage", "web", "Every /api route documented", [*n, "scripts/check-api-coverage.mjs"]),
        Step("web.dumb-ui", "web", "UI touches the network only at its edge", [*n, "scripts/check-dumb-ui.mjs"]),
        *[
            Step(f"web.deploy.{t}", "web", f"deploy/{t}.test.sh (fake docker)", [BASH, f"deploy/{t}.test.sh"])
            for t in ("update", "auto-update", "backup", "relay", "host")
        ],
        Step("web.webui-inventory", "web", "Porting inventory", [*n, "scripts/check-webui-inventory.mjs"], UI),
        Step("web.mcpl", "web", "MCPL conformance", [*n, "scripts/check-mcpl.mjs"], UI),
        Step("web.registry", "web", "Registry contracts match the server schema", [NPM, "run", "registry:check"], UI),
        Step("web.lint", "web", "Biome format and lint", [NPM, "run", "lint"], UI),
        Step("web.typecheck", "web", "svelte-check", [NPM, "run", "check"], UI, timeout=900),
        Step("web.unit", "web", "All unit tests", [NPM, "test"], UI),
        Step("web.build", "web", "Static build", [NPM, "run", "build"], UI, timeout=900),
        Step("web.browser", "web", "All mocked browser tests", [NPX, "playwright", "test"], UI, timeout=1500),
    ]


def live_steps() -> list[Step]:
    verifiers = ["verify.py", "verify_account.py", "verify_panel.py", "verify_v1.py", "verify_registry.py", "verify_compat.py"]
    return [
        *[
            Step(f"live.{v[:-3]}", "live", f"deploy/local/{v}", [PY, f"deploy/local/{v}"], needs_stack=True, timeout=900)
            for v in verifiers
        ],
        Step("live.contract", "live", "Contract tests against the engine", [NPM, "run", "test:contract-live"], UI, True, 900),
        Step("live.browser", "live", "All live browser tests", [NPM, "run", "test:live"], UI, True, 3600),
    ]


ENGINE_SCRIPT = (
    "apt-get update -qq && apt-get install -yqq --no-install-recommends clang libclang-dev cmake make "
    "protobuf-compiler pkg-config git perl ca-certificates libssl-dev zlib1g-dev >/dev/null 2>&1; "
    "STORE={store} cargo test -p tests --locked --no-fail-fast -- --test-threads=1 2>&1"
)


def engine_steps() -> list[Step]:
    steps = []
    for store in ("RocksDb", "Sqlite"):
        argv = [
            "docker", "run", "--rm",
            "-e", "CARGO_HOME=/cargo", "-e", "CARGO_TARGET_DIR=/target", "-e", "CARGO_TERM_COLOR=never",
            "-e", "CARGO_INCREMENTAL=0",
            "-v", f"{ROOT}:/src:ro", "-v", "shippin-rust-target:/target", "-v", "shippin-rust-cargo:/cargo",
            "-w", "/src", "rust:slim-trixie", "bash", "-c", ENGINE_SCRIPT.format(store=store),
        ]
        steps.append(Step(f"engine.{store.lower()}", "engine", f"Inherited Rust suite, STORE={store}", argv, timeout=7200,
                          env={"MSYS_NO_PATHCONV": "1"}))
    return steps


def git(*args: str) -> str:
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True).stdout.strip()


def credentials() -> str | None:
    path = ROOT / "deploy" / "local" / ".credentials.json"
    if not path.exists():
        return None
    c = json.loads(path.read_text("utf-8"))
    return "Basic " + base64.b64encode(f"{c['username']}:{c['secret']}".encode()).decode()


def stack_problem() -> str | None:
    """None when the local stack answers a real JMAP request as the administrator, else why not."""
    auth = credentials()
    if not auth:
        return "deploy/local/.credentials.json is missing (run deploy/local/start.ps1)"
    req = urllib.request.Request(f"{ENGINE_URL}/jmap/session", headers={"Authorization": auth})
    try:
        with urllib.request.urlopen(req, timeout=10) as res:
            return None if res.status == 200 else f"the engine answered {res.status}"
    except urllib.error.HTTPError as err:
        return f"the engine answered {err.code}"
    except Exception as err:  # connection refused, timeout
        return f"the engine at {ENGINE_URL} did not answer ({type(err).__name__})"


def image_identity() -> dict:
    def inspect(fmt: str) -> str:
        r = subprocess.run(["docker", "inspect", "shippintech-local-mail-1", "--format", fmt],
                           capture_output=True, text=True, timeout=30)
        return r.stdout.strip() if r.returncode == 0 else ""

    try:
        return {"container": "shippintech-local-mail-1", "name": inspect("{{.Config.Image}}"), "id": inspect("{{.Image}}")}
    except Exception:
        return {"container": "shippintech-local-mail-1", "name": "", "id": ""}


def summarize(step: Step, log: str) -> str:
    """One line of what the step reported, taken from its own output."""
    if step.gate == "engine":
        results = re.findall(r"test result: (\w+)\. (\d+) passed; (\d+) failed; (\d+) ignored", log)
        if results:
            p = sum(int(r[1]) for r in results)
            f = sum(int(r[2]) for r in results)
            i = sum(int(r[3]) for r in results)
            return f"{p} passed, {f} failed, {i} ignored"
    for pattern in (r"(\d+) passed(?:[^\n]*)", r"Tests\s+(\d+ passed[^\n]*)", r"(\d+ checks? passed[^\n]*)",
                    r"PASS[^\n]*", r"ok[^\n]*"):
        m = re.findall(pattern, log)
        if m:
            return str(m[-1]).strip()[:120] if isinstance(m[-1], str) else ""
    lines = [ln for ln in log.strip().splitlines() if ln.strip()]
    return lines[-1].strip()[:120] if lines else ""


def run(step: Step, logdir: Path, stack: str | None) -> dict:
    result = {"id": step.id, "gate": step.gate, "title": step.title}
    if step.needs_stack and stack:
        return {**result, "status": "not-run", "reason": stack, "seconds": 0, "detail": ""}
    if not shutil.which(step.argv[0]) and not Path(step.argv[0]).exists():
        return {**result, "status": "not-run", "reason": f"{step.argv[0]} is not installed", "seconds": 0, "detail": ""}
    started = time.time()
    env = {**os.environ, **step.env}
    try:
        proc = subprocess.run(step.argv, cwd=step.cwd, capture_output=True, text=True, errors="replace",
                              timeout=step.timeout, env=env)
        out, code = proc.stdout + proc.stderr, proc.returncode
        status = "pass" if code == 0 else "fail"
    except subprocess.TimeoutExpired as err:
        raw = (err.stdout or b"") + (err.stderr or b"")
        out = raw.decode("utf-8", "replace") if isinstance(raw, bytes) else raw
        status, code = "fail", -1
        out += f"\n[timed out after {step.timeout}s]"
    seconds = round(time.time() - started, 1)
    log = logdir / f"{step.id}.log"
    log.write_text(out, "utf-8")
    return {**result, "status": status, "exit": code, "seconds": seconds,
            "detail": summarize(step, out), "log": str(log.relative_to(ROOT)).replace("\\", "/")}


def write_reports(meta: dict, results: list[dict]) -> None:
    OUT_JSON.parent.mkdir(exist_ok=True)
    OUT_JSON.write_text(json.dumps({**meta, "steps": results}, indent=1) + "\n", "utf-8", newline="\n")
    count = lambda s: sum(r["status"] == s for r in results)  # noqa: E731
    icon = {"pass": "pass", "fail": "FAIL", "not-run": "not run"}
    md = [
        "# Regression results",
        "",
        "Written by `python scripts/regression.py`; do not edit. Rules: [REGRESSION.md](REGRESSION.md). "
        "A step that could not run is **not run**, never green.",
        "",
        f"- Commit `{meta['commit'][:12]}`{' (working tree had uncommitted changes)' if meta['dirty'] else ''}",
        f"- Image under test: `{meta['image']['name'] or 'not running'}` `{meta['image']['id'][:19]}`",
        f"- Run: {meta['started']} to {meta['finished']}",
        f"- Result: **{count('pass')} passed, {count('fail')} failed, {count('not-run')} not run**",
        "",
        "| Step | Result | Seconds | What it reported |",
        "|---|---|---:|---|",
    ]
    for r in results:
        detail = r.get("reason") if r["status"] == "not-run" else r.get("detail", "")
        md.append(f"| {r['title']} (`{r['id']}`) | {icon[r['status']]} | {r['seconds']} | {str(detail).replace('|', '/')} |")
    md.append("")
    OUT_MD.write_text("\n".join(md), "utf-8", newline="\n")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", choices=["web", "live", "engine"])
    ap.add_argument("--engine", action="store_true", help="include the inherited Rust suite (slow)")
    ap.add_argument("--list", action="store_true")
    args = ap.parse_args()

    steps = [*web_steps(), *live_steps(), *(engine_steps() if (args.engine or args.only == "engine") else [])]
    if args.only:
        steps = [s for s in steps if s.gate == args.only]
    if args.list:
        for s in steps:
            print(f"{s.id:28} {s.gate:7} {s.title}")
        return 0

    stack = stack_problem() if any(s.needs_stack for s in steps) else None
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    logdir = RUNS / stamp
    logdir.mkdir(parents=True, exist_ok=True)
    meta = {
        "commit": git("rev-parse", "HEAD"),
        "dirty": bool(git("status", "--porcelain", "--untracked-files=no")),
        "image": image_identity(),
        "started": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    results = []
    for step in steps:
        print(f"- {step.id} ...", flush=True)
        r = run(step, logdir, stack)
        print(f"  {r['status']} {r.get('detail') or r.get('reason') or ''}", flush=True)
        results.append(r)
    meta["finished"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    write_reports(meta, results)
    bad = [r for r in results if r["status"] != "pass"]
    print(f"\n{len(results) - len(bad)} passed, {sum(r['status'] == 'fail' for r in bad)} failed, "
          f"{sum(r['status'] == 'not-run' for r in bad)} not run. See {OUT_MD.name}.")
    return 0 if not bad else 1


if __name__ == "__main__":
    sys.exit(main())
