#!/usr/bin/env bash
# Classification and Papa Bravo rollback tests for scripts/vps-deploy-revision.sh.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=scripts/vps-deploy-revision.sh
source "$ROOT/scripts/vps-deploy-revision.sh"

failures=0

assert_eq() {
  local got="$1"
  local want="$2"
  local label="$3"
  if [[ "$got" != "$want" ]]; then
    echo "FAIL $label: got [$got] want [$want]" >&2
    failures=$((failures + 1))
    return 0
  fi
  echo "ok $label"
}

assert_status() {
  local status=0
  "$@" || status=$?
  if [[ "$status" -ne 0 ]]; then
    echo "FAIL command failed ($status): $*" >&2
    failures=$((failures + 1))
  fi
  return 0
}

plan_of() {
  local status="$1"
  shift
  deploy_plan "$status" "$@"
}

assert_eq "$(plan_of ancestor deploy/Caddyfile docs/operations/papabravo-release.md)" config "caddy and docs are config"
assert_eq "$(plan_of unknown .github/workflows/deploy.yml scripts/vps-deploy-revision.sh)" config "workflow and deploy script are config"
assert_eq "$(plan_of ancestor)" config "empty diff is config"
assert_eq "$(plan_of unknown app/tests/oauth.test.ts scripts/vps-deploy-plan.test.sh)" config "tests are config"
assert_eq "$(plan_of ancestor README.md)" config "markdown is config"

assert_eq "$(plan_of ancestor app/src/http/oauth.ts)" app "app source on an ancestor is an app deploy"
assert_eq "$(plan_of ancestor deploy/docker-compose.yml)" app "compose file is an app deploy"
assert_eq "$(plan_of ancestor deploy/Dockerfile)" app "Dockerfile is an app deploy"
assert_eq "$(plan_of ancestor scripts/vps-backup.sh)" app "backup script is an app deploy"
assert_eq "$(plan_of ancestor db/migrations/0005_new.sql)" app "migration is an app deploy"
assert_eq "$(plan_of ancestor docs/domain/skill-taxonomy-v1.json)" app "taxonomy json is an app deploy"
assert_eq "$(plan_of ancestor app/src/http/oauth.ts docs/operations/vps-access.md)" app "mixed app and docs is an app deploy"

assert_eq "$(plan_of not-ancestor app/src/http/oauth.ts)" preserve-app "diverged app history preserves the running app"
assert_eq "$(plan_of not-ancestor deploy/docker-compose.yml docs/operations/vps-access.md)" preserve-app "diverged compose change preserves the running app"
assert_eq "$(plan_of not-ancestor app/public/app-oauth.js)" preserve-app "diverged public asset preserves the running app"

assert_eq "$(plan_of unknown app/src/http/oauth.ts)" refuse "unknown ancestry with app files refuses"
assert_eq "$(plan_of unknown deploy/Dockerfile)" refuse "unknown ancestry with Dockerfile refuses"
assert_eq "$(plan_of unknown scripts/vps-ssh.sh)" refuse "unknown ancestry with ssh helper refuses"
assert_eq "$(plan_of "" app/src/index.ts)" refuse "blank ancestry refuses"

if path_is_config_only deploy/docker-compose.yml; then
  echo "FAIL docker-compose.yml must not be config-only" >&2
  failures=$((failures + 1))
else
  echo "ok docker-compose.yml is app-relevant"
fi

rollback_src="$(declare -f rollback_app_container)"
if [[ "$rollback_src" != *"up -d --build --no-deps app"* ]]; then
  echo "FAIL app rollback must rebuild only the app service" >&2
  failures=$((failures + 1))
else
  echo "ok app rollback rebuilds only app"
fi
if [[ "$rollback_src" == *postgres* ]]; then
  echo "FAIL app rollback must not name postgres" >&2
  failures=$((failures + 1))
else
  echo "ok app rollback does not name postgres"
fi

without_src="$(declare -f deploy_without_app_build)"
if [[ "$without_src" == *"compose"* ]]; then
  echo "FAIL config and preserve-app path must not call compose" >&2
  failures=$((failures + 1))
else
  echo "ok config and preserve-app path does not call compose"
fi

app_src="$(declare -f deploy_app)"
if [[ "$app_src" != *'up -d --build'* ]]; then
  echo "FAIL app plan must keep compose up -d --build" >&2
  failures=$((failures + 1))
else
  echo "ok app plan uses compose up -d --build"
fi

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

init_repo() {
  local dir="$1"
  git init -b main "$dir" >/dev/null
  git -C "$dir" config user.email "deploy-test@example.com"
  git -C "$dir" config user.name "deploy-test"
  git -C "$dir" config commit.gpgsign false
  git -C "$dir" config advice.detachedHead false
}

commit_file() {
  local dir="$1"
  local path="$2"
  local message="$3"
  mkdir -p "$dir/$(dirname "$path")"
  cat >"$dir/$path"
  git -C "$dir" add "$path"
  git -C "$dir" commit -m "$message" >/dev/null
}

init_repo "$tmp/rollback"
APP_PATH="$tmp/rollback"
printf '%s\n' 'korpasset.se {' 'reverse_proxy app:3000' '}' | commit_file "$tmp/rollback" deploy/Caddyfile "without papa bravo"
sha_without="$(git -C "$tmp/rollback" rev-parse HEAD)"
printf '%s\n' 'papabravo.se {' 'root * /data/sites/papabravo' '}' | commit_file "$tmp/rollback" deploy/Caddyfile "with papa bravo"
sha_with="$(git -C "$tmp/rollback" rev-parse HEAD)"
snapshot="$(mktemp)"
cp "$tmp/rollback/deploy/Caddyfile" "$snapshot"
PREVIOUS_SHA="$sha_without"
restore_tree_keeping_papabravo "$snapshot"
assert_eq "$(git -C "$tmp/rollback" rev-parse HEAD)" "$sha_without" "rollback moves HEAD to the previous app revision"
if caddyfile_serves_papabravo "$tmp/rollback/deploy/Caddyfile"; then
  echo "ok rollback keeps a Papa Bravo Caddyfile the previous revision lacks"
else
  echo "FAIL rollback dropped papabravo.se" >&2
  failures=$((failures + 1))
fi

git -C "$tmp/rollback" checkout --force "$sha_with" >/dev/null
printf '%s\n' 'papabravo.se {' 'root * /data/sites/papabravo' '# later' '}' | commit_file "$tmp/rollback" deploy/Caddyfile "later papa bravo"
printf '%s\n' 'papabravo.se SNAPSHOT /data/sites/papabravo' >"$snapshot"
PREVIOUS_SHA="$sha_with"
restore_tree_keeping_papabravo "$snapshot"
assert_eq "$(git -C "$tmp/rollback" rev-parse HEAD)" "$sha_with" "rollback to a Papa Bravo revision checks that revision out"
if grep -q SNAPSHOT "$tmp/rollback/deploy/Caddyfile"; then
  echo "FAIL snapshot replaced a revision that already serves papabravo.se" >&2
  failures=$((failures + 1))
else
  echo "ok rollback uses the previous Papa Bravo Caddyfile"
fi
rm -f "$snapshot"

init_repo "$tmp/linear"
printf 'one\n' | commit_file "$tmp/linear" app/src/main.ts "one"
linear_root="$(git -C "$tmp/linear" rev-parse HEAD)"
printf 'two\n' | commit_file "$tmp/linear" app/src/main.ts "two"
linear_tip="$(git -C "$tmp/linear" rev-parse HEAD)"
APP_PATH="$tmp/linear"
assert_eq "$(ancestor_status "$linear_root" "$linear_tip")" ancestor "linear history is an ancestor"
assert_eq "$(ancestor_status "$linear_tip" "$linear_root")" not-ancestor "child is not an ancestor of its parent"

init_repo "$tmp/side"
printf 'base\n' | commit_file "$tmp/side" README.md "base"
side_base="$(git -C "$tmp/side" rev-parse HEAD)"
printf 'mainline\n' | commit_file "$tmp/side" app/src/main.ts "mainline"
side_main="$(git -C "$tmp/side" rev-parse HEAD)"
git -C "$tmp/side" checkout --force "$side_base" >/dev/null
printf 'other\n' | commit_file "$tmp/side" app/src/other.ts "other"
side_other="$(git -C "$tmp/side" rev-parse HEAD)"
APP_PATH="$tmp/side"
assert_eq "$(ancestor_status "$side_other" "$side_main")" not-ancestor "diverged commits are not ancestors"

APP_PATH="$tmp/linear"
assert_eq "$(ancestor_status "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" "$linear_tip")" unknown "missing previous commit is unknown"
assert_eq "$(ancestor_status "$linear_root" "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb")" unknown "missing target commit is unknown"

# Shallow clone: both objects exist, but the parent chain is truncated.
# That must not be reported as not-ancestor.
origin="$tmp/origin"
init_repo "$origin"
git -C "$origin" config uploadpack.allowReachableSHA1InWant true
git -C "$origin" config uploadpack.allowAnySHA1InWant true
printf 'root\n' | commit_file "$origin" app/src/main.ts "root"
origin_root="$(git -C "$origin" rev-parse HEAD)"
i=0
while [[ "$i" -lt 6 ]]; do
  printf 'step-%s\n' "$i" | commit_file "$origin" app/src/main.ts "step $i"
  i=$((i + 1))
done
origin_tip="$(git -C "$origin" rev-parse HEAD)"
git clone --depth 2 "file://$origin" "$tmp/shallow" >/dev/null
git -C "$tmp/shallow" fetch --depth 1 origin "$origin_root" >/dev/null
APP_PATH="$tmp/shallow"
shallow_status="$(ancestor_status "$origin_root" "$origin_tip")"
if [[ "$shallow_status" == "not-ancestor" ]]; then
  echo "FAIL shallow truncation was treated as divergence ($shallow_status)" >&2
  failures=$((failures + 1))
else
  assert_eq "$shallow_status" ancestor "shallow truncation still proves ancestry"
fi

# The side commit exists locally and is absent from the target's completed history.
git -C "$tmp/shallow" remote add side "file://$tmp/side"
git -C "$tmp/shallow" fetch --depth 1 side "$side_other" >/dev/null
APP_PATH="$tmp/shallow"
# Complete the shallow tip against origin, then compare with an unrelated object.
divergent_status="$(ancestor_status "$side_other" "$origin_tip")"
assert_eq "$divergent_status" not-ancestor "unrelated commit stays not-ancestor after history is complete"

# Rename keeps both paths so an app file moved into docs is still app-relevant.
init_repo "$tmp/rename"
printf 'code\n' | commit_file "$tmp/rename" app/src/moved.ts "add code"
rename_base="$(git -C "$tmp/rename" rev-parse HEAD)"
mkdir -p "$tmp/rename/docs"
git -C "$tmp/rename" mv app/src/moved.ts docs/moved.md
git -C "$tmp/rename" commit -m "move to docs" >/dev/null
rename_tip="$(git -C "$tmp/rename" rev-parse HEAD)"
APP_PATH="$tmp/rename"
rename_paths="$(collect_changed_paths "$rename_base" "$rename_tip")"
if [[ "$rename_paths" != *"app/src/moved.ts"* || "$rename_paths" != *"docs/moved.md"* ]]; then
  echo "FAIL rename diff dropped a path: [$rename_paths]" >&2
  failures=$((failures + 1))
else
  echo "ok rename diff keeps both paths"
fi
mapfile -t rename_array <<<"$rename_paths"
assert_eq "$(deploy_plan ancestor "${rename_array[@]}")" app "rename out of app still deploys the app"

if [[ "$failures" -ne 0 ]]; then
  echo "$failures test(s) failed" >&2
  exit 1
fi
echo "all deploy plan tests passed"
