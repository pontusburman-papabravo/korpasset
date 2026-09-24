#!/usr/bin/env bash
# First-boot Körpasset on an empty Ubuntu 24 VPS.
# Do not re-run on the live korpasset.se host — that box is already
# bootstrapped; use scripts/vps-deploy-revision.sh instead.
#
#   curl -fsSL https://raw.githubusercontent.com/pontusburman-papabravo/korpasset/main/scripts/vps-bootstrap.sh | bash
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Logga in som root och kör scriptet igen." >&2
  exit 1
fi

APP_PATH="${VPS_APP_PATH:-/var/www/korpasset}"
APP_USER="${VPS_USER:-deploy}"
REPO_URL="${REPO_URL:-https://github.com/pontusburman-papabravo/korpasset.git}"
DOMAIN="${DOMAIN:-korpasset.se}"
VPS_HOST="${VPS_HOST:-188.66.62.46}"
ACCESS_DIR="${ACCESS_DIR:-/root/korpasset-access}"
COMPOSE="docker compose --project-directory ${APP_PATH}/deploy -f ${APP_PATH}/deploy/docker-compose.yml"

log() { printf '\n==> %s\n' "$*"; }

apt_locked() {
  fuser /var/lib/dpkg/lock-frontend /var/lib/dpkg/lock /var/cache/apt/archives/lock >/dev/null 2>&1
}

wait_for_apt() {
  local waited=0
  local max="${APT_LOCK_TIMEOUT:-600}"
  while apt_locked; do
    if (( waited == 0 )); then
      log "Väntar tills unattended-upgrades släpper dpkg-låset"
    fi
    if (( waited >= max )); then
      echo "dpkg-låset hölls fortfarande efter ${max}s" >&2
      fuser -v /var/lib/dpkg/lock-frontend /var/lib/dpkg/lock /var/cache/apt/archives/lock >&2 || true
      exit 1
    fi
    sleep 5
    waited=$((waited + 5))
  done
}

apt_get() {
  local n=0
  local max=120
  local logf
  logf="$(mktemp)"
  while true; do
    wait_for_apt
    if apt-get "$@" 2>&1 | tee "$logf"; then
      rm -f "$logf"
      return 0
    fi
    if ! grep -q "lock-frontend\|Unable to acquire the dpkg frontend lock\|Could not get lock" "$logf"; then
      rm -f "$logf"
      exit 1
    fi
    n=$((n + 1))
    if (( n >= max )); then
      rm -f "$logf"
      echo "apt-get gav upp efter ${n} försök p.g.a. dpkg-lås" >&2
      exit 1
    fi
    log "apt är upptaget, väntar 5s (${n}/${max})"
    sleep 5
  done
}

export DEBIAN_FRONTEND=noninteractive

log "Paket"
apt_get update -y
apt_get install -y --no-install-recommends \
  ca-certificates curl git ufw unattended-upgrades \
  gnupg apt-transport-https openssl openssh-client

if ! command -v docker >/dev/null 2>&1; then
  log "Docker"
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  . /etc/os-release
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt_get update -y
  apt_get install -y --no-install-recommends \
    docker-ce docker-ce-cli containerd.io docker-compose-plugin docker-buildx-plugin
fi
systemctl enable --now docker

log "Användare ${APP_USER}"
id "$APP_USER" >/dev/null 2>&1 || adduser --disabled-password --gecos "" "$APP_USER"
usermod -aG docker "$APP_USER"
usermod -aG sudo "$APP_USER"
echo "$APP_USER ALL=(ALL) NOPASSWD:ALL" > "/etc/sudoers.d/$APP_USER"
chmod 440 "/etc/sudoers.d/$APP_USER"

install -d -m 700 -o "$APP_USER" -g "$APP_USER" "/home/${APP_USER}/.ssh"
AUTH_KEYS="/home/${APP_USER}/.ssh/authorized_keys"
touch "$AUTH_KEYS"
chmod 600 "$AUTH_KEYS"
chown "$APP_USER:$APP_USER" "$AUTH_KEYS"

log "SSH-nycklar för Cursor och GitHub Actions"
install -d -m 700 "$ACCESS_DIR"
ensure_key() {
  local name="$1"
  local comment="$2"
  local key="${ACCESS_DIR}/${name}"
  if [[ ! -f "$key" ]]; then
    ssh-keygen -t ed25519 -f "$key" -C "$comment" -N ""
  fi
  chmod 600 "$key" "${key}.pub"
  local pub
  pub="$(cat "${key}.pub")"
  grep -qxF "$pub" "$AUTH_KEYS" || echo "$pub" >> "$AUTH_KEYS"
}
ensure_key cursor_agent "cursor-agent-korpasset"
ensure_key github_actions "github-actions-korpasset"
chown "$APP_USER:$APP_USER" "$AUTH_KEYS"

if [[ -n "${EXTRA_SSH_PUBKEY:-}" ]]; then
  grep -qxF "$EXTRA_SSH_PUBKEY" "$AUTH_KEYS" || echo "$EXTRA_SSH_PUBKEY" >> "$AUTH_KEYS"
  chown "$APP_USER:$APP_USER" "$AUTH_KEYS"
fi

log "Brandvägg"
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable
dpkg-reconfigure -f noninteractive unattended-upgrades >/dev/null || true

mark_git_safe() {
  git config --global --get-all safe.directory 2>/dev/null | grep -Fxq "$APP_PATH" \
    || git config --global --add safe.directory "$APP_PATH"
}

log "Klonar ${REPO_URL}"
mkdir -p "$(dirname "$APP_PATH")"
if [[ -d "$APP_PATH" ]]; then
  mark_git_safe
fi
if [[ ! -d "$APP_PATH/.git" ]]; then
  git clone "$REPO_URL" "$APP_PATH"
fi
mark_git_safe
cd "$APP_PATH"
git fetch origin --prune

pick_ref() {
  local ref
  local -a refs=()
  if [[ -n "${REPO_REF:-}" ]]; then
    refs+=("$REPO_REF")
  fi
  # Never fall back to cursor/vps-bootstrap-korpasset-aca8 — that branch
  # carries old application code without admin/webhook/migrations.
  refs+=(main)
  for ref in "${refs[@]}"; do
    if git cat-file -e "origin/${ref}:deploy/docker-compose.yml" 2>/dev/null; then
      git checkout -B "$ref" "origin/${ref}"
      return 0
    fi
  done
  return 1
}
if ! pick_ref; then
  echo "Hittade ingen branch med deploy/docker-compose.yml" >&2
  exit 1
fi
chown -R "$APP_USER:$APP_USER" "$APP_PATH"

ENV_FILE="$APP_PATH/deploy/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  log "Skapar ${ENV_FILE}"
  umask 077
  cat > "$ENV_FILE" <<EOF
POSTGRES_PASSWORD=$(openssl rand -hex 24)
SESSION_SECRET=$(openssl rand -hex 32)
APP_BASE_URL=https://${DOMAIN}
RESEND_API_KEY=
RESEND_WEBHOOK_SECRET=
EMAIL_FROM=Körpasset <support@korpasset.se>
EOF
fi
chown "$APP_USER:$APP_USER" "$ENV_FILE"
chmod 600 "$ENV_FILE"

log "Startar Postgres, app och Caddy"
$COMPOSE up -d --build

log "Väntar på /health"
ok=0
for _ in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:3000/health >/dev/null 2>&1; then
    ok=1
    break
  fi
  sleep 2
done
if [[ "$ok" -ne 1 ]]; then
  echo "Appen svarade inte på http://127.0.0.1:3000/health" >&2
  $COMPOSE ps >&2
  $COMPOSE logs --tail=80 app >&2
  exit 1
fi

if [[ -x "$APP_PATH/scripts/vps-install-backup-timer.sh" ]]; then
  log "Daglig databasbackup (14 dagar)"
  VPS_APP_PATH="$APP_PATH" VPS_USER="$APP_USER" bash "$APP_PATH/scripts/vps-install-backup-timer.sh"
fi

if [[ -n "${GH_TOKEN:-}" ]]; then
  log "Sätter GitHub environment vps"
  if ! command -v gh >/dev/null 2>&1; then
    curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
      | gpg --dearmor -o /usr/share/keyrings/githubcli-archive-keyring.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
      > /etc/apt/sources.list.d/github-cli.list
    apt_get update -y
    apt_get install -y gh
  fi
  unset GITHUB_TOKEN
  echo "$GH_TOKEN" | gh auth login --with-token
  gh api -X PUT repos/pontusburman-papabravo/korpasset/environments/vps >/dev/null
  gh secret set VPS_SSH_KEY --repo pontusburman-papabravo/korpasset -e vps \
    < "${ACCESS_DIR}/github_actions"
  gh variable set VPS_HOST --repo pontusburman-papabravo/korpasset -e vps -b "$VPS_HOST"
  gh variable set VPS_USER --repo pontusburman-papabravo/korpasset -e vps -b "$APP_USER"
  gh variable set VPS_APP_PATH --repo pontusburman-papabravo/korpasset -e vps -b "$APP_PATH"
  gh variable set VPS_HEALTH_URL --repo pontusburman-papabravo/korpasset -e vps -b http://127.0.0.1:3000/health
fi

cat <<EOF

============================================================
Körpasset är installerat på den här servern.

Lokalt:   curl -fsS http://127.0.0.1:3000/health
Publikt:  https://${DOMAIN}/health
Kod:      ${APP_PATH}
Nycklar:  ${ACCESS_DIR}  (bara root kan läsa)

Kvar utanför servern — Cursor kan inte SSH:a förrän detta är gjort:

1) Cursor → Cloud Agents → Secrets
   Runtime Secret  VPS_SSH_KEY  = utskriften av:
     cat ${ACCESS_DIR}/cursor_agent
   Environment variables:
     VPS_HOST=${VPS_HOST}
     VPS_USER=${APP_USER}
     VPS_APP_PATH=${APP_PATH}

2) GitHub environment vps (hoppa över om du körde med GH_TOKEN=...)
   https://github.com/pontusburman-papabravo/korpasset/settings/environments
     cat ${ACCESS_DIR}/github_actions
   samma VPS_HOST / VPS_USER / VPS_APP_PATH
   VPS_HEALTH_URL=http://127.0.0.1:3000/health

Starta en ny Cursor-agent efter steg 1. Klistra inte in privata nycklar i chatten.
============================================================
EOF
