#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

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

echo "Uploading $IPA to App Store Connect (app $APP_ID)..."
asc builds upload --app "$APP_ID" --ipa "$IPA"
