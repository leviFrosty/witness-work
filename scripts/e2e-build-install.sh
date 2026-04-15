#!/usr/bin/env bash
# Build a standalone iOS simulator .app (production-simulator profile), cache
# it to .e2e/, install on the booted simulator, and launch. Similar to
# `pnpm ios` but produces a bundled app suitable for Maestro e2e tests
# (no Metro / dev client required).
#
# The .app is preserved at .e2e/WitnessWork.app so `pnpm e2e:reinstall` can
# reinstall without a full rebuild (useful after Maestro clearState uninstalls
# it mid-run, or when the sim device is reset).
set -euo pipefail

BUNDLE_ID='com.leviwilkerson.jwtime'
CACHE_DIR="$(pwd)/.e2e"
CACHED_APP="$CACHE_DIR/WitnessWork.app"
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

echo '==> Ensuring a simulator is booted'
if ! xcrun simctl list devices booted | /usr/bin/grep -q Booted; then
  echo 'No booted simulator found. Open Simulator.app and boot a device, then retry.' >&2
  exit 1
fi

echo '==> Building production-simulator iOS app (local)'
rm -f build-*.tar.gz
pnpm exec eas build --profile production-simulator --platform ios --local --non-interactive --output "$WORK_DIR/build.tar.gz"

echo '==> Extracting .app'
tar -xzf "$WORK_DIR/build.tar.gz" -C "$WORK_DIR"
APP_PATH="$(find "$WORK_DIR" -maxdepth 2 -name '*.app' -type d | head -n1)"
if [[ -z "$APP_PATH" ]]; then
  echo 'No .app found in build output' >&2
  exit 1
fi

echo "==> Caching $APP_PATH to $CACHED_APP"
mkdir -p "$CACHE_DIR"
rm -rf "$CACHED_APP"
cp -R "$APP_PATH" "$CACHED_APP"

echo "==> Installing on booted simulator"
xcrun simctl install booted "$CACHED_APP"

echo "==> Launching $BUNDLE_ID"
xcrun simctl launch booted "$BUNDLE_ID"

echo '==> Done. Run `pnpm e2e` to execute tests.'
echo '    If the simulator loses the app later, run `pnpm e2e:reinstall` to restore it.'
