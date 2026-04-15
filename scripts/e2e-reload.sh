#!/usr/bin/env bash
# Fast JS-only reload for an already-installed production-simulator build.
# Bundles JS locally (release mode), overwrites main.jsbundle + assets inside
# the installed .app, then relaunches. ~30s vs ~5min for a full EAS rebuild.
#
# Does NOT cover native changes (new package, Info.plist, entitlements). For
# those, re-run `pnpm e2e:install`.
set -euo pipefail

BUNDLE_ID='com.leviwilkerson.jwtime'
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

echo '==> Checking booted simulator'
if ! xcrun simctl list devices booted | /usr/bin/grep -q Booted; then
  echo 'No booted simulator found. Open Simulator.app and boot a device.' >&2
  exit 1
fi

echo '==> Verifying app is installed'
if ! APP_PATH="$(xcrun simctl get_app_container booted "$BUNDLE_ID" 2>/dev/null)"; then
  echo "App $BUNDLE_ID not installed. Run 'pnpm e2e:install' first." >&2
  exit 1
fi

echo '==> Bundling JS (release mode)'
pnpm exec expo export:embed \
  --platform ios \
  --dev false \
  --entry-file src/index.js \
  --bundle-output "$WORK_DIR/main.jsbundle" \
  --assets-dest "$WORK_DIR/assets"

echo "==> Overwriting bundle in $APP_PATH"
cp "$WORK_DIR/main.jsbundle" "$APP_PATH/main.jsbundle"
if [[ -d "$WORK_DIR/assets" ]]; then
  cp -R "$WORK_DIR/assets/." "$APP_PATH/"
fi

echo '==> Relaunching app'
xcrun simctl terminate booted "$BUNDLE_ID" 2>/dev/null || true
xcrun simctl launch booted "$BUNDLE_ID" >/dev/null

echo '==> Done. Run `pnpm e2e` to execute tests.'
