#!/usr/bin/env bash
# Make sure an API environment serves the API code on main, ahead of an app build.
#
# The API lives in services/api and is deployed by the "API deploy" workflow
# (.github/workflows/api-deploy.yml):
#   beta        api-beta.witnesswork.app  deployed by every push to main that
#               touches services/api. This script waits for that deploy, and
#               starts one if none is running.
#   production  api.witnesswork.app       deployed only on request. This script
#               is that request: it starts the deploy and waits for it.
# An environment is current when the commit it reports (`versionTag` in
# /health) contains the last commit on main that touched services/api. The
# backend must be live before the app that needs it ships, so
# `scripts/build-beta.sh` runs this with --env beta and the `/cut-release`
# skill runs it for production. Rerunning after any failure is safe.
#
# Usage: scripts/release-api.sh [--env beta|production] [--dry-run]
#   --env      Which API to bring up to date (default production).
#   --dry-run  Report what would deploy without deploying or waiting.
# --branch and --bump are accepted and ignored: the API no longer has its own
# repo, branches or version tags.
set -euo pipefail
cd "$(dirname "$0")/.."

ENVIRONMENT=production
DRY_RUN=false
while [ $# -gt 0 ]; do
  case "$1" in
    --env)
      ENVIRONMENT=${2:-}
      shift 2
      ;;
    --branch | --bump)
      shift 2
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --)
      shift
      ;;
    *)
      echo "error: unknown argument $1" >&2
      exit 2
      ;;
  esac
done
case "$ENVIRONMENT" in
  beta)
    HEALTH_URLS=(https://api-beta.witnesswork.app/health)
    ;;
  production)
    # The same Worker answers on both hosts: new builds call the first, shipped
    # builds the second (ADR 0042), so both must serve the release.
    HEALTH_URLS=(https://api.witnesswork.app/health https://ww-proxy.leviwilkerson.com/health)
    ;;
  *)
    echo "error: --env must be beta or production" >&2
    exit 2
    ;;
esac

WORKFLOW=api-deploy.yml
RUN_TITLE="API deploy ($ENVIRONMENT)"
REPO=$(git remote get-url origin | sed -E 's#^.*github\.com[:/]##; s#\.git$##')

git fetch --quiet origin main
MAIN_SHA=$(git rev-parse origin/main)
API_SHA=$(git log -1 --format=%H origin/main -- services/api)
if [ -z "$API_SHA" ]; then
  echo "error: no commit on origin/main touches services/api" >&2
  exit 1
fi

# Prints one field of a /health answer, or nothing.
health_field() {
  curl -fsS --max-time 15 "$1" 2>/dev/null |
    node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s)[process.argv[1]]||'')}catch{console.log('')}})" "$2" ||
    true
}

# True when commit $1 is on main and contains the API's last change.
contains_api() {
  git cat-file -e "$1^{commit}" 2>/dev/null &&
    git merge-base --is-ancestor "$1" origin/main &&
    git merge-base --is-ancestor "$API_SHA" "$1"
}

DEPLOYED=$(health_field "${HEALTH_URLS[0]}" versionTag)
if [ -n "$DEPLOYED" ] && contains_api "$DEPLOYED"; then
  echo "API:      $ENVIRONMENT serves ${DEPLOYED:0:7}, which has the API's last change (${API_SHA:0:7})"
  echo "API_RESULT status=current env=$ENVIRONMENT sha=${DEPLOYED:0:7}"
  exit 0
fi

echo "API:      $ENVIRONMENT serves ${DEPLOYED:-an unknown commit}; main's API is at ${API_SHA:0:7}"
if [ -n "$DEPLOYED" ] && git cat-file -e "$DEPLOYED^{commit}" 2>/dev/null; then
  git log --format='  %s' "$DEPLOYED..origin/main" -- services/api
fi
if [ "$DRY_RUN" = true ]; then
  echo "API_RESULT status=pending env=$ENVIRONMENT sha=${API_SHA:0:7}"
  exit 0
fi

# Prints "id status conclusion createdAt url" for the newest deploy of this
# environment that has the API's last change and hasn't failed.
find_run() {
  local id sha status conclusion created url
  while read -r id sha status conclusion created url; do
    [ -n "$id" ] || continue
    [ "$status" = completed ] && [ "$conclusion" != success ] && continue
    contains_api "$sha" || continue
    echo "$id $status ${conclusion:-none} $created $url"
    return 0
  done < <(gh run list -R "$REPO" --workflow "$WORKFLOW" --branch main --limit 30 \
    --json databaseId,headSha,status,conclusion,createdAt,url,displayTitle \
    --jq ".[] | select(.displayTitle == \"$RUN_TITLE\") | \"\(.databaseId) \(.headSha) \(.status) \(.conclusion) \(.createdAt) \(.url)\"")
  return 1
}

RUN=""
# A push to main starts the Beta deploy by itself; give it a moment to appear.
for _ in $(seq 6); do
  RUN=$(find_run) && break
  [ "$ENVIRONMENT" = production ] && break
  sleep 5
done
if [ -z "$RUN" ]; then
  echo "Deploy:   starting $RUN_TITLE at ${MAIN_SHA:0:7}"
  gh workflow run "$WORKFLOW" -R "$REPO" --ref main -f "environment=$ENVIRONMENT"
  for _ in $(seq 24); do
    sleep 5
    RUN=$(find_run) && break
  done
fi
if [ -z "$RUN" ]; then
  echo "error: no $RUN_TITLE run appeared for ${API_SHA:0:7}" >&2
  exit 1
fi

read -r ID STATUS CONCLUSION CREATED URL <<<"$RUN"
echo "Deploy:   $URL"
for _ in $(seq 120); do
  [ "$STATUS" = completed ] && break
  sleep 10
  read -r STATUS CONCLUSION <<<"$(gh run view "$ID" -R "$REPO" --json status,conclusion --jq '"\(.status) \(.conclusion)"')"
done
if [ "$STATUS" != completed ]; then
  echo "error: $RUN_TITLE still $STATUS after 20 minutes: $URL" >&2
  exit 1
fi
if [ "$CONCLUSION" != success ]; then
  echo "error: $RUN_TITLE finished with '$CONCLUSION': $URL" >&2
  echo "Retry a transient failure with: gh run rerun $ID -R $REPO --failed" >&2
  exit 1
fi

# Every host must serve a Worker version at least as new as that run (not a
# rollback).
for health in "${HEALTH_URLS[@]}"; do
  LIVE=""
  for _ in $(seq 6); do
    LIVE=$(health_field "$health" deployedAt)
    if [ -n "$LIVE" ] &&
      node -e 'process.exit(Date.parse(process.argv[1]) >= Date.parse(process.argv[2]) ? 0 : 1)' "$LIVE" "$CREATED"; then
      echo "Live:     Worker version deployed $LIVE (${health%/health})"
      continue 2
    fi
    sleep 5
  done
  echo "error: $health serves a Worker version from ${LIVE:-unknown}, older than the deploy ($CREATED). Was it rolled back, or is the host down?" >&2
  exit 1
done
echo "API_RESULT status=released env=$ENVIRONMENT sha=${API_SHA:0:7}"
