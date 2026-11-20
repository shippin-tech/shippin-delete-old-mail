# Known failures

Anything that fails in a regression run and is not fixed yet is listed here with its cause. An entry that
only says "flaky" or "environment" is not accepted: say what is different and what removes it. A run with
an unexplained failure is not a pass (REGRESSION.md). Delete an entry in the commit that fixes it.

## Inherited engine suite (`tests/`, ROADMAP R1)

First run, 2026-11-20, `cargo test -p tests` in `rust:slim-trixie`, no environment set:
26 passed, 66 failed, 4 ignored in 1.5 s. The failures are one cause, not 66 bugs:

| Cause | Tests | Fix |
|---|---|---|
| `STORE` not set. The suite is configured by `STORE=<RocksDb\|Sqlite\|FoundationDb\|PostgreSql\|MariaDb...>` | 63 | Run with `STORE=RocksDb`, then `STORE=Sqlite` (`scripts/regression.py --engine`) |
| `COORDINATOR` not set (`Nats` or `Redis`) | 1 | Needs a NATS or Redis container the test starts itself |
| No Docker socket in the container: the suite starts containers (OpenLDAP, a DNS challenge server, NATS, Redis, MariaDB, Postgres, FoundationDB) | 2 and the cluster and scale-store tests | Mount the host's Docker socket and give the container host networking, or run a sidecar set. Until then these are **not run**, not passed |

Results with the store set are in `roadmap/engine-suite-baseline.md` once the run finishes.

## Local Docker stack

| Failure | Cause | Fix |
|---|---|---|
| Engine stops answering and never recovers; the Domains spec "cold start hang" | The Docker VM disk reached 99%. FoundationDB then throttles every transaction (`RkTlogMinFreeSpaceZero`), and the engine waits on it with no timeout and no error. Seen on 2026-11-20 after about 14 hours of silence | Free disk. Product fix: the engine must fail requests with a clear error and report unhealthy when the store stops answering, and `deploy/` health checks must catch it. Tracked as ROADMAP L12 (behaviour) and L9 (alerting) |
| FoundationDB "unhealthy" after a restart | The cluster file records the coordinator's container IP, and a restart can give it a new one. `deploy/compose.yaml` and `deploy/local/compose.yaml` both use container networking with no fixed address | Give the service a fixed address or a hostname coordinator. Not done: it needs a proof that a recreated container reopens existing data |
