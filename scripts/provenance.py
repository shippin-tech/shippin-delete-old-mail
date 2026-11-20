#!/usr/bin/env python3
"""Stage 0 of the independent-engine plan: an inventory of what is inherited and what is ours.

Source of truth is git. The baseline is the initial commit (the tree this fork started from).
Every tracked text file is one of:
  inherited-unchanged  present at the baseline, not touched since
  claimed-own          present at the baseline, and listed in provenance/own-paths.txt by the owner
  inherited-modified   present at the baseline, edited since (lines added and removed are counted)
  added                not in the baseline; written or imported after it
and every dependency in Cargo.lock is one of: workspace member, registry crate, or git source.

This is a measurement, not a judgement of independence. Lines in an inherited-modified file that
were not touched are still inherited. "Added" says when a file arrived, not who wrote it; the
platform/ tree was imported from the owner's other project and is reported on its own.

Usage:  python scripts/provenance.py     writes PROVENANCE.md and provenance/*.csv

The output names the commit it measured. It is regenerated on request, not on every commit,
because every commit changes the counts.
"""

from __future__ import annotations

import csv
import fnmatch
import io
import json
import subprocess
import sys
import threading
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_MD = ROOT / "PROVENANCE.md"
OUT_DIR = ROOT / "provenance"
SKIP_NAMES = {"Cargo.lock", "package-lock.json", "pnpm-lock.yaml"}
IMPORTED_AREAS = {"platform"}  # arrived from a separate project; see platform/ABSORPTION.md
UPSTREAM_MARKERS = ("stalwart",)


def git(*args: str, text: bool = True) -> str | bytes:
    out = subprocess.run(["git", *args], cwd=ROOT, check=True, capture_output=True)
    return out.stdout.decode("utf-8", "replace") if text else out.stdout


def baseline() -> str:
    return str(git("rev-list", "--max-parents=0", "HEAD")).split()[0]


def area_of(path: str) -> str:
    parts = path.split("/")
    if parts[0] == "crates" and len(parts) > 2:
        return f"crates/{parts[1]}"
    return parts[0] if len(parts) > 1 else "(root)"


def head_blobs() -> dict[str, tuple[int, bool]]:
    """path -> (line count, is_text) for every tracked file at HEAD, read in one batch."""
    listing = str(git("ls-tree", "-r", "-z", "HEAD")).split("\0")
    entries = []
    for row in listing:
        if not row:
            continue
        meta, path = row.split("\t", 1)
        mode, kind, sha = meta.split()
        if kind == "blob" and mode != "160000":
            entries.append((path, sha))
    proc = subprocess.Popen(
        ["git", "cat-file", "--batch"], cwd=ROOT, stdin=subprocess.PIPE, stdout=subprocess.PIPE
    )
    assert proc.stdin and proc.stdout
    feed = "".join(f"{sha}\n" for _, sha in entries).encode()
    stdin = proc.stdin

    def push() -> None:  # a thread: the output must be read while the input is still being written
        stdin.write(feed)
        stdin.close()

    threading.Thread(target=push, daemon=True).start()
    result: dict[str, tuple[int, bool]] = {}
    for path, _ in entries:
        header = proc.stdout.readline().split()
        size = int(header[2])
        data = proc.stdout.read(size)
        proc.stdout.read(1)
        is_text = b"\0" not in data[:8000]
        result[path] = (data.count(b"\n") + (1 if data and not data.endswith(b"\n") else 0), is_text)
    proc.wait()
    return result


def file_status(base: str) -> tuple[set[str], dict[str, tuple[int, int]]]:
    """(paths present at the baseline, path -> (added, removed) lines changed since)."""
    base_paths = {p for p in str(git("ls-tree", "-r", "--name-only", "-z", base)).split("\0") if p}
    changed: dict[str, tuple[int, int]] = {}
    for row in str(git("diff", "--numstat", "-z", "--no-renames", base, "HEAD")).split("\0"):
        if not row:
            continue
        added, removed, path = row.split("\t", 2)
        if added == "-":
            continue
        changed[path] = (int(added), int(removed))
    return base_paths, changed


CLAIMS = ROOT / "provenance" / "own-paths.txt"


def claim_rules() -> list[str]:
    """Glob patterns the owner has confirmed as their own work that already existed at the baseline.

    The baseline is a squashed first commit that contains product code, so git cannot tell what
    was written before it. Only the owner can; this file is where they say so, one pattern a line.
    """
    if not CLAIMS.exists():
        return []
    lines = (ln.strip() for ln in CLAIMS.read_text("utf-8").splitlines())
    return [ln for ln in lines if ln and not ln.startswith("#")]


def measure() -> tuple[list[dict], dict]:
    rules = claim_rules()

    def claimed(path: str) -> bool:
        return any(fnmatch.fnmatchcase(path, rule) for rule in rules)

    base = baseline()
    blobs = head_blobs()
    base_paths, changed = file_status(base)
    areas: dict[str, Counter] = defaultdict(Counter)
    files: list[dict] = []
    for path, (lines, is_text) in sorted(blobs.items()):
        if not is_text or Path(path).name in SKIP_NAMES:
            continue
        area = area_of(path)
        if path not in base_paths:
            status, ours = "added", lines
        elif claimed(path):
            status, ours = "claimed-own", lines
        elif path in changed:
            status, ours = "inherited-modified", min(changed[path][0], lines)
        else:
            status, ours = "inherited-unchanged", 0
        a = areas[area]
        a["files"] += 1
        a["lines"] += lines
        a[f"files_{status}"] += 1
        a[f"lines_{status}"] += lines
        a["lines_ours_est"] += ours
        files.append({"path": path, "area": area, "status": status, "lines": lines, "added_lines": ours})
    rows = []
    for name, c in areas.items():
        rows.append({"area": name, **{k: c[k] for k in (
            "files", "lines", "files_inherited-unchanged", "files_inherited-modified", "files_claimed-own",
            "files_added", "lines_inherited-unchanged", "lines_inherited-modified", "lines_claimed-own",
            "lines_added", "lines_ours_est")}})
    rows.sort(key=lambda r: -r["lines"])
    return rows, {"baseline": base, "head": str(git("rev-parse", "HEAD")).strip(), "files": files}


def cargo_inventory() -> dict:
    raw = subprocess.run(
        ["cargo", "metadata", "--format-version", "1", "--locked"],
        cwd=ROOT, capture_output=True, check=False,
    )
    if raw.returncode != 0:
        raw = subprocess.run(
            ["cargo", "metadata", "--format-version", "1", "--locked", "--offline"],
            cwd=ROOT, capture_output=True, check=True,
        )
    meta = json.loads(raw.stdout)
    members = set(meta["workspace_members"])
    by_id = {p["id"]: p for p in meta["packages"]}
    direct: dict[str, set[str]] = defaultdict(set)
    for node in meta["resolve"]["nodes"]:
        owner = by_id[node["id"]]
        if node["id"] not in members:
            continue
        for dep in node["deps"]:
            direct[dep["pkg"]].add(owner["name"])
    deps = []
    for pkg in meta["packages"]:
        if pkg["id"] in members:
            continue
        blob = " ".join(str(pkg.get(k) or "") for k in ("authors", "repository", "homepage", "description")).lower()
        src = pkg.get("source") or ""
        deps.append({
            "name": pkg["name"],
            "version": pkg["version"],
            "source": "git" if src.startswith("git+") else "registry",
            "license": pkg.get("license") or "UNSPECIFIED",
            "upstream_authored": any(m in blob for m in UPSTREAM_MARKERS),
            "direct_in": sorted(direct.get(pkg["id"], set())),
            "repository": pkg.get("repository") or "",
        })
    deps.sort(key=lambda d: (not d["upstream_authored"], d["name"]))
    return {"members": len(members), "deps": deps}


def copyleft(expr: str) -> bool:
    # a dependency is flagged only when no permissive alternative is offered ("MIT OR GPL" is fine)
    if expr == "UNSPECIFIED":
        return True
    alts = [a.strip(" ()") for a in expr.replace(" or ", " OR ").split(" OR ")]
    bad = ("GPL", "AGPL", "LGPL", "MPL", "EUPL", "SSPL", "BUSL", "CC-BY-SA", "OSL")
    return all(any(b in a.upper() for b in bad) for a in alts)


def pct(part: int, whole: int) -> str:
    return f"{100 * part / whole:.1f}%" if whole else "-"


def render(rows: list[dict], info: dict, cargo: dict) -> tuple[str, dict[str, str]]:
    own = [r for r in rows if r["area"].split("/")[0] not in IMPORTED_AREAS]
    imported = [r for r in rows if r["area"].split("/")[0] in IMPORTED_AREAS]
    tot = Counter()
    for r in own:
        for k, v in r.items():
            if k != "area":
                tot[k] += v
    rust = [r for r in own if r["area"].startswith("crates/")]
    rt = Counter()
    for r in rust:
        for k, v in r.items():
            if k != "area":
                rt[k] += v

    def table(rs: list[dict]) -> list[str]:
        out = ["| Area | Files | Lines | Inherited unchanged | Inherited, edited since | Claimed own | Added since | Ours (est.) |",
               "|---|---:|---:|---:|---:|---:|---:|---:|"]
        for r in rs:
            out.append(
                f"| {r['area']} | {r['files']} | {r['lines']:,} | {r['lines_inherited-unchanged']:,} "
                f"| {r['lines_inherited-modified']:,} | {r['lines_claimed-own']:,} | {r['lines_added']:,} "
                f"| {r['lines_ours_est']:,} ({pct(r['lines_ours_est'], r['lines'])}) |"
            )
        return out

    up = [d for d in cargo["deps"] if d["upstream_authored"]]
    flagged = [d for d in cargo["deps"] if copyleft(d["license"])]
    licenses = Counter(d["license"] for d in cargo["deps"])
    md = [
        "# Provenance inventory",
        "",
        "Stage 0 of `.ai/modules/plans/data/2026-11-16-independent-engine.json`. Generated by "
        "`python scripts/provenance.py`; do not edit by hand. It is a snapshot of the commit named "
        "below and is regenerated on request.",
        "",
        f"Baseline `{info['baseline'][:12]}` (the initial commit); measured at `{info['head'][:12]}`.",
        "",
        "Read this as a measurement. The baseline is a squashed first commit that already contains "
        "product code, so git cannot say who wrote what before it: those files are *inherited* here "
        "until the owner lists them as their own in `provenance/own-paths.txt`. *Added since* says "
        "when a file arrived, not who wrote it, and an edited inherited file is still mostly "
        "inherited: only its added lines are counted as ours. Nothing here is evidence of "
        "independent authorship; it is the list of what still has to be replaced or have its rights "
        "recorded.",
        "",
        "## Totals (everything except imported trees)",
        "",
        f"- Text files: {tot['files']:,}; lines: {tot['lines']:,}.",
        f"- Inherited and untouched: {tot['lines_inherited-unchanged']:,} lines "
        f"({pct(tot['lines_inherited-unchanged'], tot['lines'])}).",
        f"- Inherited and edited since: {tot['lines_inherited-modified']:,} lines in "
        f"{tot['files_inherited-modified']:,} files, of which about "
        f"{tot['lines_ours_est'] - tot['lines_added'] - tot['lines_claimed-own']:,} lines were added by edits.",
        f"- Claimed as the owner's own, present at the baseline: {tot['lines_claimed-own']:,} lines in "
        f"{tot['files_claimed-own']:,} files (`provenance/own-paths.txt`).",
        f"- Added since: {tot['lines_added']:,} lines in {tot['files_added']:,} files.",
        f"- Ours, estimated: {tot['lines_ours_est']:,} lines ({pct(tot['lines_ours_est'], tot['lines'])}).",
        "",
        "### Rust workspace",
        "",
        f"{rt['lines']:,} lines in {len(rust)} crates; ours (est.) {rt['lines_ours_est']:,} "
        f"({pct(rt['lines_ours_est'], rt['lines'])}); inherited and untouched "
        f"{rt['lines_inherited-unchanged']:,} ({pct(rt['lines_inherited-unchanged'], rt['lines'])}).",
        "",
        *table(rust),
        "",
        "### Everything else",
        "",
        *table([r for r in own if not r["area"].startswith("crates/")]),
        "",
        "## Imported trees",
        "",
        "These arrived from the owner's separate project and carry that project's own provenance "
        "(`platform/ABSORPTION.md`). They are not counted above.",
        "",
        *table(imported),
        "",
        "## Dependencies (Cargo.lock)",
        "",
        f"{len(cargo['deps']):,} external packages for {cargo['members']} workspace crates; "
        f"{sum(d['source'] == 'git' for d in cargo['deps'])} from git sources.",
        "",
        "### Authored by the upstream project",
        "",
        "Matched on the package's authors, repository, homepage or description. Each is a "
        "decision for Stage 1: keep as a permitted dependency, or replace.",
        "",
    ]
    if up:
        md += ["| Package | Version | Used directly by | License |", "|---|---|---|---|"]
        for d in up:
            md.append(f"| {d['name']} | {d['version']} | {', '.join(d['direct_in']) or '(transitive)'} | {d['license']} |")
    else:
        md.append("None matched.")
    md += [
        "",
        "### Licenses needing review",
        "",
        "Packages with no permissive option in their license expression, or with none declared.",
        "",
    ]
    if flagged:
        md += ["| Package | Version | License |", "|---|---|---|"]
        md += [f"| {d['name']} | {d['version']} | {d['license']} |" for d in flagged]
    else:
        md.append("None.")
    md += ["", "### License counts", "", "| License | Packages |", "|---|---:|"]
    md += [f"| {k} | {v} |" for k, v in licenses.most_common()]
    md.append("")

    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=list(rows[0].keys()), lineterminator="\n")
    w.writeheader()
    w.writerows(rows)
    areas_csv = buf.getvalue()

    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=["path", "area", "status", "lines", "added_lines"], lineterminator="\n")
    w.writeheader()
    w.writerows(info["files"])
    files_csv = buf.getvalue()

    buf = io.StringIO()
    w = csv.writer(buf, lineterminator="\n")
    w.writerow(["name", "version", "source", "license", "upstream_authored", "direct_in", "repository"])
    for d in cargo["deps"]:
        w.writerow([d["name"], d["version"], d["source"], d["license"], d["upstream_authored"],
                    ";".join(d["direct_in"]), d["repository"]])
    deps_csv = buf.getvalue()
    return "\n".join(md), {"areas.csv": areas_csv, "files.csv": files_csv, "dependencies.csv": deps_csv}


def main() -> int:
    rows, info = measure()
    md, csvs = render(rows, info, cargo_inventory())
    OUT_DIR.mkdir(exist_ok=True)
    OUT_MD.write_text(md, "utf-8", newline="\n")
    for name, text in csvs.items():
        (OUT_DIR / name).write_text(text, "utf-8", newline="\n")
    print(f"wrote {OUT_MD.name} and provenance/ ({len(rows)} areas, {len(info['files'])} files)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
