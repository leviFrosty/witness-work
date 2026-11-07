#!/usr/bin/env bash
# Smoke test for .github/workflows/services.yml. Needs SITE, SEARCH and
# EXPECT_NOINDEX ('true' on staging, 'false' on production). Optional:
# ALLOW_EMPTY_INDEX ('true' on staging only) and LEGACY_SEARCH (the old search
# host, production only). New custom domains can take a minute to get their
# certificate, so each URL is retried for up to 5 minutes.
set -euo pipefail

HEADERS=$(mktemp)
BODY=$(mktemp)

# Response bodies come from the network: never let the log run them as
# workflow commands, and keep them short.
show_body() {
  local token
  token=$(openssl rand -hex 16)
  echo "::stop-commands::$token"
  head -c 2000 "$BODY"
  echo
  echo "::$token::"
}

fetch() { # url -> headers in $HEADERS, body in $BODY; fails until 200
  local url=$1
  for attempt in $(seq 1 30); do
    if curl -sS --max-time 20 -D "$HEADERS" -o "$BODY" "$url" &&
      head -1 "$HEADERS" | grep -q ' 200'; then
      return 0
    fi
    echo "waiting for $url (attempt $attempt)"
    sleep 10
  done
  echo "::error::$url never answered 200"
  return 1
}

fetch "$SITE/"
noindex_header=false
noindex_meta=false
grep -qi '^x-robots-tag:.*noindex' "$HEADERS" && noindex_header=true
grep -qiE '<meta name="?robots"? content="?[^">]*noindex' "$BODY" && noindex_meta=true
if [ "$EXPECT_NOINDEX" = 'true' ]; then
  [ "$noindex_header" = true ] || { echo "::error::$SITE/ is missing X-Robots-Tag: noindex"; exit 1; }
else
  # A production build that picked up the dev config would drop out of search.
  [ "$noindex_header" = false ] && [ "$noindex_meta" = false ] ||
    { echo "::error::$SITE/ says noindex"; exit 1; }
fi

fetch "$SITE/help/bundle/manifest.json"
jq -e --arg site "$SITE" '
  (.locales | length) > 0 and
  all(.locales[]; .path | startswith($site + "/help/bundle/"))' "$BODY" >/dev/null ||
  { echo "::error::manifest paths are not absolute on $SITE"; show_body; exit 1; }

fetch "$SEARCH/v1/health"
if [ -n "${LEGACY_SEARCH:-}" ]; then
  # Shipped apps still call the old host (ADR 0042 §2).
  fetch "$LEGACY_SEARCH/v1/health"
fi

# Search answers are edge-cached by their parameters, so a per-run appVersion
# makes this hit the Worker that was just deployed.
run=${GITHUB_RUN_ID:-$RANDOM}
version="999.$((run % 1000)).$(((run / 1000) % 1000))"
status=$(curl -sS --max-time 20 -o "$BODY" -w '%{http_code}' \
  "$SEARCH/v1/search?q=time&locale=en-US&appVersion=$version")
if [ "$status" = 200 ]; then
  jq -e '.results | type == "array" and length > 0' "$BODY" >/dev/null ||
    { echo "::error::search answered no results"; show_body; exit 1; }
elif [ "$status" = 503 ] && [ "${ALLOW_EMPTY_INDEX:-}" = 'true' ] &&
  jq -e '.error == "search_unavailable"' "$BODY" >/dev/null; then
  # Also what a failing index read answers, so only staging accepts it, where
  # a brand-new Worker has no index until its first sync (cron every 15
  # minutes, or POST /v1/admin/sync).
  echo "::warning::$SEARCH answered search_unavailable: no index yet, or search is failing"
else
  echo "::error::search answered $status"
  show_body
  exit 1
fi

echo "Smoke test passed for $SITE and $SEARCH"
