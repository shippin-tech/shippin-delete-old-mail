# Roadmap to alpha

One document for sequencing. It replaces the status columns in `PLAN.md`, `ui/porting/work-packages.json`
and the plan modules, which disagree with each other (the work-packages file shows 13 packages
queued while `RELEASE.md` shows most of the same work done). What is true of each capability lives in
one place: [roadmap/capabilities.csv](roadmap/capabilities.csv), built by
`roadmap/build_capabilities.py`. A row changes status only together with the test that earns it.

`RELEASE.md` stays the gate for a `v*` tag. `REGRESSION.md` stays the acceptance rule. This file is the order
of work between them. Pre-release: nothing here is supported for real mail.

## 1. Where we stand (measured 2026-11-20)

| | |
|---|---|
| Product surface | Svelte UI, 54k lines, all the owner's. One API prefix `/api/v1`, registry facade over JMAP, generated ArkType contracts, stale-write guard. No legacy management API. |
| Engine | 376k lines of Rust in 28 crates, about 96% inherited and untouched ([PROVENANCE.md](PROVENANCE.md)). Largest: `registry` 87k (82k of it in `schema/`, machine-generated with no generator in this tree), `common` 44k, `jmap` 33k, `store` 24k, `smtp` 20k. |
| Capabilities | 46 tracked: **30 verified**, 5 engine-suite-only, 4 unverified, 5 gap, 2 mocked-only. |
| What CI proves | Lint, typecheck, unit tests, mocked browser tests, `cargo check`. |
| What CI does not prove | Every live browser test, every `deploy/local/verify_*.py`, and the **120k-line inherited engine suite (`tests/`)**. All of them run by hand. That is why no regression claim can be made for the engine today. |
| Separation from the upstream | The product surface is separate. The engine is not: 12 upstream-authored packages are dependencies and 96% of the workspace is inherited. Section 5 says how that ends. |

## 2. What alpha means

A tagged build where every line below is true and has a command that shows it. Nothing is waived by being
hard.

| Id | Criterion | Shown by |
|---|---|---|
| X1 | Every capability row is `verified`, or is a `gap` the owner has waived in section 7 with a reason | `roadmap/capabilities.csv` |
| X2 | The inherited engine suite runs on every push to `main`. Every failure is fixed or listed in `roadmap/known-failures.md` with its cause. None unexplained | CI job `engine tests` |
| X3 | One command runs every gate in `REGRESSION.md` against a named image and records commit, image and results | `python scripts/regression.py` |
| X4 | The UI is dumb: no component calls the network; every network call goes through the typed client; nothing is served outside `/api/v1`, JMAP and the standard protocols | `node scripts/check-dumb-ui.mjs` |
| X5 | Performance baseline recorded for the capability set, with thresholds; the candidate is inside them | `roadmap/perf/` |
| X6 | Clean Linux host: install, upgrade, backup and restore drill, TLS certificate | `RELEASE.md` A10, B3, B5, B6 |
| X7 | `RELEASE.md` rows A and B Done; C and D Done or Waived by the owner | `RELEASE.md` |
| X8 | Independence stage 1 closed: the per-dependency decision table is written (section 5) and the oracle for the first replacement slice passes against the current implementation | `roadmap/independence.md` |

Alpha does **not** wait for the engine to be rewritten. A rewrite gates nothing until it passes the oracle,
and 376k lines cannot be one step. Independence proceeds slice by slice from the first week of this plan
and each slice ships on its own (section 5). This is the one structural call in this document; section 7
lists it so it can be overruled in one line.

## 3. Track R: the regression machine

Everything else is safe only once this exists. Do first.

| Id | Task | Done when |
|---|---|---|
| R1 | **Run the inherited engine suite** in a Linux container against `HEAD` and record the real baseline: how many pass, fail, are ignored, and why | `roadmap/engine-suite-baseline.md` with counts per area (smtp, imap, jmap, webdav, scim, store, system, directory, automation, cluster, telemetry, utils) |
| R2 | Put it in CI as job `engine tests` (rocks and sqlite, Linux). Failures that are environmental get an owner and a fix; real ones are bugs | Job green or every red listed in `known-failures.md` |
| R3 | `scripts/regression.py`: runs REGRESSION.md gate 1 (the CI steps), gate 2 (build the image, bring up `deploy/local`, run `verify*.py`, `test:live`, `test:contract-live`, the engine suite), and writes `roadmap/regression-results.json` and `REGRESSION-RESULTS.md` with commit, image digest, per-gate result and what was not run | One command, one report. A gate that could not run says so; it is never green |
| R4 | Fix whatever R1 and R3 find that is ours (stale tests, flaky live specs such as the Domains cold start) | Two consecutive full runs with identical results |
| R5 | Performance fixture: delivery rate, JMAP list and search latency, IMAP fetch, memory at idle and under load, on synthetic data; thresholds written down | `roadmap/perf/baseline.json` and a script that compares a candidate to it |
| R6 | `scripts/check-dumb-ui.mjs` in CI: no `.svelte` file calls `fetch`; `fetch` appears only in `src/lib/adapter`, `src/lib/contract`, and an allow-list that shrinks to nothing. Today 12 modules under `src/lib/shippin/` call it directly | Check green with an empty allow-list; those 12 use the typed client |

## 4. Track L: close the capability gaps

Each row is in the ledger. Order is by how much alpha depends on it.

| Id | Ledger | Task | Done when |
|---|---|---|---|
| L1 | M5, M6, I9 | Independent-client suite for IMAP, POP3 and XOAUTH2 (flags, search, move, IDLE, retrieve and delete) against the live stack | Added to `verify_compat.py` or a sibling; rows `verified` |
| L2 | C4, C7 | An independent DAV client check (CalDAV, CardDAV, WebDAV) and ManageSieve script upload, activation and effect on delivery | Rows `verified` |
| L3 | C7 | Svelte Sievepad: edit, validate, activate scripts through JMAP, with the server's error positions shown | Browser test: a script that files a message into a folder, proven by delivery |
| L4 | M9 | Live webmail search: text, sender, date, folder, flags | Live browser test |
| L5 | G2 | Microsoft 365 connection on the server, matching the Google one: consent, expiry, cancel, disconnect, isolation, byte-exact copy, against a stand-in Microsoft server | Live spec like `google.spec.ts`. Real consent stays the owner's (gate 4) |
| L6 | I6, U2 | Create and read round trips on the 37 empty registry objects; nested patch paths (read RFC 8620 5.3 first); typed editors for the largest objects | `verify_registry.py` covers every object; editors tested |
| L7 | I5 | Seed an organisation-admin account; `verify_v1.py` covers the `org` role | Check added |
| L8 | O6 | TLS certificate by ACME at install (RELEASE A10) | Certificate on a public host |
| L9 | O8 | Monitoring and an alert channel (RELEASE D3) | Down host raises an alert outside itself |
| L10 | M3, M4 | Queue retry and failure-report check and a sender-authentication check that do not need the public internet (local resolver, test domain) | Rows `verified` without waiting for RELEASE B1 and B4 |
| L12 | O10 | Engine behaviour when the store stalls: bounded wait, a clear error to the client, health check turns unhealthy, recovery without a restart. Seen on 2026-11-20 (full disk, FoundationDB throttled, engine silent for 14 hours) | A test that stalls the store and sees errors and recovery |
| L11 | U1 | Keyboard-only and mobile-width assertions on the main flows | Added to the live specs |

Platform port (`ui/porting` C1 to C4, the Go control plane) and Docs/Drive beyond v1 scope are **after
alpha**, as `RELEASE.md` already scopes them. They are not lost: they stay in `ui/porting/work-packages.json`.

## 5. Track S: independence from the upstream

**Rule.** A component is replaced only when the replacement passes the same oracle as the original and the
original is still there until it does (REGRESSION.md). Both implementations build behind a feature during the
overlap, the original is removed in its own commit afterwards, and data stays readable.

**Oracle.** In this order of strength: the inherited engine suite (R1), the ledger's live tests, differential
tests of old against new on the same inputs, the relevant RFC test vectors, and fuzzing for parsers.

### Stage 1: decisions per upstream-authored dependency

All twelve packages are replaced. They are small enough to take one at a time and big enough to need an oracle.

| Slice | Dependency | What it is | Replace by | Oracle beyond the engine suite |
|---|---|---|---|---|
| S1 | `sieve-rs` | Sieve interpreter and script parser (RFC 5228 and extensions) | Own crate `shippin-sieve` | RFC 5228 and extension vectors; differential run over every script in `tests/` |
| S2 | `smtp-proto`, `mail-builder` (two versions), `hashify`, `encodify` | SMTP command and reply parsing, message building, compile-time lookup helpers | Own crates; `phf` or std for lookups | Differential and fuzz; message round trips |
| S3 | `mail-parser` | RFC 5322 and MIME parsing (16 crates use it) | Own crate | Differential over a public corpus plus the engine suite's messages; fuzzing; byte-exact attachment round trip |
| S4 | `mail-auth` | DKIM, SPF, DMARC, ARC (RFC 6376, 7208, 7489, 8617) | Own crate | RFC test vectors; interoperability against a second implementation |
| S5 | `calcard`, `jmap-tools` | iCalendar and vCard (RFC 5545, 6350, 7265), JMAP patch helpers | Own crates | RFC vectors; DAV and JMAP calendar suites |
| S6 | `dns-update`, `jmap-client` (tests only) | DNS record management; the JMAP client the tests use | Own crate; own test client | Own client used by the ledger tests |

### Stage 2: the engine's own crates, by layer

Replaced bottom-up so each layer has a stable interface under it. One crate per slice.

| Layer | Crates | Lines | Note |
|---|---|---|---|
| Schema | `registry` | 87k | 82k is generated from `resources/schema/schema.json.gz` and no generator is in this tree. Own the schema and write the generator: one slice replaces a fifth of the workspace and the output is checkable against the existing structs |
| Leaf | `utils`, `types`, `trc`, `nlp`, `http-proto` | 22k | Small and widely used |
| Protocol | `imap-proto`, `dav-proto`, `jmap-proto`, `scim-proto` | 47k | Parser and serializer; oracle is round trip plus the independent clients from L1 and L2 |
| Services | `smtp`, `imap`, `pop3`, `managesieve`, `dav`, `jmap`, `scim`, `spam-filter`, `email`, `groupware` | about 130k | One protocol per slice, behind its port |
| Core | `directory`, `store`, `coordinator`, `common`, `services`, `http`, `main` | about 100k | Last. `store` needs a migration path from the inherited layout, tested against a copy of real data |

The first slice is **S1 (Sieve)** because it is self-contained, has a clear specification and a strong
oracle, and the Svelte Sievepad (L3) needs a validator whose error positions we control anyway. The second is
**the registry generator**, the largest single reduction.

Stage 1 is closed for alpha (X8) when this table is accepted and S1's oracle runs green against the current
`sieve-rs`. `roadmap/independence.md` records each slice's baseline revision, oracle, result and removal commit.

## 6. Order of work

1. **R1** now (running). Then **R3**, so every later change is measured.
2. **R2, R4, R6** the same week: CI carries the engine suite and the dumb-UI check.
3. **L1, L2, L10, L4** (the evidence gaps), then **L3, L5, L6, L7** (the capability gaps).
4. **R5** before any Stage 2 slice, so performance is a gate, not an opinion.
5. **S1** starts when R1 and R3 are done; it runs in parallel with Track L because it touches different code.
6. **L8, L9** and the owner's host items, then the alpha run: `scripts/regression.py` on the candidate image,
   X1 to X8 checked in order, tag only when `RELEASE.md` allows it.

Each step ends with `main` green, results recorded, and the ledger updated.

## 7. Decisions made here, and what only the owner can do

Decisions taken so the work does not stall. Edit this section to overrule any of them.

1. Alpha does not wait for the engine rewrite; independence ships slice by slice (section 2).
2. `provenance/own-paths.txt` lists `ui/`, `api/`, `mcpl/`, `.ai/`, `scripts/`, `brand/`, `deploy/`,
   `resources/product/` and the `shippin` modules as the owner's. Strike what is not.
3. The platform port and Docs/Drive beyond v1 scope are after alpha.
4. All twelve upstream-authored packages are replaced, Sieve first, then the registry generator.
5. Waived gaps: none yet.

Only the owner can: provide the Google and Microsoft OAuth clients and test accounts (gate 4); publish a DNS
record for RELEASE B1; run the host items (RELEASE B3 to B6) or give a Linux machine to run them; choose the alert
channel (D3); decide RELEASE C2 to C5; lift the pull-request freeze.
