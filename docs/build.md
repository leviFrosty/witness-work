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
  - The build script `set -a; source`s it so the local EAS build job inherits everything — required because EAS **secret** env vars (e.g. `SENTRY_AUTH_TOKEN`, which the Sentry source-map upload phase hard-fails without) are never delivered to local builds. Plaintext/sensitive vars from the EAS `production` environment _are_ injected into local builds; keep `.env.production` in sync with `eas env:list production`.
