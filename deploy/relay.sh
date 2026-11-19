#!/usr/bin/env bash
# Outbound smarthost, off unless relay.env says RELAY=on.
#
#   bash relay.sh status     # what relay.env says, and what the server is doing
#   bash relay.sh apply      # make the server match relay.env
#   bash relay.sh enable     # RELAY=on, then apply
#   bash relay.sh disable    # RELAY=off, then apply (direct MX again)
#
# The provider secret belongs in secrets/relay/relay.key. Sign-in for this
# command is RELAY_ADMIN (address:password) or secrets/relay-admin. Neither
# file is mounted into the mail container. See README.md, "Outbound smarthost".
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
command -v python3 >/dev/null || { echo 'relay: python3 is required for this command' >&2; exit 1; }
exec python3 "$PWD/relay.py" "$@"
