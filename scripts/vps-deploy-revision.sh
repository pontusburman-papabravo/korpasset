#!/usr/bin/env bash
# Deploy one tested SHA to the VPS.
#
# Three plans, chosen before any checkout:
#   config       Only webserver config, tests, markdown, or GitHub workflows
#                changed. Checkout and reload Caddy if its file changed.
#                Do not build the app or recreate Postgres.
#   app          App-relevant paths changed and the running revision is a
#                proven ancestor. Use the existing Compose build.
#   preserve-app App-relevant paths changed, but the running revision is not
#                an ancestor (the VPS can be on another line of history).
#                Checkout so the tree matches the SHA. Leave app and Postgres
#                running.
#   refuse       App-relevant paths changed and ancestry is not proven.
#                Stop before checkout. A shallow clone must not skip a build.
#
# Must use --project-directory deploy/ so the existing Compose project
# (`deploy`) and volumes (`deploy_postgres_data`) are reused.
set -euo pipefail

APP_PATH="${VPS_APP_PATH:-/var/www/korpasset}"

git_app() {
  git -C "$APP_PATH" "$@"
}

repo_is_shallow() {
  [[ "$(git_app rev-parse --is-shallow-repository 2>/dev/null || echo true)" == "true" ]]
}

shallow_file_path() {
  git_app rev-parse --path-format=absolute --git-path shallow
}

# Runtime input stays app-relevant. docs/domain/*.json is copied into the
# image; only markdown under docs/ is documentation.
path_is_config_only() {
  local path="$1"
  case "$path" in
    deploy/Caddyfile | deploy/check-caddyfile.py | scripts/vps-deploy-revision.sh | scripts/vps-deploy-plan.test.sh)
      return 0
      ;;
    .github/* | app/tests/* | *.md | *.test.ts | *.test.js | *.test.mjs | *.test.sh | *.spec.ts | *.spec.js)
      return 0
      ;;
  esac
  return 1
}

# deploy_plan <ancestor|not-ancestor|unknown> [path...]
deploy_plan() {
  local status="$1"
  shift
  local path app_relevant=0
  for path in "$@"; do
    if ! path_is_config_only "$path"; then
      app_relevant=1
      break
    fi
  done
  if [[ "$app_relevant" -eq 0 ]]; then
    printf '%s\n' config
    return 0
  fi
  case "$status" in
    ancestor) printf '%s\n' app ;;
    not-ancestor) printf '%s\n' preserve-app ;;
    *) printf '%s\n' refuse ;;
  esac
}

caddyfile_serves_papabravo() {
  local file="$1"
  [[ -f "$file" ]] || return 1
  grep -q -F "papabravo.se" "$file" && grep -q -F "/data/sites/papabravo" "$file"
}

collect_changed_paths() {
  local previous="$1"
  local target="$2"
  local out status path
  out="$(mktemp)"
  if ! git_app diff --name-status --find-renames -z "$previous" "$target" >"$out"; then
    rm -f "$out"
    return 1
  fi
  while IFS= read -r -d '' status; do
    case "$status" in
      R* | C*)
        IFS= read -r -d '' path || {
          rm -f "$out"
          return 1
        }
        printf '%s\n' "$path"
        IFS= read -r -d '' path || {
          rm -f "$out"
          return 1
        }
        printf '%s\n' "$path"
        ;;
      *)
        IFS= read -r -d '' path || {
          rm -f "$out"
          return 1
        }
        printf '%s\n' "$path"
        ;;
    esac
  done <"$out"
  rm -f "$out"
}

# A shallow graft hides parents even after those objects have been fetched.
# The target history is complete only when no graft is reachable from it.
target_has_shallow_cut() {
  local target="$1"
  local shallow_file boundary
  shallow_file="$(shallow_file_path)"
  [[ -s "$shallow_file" ]] || return 1
  while IFS= read -r boundary; do
    [[ -n "$boundary" ]] || continue
    if git_app merge-base --is-ancestor "$boundary" "$target" >/dev/null 2>&1; then
      return 0
    fi
  done <"$shallow_file"
  return 1
}

shallow_cuts_of_target() {
  local target="$1"
  local shallow_file boundary
  shallow_file="$(shallow_file_path)"
  [[ -s "$shallow_file" ]] || return 0
  while IFS= read -r boundary; do
    [[ -n "$boundary" ]] || continue
    if git_app merge-base --is-ancestor "$boundary" "$target" >/dev/null 2>&1; then
      printf '%s\n' "$boundary"
    fi
  done <"$shallow_file"
}

# Deepen until the revision walker can see the whole target history.
# Fetching a missing parent object is not enough: the graft stays until --deepen.
complete_target_history() {
  local target="$1"
  local attempt before after
  for attempt in $(seq 1 40); do
    if ! target_has_shallow_cut "$target"; then
      return 0
    fi
    before="$(shallow_cuts_of_target "$target" | sort)"
    echo "Deepening shallow history of $target" >&2
    if ! git_app fetch --no-tags --deepen=200 origin "$target"; then
      echo "Could not deepen history for $target" >&2
      return 1
    fi
    after="$(shallow_cuts_of_target "$target" | sort)"
    if [[ "$before" == "$after" ]]; then
      echo "Deepen made no progress for $target" >&2
      return 1
    fi
  done
  echo "Gave up completing history for $target" >&2
  return 1
}

ancestor_status() {
  local previous="$1"
  local target="$2"
  local rc=0

  if ! git_app cat-file -e "${previous}^{commit}" >/dev/null 2>&1; then
    printf '%s\n' unknown
    return 0
  fi
  if ! git_app cat-file -e "${target}^{commit}" >/dev/null 2>&1; then
    printf '%s\n' unknown
    return 0
  fi

  git_app merge-base --is-ancestor "$previous" "$target" >/dev/null 2>&1 || rc=$?
  if [[ "$rc" -eq 0 ]]; then
    printf '%s\n' ancestor
    return 0
  fi
  if [[ "$rc" -gt 1 ]]; then
    printf '%s\n' unknown
    return 0
  fi
  if ! repo_is_shallow; then
    printf '%s\n' not-ancestor
    return 0
  fi
  if complete_target_history "$target"; then
    rc=0
    git_app merge-base --is-ancestor "$previous" "$target" >/dev/null 2>&1 || rc=$?
    if [[ "$rc" -eq 0 ]]; then
      printf '%s\n' ancestor
      return 0
    fi
    if [[ "$rc" -eq 1 ]] && ! target_has_shallow_cut "$target"; then
      printf '%s\n' not-ancestor
      return 0
    fi
  fi
  printf '%s\n' unknown
  return 0
}

local_changes_are_safe() {
  local line
  local dirty
  dirty="$(git_app status --porcelain)"
  [[ -n "$dirty" ]] || return 0
  while IFS= read -r line; do
    [[ -n "$line" ]] || continue
    case "$line" in
      " M deploy/Caddyfile" | "M  deploy/Caddyfile" | "MM deploy/Caddyfile") ;;
      *)
        return 1
        ;;
    esac
  done <<<"$dirty"
}

# Checkout the previous SHA, then put the pre-checkout Caddyfile back when
# that revision does not serve papabravo.se. App rollback does not call this
# to decide whether Postgres restarts; that is rollback_app_container.
restore_tree_keeping_papabravo() {
  local snapshot="$1"
  local previous="${2:-${PREVIOUS_SHA:-}}"
  if [[ -z "$previous" ]]; then
    echo "No previous revision to restore" >&2
    return 1
  fi
  git_app checkout --force "$previous"
  if ! caddyfile_serves_papabravo "$APP_PATH/deploy/Caddyfile"; then
    if [[ -f "$snapshot" ]] && caddyfile_serves_papabravo "$snapshot"; then
      echo "Previous revision has no Papa Bravo Caddyfile; keeping the running proxy configuration" >&2
      cp "$snapshot" "$APP_PATH/deploy/Caddyfile"
    else
      echo "Previous revision has no Papa Bravo Caddyfile and there is no snapshot to keep" >&2
      return 1
    fi
  fi
}

rollback_app_container() {
  echo "Rebuilding only the app container from $PREVIOUS_SHA" >&2
  "${COMPOSE[@]}" up -d --build --no-deps app || return 1
}

fetch_deploy_sha() {
  if repo_is_shallow; then
    git_app fetch --no-tags --depth 1 origin "$DEPLOY_SHA"
  else
    git_app fetch --no-tags origin "$DEPLOY_SHA"
  fi
}

require_tree_path() {
  local path="$1"
  if ! git_app cat-file -e "$DEPLOY_SHA:$path" >/dev/null 2>&1; then
    echo "SHA $DEPLOY_SHA is missing $path — refusing checkout" >&2
    exit 1
  fi
}

require_env_nonempty() {
  local key="$1"
  local env_file="$APP_PATH/deploy/.env"
  if [[ ! -f "$env_file" ]]; then
    echo "Missing $env_file — refusing deploy" >&2
    exit 1
  fi
  local line value
  line="$(grep -E "^${key}=" "$env_file" | tail -n1 || true)"
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

COMPOSE=()
CADDY_SNAPSHOT=""
CADDY_RECREATED=0

validate_caddyfile() {
  local config="$APP_PATH/deploy/Caddyfile"
  if [[ ! -f "$config" ]]; then
    echo "Missing $config — refusing deploy" >&2
    return 1
  fi
  if ! caddyfile_serves_papabravo "$config"; then
    echo "Checked-out Caddyfile does not serve papabravo.se — refusing to load it" >&2
    return 1
  fi
  echo "Validating Caddyfile"
  docker run --rm --pull never \
    -v "$config:/etc/caddy/Caddyfile:ro" \
    caddy:2-alpine \
    caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
}

# 0 current, 1 different, 2 unreadable. Callers must not recreate on 2
# unless they already know the container should move.
caddy_mount_is_current() {
  local host_sum running_sum
  host_sum="$(md5sum "$APP_PATH/deploy/Caddyfile" | awk '{print $1}')"
  if ! running_sum="$("${COMPOSE[@]}" exec -T caddy md5sum /etc/caddy/Caddyfile 2>/dev/null | awk '{print $1}')"; then
    return 2
  fi
  if [[ -z "$running_sum" ]]; then
    return 2
  fi
  [[ "$host_sum" == "$running_sum" ]]
}

wait_for_caddy() {
  local _i cid status
  for _i in $(seq 1 20); do
    cid="$("${COMPOSE[@]}" ps -q caddy 2>/dev/null || true)"
    if [[ -n "$cid" ]]; then
      status="$(docker inspect -f '{{.State.Status}}' "$cid" 2>/dev/null || true)"
      if [[ "$status" == "running" ]]; then
        return 0
      fi
    fi
    sleep 1
  done
  echo "Caddy did not stay running" >&2
  "${COMPOSE[@]}" logs --tail=40 caddy >&2 || true
  return 1
}

refresh_caddy() {
  local rc=0
  caddy_mount_is_current || rc=$?
  if [[ "$rc" -eq 0 ]]; then
    echo "Caddy is already serving the checked-out Caddyfile"
    return 0
  fi
  if [[ "$rc" -ge 2 ]]; then
    echo "Could not compare the running Caddyfile — not recreating Caddy" >&2
    return 1
  fi
  if ! caddyfile_serves_papabravo "$APP_PATH/deploy/Caddyfile"; then
    echo "Refusing to recreate Caddy without papabravo.se" >&2
    return 1
  fi
  echo "Recreating Caddy to load the checked-out Caddyfile"
  CADDY_RECREATED=1
  "${COMPOSE[@]}" up -d --force-recreate --no-deps caddy || return 1
  wait_for_caddy || return 1
}

wait_for_health() {
  local _i
  for _i in $(seq 1 45); do
    if curl -fsS http://127.0.0.1:3000/health >/dev/null; then
      return 0
    fi
    sleep 2
  done
  return 1
}

rollback_failed_config() {
  echo "Restoring the previous tree without recreating app or Postgres" >&2
  local recreated="${CADDY_RECREATED:-0}"
  restore_tree_keeping_papabravo "$CADDY_SNAPSHOT" || true
  if [[ "$recreated" == "1" ]] && caddyfile_serves_papabravo "$APP_PATH/deploy/Caddyfile"; then
    refresh_caddy || true
  fi
}

rollback_failed_app() {
  echo "Restoring previous app revision $PREVIOUS_SHA" >&2
  restore_tree_keeping_papabravo "$CADDY_SNAPSHOT" || return 1
  rollback_app_container || return 1
  if caddyfile_serves_papabravo "$APP_PATH/deploy/Caddyfile"; then
    refresh_caddy || return 1
  else
    echo "Refusing to reload Caddy without papabravo.se" >&2
    return 1
  fi
  if wait_for_health; then
    echo "Restored $PREVIOUS_SHA after failed deploy of $DEPLOY_SHA" >&2
    return 0
  fi
  echo "Rollback of $PREVIOUS_SHA also failed health" >&2
  return 1
}

deploy_without_app_build() {
  if [[ "$DEPLOY_PLAN" == "preserve-app" ]]; then
    echo "App files differ, but $PREVIOUS_SHA is not an ancestor of $DEPLOY_SHA."
    echo "Leaving the running app and Postgres containers unchanged."
  else
    echo "Config-only change; not rebuilding the app or Postgres."
  fi
  refresh_caddy || return 1
}

deploy_app() {
  echo "App-relevant change on top of $PREVIOUS_SHA; rebuilding with Compose."
  "${COMPOSE[@]}" up -d --build || return 1
  refresh_caddy || return 1
  if ! wait_for_health; then
    return 1
  fi
  bash "$APP_PATH/scripts/vps-install-backup-timer.sh" || return 1
}

print_plan() {
  local path
  printf 'previous=%s\n' "$PREVIOUS_SHA"
  printf 'target=%s\n' "$DEPLOY_SHA"
  printf 'ancestor=%s\n' "$ANCESTOR_STATUS"
  printf 'plan=%s\n' "$DEPLOY_PLAN"
  if local_changes_are_safe; then
    printf 'local_changes=safe\n'
  else
    printf 'local_changes=unsafe\n'
    git_app status --porcelain | sed 's/^/local_change=/'
  fi
  if [[ -n "${CHANGED_PATHS:-}" ]]; then
    while IFS= read -r path; do
      [[ -n "$path" ]] || continue
      printf 'path=%s\n' "$path"
    done <<<"$CHANGED_PATHS"
  fi
}

main() {
  local env_file_needed=1
  cd "$APP_PATH"

  if [[ -z "${DEPLOY_SHA:-}" ]]; then
    echo "DEPLOY_SHA is required" >&2
    exit 1
  fi
  if ! [[ "$DEPLOY_SHA" =~ ^[0-9a-f]{40}$ ]]; then
    echo "Invalid DEPLOY_SHA: $DEPLOY_SHA" >&2
    exit 1
  fi

  fetch_deploy_sha
  DEPLOY_SHA="$(git_app rev-parse "$DEPLOY_SHA")"

  require_tree_path deploy/docker-compose.yml
  require_tree_path deploy/Dockerfile
  require_tree_path deploy/Caddyfile
  require_tree_path scripts/vps-deploy-revision.sh
  require_tree_path scripts/vps-backup.sh
  require_tree_path scripts/vps-install-backup-timer.sh

  # Before any checkout. The workflow repeats this on the runner so an older
  # script extracted from an older SHA is never reached over SSH.
  if ! git_app grep -q -F "papabravo.se" "$DEPLOY_SHA" -- deploy/Caddyfile \
    || ! git_app grep -q -F "/data/sites/papabravo" "$DEPLOY_SHA" -- deploy/Caddyfile; then
    echo "SHA $DEPLOY_SHA deploy/Caddyfile does not serve papabravo.se — refusing checkout" >&2
    exit 1
  fi

  if [[ "${DEPLOY_PLAN_ONLY:-}" == "1" ]]; then
    env_file_needed=0
  fi
  if [[ "$env_file_needed" -eq 1 ]]; then
    require_env_nonempty POSTGRES_PASSWORD
    require_env_nonempty SESSION_SECRET
    require_env_nonempty RESEND_API_KEY
    require_env_nonempty RESEND_WEBHOOK_SECRET
  fi

  PREVIOUS_SHA="$(git_app rev-parse HEAD)"
  COMPOSE=(docker compose --project-directory "$APP_PATH/deploy" -f "$APP_PATH/deploy/docker-compose.yml")
  ANCESTOR_STATUS="$(ancestor_status "$PREVIOUS_SHA" "$DEPLOY_SHA")"
  if ! CHANGED_PATHS="$(collect_changed_paths "$PREVIOUS_SHA" "$DEPLOY_SHA")"; then
    echo "Could not diff $PREVIOUS_SHA and $DEPLOY_SHA — refusing checkout" >&2
    exit 1
  fi
  local -a path_args=()
  if [[ -n "$CHANGED_PATHS" ]]; then
    mapfile -t path_args <<<"$CHANGED_PATHS"
  fi
  DEPLOY_PLAN="$(deploy_plan "$ANCESTOR_STATUS" "${path_args[@]+"${path_args[@]}"}")"

  print_plan
  if [[ "${DEPLOY_PLAN_ONLY:-}" == "1" ]]; then
    exit 0
  fi

  if [[ "$DEPLOY_PLAN" == "refuse" ]]; then
    echo "Refusing checkout of $DEPLOY_SHA: app files differ and ancestry is $ANCESTOR_STATUS" >&2
    exit 1
  fi
  if ! local_changes_are_safe; then
    echo "Refusing checkout; unexpected local changes" >&2
    git_app status --porcelain >&2 || true
    exit 1
  fi

  if [[ -f "$APP_PATH/deploy/Caddyfile" ]]; then
    CADDY_SNAPSHOT="$(mktemp)"
    cp "$APP_PATH/deploy/Caddyfile" "$CADDY_SNAPSHOT"
  fi

  if ! git_app checkout --force "$DEPLOY_SHA"; then
    echo "Checkout of $DEPLOY_SHA failed — restoring the previous tree" >&2
    rollback_failed_config
    exit 1
  fi

  if [[ ! -f "$APP_PATH/deploy/docker-compose.yml" ]]; then
    echo "SHA $DEPLOY_SHA has no deploy/docker-compose.yml after checkout" >&2
    rollback_failed_config
    exit 1
  fi
  if ! caddyfile_serves_papabravo "$APP_PATH/deploy/Caddyfile"; then
    echo "Checkout removed papabravo.se from the Caddyfile — restoring the previous file" >&2
    rollback_failed_config
    exit 1
  fi
  if ! validate_caddyfile; then
    echo "Caddyfile validation failed for $DEPLOY_SHA — leaving running containers unchanged" >&2
    rollback_failed_config
    exit 1
  fi

  case "$DEPLOY_PLAN" in
    config | preserve-app)
      if ! deploy_without_app_build; then
        echo "Caddy refresh failed for $DEPLOY_SHA" >&2
        rollback_failed_config
        exit 1
      fi
      echo "Deployed $DEPLOY_SHA ($DEPLOY_PLAN) without rebuilding the app"
      ;;
    app)
      if ! deploy_app; then
        echo "App deploy failed for $DEPLOY_SHA" >&2
        "${COMPOSE[@]}" ps >&2 || true
        "${COMPOSE[@]}" logs --tail=80 app >&2 || true
        rollback_failed_app || true
        exit 1
      fi
      echo "Deployed $DEPLOY_SHA"
      ;;
    *)
      echo "Unknown deploy plan $DEPLOY_PLAN — refusing" >&2
      rollback_failed_config
      exit 1
      ;;
  esac
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
