---
status: proposed
---

# Notes Import on Android uses Play Integrity where iOS uses App Attest

## Context

Notes Import (Scribe AI) calls a paid model through ww-api. On iOS the security
boundary is Apple App Attest (ADR 0007): every metered request carries an
assertion proving it came from the genuine app on a genuine Apple device, and
credits meter against the account id (ADR 0011). Android had no equivalent, so
Notes Import — and with it the larger Supporter allowance — was iOS-only. On
Android the only remaining Supporter perk was the accent color.

Google's equivalent is the Play Integrity API. Its tokens are opaque: only
Google can decrypt them, through `decodeIntegrityToken`, and the verdict
carries a caller-chosen `requestHash` verbatim. It has no device key, no
counter, and no stable device identity.

## Decision

### Standard requests bound to a one-time challenge

The app uses **standard** requests (`StandardIntegrityManager`), not classic.
Google recommends them for on-demand checks: after a few-second warm-up, a token
takes a few hundred ms, and Play itself clears the verdicts of a token decoded
repeatedly. Classic requests are slower, rate-limited to five per minute, and
meant for rare one-off actions.

Each protected request keeps the App Attest v2 shape:

1. `POST /notes-import/challenge` with
   `attestationProvider: "play-integrity"`, `protocolVersion: 1`, the
   operation id, install uuid, account id, purpose, content hash, and canonical
   request hash. ww-api returns a 32-byte challenge bound to a hash of those
   fields, valid for five minutes.
2. The app builds the client data
   `witnesswork.play-integrity|1|assert|<purpose>|<operationId>|<challenge>|<uuid>|<accountId>|<contentHash>|<requestHash>`
   and passes its lowercase hex SHA-256 to Play as `requestHash` (64 of the
   500 allowed characters; never plaintext, as Google advises).
3. `POST /notes-import/kickoff` (or `/verify` for the diagnostics probe) with
   the same fields, the challenge, and `integrityToken`.

The token therefore covers exactly one challenge, one identity, and one
payload. The provider is warmed while the challenge round-trips, and is
re-prepared once when Play reports it expired.

### Server verification

ww-api handles the request in this order, failing closed at each step:

1. Recompute the content hash and canonical request hash from the body.
2. Atomically consume the challenge in a `PlayIntegrityChallenges` Durable
   Object (one per install uuid, outstanding challenges capped at 32). It
   checks the descriptor, single use, and expiry. Consuming before decoding
   means one challenge buys at most one decode, which also protects the daily
   decode quota.
3. Mint an OAuth token for a service account in the linked Cloud project (JWT
   bearer grant, `playintegrity` scope, cached per isolate) and call
   `decodeIntegrityToken`. A 400 means an invalid token; other failures mean the
   service is unavailable and are reported to Sentry.
4. Apply the verdict policy:
   - `requestDetails`: the package name matches, `requestHash` equals the
     recomputed client-data hash, and the timestamp is no earlier than the
     challenge (with one minute of skew).
   - **Device integrity is required.** `deviceRecognitionVerdict` must include
     `MEETS_DEVICE_INTEGRITY` (or `STRONG`). Since 2025 that needs
     hardware-backed proof of a locked bootloader and a certified OS: the
     equivalent of App Attest's genuine-device guarantee.
     `PLAY_INTEGRITY_REQUIRED_DEVICE_VERDICT` can relax this to `BASIC` or
     tighten it to `STRONG` without code changes.
   - **App integrity is required.** `appRecognitionVerdict` must be
     `PLAY_RECOGNIZED` with a matching package. When
     `ANDROID_CERT_SHA256_DIGESTS` is set, the signing certificate must also
     match.
   - **Licensing is not required.** WitnessWork is free, so a genuine binary
     on a genuine device is the same client whether this Play account
     installed it or not. Requiring `LICENSED` would block sideloaded genuine
     copies and devices without a Play account, and stop no abuse.
5. Continue through the unchanged Supporter check, credit gate, and run, keyed
   on `accountId ?? uuid` exactly as on iOS.

Verdict failures return `attestation_failed` with a stable `reason`
(`device_integrity_failed`, `app_not_recognized`, `integrity_token_invalid`,
`integrity_unavailable`, or the shared challenge reasons) and an `action`. The
app retries once under a fresh operation for challenge and token errors.

### Fitting the existing protocol without weakening iOS

- A request enters the Play path only through the explicit
  `attestationProvider` field. Without it, every byte of the App Attest v1/v2
  handling runs exactly as before. The App Attest tests are unchanged.
- `/notes-import/attest` rejects Play requests: there is no key to register.
  The legacy synchronous endpoint also rejects them, since Android only uses
  kickoff.
- Play challenges live in their own Durable Object, never in
  `AppAttestIdentity`, so neither path can consume or conflict with the
  other's state.
- `GET /notes-import/status` advertises
  `capabilities.playIntegrity: { protocolVersions: [1], cloudProjectNumber }`
  only when the package name, the project number, and the service-account
  secret are all configured. The app keeps Android closed while it is absent.
  The project number isn't secret; serving it keeps one source of truth with
  the service account.
- The overall system is only as strong as the weaker attestation. Forging the
  Play path still needs a genuine, unmodified Play build on a certified device
  for each request, so iOS's own guarantees are unchanged.

### Identity on Android

The account id is unchanged: it is still the RevenueCat app user id and the
server's meter id, so RevenueCat `logIn` and credits stay consistent. Android
has no iCloud adoption, so the account id equals the install id there.

What changes is the install id. Previously Android stored a random UUID in
MMKV, so "Clear storage" or a reinstall gave a fresh identity: a new RevenueCat
customer and five new free credits. iOS's Keychain id survives both. New
Android installs now derive their id from `ANDROID_ID`, which Android 8+ scopes
to the app signing key, user, and device. It survives reinstall as long as the
signing key is unchanged, and resets on factory reset, which matches the iOS
Keychain's lifetime.

- The id is `SHA-256("witnesswork.install-id|1|<package>|<ANDROID_ID>")`,
  formatted as a version-8 UUID. The raw value never leaves the device, and the
  package name separates the dev, beta, and production apps.
- An id already in MMKV always wins, so existing Android installs keep the
  RevenueCat identity their purchases are filed under. A pre-change install
  that later clears storage moves to the derived id once, which is today's
  behavior.
- If `ANDROID_ID` is unavailable, the app falls back to a random UUID.

## Considered options

- **Classic requests with a server nonce.** Natural challenge binding, but
  slower, capped at five per minute, and replay protection is entirely ours.
  Rejected: Google recommends standard requests for anything but rare one-off
  calls, and request-hash binding gives the same guarantee.
- **Decrypting tokens locally.** Only possible for classic requests with
  developer-managed keys. Rejected: it means more key management and gives no
  benefit at our volume.
- **A separate `/notes-import/integrity/*` endpoint family.** Rejected: the
  existing endpoints already express challenge → protected request, and the
  explicit discriminator keeps the two paths separate.
- **Block Store for the install id.** It is asynchronous at startup, needs
  Backup turned on, and Google may clear it when the user clears app storage —
  exactly the case to cover. Rejected.
- **Keep the random MMKV id.** Rejected: on Android, clearing storage would
  hand out free credits indefinitely, a much weaker meter than iOS's.
- **Play Integrity device recall.** Three bits per device that survive even a
  factory reset. Deferred: it is beta, needs an expression of interest, and
  reinstall-resistant ids already match iOS. Revisit if abuse appears.

## Consequences

- Android Notes Import needs a Play-installed build on a certified device with
  current Play services. Rooted devices, custom ROMs, emulators, and modified
  builds are refused. They see a dedicated message and the Help Center
  explains why. Development builds use the existing dev bypass against a dev
  worker.
- Each Android import costs one Play token request and one decode against the
  default quota of 10,000 per day each. Raise it through Google's form before
  that matters.
- ww-api now depends on Google's OAuth and Play Integrity endpoints for
  Android. While they are down, Android imports return a retryable
  `integrity_unavailable`; iOS is unaffected.
- Supporter status comes from the store the purchase was made in. App Store
  and Google Play subscriptions don't cross platforms, because the account ids
  differ.
- The install id is derived from a persistent, app-scoped device identifier.
  Play Console's Data safety form must declare "Device or other IDs" for app
  functionality and fraud prevention. No raw identifier is sent anywhere.

## Setup (needs the owner's accounts)

1. **Google Cloud.** Create or choose a project. Under APIs & Services →
   Library, enable **Google Play Integrity API**. Note the **project number**
   (project settings, not the project id).
2. **Play Console.** Open WitnessWork (`com.leviwilkerson.jwtime`) →
   **Protected with Play** → Play Integrity API → **Link Cloud project**, and
   choose that project. Keep the default responses: `MEETS_DEVICE_INTEGRITY`
   needs no opt-in.
3. **Service account.** In the same project, go to IAM & Admin → Service
   Accounts → Create (for example `play-integrity-decoder`); Google documents
   no extra role. Then Keys → Add key → JSON, and download it.
4. **ww-api secrets.** Store the key, then delete the downloaded file:
   ```bash
   wrangler secret put PLAY_INTEGRITY_SERVICE_ACCOUNT_JSON < key.json
   wrangler secret put PLAY_INTEGRITY_SERVICE_ACCOUNT_JSON --env dev < key.json
   ```
5. **ww-api vars.** In `wrangler.toml`, uncomment `ANDROID_PACKAGE_NAME` and
   `PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER` under both `[vars]` and
   `[env.dev.vars]`, and fill in the project number.
   - Optionally pin the signing certificate. Take the **App signing key
     certificate** SHA-256 from Play Console → Test and release → App integrity
     → App signing, then convert it:
     ```bash
     echo "<SHA-256 with colons>" | tr -d ':' | xxd -r -p | base64 | tr '+/' '-_' | tr -d '='
     ```
     Put the result in `ANDROID_CERT_SHA256_DIGESTS`.
6. **Deploy.** Run `pnpm run deploy:dev`, then `pnpm run deploy`. This applies
   migration `v4`. `GET /notes-import/status` should now include
   `capabilities.playIntegrity`.
7. **PostHog.** Create the boolean flag `notes-import-android`. Release it to
   your own device first, then ramp up. Android needs both it and
   `notes-import`.
8. **Verify on a device.** Install the release from a Play testing track. With
   developer tools on, open the Tools tab → Run auth diagnostics and check
   that the verify probe passes without spending credits. Play Console's Play Integrity **Testing** page can force
   failing verdicts for tester accounts.
9. **Data safety.** Check that "Device or other IDs" is declared for app
   functionality and fraud prevention.
