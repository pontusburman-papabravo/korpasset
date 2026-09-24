#!/usr/bin/env bash
# Fast-forward the VPS checkout to a tested SHA and rebuild.
# Must use --project-directory deploy/ so the existing Compose project
# (`deploy`) and volumes (`deploy_postgres_data`) are reused.
set -euo pipefail

APP_PATH="${VPS_APP_PATH:-/var/www/korpasset}"
ENV_FILE="$APP_PATH/deploy/.env"
cd "$APP_PATH"

if [[ -z "${DEPLOY_SHA:-}" ]]; then
  echo "DEPLOY_SHA is required" >&2
  exit 1
fi
if ! [[ "$DEPLOY_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Invalid DEPLOY_SHA: $DEPLOY_SHA" >&2
  exit 1
fi

git fetch --depth 1 origin "$DEPLOY_SHA"

require_tree_path() {
  local path="$1"
  if ! git cat-file -e "$DEPLOY_SHA:$path" 2>/dev/null; then
    echo "SHA $DEPLOY_SHA is missing $path — refusing checkout" >&2
    exit 1
  fi
}

require_tree_path deploy/docker-compose.yml
require_tree_path deploy/Dockerfile
require_tree_path scripts/vps-deploy-revision.sh
require_tree_path scripts/vps-backup.sh
require_tree_path scripts/vps-install-backup-timer.sh

# Never print values. Empty or missing keys fail the deploy.
require_env_nonempty() {
  local key="$1"
  if [[ ! -f "$ENV_FILE" ]]; then
    echo "Missing $ENV_FILE — refusing deploy" >&2
    exit 1
  fi
  local line value
  line="$(grep -E "^${key}=" "$ENV_FILE" | tail -n1 || true)"
  if [[ -z "$line" ]]; then
    echo "$key is not set in deploy/.env — refusing deploy" >&2
    exit 1
  fi
  value="${line#*=}"
  value="${value%$'\r'}"
  if [[ "$value" == \"*\" ]]; then
    value="${value#\"}"
    value="${value%\"}"
  elif [[ "$value" == \'*\' ]]; then
    value="${value#\'}"
    value="${value%\'}"
  fi
  if [[ -z "$value" ]]; then
    echo "$key is empty in deploy/.env — public beta deploy requires it" >&2
    exit 1
  fi
}

require_env_nonempty POSTGRES_PASSWORD
require_env_nonempty SESSION_SECRET
require_env_nonempty RESEND_API_KEY
require_env_nonempty RESEND_WEBHOOK_SECRET

git checkout --force "$DEPLOY_SHA"

if [[ ! -f deploy/docker-compose.yml ]]; then
  echo "SHA $DEPLOY_SHA has no deploy/docker-compose.yml after checkout" >&2
  exit 1
fi

COMPOSE=(docker compose --project-directory "$APP_PATH/deploy" -f "$APP_PATH/deploy/docker-compose.yml")
"${COMPOSE[@]}" up -d --build

for _ in $(seq 1 45); do
  if curl -fsS http://127.0.0.1:3000/health >/dev/null; then
    bash "$APP_PATH/scripts/vps-install-backup-timer.sh"
    echo "Deployed $DEPLOY_SHA"
    exit 0
  fi
  sleep 2
done

echo "Health check failed after deploy of $DEPLOY_SHA" >&2
"${COMPOSE[@]}" ps >&2
"${COMPOSE[@]}" logs --tail=80 app >&2
exit 1
