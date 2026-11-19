#!/usr/bin/env bash
# systemd unit for this mail instance. The unit runs the compose project in
# this directory (the supported path is /srv/shippin-tech/mail). It does not
# use /srv/shippin-tech/node-a or /etc/shippin-tech/infra.compose.yaml.
#
#   sudo bash host.sh install     # unit + nightly backup timer
#   sudo bash host.sh uninstall   # remove the unit; containers keep running
#
# BACKUP_TIMER=skip skips the timer. Tests set SHIPPIN_UNIT_DIR and SHIPPIN_SYSTEMCTL.
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
here=$(pwd -P)
mode=${1:-install}
unit_dir=${SHIPPIN_UNIT_DIR:-/etc/systemd/system}
systemctl=(${SHIPPIN_SYSTEMCTL:-systemctl})

die() { echo "host: $*" >&2; exit 1; }
value() { awk -F= -v k="$1" '$1 == k { sub(/^[^=]*=/, ""); print; exit }' server.env; }

[[ -f server.env && -f compose.yaml ]] || die "run this in the instance directory (server.env and compose.yaml)"
if [[ "$unit_dir" == /etc/systemd/system && ${EUID:-$(id -u)} -ne 0 ]]; then
  die "run as root (sudo bash host.sh $mode)"
fi

project=$(value COMPOSE_PROJECT_NAME)
project=${project:-shippin-mail}
safe=$(printf '%s' "$project" | tr -c 'A-Za-z0-9._-' '-')
unit="shippin-stack-${safe}"

retire_broken() {
  local name=$1 file=$2 path broken=0
  [[ -f "$file" ]] || return 0
  local wd
  wd=$(sed -n 's/^WorkingDirectory=//p' "$file" | head -1)
  if [[ -n "$wd" && ! -d "$wd" ]]; then
    broken=1
  fi
  while read -r path; do
    case "$path" in
      *.yaml|*.yml|*server.env)
        [[ -e "$path" ]] || broken=1
        ;;
    esac
  done < <(grep -oE '/[[:graph:]]+' "$file" || true)
  if [[ "$broken" -eq 1 ]]; then
    "${systemctl[@]}" disable --now "$name" >/dev/null 2>&1 || true
    rm -f -- "$file"
    echo "removed $name: it pointed at a path that is not on this host"
  fi
}

install_unit() {
  mkdir -p -- "$unit_dir" "$here/secrets/relay"
  chmod 755 "$here/secrets/relay" || true
  cat > "$unit_dir/${unit}.service" <<EOF
[Unit]
Description=shippin.tech mail stack (${here})
Requires=docker.service
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=${here}
ExecStart=/usr/bin/docker compose --env-file ${here}/server.env -f ${here}/compose.yaml up -d --wait --wait-timeout 240
ExecStop=/usr/bin/docker compose --env-file ${here}/server.env -f ${here}/compose.yaml stop
TimeoutStartSec=300

[Install]
WantedBy=multi-user.target
EOF
  "${systemctl[@]}" daemon-reload
  "${systemctl[@]}" enable --now "${unit}.service"
  echo "installed ${unit}.service for ${here}"
}

case "$mode" in
  install)
    retire_broken shippin-tech-mail.service "$unit_dir/shippin-tech-mail.service"
    retire_broken shippin-tech-infra.service "$unit_dir/shippin-tech-infra.service"
    install_unit
    if [[ "${BACKUP_TIMER:-install}" == skip ]]; then
      :
    elif [[ ",$(value COMPOSE_PROFILES)," == *,bundled,* ]]; then
      SHIPPIN_UNIT_DIR="$unit_dir" SHIPPIN_SYSTEMCTL="${systemctl[*]}" bash "$here/backup.sh" install
    else
      echo "note: COMPOSE_PROFILES is not bundled, so backup.sh was not installed. Back up FoundationDB and object storage with their own tools."
    fi
    ;;
  uninstall)
    "${systemctl[@]}" disable --now "${unit}.service" >/dev/null 2>&1 || true
    rm -f -- "$unit_dir/${unit}.service"
    "${systemctl[@]}" daemon-reload || true
    echo "removed ${unit}.service; containers were left running"
    ;;
  *)
    sed -n '2,9p' "$0" >&2
    exit 2
    ;;
esac
