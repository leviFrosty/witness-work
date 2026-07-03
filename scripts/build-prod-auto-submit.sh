#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

START_TIME=$SECONDS

# Format a duration in seconds as e.g. "40s", "3m 40s", or "1h 3m 40s".
format_duration() {
  local total=$1 h m s out=""
  h=$((total / 3600))
  m=$(((total % 3600) / 60))
  s=$((total % 60))
  [ "$h" -gt 0 ] && out+="${h}h "
  { [ "$h" -gt 0 ] || [ "$m" -gt 0 ]; } && out+="${m}m "
  out+="${s}s"
  echo "$out"
}

# Format a byte count as e.g. "85KB", "102MB", or "1.1GB".
format_size() {
  local bytes=$1
  awk -v b="$bytes" 'BEGIN {
    split("B KB MB GB TB", u, " ")
    i = 1
    while (b >= 1024 && i < 5) { b /= 1024; i++ }
    if (i == 1) printf "%d%s\n", b, u[i]
    else printf "%.1f%s\n", b, u[i]
  }'
}

IPA=./build-production.ipa
APP_ID=$(node -p "require('./eas.json').submit.production.ios.ascAppId")

# Production env comes from .env.production (.env holds development values).
# Local builds don't receive EAS secret env vars (e.g. SENTRY_AUTH_TOKEN, which
# the Sentry source-map upload phase fails hard without), so export everything
# into the shell — the local build job inherits it.
if [ ! -f .env.production ]; then
  echo "error: .env.production not found — copy .env.example and fill in production values" >&2
  exit 1
fi
set -a
# shellcheck disable=SC1091
source .env.production
set +a
if [ -z "${SENTRY_AUTH_TOKEN:-}" ]; then
  echo "error: SENTRY_AUTH_TOKEN not set in .env.production" >&2
  exit 1
fi

pnpm sync:widget-shared

rm -f "$IPA"
eas build -p ios --profile production --local --non-interactive --output "$IPA"

# Pull the shipped version + build number straight from the IPA so the summary
# reflects what actually got built (build number is remotely auto-incremented).
PLIST_TMP=$(mktemp -d)
trap 'rm -rf "$PLIST_TMP"' EXIT
unzip -o -q "$IPA" 'Payload/*.app/Info.plist' -d "$PLIST_TMP"
INFO_PLIST=$(find "$PLIST_TMP/Payload" -maxdepth 2 -name Info.plist | head -n 1)
VERSION=$(plutil -extract CFBundleShortVersionString raw "$INFO_PLIST")
BUILD=$(plutil -extract CFBundleVersion raw "$INFO_PLIST")

IPA_BYTES=$(stat -f%z "$IPA")

echo "Uploading $IPA to App Store Connect (app $APP_ID)..."
asc builds upload --app "$APP_ID" --ipa "$IPA"

echo
echo "──────────────────────────────────────────"
echo "  Build & submit complete"
echo "  Version:  $VERSION"
echo "  Build:    $BUILD"
echo "  Size:     $(format_size "$IPA_BYTES") ($IPA_BYTES bytes)"
echo "  Duration: $(format_duration $((SECONDS - START_TIME)))"
echo "──────────────────────────────────────────"
