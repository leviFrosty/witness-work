#!/usr/bin/env bash
# Ship the current commit to the WitnessWork Beta app (internal TestFlight).
#
# Publishes an EAS Update to the `beta` channel when HEAD's native fingerprint
# matches the latest TestFlight beta build; otherwise builds locally and
# uploads a new TestFlight build. Driven by the `/beta-build` skill.
#
# Usage: scripts/build-beta.sh [--mode auto|ota|native] [--interactive] [--dry-run]
#   --mode         auto (default) picks OTA vs native from the fingerprint.
#   --interactive  Let EAS prompt (Apple login for first-time signing setup).
#   --dry-run      Report the chosen mode without shipping anything.
set -euo pipefail
cd "$(dirname "$0")/.."

MODE=auto
INTERACTIVE=false
DRY_RUN=false
while [ $# -gt 0 ]; do
  case "$1" in
    --mode)
      MODE=${2:-}
      shift 2
      ;;
    --interactive)
      INTERACTIVE=true
      shift
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
case "$MODE" in auto | ota | native) ;; *)
  echo "error: --mode must be auto, ota or native" >&2
  exit 2
  ;;
esac

START_TIME=$SECONDS
format_duration() {
  local total=$1
  echo "$((total / 60))m $((total % 60))s"
}

# One beta build per machine: parallel worktrees would race on EAS build
# numbers and saturate the Mac.
LOCK_DIR="${TMPDIR:-/tmp}/witnesswork-beta-build.lock"
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  HOLDER=$(cat "$LOCK_DIR/pid" 2>/dev/null || true)
  if [ -n "$HOLDER" ] && kill -0 "$HOLDER" 2>/dev/null; then
    echo "error: another beta build is running (pid $HOLDER, $(cat "$LOCK_DIR/source" 2>/dev/null))" >&2
    exit 1
  fi
  rm -rf "$LOCK_DIR"
  mkdir "$LOCK_DIR"
fi
echo $$ >"$LOCK_DIR/pid"
pwd >"$LOCK_DIR/source"
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$LOCK_DIR" "$TMP_DIR"' EXIT

# Builds ship committed code only, so the reported commit is what testers run.
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "error: uncommitted changes to tracked files; commit them first" >&2
  git status --short --untracked-files=no >&2
  exit 1
fi

pnpm sync:widget-shared >/dev/null
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "error: widget shared sources were out of sync; commit the changes from pnpm sync:widget-shared" >&2
  exit 1
fi

# .env.beta is gitignored, so worktrees fall back to the main checkout's copy.
ENV_FILE=.env.beta
if [ ! -f "$ENV_FILE" ]; then
  MAIN_CHECKOUT=$(git worktree list --porcelain | awk 'NR == 1 { print $2 }')
  ENV_FILE="$MAIN_CHECKOUT/.env.beta"
fi
if [ ! -f "$ENV_FILE" ]; then
  echo "error: .env.beta not found here or in the main checkout (see docs/build.md)" >&2
  exit 1
fi
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a
# The shell environment is the single source of truth: never let Expo merge
# the development .env into a beta bundle.
export APP_VARIANT=beta EXPO_NO_DOTENV=1 NODE_ENV=production

# asc resolves the App Store Connect app from its exact bundle id.
APP_ID=com.leviwilkerson.jwtimebeta
BRANCH=$(git rev-parse --abbrev-ref HEAD)
SHA=$(git rev-parse --short HEAD)
SUBJECT=$(git log -1 --format=%s)

RUNTIME=$(pnpm exec expo-updates runtimeversion:resolve --platform ios 2>/dev/null |
  node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).runtimeVersion))")
echo "Commit:   $BRANCH @ $SHA — $SUBJECT"
echo "Runtime:  $RUNTIME"

# The latest beta build records its runtime in its What to Test notes.
LATEST_RUNTIME=$(asc builds test-notes view --app "$APP_ID" --latest --exclude-expired --locale en-US --output json 2>/dev/null |
  node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const m=JSON.stringify(JSON.parse(s)).match(/Runtime: ([0-9a-f]{40})/);console.log(m?m[1]:'')}catch{console.log('')}})" ||
  true)
echo "Latest TestFlight runtime: ${LATEST_RUNTIME:-none}"

if [ "$MODE" = auto ]; then
  if [ "$RUNTIME" = "$LATEST_RUNTIME" ]; then MODE=ota; else MODE=native; fi
fi
if [ "$MODE" = ota ] && [ "$RUNTIME" != "$LATEST_RUNTIME" ]; then
  echo "error: native code differs from the latest TestFlight build; an update would not reach it. Use --mode native." >&2
  exit 1
fi
echo "Mode:     $MODE"
if [ "$DRY_RUN" = true ]; then
  echo "BETA_RESULT mode=$MODE sha=$SHA runtime=$RUNTIME dry_run=true"
  exit 0
fi

if [ "$MODE" = ota ]; then
  rm -rf dist
  eas update --channel beta --platform ios --environment preview \
    --message "$BRANCH@$SHA: $SUBJECT" --non-interactive --json \
    >"$TMP_DIR/update.json"
  GROUP=$(node -p "require('$TMP_DIR/update.json')[0].group")

  if [ -n "${POSTHOG_CLI_API_KEY:-}" ] && command -v posthog-cli >/dev/null 2>&1; then
    posthog-cli hermes upload --directory dist ||
      echo "warning: PostHog source map upload failed; stacks for this update won't symbolicate" >&2
  fi

  echo
  echo "──────────────────────────────────────────"
  echo "  Beta update published"
  echo "  Commit:   $BRANCH @ $SHA"
  echo "  Runtime:  $RUNTIME"
  echo "  Group:    $GROUP"
  echo "  Relaunch WitnessWork Beta (swipe away, reopen) to load it."
  echo "  Duration: $(format_duration $((SECONDS - START_TIME)))"
  echo "──────────────────────────────────────────"
  echo "BETA_RESULT mode=ota sha=$SHA runtime=$RUNTIME group=$GROUP"
  exit 0
fi

IPA=./build-beta.ipa
NON_INTERACTIVE=--non-interactive
[ "$INTERACTIVE" = true ] && NON_INTERACTIVE=
rm -f "$IPA"
eas build -p ios --profile beta --local $NON_INTERACTIVE --output "$IPA"

unzip -o -q "$IPA" 'Payload/*.app/Info.plist' 'Payload/*.app/Expo.plist' -d "$TMP_DIR"
APP_DIR=$(find "$TMP_DIR/Payload" -maxdepth 1 -name '*.app' | head -n 1)
VERSION=$(plutil -extract CFBundleShortVersionString raw "$APP_DIR/Info.plist")
BUILD=$(plutil -extract CFBundleVersion raw "$APP_DIR/Info.plist")
BUILT_RUNTIME=$(plutil -extract EXUpdatesRuntimeVersion raw "$APP_DIR/Expo.plist")
# The fingerprint policy embeds a sentinel; expo-updates reads the real hash
# from EXUpdates.bundle at launch, so read it from the same place.
if [ "$BUILT_RUNTIME" = file:fingerprint ]; then
  FINGERPRINT_ENTRY=$(unzip -Z1 "$IPA" | grep -E '^Payload/[^/]+\.app/(.+/)?EXUpdates\.bundle/fingerprint$' | head -n 1)
  BUILT_RUNTIME=$(unzip -p "$IPA" "$FINGERPRINT_ENTRY")
fi
if [ "$BUILT_RUNTIME" != "$RUNTIME" ]; then
  echo "warning: built runtime $BUILT_RUNTIME differs from local fingerprint $RUNTIME; recording the built one" >&2
fi

NOTES="$BRANCH @ $SHA
$SUBJECT

Runtime: $BUILT_RUNTIME"

echo "Uploading $IPA to App Store Connect (app $APP_ID)..."
asc builds upload --app "$APP_ID" --ipa "$IPA" --test-notes "$NOTES" --locale en-US --wait --output json >"$TMP_DIR/upload.json"

echo
echo "──────────────────────────────────────────"
echo "  Beta build uploaded to TestFlight"
echo "  Commit:   $BRANCH @ $SHA"
echo "  Version:  $VERSION ($BUILD)"
echo "  Runtime:  $BUILT_RUNTIME"
echo "  Duration: $(format_duration $((SECONDS - START_TIME)))"
echo "──────────────────────────────────────────"
echo "BETA_RESULT mode=native sha=$SHA version=$VERSION build=$BUILD runtime=$BUILT_RUNTIME"
