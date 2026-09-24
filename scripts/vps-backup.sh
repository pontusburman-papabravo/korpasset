#!/usr/bin/env bash
# Take a Postgres dump and delete copies that are 14 days old or older.
# Restore-only. Do not print secrets, emails, or dump contents.
set -euo pipefail

BACKUP_RETENTION_DAYS=14
APP_PATH="${VPS_APP_PATH:-/var/www/korpasset}"
BACKUP_DIR="${KORPASSET_BACKUP_DIR:-/var/backups/korpasset}"
LEGACY_BACKUP_DIRS="${KORPASSET_LEGACY_BACKUP_DIRS:-/home/deploy/korpasset-backups:/var/www/korpasset/backups}"
COMPOSE=(docker compose --project-directory "$APP_PATH/deploy" -f "$APP_PATH/deploy/docker-compose.yml")

usage() {
  echo "Usage: $0 [--prune-only|--adopt-legacy]" >&2
  exit 2
}

MODE="backup"
if [[ "${1:-}" == "--prune-only" ]]; then
  MODE="prune"
elif [[ "${1:-}" == "--adopt-legacy" ]]; then
  MODE="adopt"
elif [[ -n "${1:-}" ]]; then
  usage
fi

file_mtime_stamp() {
  date -u -d "@$(stat -c %Y "$1")" +%Y%m%dT%H%M%SZ
}

adopt_legacy_backups() {
  local dest="$1"
  local src moved=0
  IFS=':' read -r -a sources <<< "$LEGACY_BACKUP_DIRS"
  for src in "${sources[@]}"; do
    [[ -n "$src" && -d "$src" ]] || continue
    [[ "$src" == "$dest" ]] && continue
    shopt -s nullglob
    local file
    for file in "$src"/korpasset-*.dump; do
      mv -n "$file" "$dest/"
      moved=$((moved + 1))
    done
  done
  echo "backup adopt moved=$moved"
}

prune_expired_backups() {
  local dir="$1"
  local cutoff
  cutoff="$(date -u -d "${BACKUP_RETENTION_DAYS} days ago" +%Y%m%dT%H%M%SZ)"
  shopt -s nullglob
  local file stamp deleted=0 kept=0
  for file in "$dir"/korpasset-*.dump; do
    stamp="$(basename "$file")"
    stamp="${stamp#korpasset-}"
    stamp="${stamp%.dump}"
    if [[ ! "$stamp" =~ ^[0-9]{8}T[0-9]{6}Z$ ]]; then
      stamp="$(file_mtime_stamp "$file")"
    fi
    if [[ "$stamp" < "$cutoff" || "$stamp" == "$cutoff" ]]; then
      rm -f "$file"
      deleted=$((deleted + 1))
    else
      kept=$((kept + 1))
    fi
  done
  echo "backup prune deleted=$deleted kept=$kept retention_days=$BACKUP_RETENTION_DAYS"
}

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR" 2>/dev/null || true

if [[ "$MODE" == "adopt" ]]; then
  adopt_legacy_backups "$BACKUP_DIR"
  prune_expired_backups "$BACKUP_DIR"
  exit 0
fi

if [[ "$MODE" == "prune" ]]; then
  prune_expired_backups "$BACKUP_DIR"
  exit 0
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required for backups" >&2
  exit 1
fi

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
partial="$BACKUP_DIR/korpasset-$stamp.dump.partial"
final="$BACKUP_DIR/korpasset-$stamp.dump"

"${COMPOSE[@]}" exec -T postgres pg_dump -Fc -U bilklar -d bilklar > "$partial"
if [[ ! -s "$partial" ]]; then
  rm -f "$partial"
  echo "pg_dump produced an empty file" >&2
  exit 1
fi
mv -f "$partial" "$final"
chmod 600 "$final"
echo "backup wrote 1 dump"

prune_expired_backups "$BACKUP_DIR"
