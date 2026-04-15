#!/usr/bin/env bash
# Reinstall the most recent production-simulator build on the booted simulator
# without rebuilding. Uses the .app cached by `pnpm e2e:install`.
#
# Use when the simulator has lost the app — typically after Maestro clearState
# was interrupted mid-run, or the device was erased.
set -euo pipefail

BUNDLE_ID='com.leviwilkerson.jwtime'
CACHED_APP="$(pwd)/.e2e/WitnessWork.app"

if [[ ! -d "$CACHED_APP" ]]; then
  echo "No cached build found at $CACHED_APP." >&2
  echo 'Run `pnpm e2e:install` first to produce one.' >&2
  exit 1
fi

if ! xcrun simctl list devices booted | /usr/bin/grep -q Booted; then
  echo 'No booted simulator found. Open Simulator.app and boot a device.' >&2
  exit 1
fi

echo "==> Installing cached $CACHED_APP"
xcrun simctl install booted "$CACHED_APP"

echo "==> Launching $BUNDLE_ID"
xcrun simctl launch booted "$BUNDLE_ID" >/dev/null

echo '==> Done.'
