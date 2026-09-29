#!/bin/sh
# Xcode Cloud runs this after git clone and before Swift package resolution.
# CapApp-SPM points at native/node_modules; public/, capacitor.config.json and
# config.xml are gitignored. Both must exist before xcodebuild.
set -e

export HOMEBREW_NO_AUTO_UPDATE=1
export HOMEBREW_NO_INSTALL_CLEANUP=1
export HOMEBREW_NO_INSTALLED_DEPENDENTS_CHECK=1

echo "===== Körpasset Xcode Cloud: post-clone ====="

if [ -n "${CI_PRIMARY_REPOSITORY_PATH:-}" ]; then
  REPO="$CI_PRIMARY_REPOSITORY_PATH"
else
  REPO="$(CDPATH= cd -- "$(dirname "$0")/../../../.." && pwd)"
fi

NATIVE="$REPO/native"

if [ ! -f "$NATIVE/package.json" ]; then
  echo "error: native/package.json not found under $REPO" >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "===== Installing node@22 ====="
  brew install node@22
fi

BREW_PREFIX="$(brew --prefix 2>/dev/null || true)"
if [ -n "$BREW_PREFIX" ] && [ -d "$BREW_PREFIX/opt/node@22/bin" ]; then
  PATH="$BREW_PREFIX/opt/node@22/bin:$PATH"
  export PATH
fi

if ! command -v node >/dev/null 2>&1; then
  echo "error: node is not on PATH after Homebrew install" >&2
  exit 1
fi

echo "node $(node -v)"
echo "npm $(npm -v)"

# Known Xcode Cloud npm stall: limit concurrent sockets.
npm config set maxsockets 3

cd "$NATIVE"
npm ci
npx cap sync ios

if [ ! -f "$NATIVE/ios/App/App/capacitor.config.json" ]; then
  echo "error: cap sync ios did not write App/capacitor.config.json" >&2
  exit 1
fi

echo "===== Capacitor iOS sync complete ====="

# Xcode Cloud resolves packages with automatic resolution disabled. cap sync
# just added Alamofire/GoogleSignIn via CapApp-SPM, so Package.resolved must
# exist before that step or xcodebuild fails.
PROJECT="$NATIVE/ios/App/App.xcodeproj"
if command -v xcodebuild >/dev/null 2>&1; then
  echo "===== Resolving Swift packages ====="
  xcodebuild -resolvePackageDependencies \
    -project "$PROJECT" \
    -scheme App
  RESOLVED="$PROJECT/project.xcworkspace/xcshareddata/swiftpm/Package.resolved"
  if [ ! -f "$RESOLVED" ]; then
    echo "error: xcodebuild did not write $RESOLVED" >&2
    exit 1
  fi
  echo "===== Package.resolved written ====="
fi

exit 0
