#!/usr/bin/env bash
# Install the daily backup timer and the 14-day prune.
# Safe to re-run. Requires sudo. Does not print secrets.
set -euo pipefail

APP_PATH="${VPS_APP_PATH:-/var/www/korpasset}"
BACKUP_DIR="${KORPASSET_BACKUP_DIR:-/var/backups/korpasset}"
APP_USER="${VPS_USER:-deploy}"

if [[ "$(id -u)" -ne 0 ]]; then
  exec sudo -n -- "$0" "$@"
fi

if [[ ! -x "$APP_PATH/scripts/vps-backup.sh" ]]; then
  echo "missing $APP_PATH/scripts/vps-backup.sh" >&2
  exit 1
fi
if [[ ! -f "$APP_PATH/deploy/korpasset-backup.service" || ! -f "$APP_PATH/deploy/korpasset-backup.timer" ]]; then
  echo "missing backup systemd units" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
chown "$APP_USER:$APP_USER" "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

install -m 644 "$APP_PATH/deploy/korpasset-backup.service" /etc/systemd/system/korpasset-backup.service
install -m 644 "$APP_PATH/deploy/korpasset-backup.timer" /etc/systemd/system/korpasset-backup.timer
systemctl daemon-reload
systemctl enable --now korpasset-backup.timer
systemctl is-active --quiet korpasset-backup.timer

# Always adopt leftover dumps and prune. Do this even if today's dump
# already exists, otherwise copies ≥14 days can survive until 03:17 UTC.
sudo -u "$APP_USER" -- \
  env VPS_APP_PATH="$APP_PATH" KORPASSET_BACKUP_DIR="$BACKUP_DIR" \
  "$APP_PATH/scripts/vps-backup.sh" --adopt-legacy

today_prefix="$(date -u +%Y%m%d)"
if ! compgen -G "$BACKUP_DIR/korpasset-${today_prefix}"*.dump >/dev/null; then
  sudo -u "$APP_USER" -- \
    env VPS_APP_PATH="$APP_PATH" KORPASSET_BACKUP_DIR="$BACKUP_DIR" \
    "$APP_PATH/scripts/vps-backup.sh"
fi

echo "backup timer active, dir=$BACKUP_DIR"
