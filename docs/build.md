# Build

Ensure you have all dependencies installed.

## iOS

Build dependencies: [XCode](https://docs.expo.dev/workflow/ios-simulator/#install-xcode), XCode latest iOS version, [XCode cli](https://docs.expo.dev/workflow/ios-simulator/#install-xcode-command-line-tools), [Watchman](https://facebook.github.io/watchman/docs/install#macos), [Fastlane](https://docs.fastlane.tools/), [Cocoapods](https://cocoapods.org/), [Node](https://nodejs.org/en/download/package-manager), [pnpm](https://pnpm.io/), and [EAS cli](https://docs.expo.dev/eas-update/getting-started/)

1. Clone repository

1. Switch to workspace node version, `nvm use`

1. Install dependencies, `pnpm install`

1. Build iOS, run `pnpm run build`

1. Install new build to simulator, (replace path) `eas build:run -p ios --path [path].tar.gz`

1. Run development server, `pnpm run ios`

1. Develop 🚀

## Production build & App Store upload (fully local)

For the complete release workflow, invoke `/cut-release` (see `.agents/skills/cut-release/SKILL.md`). Tag pushes run validation and create a GitHub Release; they do not build or upload.

**We intentionally do not use EAS Build cloud services for production.** Every production build runs on our own hardware via `eas build --local` so we never pay for build credits. The EAS CLI is still used as the local build orchestrator and for `autoIncrement` (fetching the next build number from EAS — free; only cloud builder minutes cost money).

```bash
pnpm run build:prod-auto-submit
```

This runs `scripts/build-prod-auto-submit.sh`, which:

1. Sources `.env.production` into the shell (see [Environment files](#environment-files)).
2. Builds locally: `eas build -p ios --profile production --local --output ./build-production.ipa` — always the same single artifact path (gitignored), so repeat runs are idempotent.
3. Uploads the IPA to App Store Connect with `asc builds upload` — also fully local, no EAS Submit involved.

App Store review submission (version, "What's New", submit) is a separate step — see the `app-store-release` skill.

### One-time machine prerequisites

- **Apple WWDR intermediate certificates (G2–G6)** in the login keychain, from <https://www.apple.com/certificateauthority/>. Without a valid intermediate, the build fails with a misleading `Distribution certificate ... hasn't been imported successfully` (macOS ships only the G1, expired Feb 2023). EAS cloud builders preinstall these — local machines must too.
- **`asc` CLI** installed and authenticated (`asc doctor` to verify).
- **`.env.production`** present (see below).

### Environment files

- `.env` — **development** values. Loaded by Expo for `expo start` / dev builds.
- `.env.production` — **production** values (gitignored). Loaded two ways:
  - Expo CLI loads it with higher priority than `.env` whenever `NODE_ENV=production` (e.g. `expo export`). It explicitly blanks the dev-only notes-import bypass vars so they can never leak into a production bundle.
  - The build script `set -a; source`s it so the local EAS build job inherits everything — required because EAS **secret** env vars (e.g. `POSTHOG_CLI_API_KEY` for source map and native symbol uploads) are never delivered to local builds. Plaintext/sensitive vars from the EAS `production` environment _are_ injected into local builds; keep `.env.production` in sync with `eas env:list production`.

### PostHog error tracking and source maps

The provider-independent `src/lib/errorTracking` module reports handled errors,
render failures, uncaught JavaScript exceptions, and unhandled rejections through
PostHog. Native crashes use `@posthog/react-native-plugin`; a new native build
is required for this integration (an OTA update cannot add the native module).

The Metro configuration injects PostHog debug IDs. The PostHog Expo plugin
uploads matching Hermes source maps and iOS dSYMs during native release builds,
including native source files for crash context.
Development profiles and `production-simulator` skip PostHog uploads; to test
uploads on a simulator, prebuild and run a Release build without that profile:
`APP_VARIANT=production pnpm exec expo run:ios --configuration Release`.

Before a release:

- Install `posthog-cli` (minimum 0.16.0; the EAS post-install hook installs pinned
  version 0.18.1 automatically in build jobs).
- Set `POSTHOG_CLI_API_KEY`, `POSTHOG_CLI_PROJECT_ID` and `POSTHOG_CLI_HOST` in
  `.env.production`. Use a personal key with **error tracking write** and
  **organization read** scopes. The CLI host is `https://us.posthog.com` or
  `https://eu.posthog.com`, not the ingestion host used by `POSTHOG_HOST`.
- Set the same variables in the EAS environment used by cloud builds, including
  preview builds. Store the API key as a secret. GitHub Actions only triggers
  EAS; the credentials must be available on the EAS worker.
- Enable **Enable exception autocapture** in the PostHog project’s error tracking
  settings; native crash capture requires this server-side setting.
- Keep the public `POSTHOG_PROJECT_TOKEN` and `POSTHOG_HOST` configured so the
  app sends errors to the same project receiving the source maps.

`pnpm run build:prod-auto-submit` checks upload credentials before building,
then builds and uploads to App Store Connect as usual. To build without
submitting, source `.env.production` into the environment and run
`pnpm sync:widget-shared && eas build -p ios --profile production --local`.
A newly generated native project is required for the new upload build phase.

OTA updates do not run Xcode upload hooks. After each `eas update`, run
`pnpm upload:posthog-sourcemaps` against its unchanged `dist` output before
removing the artifacts. Do not rebuild between publishing and uploading maps.

Verify the next release in PostHog Error Tracking: check that Symbol sets were
uploaded, then capture a test exception from that release and confirm its stack
resolves to the original TypeScript source. A local config check alone cannot
verify delivery or symbolication. Also trigger a native test crash on a release
build, relaunch the app, and verify its symbolicated native stack.

References: [React Native installation](https://posthog.com/docs/error-tracking/installation/react-native)
and [source map uploads](https://posthog.com/docs/error-tracking/upload-source-maps/react-native).
