#!/usr/bin/env bash
# SSH to the shared VPS as the papabravo user. Requires PAPABRAVO_SSH_KEY.
# This login can write /var/www/papabravo and /etc/papabravo/Caddyfile, and
# sudo only /usr/local/sbin/papabravo-caddy-apply. It cannot read Körpasset.
set -euo pipefail

strip_ws() {
  local value="${1-}"
  value="${value//$'\r'/}"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "$value"
}

HOST="$(strip_ws "${PAPABRAVO_SSH_HOST:-188.66.62.46}")"
USER=papabravo
PORT="$(strip_ws "${PAPABRAVO_SSH_PORT:-22}")"

if [[ -z "${PAPABRAVO_SSH_KEY:-}" ]]; then
  echo "PAPABRAVO_SSH_KEY is not set. Add it as a Cursor runtime secret." >&2
  exit 1
fi

# Cursor may flatten the secret to one line. Reconstruct OpenSSH PEM.
write_normalized_key() {
  local dest="$1"
  local raw begin end body
  raw="${PAPABRAVO_SSH_KEY//$'\r'/}"
  raw="${raw#"${raw%%[![:space:]]*}"}"
  raw="${raw%"${raw##*[![:space:]]}"}"
  raw="${raw//\\n/$'\n'}"

  if [[ "$raw" == *$'\n-----'* ]]; then
    printf '%s' "$raw" > "$dest"
    [[ "$raw" == *$'\n' ]] || printf '\n' >> "$dest"
    return
  fi

  begin="$(printf '%s' "$raw" | sed -n 's/.*\(-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----\).*/\1/p')"
  end="$(printf '%s' "$raw" | sed -n 's/.*\(-----END [A-Z0-9 ]*PRIVATE KEY-----\).*/\1/p')"
  body="$(printf '%s' "$raw" \
    | sed -e 's/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----//' \
          -e 's/-----END [A-Z0-9 ]*PRIVATE KEY-----//' \
    | tr -d '[:space:]')"

  if [[ -z "$begin" || -z "$end" || -z "$body" ]]; then
    echo "PAPABRAVO_SSH_KEY is not a recognizable OpenSSH PEM key." >&2
    exit 1
  fi

  {
    printf '%s\n' "$begin"
    printf '%s' "$body" | fold -w 70
    printf '\n%s\n' "$end"
  } > "$dest"
}

KEY_FILE="$(mktemp)"
cleanup() { rm -f "$KEY_FILE"; }
trap cleanup EXIT
chmod 700 "$(dirname "$KEY_FILE")" 2>/dev/null || true
write_normalized_key "$KEY_FILE"
chmod 600 "$KEY_FILE"

ssh_cmd() {
  ssh -i "$KEY_FILE" \
    -o BatchMode=yes \
    -o IdentitiesOnly=yes \
    -o StrictHostKeyChecking=accept-new \
    -p "$PORT" \
    "${USER}@${HOST}" \
    "$@"
}

case "${1:-}" in
  ""|-h|--help)
    echo "Usage: $0 check | [remote command...]"
    exit 0
    ;;
  check)
    ssh_cmd "set -euo pipefail
echo host_ok
test -w /var/www/papabravo && echo web_writable
test -w /etc/papabravo/Caddyfile && echo caddyfile_writable
if test -x /var/www/korpasset || test -r /var/www/korpasset/deploy/.env; then
  echo korpasset_reachable >&2
  exit 1
fi
echo isolated_ok
sudo -n /usr/local/sbin/papabravo-caddy-apply"
    ;;
  *)
    ssh_cmd "$@"
    ;;
esac
