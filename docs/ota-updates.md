# Cloudflare OTA updates

Hot Updater 1.0.2 replaces Expo Updates. Expo still builds the native app through
EAS; EAS Update channels and `runtimeVersion` are no longer used. Installed
Expo Updates binaries require a new native build before they can use this
service. Leave their existing EAS update history intact during the transition.

| App variant   | Hot Updater channel | Worker / private R2 bucket | EAS build environment |
| ------------- | ------------------- | -------------------------- | --------------------- |
| `development` | `dev`               | `ww-updates-dev`           | `development`         |
| `beta`        | `beta`              | `ww-updates-beta`          | `preview`             |
| `production`  | `production`        | `ww-updates-prod`          | `production`          |

URLs and D1 IDs are in `config/ota-environments.json`. Each environment has a
different client key and RSA public trust anchor. Workers, buckets and databases
are separate; a test deployment cannot change the production release catalog.
The services live in ww-api (`src/updates/worker.ts`, `wrangler-updates.json`).
Land the backend PR first. A backend tag deployment migrates and deploys all
three update Workers. It does not publish any app bundle.

## Client and native builds

`src/lib/hotUpdater.ts` initializes one SDK instance. Native startup verification
and rollback belong to the SDK. Release builds check once on launch, download
in the background and apply on the next cold launch. The app does not restart
while someone is recording service. Settings → More → Check for update checks
the latest catalog, including an already staged update; its existing Update
screen downloads and restarts immediately. Android uses a process restart so
the SDK can finish native launch verification; iOS reloads in process.

### Test `dev` updates

A debug dev client can't receive OTA updates: Hot Updater skips update checks
when `__DEV__` is set, and the native app always loads JS from Metro, so Check
for update shows the existing unavailable alert. Test the `dev` channel with a
Release build of the development app instead. It's still WitnessWork Dev, with
the same bundle ID and `.env` values, but without Metro:

```sh
pnpm ios:ota                   # or: pnpm android:ota
# change some JS, then:
pnpm update:dev ios --message 'Test update'
# relaunch the app twice, or use Settings → More → Check for update
```

`scripts/with-local-env.mjs` requires the dev `EXPO_PUBLIC_HOT_UPDATER_API_KEY`
(in `.env.local`) for these builds, and runs a clean iOS prebuild so the binary
embeds the `dev` channel and current fingerprint. A later native change needs
a new `ios:ota` build before `update:dev` matches it again.

RevenueCat's Test Store key crashes a Release build. iOS compiles RevenueCat
with its opt-out flag (`config/dev-release.xcconfig`). Android can't opt out,
so Android dev Release builds and dev Android OTA bundles both leave the key
out and purchases are unavailable. Android Release also blocks plain HTTP, so
a `http://localhost` API in `.env` is unreachable there. OTA itself is
unaffected.

Android purchases also stay unavailable in any environment that has no Google
store SDK key.

`EXPO_PUBLIC_HOT_UPDATER_API_KEY` is the registered client credential. It is
configured in EAS's development/preview/production environments and in the
corresponding ignored local app environment override. It must be present in
native and OTA builds. It cannot deploy updates. Provider and signing credentials
never belong in `ExpoConfig.extra` or `EXPO_PUBLIC_*` variables.

The public keys in `config/ota-keys/` are embedded by `@hot-updater/expo` during
prebuild. Changing the native SDK, public key, native modules, permissions,
entitlements or native plugin configuration requires a new native build. The
fingerprint includes those inputs, with separate iOS/Android configuration;
upload-only PostHog settings and the commit hash do not alter compatibility.
The Expo fingerprint 0.20.13 patch lets exclusions run after Hot Updater's
native-extension allowlist. Generated Gradle files, Maps headers and SQLite
build copies are excluded; the SQLite vendor sources remain fingerprinted.
This keeps a fresh native build compatible with a later publish from the same
native inputs.
The Hot Updater 1.0.2 CLI patch validates the selected Expo configuration's
trust anchor against its signer. Generated native projects may belong to a
previous local variant; they do not choose the OTA environment. A missing or
mismatched selected trust anchor still blocks publishing.
Native-project doctor key warnings describe the last local prebuild; verify
the selected key and fingerprint in the compiled artifact before shipping.
Re-evaluate both patches and the SDK-source regression probes when upgrading
Hot Updater or Expo fingerprint.
Generate/read the fingerprint under the exact environment used by the build:

```sh
node scripts/with-local-env.mjs beta ios -- node scripts/ota-fingerprint.mjs ios
```

The version row reads the JS-inlined `EXPO_PUBLIC_COMMIT_HASH`, so it identifies
OTA code as well as native builds. Expo Constants continues to describe the
native binary after an OTA.

## Publishing credentials

Use the matching ignored `.env.hotupdater.<channel>.local` file, in this
worktree or the main checkout:

```dotenv
HOT_UPDATER_CLOUDFLARE_API_TOKEN=
HOT_UPDATER_R2_ACCESS_KEY_ID=
HOT_UPDATER_R2_SECRET_ACCESS_KEY=
HOT_UPDATER_API_KEY=
```

The first token needs D1 Edit in the configured Cloudflare account. The S3
credentials need Object Read & Write only for that environment's R2 bucket.
The final key must match `EXPO_PUBLIC_HOT_UPDATER_API_KEY` in the selected app
environment. Keep secrets in the 1Password Agents vault; never commit these
files. Metro blocks `.env*` files/directories and `.verify/` from its module
contexts, including Expo DOM contexts.

Each private RSA key lives only in 1Password, as the note of a Secure Note
named `WitnessWork OTA signing (<channel>)`. Never save one to disk: the
publishing script reads the key with `op` right before it signs, writes it to
a mode 600 file in a fresh temporary directory, and deletes that directory
when the deploy ends, interrupted or not. Native builds read only the public
key.

- **Beta and dev** keys are in the Agents vault and read through the agents'
  service account, so `/beta-build` publishes without anyone at the Mac.
- **Production** is read through the 1Password app, never the service account
  (the script drops `OP_SERVICE_ACCOUNT_TOKEN` for that read), so a person
  approves each publish with Touch ID or the account password. Keep its item in
  a vault the service account can't open, such as Private, never in Agents: a
  production signing key can ship code to every install, so no agent session
  may read it unattended. On the Mac that publishes, turn on 1Password →
  Settings → Developer → Integrate with 1Password CLI, and keep the app
  unlocked during a release. Rotate a signing key only with a new native build; existing clients keep
  their old trust anchor. For client-key rotation, register a new key, ship it to
  clients, then revoke the old key after those clients have migrated. Updating a
  local file does not update installed binaries.

## Publish

```sh
pnpm update:dev ios --dry-run
pnpm update:dev ios --message 'Test update'
pnpm update:beta android --dry-run
pnpm build:beta
```

`scripts/ota.mjs` selects a fixed environment/channel/database/bucket, loads the
selected app values, validates credentials, regenerates `fingerprint.json`,
signs the bundle and publishes it. Source maps stay in
`dist/hot-updater-build`; the script pairs the composed Hermes map with the
shipped bytecode and its Expo debug ID, then uploads it to PostHog after a successful
deployment when upload credentials are present. A failed map upload is reported
separately from the already published OTA.

Beta and production publishing require committed code. Production additionally
requires code already on `origin/main` and the user's typed
`SHIP-PROD-<exact-version>` keyword through `WW_RELEASE_CONFIRM`. Both the wrapper
and Hot Updater config reject an unguarded production deployment. Use the
wrapper to publish; direct `hot-updater deploy` is refused.

The first `/beta-build` after migration takes the native path. Later builds
compare the installed TestFlight build's `Hot Updater runtime:` note with the
local fingerprint. A match permits an iOS OTA. After a background update has
downloaded, swipe Beta away and reopen it, or use Check for update to apply it
immediately. Android can publish to Beta via `pnpm update:beta android`; Android
Beta currently uses the existing shared Android package identity, so use a
dedicated emulator for testing rather than installing over production records.

## Verification and rollout

Provider setup uses the official version-matched generated scaffolds, kept in
ignored `.verify/ota-scaffold-{dev,beta,prod}`. Require both official doctor
scopes to return `success: true`, then separately test storage access, signed
artifact downloads and a native Release build. An authenticated empty catalog
proves protocol/authentication readiness, not an applied OTA.

Before enabling an environment, provision its Worker, private bucket and D1
schema; register its client key; install the scoped R2 Worker secrets; and
configure the app's public client credential and signing trust anchor. Store
R2 credentials in Agents as `WitnessWork OTA R2 (dev)`,
`WitnessWork OTA R2 (beta)` and `WitnessWork OTA R2 (prod)`. The shared,
account-scoped D1 Edit token is stored as `WitnessWork OTA D1`. Publishing needs
that token as well as the selected R2 credential and private signing key.

Prove a visible JS change and rendered assets on dev and Beta Release builds
on iOS and Android. Read the published Bundle ID back from native metadata,
then disable the release and prove rollback. A test artifact with an invalid
signature must be rejected while the verified bundle remains usable. Confirm
received Insights launch/download reports and fingerprint equality before and
after native builds. Debug/Metro testing does not substitute for this proof.

Production infrastructure can be prepared separately. Production app testing
and rollout follow only after the user starts the production release with the
typed keyword. Record each environment's current setup and proof in the PR or
release record rather than treating a successful empty catalog as a completed
migration.
