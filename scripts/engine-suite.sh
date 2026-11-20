#!/usr/bin/env bash
# The inherited engine suite (tests/), one test at a time, inside rust:slim-trixie.
# Started by scripts/regression.py --engine; not meant to be run on a workstation directly.
#
#   engine-suite.sh <STORE> [seconds per test]
#
# Needs: the repository mounted read-only at /host-src, a writable volume at /src (the tests write
# next to their sources), cargo caches at /cargo and /target, the Docker socket (some tests start
# OpenLDAP, Keycloak, NATS, Redis, MariaDB, a DNS challenge server) and host networking so the
# containers they start are reachable on 127.0.0.1.
#
# Each test runs alone with its own time limit, so one that hangs cannot hide the rest, and each
# leaves a log. A line "RESULT <test> <pass|fail|timeout|skipped> <seconds>" is printed for every one.
# When the disk under /target runs low the remaining tests are reported "skipped": FoundationDB
# on the same disk stops accepting writes below 5% free, and a test run must not do that to it.
set -u
STORE_TYPE="${1:?store type}"
LIMIT="${2:-1800}"
MIN_FREE_GB="${MIN_FREE_GB:-20}"
OUT=/target/engine-suite/$STORE_TYPE
mkdir -p "$OUT"

export CARGO_HOME=/cargo CARGO_TARGET_DIR=/target CARGO_TERM_COLOR=never CARGO_INCREMENTAL=0
export STORE="$STORE_TYPE" RUST_BACKTRACE=0

apt-get update -qq >/dev/null 2>&1
apt-get install -yqq --no-install-recommends clang libclang-dev cmake make protobuf-compiler pkg-config \
  git perl ca-certificates libssl-dev zlib1g-dev rsync >/dev/null 2>&1

# A writable copy at the same path keeps cargo's fingerprints valid (path dependencies).
rsync -a --delete --exclude node_modules --exclude .svelte-kit --exclude build --exclude target \
  --exclude .git --exclude ui/test-results /host-src/ /src/
cd /src || exit 2

echo "BUILD $(date -u +%T)"
BIN=$(cargo test -p tests --locked --no-run --message-format=json 2>"$OUT/build.log" \
  | grep -o '"executable":"[^"]*"' | tail -1 | cut -d'"' -f4)
if [ -z "$BIN" ] || [ ! -x "$BIN" ]; then
  echo "RESULT build fail 0"
  tail -30 "$OUT/build.log"
  exit 3
fi
echo "BIN $BIN"

cd /src/tests || exit 2
TESTS=$("$BIN" --list 2>/dev/null | sed -n 's/: test$//p')
echo "TESTS $(echo "$TESTS" | wc -l)"
for t in $TESTS; do
  free=$(df --output=avail -BG /target | tail -1 | tr -dc 0-9)
  if [ "${free:-0}" -lt "$MIN_FREE_GB" ]; then
    echo "RESULT $t skipped 0 (only ${free}G free under /target)"
    continue
  fi
  log="$OUT/$(echo "$t" | tr ':' '_').log"
  start=$(date +%s)
  timeout "$LIMIT" "$BIN" --exact "$t" >"$log" 2>&1
  rc=$?
  secs=$(( $(date +%s) - start ))
  if [ $rc -eq 0 ]; then verdict=pass; elif [ $rc -eq 124 ]; then verdict=timeout; else verdict=fail; fi
  # an ignored test exits 0 with "0 passed"; do not count it as a pass
  if [ $rc -eq 0 ] && grep -q "0 passed; 0 failed; 1 ignored" "$log"; then verdict=ignored; fi
  reason=""
  if [ "$verdict" = fail ]; then
    reason=$(grep -m1 -E "panicked at|Error|error:" -A1 "$log" | tr '\n' ' ' | cut -c1-200)
  fi
  echo "RESULT $t $verdict $secs $reason"
done
echo "END $(date -u +%T)"
