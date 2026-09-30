#!/usr/bin/env bash
# Xcode Cloud clones the repo without node_modules. CapApp-SPM references
# @capacitor/app and @capgo/capacitor-social-login there, so those packages
# must exist before Xcode resolves Swift package dependencies.
#
# Xcode Cloud also disables automatic Swift package resolution. Local path
# packages are not listed in Package.resolved, so the archive stops unless
# resolution is turned back on for this build.
set -euo pipefail

defaults write com.apple.dt.Xcode IDEDisableAutomaticPackageResolution -bool NO
defaults write com.apple.dt.Xcode IDEPackageOnlyUseVersionsFromResolvedFile -bool NO

export HOMEBREW_NO_INSTALL_CLEANUP=TRUE
export HOMEBREW_NO_AUTO_UPDATE=1

brew install node@22
export PATH="$(brew --prefix node@22)/bin:${PATH}"
hash -r

cd "${CI_PRIMARY_REPOSITORY_PATH}/native"
npm ci --include=dev
npx cap sync ios
