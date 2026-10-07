#!/bin/sh
# Re-apply the Sign in with Apple window selection after npm install.
# Already-patched checkouts are left untouched.
set -eu

root=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
pkg="$root/node_modules/@capgo/capacitor-social-login"
provider="$pkg/ios/Sources/SocialLoginPlugin/AppleProvider.swift"
patch="$root/patches/capacitor-social-login-apple-presentation.patch"

if [ ! -f "$provider" ]; then
  echo "social-login is not installed; skipping Apple presentation patch" >&2
  exit 0
fi

if grep -q "korpassetApplePresentationWindow" "$provider"; then
  exit 0
fi

patch -p1 -d "$pkg" --forward --input "$patch"
