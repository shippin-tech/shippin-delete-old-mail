# Source baseline audit — 2026-11-20

The audited source baseline is `afb98b27389c918d789b7f2e1da06690b5451888`.
It was committed and pushed by another process during this audit. Local `main`,
`origin/main` and the live GitHub branch tip matched; `git status --porcelain` was
empty and the ahead/behind count was `0 0`. No stash or second worktree existed.

The 12 earlier working-tree entries became 11 content changes in that commit.
`deploy/update.test.sh` was the remaining entry: checkout line-ending normalization,
with no Git content diff. No pending change was discarded by this audit.

The canonical repository is [shippin-tech/shippinTECH](https://github.com/shippin-tech/shippinTECH).
The configured origin, `https://github.com/shippinAI/shipping-tech`, redirects there.

| Work | GitHub status | Evidence in current main |
| --- | --- | --- |
| [PR #1](https://github.com/shippin-tech/shippinTECH/pull/1), suite readiness | Merged on 2026-11-03 as `6ef46d1` | All seven affected files exist; six have subsequently changed. The historical merge is outside the new-root history |
| [PR #2](https://github.com/shippin-tech/shippinTECH/pull/2), scaffolding plan | Closed, not merged through GitHub | Historical direct merge `3737b14` included head `b2d0f7b`. Its only added file remains in current main, with one policy line removed in the later snapshot |
| [PR #3](https://github.com/shippin-tech/shippinTECH/pull/3), deploy parity | Closed, not merged through GitHub | Exact head `b09dbc398a830014c72a1c24c2e373cb79b61d43` is an ancestor of current main |
| Surviving branch `cursor/production-deploy-parity-c403` | Remote tip `b09dbc3` | No commits ahead of main; no merge is needed |

Current history starts at parentless commit `6693b60be553b880ffd9c6ca9b1dd5640f41d036`.
Consequently, absence of older PR heads from its ancestry does not mean their files
are absent. Content comparisons above establish what was retained and changed;
they do not prove every historical behavior was preserved. Old branches were not
merged again over the current implementation.

[Check run 44829308023](https://github.com/shippin-tech/shippinTECH/actions/runs/44829308023)
passed for `afb98b2`, including Python 3.11 runner tests, Linux deploy tests,
typecheck, unit tests, static build and mocked browser tests. Cargo check was skipped
by the workflow's Rust-change filter. Live and inherited-engine suites are not covered
by that result. `RELEASE.md` remains open; this is a source baseline, not a release.

## Repairs committed with this audit

- Restored only line 20 of the damaged session `tools.jsonl` from `d517c13`, matching
  its full intact prefix. Other historical records were not reintroduced.
- Restored `concerns` and `boundaries` in the 2026-11-01 readiness plan from `6ef46d1`.
  These are the original plan's historical scope, not a new restriction on current work.
- Added the operating-tree check to CI and removed the `.ai/**` trigger exclusion.
- `organize.py --check` now passes: 6 modules, 50 documents, 406 records.
  Exact historical recovery checks and `git diff --check` also pass.

The commit containing this audit is the repaired baseline. Use its Git hash and CI
result together; do not use a release tag while the release gates remain open.
