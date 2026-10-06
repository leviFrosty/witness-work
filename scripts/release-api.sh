#!/usr/bin/env bash
# Release ww-api, the production backend, ahead of an app build.
#
# Beta and production app builds both call the production API, so backend
# changes must be live before the app that needs them ships. When ww-api's
# origin/main has commits since its latest v* tag, this runs ww-api's tests,
# bumps package.json, tags the release and pushes main + tag; ww-api's tag
# workflow deploys the Worker. With nothing new it confirms the latest tag
# deployed. ww-api's tags are the only state, so rerunning after any failure is
# safe. Driven by `scripts/build-beta.sh` and the `/cut-release` skill.
#
# Usage: scripts/release-api.sh [--branch <name>] [--bump patch|minor|major] [--dry-run]
#   --branch   Fail if ww-api's branch of this name has commits not on main,
#              i.e. the app branch's backend half hasn't landed yet.
#   --bump     Override the inferred bump (minor with any feat commit, else patch).
#   --dry-run  Report what would ship without releasing or waiting.
# WW_API_DIR overrides the ww-api checkout (default ~/dev/ww-api). Only its Git
# data is used; its working tree is never touched.
set -euo pipefail

API_DIR=${WW_API_DIR:-$HOME/dev/ww-api}
HEALTH_URL=https://ww-proxy.leviwilkerson.com/health
BRANCH=
BUMP=
DRY_RUN=false
while [ $# -gt 0 ]; do
  case "$1" in
    --branch)
      BRANCH=${2:-}
      shift 2
      ;;
    --bump)
      BUMP=${2:-}
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
case "$BUMP" in "" | patch | minor | major) ;; *)
  echo "error: --bump must be patch, minor or major" >&2
  exit 2
  ;;
esac

if ! git -C "$API_DIR" rev-parse --git-dir >/dev/null 2>&1; then
  echo "error: ww-api checkout not found at $API_DIR (set WW_API_DIR)" >&2
  exit 1
fi
API_DIR=$(cd "$API_DIR" && pwd)
git_api() { git -C "$API_DIR" "$@"; }
REPO=$(git_api remote get-url origin | sed -E 's#^.*github\.com[:/]##; s#\.git$##')

git_api fetch --quiet --prune --tags origin

# Beta and production share one API, so an app branch can't ship ahead of its
# backend branch. ww-api branches reuse the app's branch names; `cherry`
# matches by patch, so rebase-merged commits count as landed.
if [ -n "$BRANCH" ] && [ "$BRANCH" != main ] && [ "$BRANCH" != HEAD ] &&
  git_api rev-parse --quiet --verify "refs/remotes/origin/$BRANCH" >/dev/null; then
  UNMERGED=$(git_api cherry -v origin/main "origin/$BRANCH" | grep '^+' || true)
  if [ -n "$UNMERGED" ]; then
    echo "error: ww-api branch $BRANCH has commits that aren't on main:" >&2
    echo "$UNMERGED" | sed -E 's/^\+ ([0-9a-f]{7})[0-9a-f]* /  \1 /' >&2
    echo "This app build calls the production API. Land that backend work on ww-api main first," >&2
    echo "or delete the branch if it already landed in another form." >&2
    exit 1
  fi
fi

MAIN_SHA=$(git_api rev-parse origin/main)
LAST_TAG=$(git_api describe --tags --abbrev=0 --match 'v[0-9]*' origin/main 2>/dev/null || true)
if [ -z "$LAST_TAG" ]; then
  echo "error: no v* release tag on ww-api main" >&2
  exit 1
fi
PENDING=$(git_api log --format=%s "$LAST_TAG..origin/main")

# Prints "id status url createdAt conclusion" for the latest deploy run of $1.
deploy_run() {
  gh run list -R "$REPO" --workflow deploy.yml --commit "$1" --limit 1 \
    --json databaseId,status,url,createdAt,conclusion \
    --jq '.[] | "\(.databaseId) \(.status) \(.url) \(.createdAt) \(.conclusion)"'
}

# Waits for the tag workflow to deploy $1 (release $2), then checks production
# serves a Worker version at least as new as that run (not a rollback).
confirm_deploy() {
  local sha=$1 tag=$2 id="" status url created conclusion deployed=""
  for _ in $(seq 24); do
    read -r id status url created conclusion <<<"$(deploy_run "$sha")"
    [ -n "$id" ] && break
    sleep 5
  done
  if [ -z "$id" ]; then
    echo "error: no ww-api deploy run found for $tag ($sha)" >&2
    exit 1
  fi
  echo "Deploy:   $url"
  for _ in $(seq 60); do
    [ "$status" = completed ] && break
    sleep 10
    read -r status conclusion <<<"$(gh run view "$id" -R "$REPO" --json status,conclusion --jq '"\(.status) \(.conclusion)"')"
  done
  if [ "$status" != completed ]; then
    echo "error: $tag deploy still $status after 10 minutes: $url" >&2
    exit 1
  fi
  if [ "$conclusion" != success ]; then
    echo "error: $tag deploy finished with '$conclusion': $url" >&2
    echo "Retry a transient failure with: gh run rerun $id -R $REPO --failed" >&2
    exit 1
  fi
  for _ in $(seq 6); do
    deployed=$(curl -fsS --max-time 15 "$HEALTH_URL" 2>/dev/null |
      node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s).deployedAt||'')}catch{console.log('')}})" ||
      true)
    if [ -n "$deployed" ] &&
      node -e 'process.exit(Date.parse(process.argv[1]) >= Date.parse(process.argv[2]) ? 0 : 1)' "$deployed" "$created"; then
      echo "Live:     Worker version deployed $deployed"
      return
    fi
    sleep 5
  done
  echo "error: production serves a Worker version from ${deployed:-unknown}, older than the $tag deploy ($created). Was it rolled back?" >&2
  exit 1
}

if [ -z "$PENDING" ]; then
  echo "ww-api:   no commits since $LAST_TAG"
  if [ "$DRY_RUN" = false ]; then
    confirm_deploy "$MAIN_SHA" "$LAST_TAG"
  fi
  echo "API_RESULT status=current tag=$LAST_TAG sha=${MAIN_SHA:0:7}"
  exit 0
fi

if [ -z "$BUMP" ]; then
  BUMP="patch"
  if echo "$PENDING" | grep -qE '^feat(\(.+\))?!?:'; then BUMP=minor; fi
fi
IFS=. read -r MAJOR MINOR PATCH <<<"${LAST_TAG#v}"
case "$BUMP" in
  major) VERSION="$((MAJOR + 1)).0.0" ;;
  minor) VERSION="$MAJOR.$((MINOR + 1)).0" ;;
  patch) VERSION="$MAJOR.$MINOR.$((PATCH + 1))" ;;
esac
TAG=v$VERSION
COUNT=$(echo "$PENDING" | wc -l | tr -d ' ')

echo "ww-api:   $COUNT commit(s) since $LAST_TAG → $TAG ($BUMP)"
echo "$PENDING" | sed 's/^/  /'
if [ "$DRY_RUN" = true ]; then
  echo "API_RESULT status=pending tag=$TAG commits=$COUNT"
  exit 0
fi
if git_api ls-remote --exit-code --tags origin "refs/tags/$TAG" >/dev/null; then
  echo "error: $TAG already exists on ww-api's origin but isn't on main; pass --bump to pick another version" >&2
  exit 1
fi

# Release from a throwaway worktree of origin/main next to the checkout.
mkdir -p "$API_DIR-worktrees"
WORKTREE=$(mktemp -d "$API_DIR-worktrees/release.XXXXXX")
LOG=$(mktemp)
cleanup() {
  cd "$API_DIR"
  git_api worktree remove --force "$WORKTREE" 2>/dev/null || rm -rf "$WORKTREE"
  git_api worktree prune
  rm -f "$LOG"
}
trap cleanup EXIT
git_api worktree add --quiet --detach "$WORKTREE" "$MAIN_SHA"
cd "$WORKTREE"

for check in "install --frozen-lockfile" test typecheck; do
  # shellcheck disable=SC2086
  if ! pnpm $check >"$LOG" 2>&1; then
    cat "$LOG" >&2
    echo "error: pnpm $check failed on ww-api ${MAIN_SHA:0:7}; nothing was released" >&2
    exit 1
  fi
done

node -e '
  const fs = require("fs")
  const text = fs.readFileSync("package.json", "utf8")
  fs.writeFileSync("package.json", text.replace(/"version": "[^"]*"/, `"version": "${process.argv[1]}"`))
' "$VERSION"
if ! git diff --quiet package.json; then
  git add package.json
  git commit --quiet -m "chore: release $TAG" -m "$(echo "$PENDING" | sed 's/^/- /')"
fi
# --force replaces a local tag left by a run that never pushed it.
git tag --force --annotate "$TAG" --message "Release $VERSION" >/dev/null
RELEASE_SHA=$(git rev-parse HEAD)
if ! git push --quiet --atomic origin HEAD:refs/heads/main "refs/tags/$TAG"; then
  echo "error: push rejected; ww-api main probably moved. Rerun to release its new tip." >&2
  exit 1
fi
echo "Pushed:   $TAG at ${RELEASE_SHA:0:7}"

confirm_deploy "$RELEASE_SHA" "$TAG"
echo "API_RESULT status=released tag=$TAG sha=${RELEASE_SHA:0:7} commits=$COUNT"
