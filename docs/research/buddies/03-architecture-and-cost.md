# WitnessWork Buddies: Architecture and Usage-Optimized Cost Recommendation

- **Date:** 2026-09-23. All vendor pages were accessed 2026-09-23. "Last updated" dates are the vendor's own dates.
- **Scope:** calendar sharing (#288), device-calendar sync (#265), buddy invites by secure link, Follow-up invitations, push notifications, later Achievement-style awards, buddy activity. Future: territory collaboration (#434).
- **Status:** recommendation only. Nothing was implemented. The repos were read-only.
- **Glossary:** terms follow `CONTEXT.md`: Plan, Day Plan, Recurring Plan, Follow-up, Visit, Contact, Milestone, Achievement Tier, Supporter, iCloud Sync.

---

## 0. Recommendation in one page

**Build Option D.** D is Option C, a Cloudflare "blind relay" on the existing ww-proxy, plus an identity seed synced through iCloud Keychain and a small encrypted copy of your own buddy state stored on the relay.

1. **One `BuddyInbox` Durable Object per user.** It uses SQLite and holds only ciphertext and opaque IDs:
   - the latest encrypted **Buddy Card** from each buddy (a rolling window of their Plans, plus an optional progress summary)
   - an encrypted **event log** with a TTL (Follow-up invitations, responses, Milestones, Achievement Tiers)
   - the owner's APNs device tokens
   - the owner's encrypted **roster** (buddy list and pair keys), so a new iPhone or iPad can rebuild everything
2. **Two-layer authorization.**
   - A 24-hour stateless session token is minted once per device per day behind the **existing** App Attest v2 machinery (`AppAttestIdentity` DO).
   - Each write also needs a per-buddy **capability token**, so only people you paired with can write to your inbox. Either side can revoke.
   - The relay never sees names, Apple IDs, Plans, Contacts, or Follow-up details.
3. **Schedule sharing is pull, not push.**
   - The sender publishes one small encrypted snapshot per buddy when their Plans actually change. Publishes are debounced and coalesced, and unchanged hashes are skipped.
   - Receivers pull all buddies in **one** request on foreground, throttled.
   - There are no silent pushes and no background polling.
4. **Only user-visible events get pushes.**
   - These are Follow-up invitations and replies, invite accepted, and opt-in Milestones.
   - The push is an `alert` + `mutable-content` push carrying the encrypted event **inline** (≤4 KB). A Notification Service Extension (NSE) decrypts it locally, with no network call in the NSE.
   - Activity pushes use the `passive` interruption level.
5. **APNs is called directly from the Worker with `fetch()`.** In 2025–2026, several independent sources and open-source code report that HTTP/2 is negotiated in production, but Cloudflare does not document it, so a spike comes first. The fallback is the Expo Push Service, which is free.
6. **Device-calendar sync (#265) stays 100% local (EventKit) and costs nothing on the server.** Ship it first. It is independent of Buddies.

**Cost (Option C/D):** with 25% adoption, 2 buddies on average, and 1.3 devices per adopter, the extra monthly cost on top of the Workers Paid $5 base is:

| MAU  | Extra cost if Buddies gets the included allowances | Worst case at list rates (no allowance left) |
| ---- | -------------------------------------------------- | -------------------------------------------- |
| 1k   | $0.00                                              | $0.21                                        |
| 10k  | $0.07                                              | $2.09                                        |
| 50k  | $0.93                                              | $10.47                                       |
| 200k | $9.21                                              | $41.89                                       |

Stress case (200k MAU, 100% adoption, 5 buddies each): about $280–345 per month. SQLite row writes are ~70–75% of that. See §7.

**Rejected options:**

- **A, the CloudKit public-DB bus.**
  - The records are readable by every authenticated user of the app, so the social graph is enumerable.
  - Anyone can address records (and so pushes) to any fingerprint, which enables spam.
  - Apple no longer publishes the public-DB quotas.
  - It adds manual schema promotion.
  - It is iOS-only forever.
- **B, CKShare plus `encryptedValues`.**
  - `encryptedValues` is end-to-end encrypted **only when the user enables Advanced Data Protection**.
  - Both people need iCloud accounts, and participants see each other's iCloud identity (name plus email or phone lookup info).
  - Shared-database pushes are coalesced "something changed" hints.
  - Expo SDK 57's `ExpoAppSceneDelegate` does not forward `windowScene(_:userDidAcceptCloudKitShareWith:)`.

---

## 1. What exists today (repo facts that shape the design)

| Area              | Fact (file)                                                                                                                                                                                                                                                                                                                                                                                                                                        | Consequence                                                                                                                                                                                                                                                                                                                                          |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Architecture      | Three tiers: `src/app` (infra), `src/features/<domain>` (can import shared + itself only), shared (`src/lib`, `src/components`, `src/stores`, ...). `plans`, `settings`, `home`, `progress`, `updates`, `onboarding` are classified **app** (`docs/architecture-features.md`).                                                                                                                                                                     | The Buddies UI lives in `features/buddies`. App-tier orchestrators (Schedule, Settings) compose it. `features/visits` cannot import `features/buddies`, so it uses a navigation route instead.                                                                                                                                                       |
| App Attest client | 2,548-line `src/features/notes-import/lib/notesImportAppAttest.ts` plus `notesImportAppAttestRuntime.ts`.                                                                                                                                                                                                                                                                                                                                          | This is **feature-owned**, so Buddies cannot import it. Lift the generic v2 machinery into `src/lib/appAttest/` first. That is a prerequisite refactor.                                                                                                                                                                                              |
| Server App Attest | v2 protocol: `POST /notes-import/challenge` (issues a one-time challenge through the `AppAttestIdentity` DO), then an assertion on the protected call (`verifyAssertion` through the same DO). Purposes are namespaced (`NOTES_IMPORT_KICKOFF_PURPOSE`, `..._VERIFY_PURPOSE`).                                                                                                                                                                     | Each attested call costs 2 Worker requests and 2 DO requests, plus row writes. **Attest once per day to mint a session token, not per request.** Precedent: Notes Import already signs only the kickoff with App Attest and uses a short-lived KV "subscribe token" for the stream (`docs/notes-import-streaming-durable-objects.md`, "Auth split"). |
| DO conventions    | SQLite DOs with RPC methods (`NotesImportIndex`, `NotesImportRun`), alarm-based retention cleanup (`runDO.ts`), bindings and migrations repeated under `[env.dev]` (not inherited), separate dev worker `ww-proxy-dev` with dev bundle ID and development App Attest.                                                                                                                                                                              | Mirror these for `BuddyInbox`: migration tag `v3`, repeated for dev.                                                                                                                                                                                                                                                                                 |
| Rate limiting     | `RATE_LIMITER` 60 req / 60 s keyed by `CF-Connecting-IP`.                                                                                                                                                                                                                                                                                                                                                                                          | Add a Buddies limiter keyed by session device tag, plus an IP limiter for the unauthenticated invite-open route.                                                                                                                                                                                                                                     |
| Universal links   | AASA (`src/contactLink.ts`) lists only `/c/*` for the prod and dev bundle IDs. The fallback HTML page has no JS.                                                                                                                                                                                                                                                                                                                                   | Add a `/b` component. The invite secret goes in the **URL fragment**, which browsers never send to the server.                                                                                                                                                                                                                                       |
| Observability     | Prod `wrangler.toml` has `observability.enabled`, `head_sampling_rate = 1`, `logs.persist = true`.                                                                                                                                                                                                                                                                                                                                                 | Keep inbox IDs and capability tokens **out of URL paths and logs**. Put them in POST bodies.                                                                                                                                                                                                                                                         |
| Push              | Only local notifications (`expo-notifications`). `UIBackgroundModes` = `fetch`, `processing` (no `remote-notification`). **But** `expo-notifications`' auto-applied config plugin injects `aps-environment` (mode defaults to `development`). The local dev prebuild's `ios/WitnessWorkDev/WitnessWorkDev.entitlements` already contains `aps-environment = development` (`node_modules/expo-notifications/plugin/build/withNotificationsIOS.js`). | Entitlement friction is lower than the brief assumed. Set `['expo-notifications', { mode: IS_DEV ? 'development' : 'production' }]` explicitly and confirm Push is enabled on the prod App ID. No `remote-notification` background mode is needed, because the design uses alert pushes only.                                                        |
| Scene lifecycle   | SDK 57 uses `EXExpoAppSceneDelegate`. It forwards `scene(_:continue:)` (universal links) but **not** `windowScene(_:userDidAcceptCloudKitShareWith:)` (`node_modules/expo/ios/AppDelegates/ExpoAppSceneDelegate.swift`).                                                                                                                                                                                                                           | Option C's link flow works with no native changes. Option B would need a custom scene-delegate subclass plus a config plugin.                                                                                                                                                                                                                        |
| Background        | `expo-background-task` is already registered for widget refresh (`src/app/widgets/widgetSync.ts`, minimum interval 60 min).                                                                                                                                                                                                                                                                                                                        | Buddies does not need a new background task. It could piggyback later if a Buddies widget ships.                                                                                                                                                                                                                                                     |
| Keychain          | `modules/keychain-uuid` items are **explicitly this-device-only and non-synchronizing** (a documented invariant).                                                                                                                                                                                                                                                                                                                                  | Put the synchronizable Buddies seed in a **new** module or function. Do not bend keychain-uuid.                                                                                                                                                                                                                                                      |
| iCloud            | The account file (`witness-work-account.json`, ADR 0011) uses the ubiquity container for **all** users, so it is not Supporter-gated. Payload sync is Supporter-gated.                                                                                                                                                                                                                                                                             | iCloud Drive is available without Supporter status, but it is **not E2EE by default** (§2.5), so it is unfit for key material.                                                                                                                                                                                                                       |
| Targets           | `targets/widgets` via `@bacons/apple-targets` 0.2.1, deployment target 17.0. The app's minimum is iOS 16.4 (`ios/Podfile`). `scripts/sync-widget-shared.mjs` copies shared Swift into the widget.                                                                                                                                                                                                                                                  | The NSE is a sibling target (type `notification-service`). Reuse the sync-shared pattern to share crypto Swift between the Expo module and the NSE.                                                                                                                                                                                                  |
| Prior plans       | `docs/friend-sharing-plan.md` and `docs/calendar-sync-plan.md` use pre-refactor paths (`src/screens/...`, `src/lib/sync/...`). The friend plan says public-DB records "count against A's iCloud quota".                                                                                                                                                                                                                                            | Remap paths (§9). Apple's docs say public-DB data counts toward the **app's** quota, not the user's (§2.3).                                                                                                                                                                                                                                          |

---

## 2. Verified external findings

### 2.1 Can Cloudflare Workers call APNs directly? (Critical)

- **Apple's requirement:** "Use HTTP/2 and TLS 1.2 or later to establish a connection between your provider server and [api.push.apple.com:443 / api.sandbox.push.apple.com:443]". Source: [Apple, Sending notification requests to APNs](https://developer.apple.com/documentation/usernotifications/sending-notification-requests-to-apns).
- **Evidence that production Workers negotiate HTTP/2 on outbound `fetch()`:**
  - [workerd #5266](https://github.com/cloudflare/workerd/issues/5266) (opened 2025-10-04, open): "Currently `fetch` in a real Worker uses HTTP/2 when possible, but when developing locally this doesn't seems to be supported."
  - [workerd #4841](https://github.com/cloudflare/workerd/issues/4841) (opened 2025-08-20, open): APNs via `fetch()` fails in local dev on macOS; "The same code works correctly when deployed on production Cloudflare Workers."
  - Open-source Worker APNs senders that use plain `fetch()`:
    - [jonesphillip/paje](https://github.com/jonesphillip/paje) (created 2026-02-15). `worker/apns.ts` calls `fetch("https://api.push.apple.com/3/device/<token>")` and caches the ES256 JWT for 50 minutes. Its per-topic Durable Object "sends APNs push".
    - [Codakuma, "A ridiculously-lightweight push notification service"](https://codakuma.com/pushy/) (2026-04-11) posts to `/3/device/{token}` from a Worker.
    - [@fivesheepco/cloudflare-apns2](https://github.com/FiveSheepCo/cloudflare-apns2) (Jan 2025). `src/apns.ts` uses `fetch`.
- **Not officially documented.** No Cloudflare docs page says outbound subrequests use HTTP/2. Treat this as _very likely, must be spiked_ (Phase 0) on `ww-proxy-dev` against the APNs sandbox.
- **Gotchas if it works:**
  1. `wrangler dev` / workerd cannot do it locally. Unit-test against a mock and do end-to-end tests on the deployed dev worker.
  2. **Provider-token reuse.** APNs says: "Refresh your token no more than once every 20 minutes and no less than once every 60 minutes... APNs report an error if you use a new token more than once every 20 minutes on the same connection" ([Apple, token-based connection](https://developer.apple.com/documentation/usernotifications/establishing-a-token-based-connection-to-apns)). ECDSA signatures are randomized, and each isolate mints its own token. Share one JWT per ~45-minute bucket across isolates through KV (plus an in-isolate cache). How Cloudflare pools APNs connections is unknown, so this is unverified.
  3. **Send from the stateless Worker (billed on CPU), not from the DO (billed on wall-clock duration while waiting on APNs).**
  4. Payload ≤ 4096 bytes ([Apple, Generating a remote notification](https://developer.apple.com/documentation/usernotifications/generating-a-remote-notification)).
  5. Prune tokens on 410 Unregistered and 400 BadDeviceToken.
- **Workarounds if the spike fails, ranked for privacy then cost:**

| Path                                            | Cost                                                                                                                                                                                                                                                                                                                                                                                      | Who sees device tokens / payload                                                                                                                                | Notes                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Direct APNs from Worker** (preferred)         | $0 (Cloudflare "does not bill for subrequests"; APNs has no per-message fee)                                                                                                                                                                                                                                                                                                              | Cloudflare, Apple (ciphertext only)                                                                                                                             | Needs the `.p8` key as a Worker secret.                                                                                                                                                                                                                                                                                                  |
| **Expo Push Service** (fallback 1)              | Free: "There is no cost associated with sending notifications through Expo push notification service" ([Expo FAQ](https://docs.expo.dev/push-notifications/faq/))                                                                                                                                                                                                                         | Expo (Expo push tokens, timing, ciphertext). Expo says it doesn't store contents "any longer than it takes to deliver"; staff may see contents while debugging. | 600 notifications/s per project; `mutableContent`, `collapseId`, `interruptionLevel`; 4096-byte payload; **Expo push tokens only**, so the device must call Expo to get one ([Expo, Sending notifications](https://docs.expo.dev/push-notifications/sending-notifications/), last updated 2026-08-31). Works over HTTP/1.1 from Workers. |
| Cloudflare Containers HTTP/2 relay (fallback 2) | About $1.7–2 per month for an always-on `lite` (1/16 vCPU, 256 MiB) instance, with memory and disk after included amounts, plus DO requests ([Containers pricing](https://developers.cloudflare.com/containers/pricing/), updated 2026-08-28: memory $0.0000025/GiB-s, CPU $0.000020/vCPU-s billed on **active** usage, disk $0.00000007/GB-s; included 25 GiB-h, 375 vCPU-min, 200 GB-h) | Cloudflare only                                                                                                                                                 | More ops (image, deploy, health).                                                                                                                                                                                                                                                                                                        |
| AWS SNS mobile push                             | 1M/month free, then about $0.50 per million (secondary sources; the AWS page did not render the rate)                                                                                                                                                                                                                                                                                     | AWS                                                                                                                                                             | Needs an AWS account and SigV4 signing.                                                                                                                                                                                                                                                                                                  |
| FCM HTTP v1 for iOS                             | $0                                                                                                                                                                                                                                                                                                                                                                                        | Google                                                                                                                                                          | Needs the Firebase iOS SDK in the app. Rejected.                                                                                                                                                                                                                                                                                         |

### 2.2 Cloudflare pricing (Workers Paid)

Sources: [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) (updated 2026-08-28) and [DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/) (updated 2026-08-25).

| Item                                                                                     | Included / month   | Overage                                                              |
| ---------------------------------------------------------------------------------------- | ------------------ | -------------------------------------------------------------------- |
| Workers Paid base                                                                        | —                  | **$5 minimum**                                                       |
| Worker requests                                                                          | 10M                | $0.30 / M                                                            |
| Worker CPU                                                                               | 30M CPU-ms         | $0.02 / M CPU-ms                                                     |
| DO requests (HTTP, **each RPC session**, alarms, WS messages at 20:1)                    | 1M                 | $0.15 / M                                                            |
| DO duration (128 MB per object, wall-clock while active or idle-but-unable-to-hibernate) | 400,000 GB-s       | $12.50 / M GB-s                                                      |
| DO SQLite rows read                                                                      | 25B                | $0.001 / M                                                           |
| DO SQLite rows written (`setAlarm()` = 1 row written)                                    | 50M                | $1.00 / M                                                            |
| DO SQLite stored                                                                         | 5 GB-month         | $0.20 / GB-month                                                     |
| KV reads / writes / deletes / lists                                                      | 10M / 1M / 1M / 1M | $0.50 / $5 / $5 / $5 per M                                           |
| KV storage                                                                               | 1 GB               | $0.50 / GB-month                                                     |
| Subrequests                                                                              | —                  | "Cloudflare does not bill for subrequests you make from your Worker" |

- **Idle DOs:** "Durable Objects that are idle and eligible for hibernation are not billed for duration." Request-driven inboxes with no WebSockets or timers cost nothing between requests.
- **RPC billing:** "Every RPC method call on a Durable Objects stub is its own RPC session and therefore a single billed request."
- **SQLite storage billing** started 2026-01-07 ([Cloudflare community changelog](https://community.cloudflare.com/t/durable-objects-workers-billing-for-sqlite-storage/867188)).
- **Limits.** Sources: [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) (updated 2026-09-05) and [DO limits](https://developers.cloudflare.com/durable-objects/platform/limits/) (as of 2026-06-01).
  - 10,000 subrequests per invocation
  - 6 simultaneous open connections per invocation
  - DO SQLite: 10 GB per object
  - 2 MB maximum row
  - soft limit of 1,000 requests/s per object
- **Rate Limiting binding** ([docs](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/), updated 2026-04-23): per-location, "permissive, eventually consistent", period 10 or 60 s. The page lists no price, so no extra charge is assumed (unverified).
- **D1**, for comparison ([D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), updated 2026-04-21): same row prices, no per-request fee, storage $0.75/GB-month, and "Indexes will add an additional written row". D1 would save the DO request fee, a few dollars at 200k MAU. It loses per-inbox serialization and alarms and doesn't match the repo's DO conventions. Not recommended.

### 2.3 CloudKit facts relevant to A and B

- **Public DB is world-readable within the app:** "The contents of the public database are readable by all users of the app, and users have write access to the records... they create... Data in the public database counts toward your app's iCloud storage quota." ([publicCloudDatabase](https://developer.apple.com/documentation/cloudkit/ckcontainer/publicclouddatabase))
  - Security roles (World / Authenticated / Creator, plus custom roles) can restrict reads to the creator. A bus where A writes and B reads **requires** read access for all authenticated users. Default: authenticated users create, the creator updates ([Rambo, 2021-12-06](https://www.rambo.codes/posts/2021-12-06-using-cloudkit-for-content-hosting-and-feature-flags); [M. Tsai, 2026-06-05](https://mjtsai.com/blog/2026/06/05/permissions-in-the-cloudkit-public-database/)).
  - No role can express "only X's buddies may create records whose `recipient == X`".
- **`encryptedValues` cannot be used on public-DB records:** "CloudKit doesn't allow encryption on ... records that you store in the public database". It is E2EE **only with ADP**: "When you enable Advanced Data Protection, the encryption keys are available exclusively to the record's owner and... that share's participants." ([encryptedValues](https://developer.apple.com/documentation/cloudkit/ckrecord/encryptedvalues))
  - Apple's overview confirms it: "When you turn on Advanced Data Protection, third-party app data stored in ... CloudKit encrypted fields and assets are end-to-end encrypted". Under standard protection it is "in transit & on server" ([Apple, iCloud data security overview](https://support.apple.com/en-us/102651), published 2026-01-05).
- **Public-DB quotas are no longer published.**
  - Apple's CloudKit page says only "up to 1PB of storage for your app's public data" ([CloudKit](https://developer.apple.com/icloud/cloudkit/)).
  - A Sep 2020 forum post quoting Apple's former terms says limits are per active user (active in the last 16 months): 250 MB assets, 2.5 MB DB, 50 MB transfer, "Requests Per Second: 10 per 100k users". It also says "overage charges may apply" (historically $100 per 10 req/s) ([forum 660009](https://developer.apple.com/forums/thread/660009)).
  - A Nov 2023 request for current numbers is unanswered ([forum 740916](https://developer.apple.com/forums/thread/740916)).
  - Current quotas are visible only in the CloudKit Console (Telemetry / Usage).
- **Sharing (B).**
  - Shared records live "in a custom record zone in the user's private database". The private DB "counts toward the user's iCloud storage quota" ([Shared records](https://developer.apple.com/documentation/cloudkit/shared-records); [privateCloudDatabase](https://developer.apple.com/documentation/cloudkit/ckcontainer/privateclouddatabase)).
  - "Only invited participants can join a private share. Anyone with the share URL can join a public share."
  - "CloudKit verifies they have an active iCloud account." It requires `CKSharingSupported`. Share metadata goes to "your app's scene delegate or app delegate."
  - "Participants must have an active iCloud account" ([CKShare.Participant](https://developer.apple.com/documentation/cloudkit/ckshare/participant)).
  - Identities include "their name, user record ID, and an email address or phone number" ([CKUserIdentity](https://developer.apple.com/documentation/cloudkit/ckuseridentity)).
  - Participants with write permission "can modify or delete any record that you include in the share".
- **Subscriptions.**
  - The shared DB supports only database subscriptions.
  - "Because the system coalesces notifications, don't rely on them for specific changes... Consider notifications an indication of remote changes" ([CKDatabaseSubscription](https://developer.apple.com/documentation/cloudkit/ckdatabasesubscription)).
  - Query subscriptions work in the public and private DBs ([CKQuerySubscription](https://developer.apple.com/documentation/cloudkit/ckquerysubscription)).

### 2.4 iOS push, NSE, background realities

- **Background (silent) pushes:** "don't try to send more than two or three per hour". Held notifications are coalesced to the newest one, and "If something force quits or kills the app, the system discards the held notification" ([Apple, Pushing background updates](https://developer.apple.com/documentation/usernotifications/pushing-background-updates-to-your-app)). **Design: zero silent pushes.**
- **APNs offline store:** "APNs stores only one notification per bundle ID" while the device is offline. Priority 5 and 1 "might get grouped and delivered in bursts". So pushes are hints; the inbox is the source of truth.
- **NSE.**
  - It runs only when the payload has an `alert` and `mutable-content: 1`, and not if alerts are disabled for the app.
  - It gets "only about 30 seconds".
  - Apple's own example is decrypting an encrypted payload ([Modifying content in newly delivered notifications](https://developer.apple.com/documentation/usernotifications/modifying-content-in-newly-delivered-notifications)).
  - Suppressing an alert needs the `com.apple.developer.usernotifications.filtering` entitlement, which requires an application ([docs](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.usernotifications.filtering)). Not needed for v1.
- **Background tasks:** `expo-background-task` uses BGTaskScheduler. "short intervals are often ignored", "Background tasks are stopped if the user kills the app" ([Expo docs](https://docs.expo.dev/versions/latest/sdk/background-task/)).
- **NSE target support:** `@bacons/apple-targets` supports `notification-service` and auto-mirrors App Groups ([README](https://github.com/EvanBacon/expo-apple-targets)).

### 2.5 Keys, iCloud Keychain, E2EE

- iCloud "Passwords and Keychain" is **end-to-end encrypted under Standard Data Protection**. **iCloud Drive is not** ("In transit & on server") unless ADP is on ([Apple 102651](https://support.apple.com/en-us/102651), 2026-01-05).
- **Synchronizable Keychain** ([kSecAttrSynchronizable](https://developer.apple.com/documentation/security/ksecattrsynchronizable)):
  - "Starting in iOS 14... the keychain synchronizes passwords, certificates, and cryptographic keys."
  - It can't use `...ThisDeviceOnly` accessibility.
  - "Updating or deleting ... affects all copies."
- **Sharing with the NSE:** "You can use app group names as keychain access group names, without adding them to the Keychain access groups entitlement" ([Sharing keychain items](https://developer.apple.com/documentation/security/sharing-access-to-keychain-items-among-a-collection-of-apps)). The NSE can read the seed using the existing App Group.
- **CryptoKit availability** (Apple doc metadata): Curve25519 KeyAgreement/Signing and ChaChaPoly from iOS 13; HPKE from iOS 17; `MLKEM768` and `XWingMLKEM768X25519` from iOS 26. The app's minimum is 16.4, so v1 uses X25519 + HKDF + ChaChaPoly. The envelope carries a suite byte so HPKE or X-Wing can come later.
- **App Attest** ([Preparing to use App Attest](https://developer.apple.com/documentation/devicecheck/preparing-to-use-the-app-attest-service); [Validating apps](https://developer.apple.com/documentation/devicecheck/validating-apps-that-connect-to-your-server)):
  - Each assertion should embed a server one-time challenge, and the counter must increase.
  - Keep `attestKey` under 100 requests/s across installs and ramp up gradually.
  - Reusing the existing Notes-Import key means **zero new attestations** for Buddies.
- **Universal-link fragments:** AASA `components` support a `#` (fragment) matcher ([Apple applinks components](https://developer.apple.com/documentation/bundleresources/applinks/details-swift.dictionary/components-swift.dictionary)). Fragments are not sent to servers by browsers, so the secret never reaches ww-proxy logs.

---

## 3. Option comparison

| Criterion                    | A: CloudKit public-DB bus                                                                                                                                      | B: CKShare zones + `encryptedValues`                                                                                                                         | C: Cloudflare blind relay                                                                             | **D: C + iCloud-Keychain seed + relay self-state (recommended)** |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| E2EE by default              | App-layer only (`encryptedValues` not allowed in public DB)                                                                                                    | **No** for non-ADP users (Apple holds the keys); yes only with ADP                                                                                           | Yes (app layer, CryptoKit)                                                                            | Yes; the seed lives only in E2EE iCloud Keychain                 |
| Server-visible metadata      | Apple: creator Apple ID on every record, `recipient`/`senderHint` fields. **Any app user with a modified client can enumerate the graph** (reads must be open) | Apple: share membership by Apple ID. **Buddies see each other's iCloud name/email/phone**                                                                    | Operator: opaque inbox/slot IDs, device tokens, IPs, timing. No names or Apple IDs                    | Same as C. IDs stay in POST bodies, not persisted logs           |
| Spam / abuse                 | Any authenticated user can create records addressed to any fingerprint, and each one triggers pushes                                                           | None (ACL by share)                                                                                                                                          | Capability per buddy + App Attest session + rate limits                                               | Same as C                                                        |
| Invite UX                    | Two-link handshake (old plan) or an extra `FriendInvite` type                                                                                                  | iCloud share URL → iCloud acceptance → app. Public share = anyone with the URL joins instantly. Private share needs an email or phone                        | One universal link or QR, secret in fragment, one tap to accept, reuses AASA                          | Same as C                                                        |
| iCloud requirement           | Yes (write + subscriptions)                                                                                                                                    | Yes, both parties                                                                                                                                            | No                                                                                                    | No. iCloud Keychain gives multi-device, with a linking fallback  |
| Push quality                 | Query subscription → alert. The NSE must **fetch** the record (network inside the NSE); coalesced                                                              | Database-subscription hints only (coalesced). Rich text needs an NSE fetch or silent push (2–3/h)                                                            | Per-event alert with the encrypted payload **inline**; NSE decrypts offline; passive or active levels | Same as C                                                        |
| Schedule sharing             | Record per (snapshot, recipient)                                                                                                                               | Natural (zone per pair)                                                                                                                                      | Card per buddy in each inbox; one pull for all buddies                                                | Same as C                                                        |
| Multi-device                 | Keypair in iCloud Drive payload (Supporter-gated, not E2EE)                                                                                                    | Native (same Apple ID)                                                                                                                                       | Needs a design                                                                                        | Seed in iCloud Keychain; roster on relay                         |
| Territory (≤10 multi-writer) | Poor                                                                                                                                                           | Good fit (read-write zone share), but E2EE only with ADP                                                                                                     | Group mailbox DO + group key / MLS                                                                    | Same as C; designed for it (§10)                                 |
| Android or web later         | Never                                                                                                                                                          | Never (CloudKit JS aside)                                                                                                                                    | Possible (swap App Attest for Play Integrity)                                                         | Possible                                                         |
| Ops burden                   | CloudKit Console, **manual schema promotion per release**, opaque quotas                                                                                       | Share lifecycle, change tokens, zone per pair                                                                                                                | New DO class, routes, APNs key secret, monitoring (existing patterns)                                 | Same as C, plus a small Keychain module                          |
| Expo/RN integration          | New `cloudkit-bridge` module, NSE with iCloud entitlement, schema scripts                                                                                      | Scene-delegate subclass (Expo doesn't forward share acceptance), `UICloudSharingController` bridge, sync engine (CKSyncEngine not usable for iOS 16.4 users) | Crypto module, NSE, push registration; links reuse existing forwarding                                | Same as C                                                        |
| Developer cost at 200k MAU   | $0 until the unpublished quota; about 7 req/s average, ~25–35 req/s peaks vs a historical ~20 req/s allowance                                                  | $0 (users' quotas)                                                                                                                                           | ≈ $9/mo ($42 worst case)                                                                              | ≈ $9/mo ($42 worst case)                                         |
| **Verdict**                  | Reject                                                                                                                                                         | Reject for Buddies (revisit only if Apple-managed keys become E2EE by default)                                                                               | Viable                                                                                                | **Adopt**                                                        |

---

## 4. Recommended architecture (D)

### 4.1 Topology

```text
 Sender (A)                               ww-proxy (Cloudflare)                         Receiver (B)
 ─────────────────────                    ─────────────────────────────                 ───────────────────────
 Zustand stores (Plans,                   Worker (Hono)                                  BuddyInbox DO (B)
 Visits, progress)                         /buddies/v1/*                                 ├─ slots (caps, ≤5+inv)
   │ plan change (local edit)              ├─ session: App Attest v2 →                   ├─ cards (1 per buddy)
   ▼                                       │   AppAttestIdentity DO (existing)            ├─ events (TTL 30d)
 buildCard() → hash → debounce             ├─ publish: verify cap per item ─────RPC────▶ ├─ devices (APNs tokens)
   │ encrypt per buddy (pairKey)           │   fan-out ≤5 inbox DOs                      └─ roster (B's own, enc.)
   ▼                                       ├─ sync: 1 RPC to own inbox                          │
 POST /publish (1 req, N items) ─────────▶ │                                              push targets
                                           └─ waitUntil: APNs fetch (HTTP/2) ─────────▶ APNs ──▶ B's devices
                                                  (JWT cached via KV ~45 min)                    │
                                                                                                 ▼
 A's iPad: same seed (iCloud Keychain)                                        NSE: slot → pairKey (App Group
 → same inbox, roster from relay                                              file) → decrypt inline event →
                                                                              localized title/body (no network)
                                                                                                 │
                                                                     App foreground: POST /sync {since} (1 req)
                                                                     → cards + events → faded buddy Plans in
                                                                       Schedule month calendar; invitations
```

### 4.2 Identity and keys

- **`rootSeed`**: 32 random bytes.
  - Stored as a **synchronizable** generic-password item (accessibility `AfterFirstUnlock`, access group = App Group `group.com.leviwilkerson.jwtime` / `...jwtimedev`).
  - Result: E2EE sync to the same Apple ID's devices, and the NSE can read it while the phone is locked after first unlock.
- **Derived with HKDF-SHA256 and domain-separated labels:**
  - `idX25519` (key agreement) and `idEd25519` (signing; unused in pairwise v1 but reserved for groups)
  - `inboxId` (128-bit, base32)
  - `ownerSecret` (bearer for owner operations; the relay stores only its SHA-256)
  - `rosterKey` (encrypts self-state on the relay)
  - `nseKey` (encrypts the App Group snapshot)
  - `eventIdKey` (deterministic event IDs)
- **Pair key**, per relationship:
  - `pairKey = HKDF(ikm = X25519(my, their), salt = SHA256(inviteSecret), info = "ww-buddies/v1/pair" ‖ sorted(pubA, pubB))`
  - Directional subkeys `k_{A→B} = HKDF(pairKey, "dir" ‖ senderPub)`
- **AEAD:** ChaCha20-Poly1305 with random 96-bit nonces, which is fine at this volume.
  - AAD = `"wwb1" ‖ recipientInboxId ‖ slotId ‖ kind ‖ objectId ‖ version`
  - Pairwise AEAD already authenticates the sender as "the other party", so v1 has no per-message signature. Groups will need Ed25519 signatures.
- **Envelope format:** `[ver:1][suite:1 (0x01 = X25519-HKDF-SHA256-ChaChaPoly)][nonce:12][ct‖tag]`. The suite byte allows moving to HPKE (iOS 17+) or X-Wing ML-KEM hybrid (iOS 26+) later.
- **Safety code (optional):** 6 digits from `SHA256("safety" ‖ sorted pubs)` shown on both phones.
- **No forward secrecy in v1** (static-static), which fits this threat model. A periodic rekey event can be added later.

### 4.3 Invite → accept (one link, one tap)

```text
A (inviter)                                  Relay (A's inbox DO)                 B (invitee)
1. s = random32; inviteId = H("inv"|s); offerKey = HKDF(s,"offer")
   create pending slot (capHash_forB)
   POST /buddies/v1/invites {inboxId_A, inviteId, sealedOffer=Enc(offerKey,
     {A.pubs, A.displayName, slotId_forB, cap_forB, grantsOffered}), exp=7d}  ──▶ store invite (single-use)
2. Share https://ww-proxy.leviwilkerson.com/b#v1.<inboxId_A>.<s>
   (iMessage / AirDrop / QR). Fragment never reaches any server.
                                                                                  3. Universal link → app
                                                                                     POST /invites/open {inboxId_A, inviteId}
                                                        ◀── sealedOffer ───────────  (IP rate-limited)
                                                                                  4. decrypt → "Levi wants to be buddies.
                                                                                     Share your Plans with Levi?" [toggles]
                                                                                  5. Accept: create own slot for A (cap_forA),
                                                                                     derive pairKey,
                                                                                     POST /invites/redeem {inboxId_A, inviteId,
                                                                                       sealedAcceptance=Enc(offerKey,{B.pubs,
                                                                                       B.name, inboxId_B, slotId_forA, cap_forA})}
                                             mark redeemed; append acceptance event;
                                             push A: "Sarah accepted" (NSE uses offerKey
                                             from the pending-invite entry in the NSE snapshot)
6. A processes acceptance → pairKey → buddy active → both publish initial cards
```

- The link is a **single-use, 7-day, revocable bearer invite**. If someone else redeems it first, A sees an unexpected name and can end the relationship. The safety code covers high-assurance cases.
- **Ending** (either side): revoke the slot in your own inbox (server deletes the cap hash and that sender's card), send an `ended` event, and delete the local keys.

### 4.4 Relay: `BuddyInbox` DO (SQLite)

```sql
meta(k TEXT PRIMARY KEY, v TEXT)          -- ownerHash, createdAt, lastOwnerSeenDay, headSeq, schema
slots(slotId TEXT PRIMARY KEY, capHash TEXT, pushPolicy INTEGER, createdAt INTEGER)  -- ≤5 buddies + ≤5 pending invites
invites(inviteId TEXT PRIMARY KEY, slotId TEXT, sealedOffer BLOB, expiresAt INTEGER, redeemedAt INTEGER)
cards(slotId TEXT PRIMARY KEY, seq INTEGER, version TEXT, hash TEXT, ct BLOB)   -- no secondary index (≤5 rows scan)
events(seq INTEGER PRIMARY KEY AUTOINCREMENT, eventId TEXT UNIQUE, slotId TEXT, ct BLOB, expiresAt INTEGER)
devices(deviceTag TEXT PRIMARY KEY, token TEXT, env TEXT, updatedAt INTEGER)   -- ≤5
roster(k TEXT PRIMARY KEY, seq INTEGER, ct BLOB)                                -- owner's encrypted self-state
```

**Auth:**

- Every call carries a **session token**: `v1.<deviceTag>.<exp>.<HMAC(BUDDIES_SESSION_SECRET)>`.
  - It is minted by `POST /buddies/v1/session` after an App Attest v2 assertion with a new purpose `buddies-session`, reusing the `AppAttestIdentity` DO.
  - It lives 24 h (a tunable knob) and is stateless, so there is no KV or DO lookup per request.
  - It contains no install UUID or account ID, and the mint handler does not persist the mapping.
- **Owner operations** (sync, roster, slots, devices, invites) also need `ownerSecret`. The DO compares SHA-256 against `ownerHash`.
- **Sender operations** need, per item, `cap` whose SHA-256 must match `slots.capHash`.
- **Per-slot quotas** inside the DO (for example ≤50 events/day, ≤20 pushes/day) stop a misbehaving buddy.

**Endpoints** (all POST with JSON bodies; IDs never in paths):

- `/buddies/v1/session/challenge`, `/buddies/v1/session` (App Attest)
- `/buddies/v1/sync` `{inboxId, ownerSecret, since, deviceToken?}` → `{headSeq, cards[changed], events[>since], roster?}`. The token piggybacks here when it changes, saving a request.
- `/buddies/v1/publish` `{items[≤10]: {inboxId, slotId, cap, kind: card|event, eventId?, version?, hash?, ct, push?: {level, collapse, exp}}}`
- `/buddies/v1/roster`, `/buddies/v1/slots` (create/revoke), `/buddies/v1/devices` (remove)
- `/buddies/v1/invites` (create/delete), `/buddies/v1/invites/open`, `/buddies/v1/invites/redeem`
- `/buddies/v1/inbox/delete`: delete everything (disable Buddies / delete my data)
- `GET /b`: fallback HTML. A tiny inline script forwards `location.hash` to `witnesswork://buddy-invite#...`, plus an App Store CTA.

**Cheap-write rules:**

- Card upsert is skipped when `hash` is unchanged: 1 row read, 0 written.
- Events use `INSERT OR IGNORE` on `eventId`.
- `lastOwnerSeenDay` is written at most once per day.
- Expired events are pruned lazily on write (`DELETE ... WHERE expiresAt < now LIMIT 50`).
- There is **one** alarm per inbox, at about 30 days: if the owner hasn't been seen for 180 days, `deleteAll()`; otherwise re-arm.

### 4.5 Push path

1. The DO's `deliver()` returns `pushTargets` (tokens + env) only for events whose slot `pushPolicy` allows it. Mute settings are owner-controlled flags on opaque slots.
2. The Worker sends to APNs in `ctx.waitUntil`, so the client response isn't blocked and no DO wall-clock is billed.
3. **Headers:**
   - `apns-push-type: alert`
   - `apns-priority`: 10 for invitations, 5 for passive activity
   - `apns-expiration`: the Follow-up start time for invitations, +24 h for activity
   - `apns-collapse-id` = short hash of the invitation ID, so updates replace each other
   - `thread-id` = slot hash, to group by buddy
4. **Payload** (≤4096 B):

```json
{
  "aps": {
    "alert": { "title": "WitnessWork", "body": "New update from a buddy" },
    "mutable-content": 1,
    "thread-id": "<h(slot)>",
    "interruption-level": "passive"
  },
  "b": { "s": "<slotId>", "e": "<base64 envelope ≤ ~3 KB>" }
}
```

5. If APNs returns 410 or 400 BadDeviceToken, call `inbox.pruneDevice()`. That is a rare extra DO request.
6. The APNs JWT is shared through KV (`buddies:apns-jwt`, rotated every ~45 min) with an in-isolate cache.

### 4.6 NSE (`targets/notification-service`)

- **Reads:**
  - the Keychain seed (App Group access group)
  - `nse-buddies.bin` in the App Group container, encrypted with `nseKey`: `{slotId → {k_recv, name, mute}, pendingInvites → offerKey}`
  - a **generated localized strings table** built from `src/locales/*.json` Buddies keys (en-US is the source; approved locales only)
- **Does:**
  - decrypts the event
  - renders a localized title and body from structured fields (type + params), never sender-rendered text
  - writes the decrypted event to an App Group "pending events" file so the app shows it without refetching
  - falls back to the generic placeholder on any failure
- **Never calls the relay.** It needs no App Attest and no network.

---

## 5. Data model

| Object                             | Lives                                                                                                         | Contents (plaintext before encryption)                                                                                                                                                                                                                                                                                                                                           | Retention / TTL                                                                    | Size                                                |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------- |
| `rootSeed`                         | iCloud Keychain (synchronizable, App Group access group)                                                      | 32 B                                                                                                                                                                                                                                                                                                                                                                             | Until the user resets Buddies                                                      | 32 B                                                |
| Session token                      | Keychain, this device only                                                                                    | `deviceTag`, `exp`, HMAC                                                                                                                                                                                                                                                                                                                                                         | 24 h                                                                               | ~120 B                                              |
| APNs device token                  | Device (MMKV) + inbox `devices`                                                                               | token, env (sandbox/production)                                                                                                                                                                                                                                                                                                                                                  | Pruned on 410/400 or 60 days unrefreshed                                           | ~100 B                                              |
| **Buddy** (relationship)           | `features/buddies/stores/buddies.ts` (MMKV, **not** in the iCloud Sync payload) + encrypted in relay `roster` | `buddyId`, display name, their pubs, `pairKey`, `sendCap`, `theirInboxId`/slot IDs, grants {plans, planNotes, progress, milestones}, notify prefs, status (pendingOut / pendingIn / active / ended), since                                                                                                                                                                       | Until ended; roster overwritten                                                    | ~400 B × ≤5                                         |
| Share grant                        | Inside Buddy (sender side); enforced by what the sender puts in the card                                      | booleans per data class                                                                                                                                                                                                                                                                                                                                                          | Changes trigger republish                                                          | —                                                   |
| **Buddy Card** (schedule snapshot) | Sender builds → each buddy's inbox `cards` (1 row per sender) → receiver cache (MMKV)                         | `v`, HLC `version`, window (first day of previous month to end of month+2, ~120 days), expanded Day Plan instances as compact tuples `[dayOffset, startMin?, minutes, flags]` (Recurring Plans **expanded sender-side** with overrides and skips applied), optional notes/category (off by default), optional `progress` {month minutes, Monthly Goal, Achievement Tier, streak} | Overwritten; deleted when the relationship ends                                    | ~0.7–2 KB compressed; ≤4 KB typical; 16 KB hard cap |
| **Event**                          | inbox `events` → receiver feed (MMKV, last 200)                                                               | `type` (`followUpInvite` / `inviteUpdate` / `inviteCancel` / `inviteReply` / `milestone` / `achievementTier` / `goalReached` / `ended` / `acceptance`), `eventId` (deterministic HMAC for derived events), `createdAt`, typed params                                                                                                                                             | Relay 30 days (invitations: Follow-up date + 7 days); client 200 entries / 30 days | 150–600 B                                           |
| **Follow-up invitation**           | Host: linked to the local Visit (`visitId`); guest: invitations store                                         | `inviteId`, date/time + time zone, duration, optional meeting point ("near Elm St" or rounded coordinate), optional Contact **first name only**, optional note; replies accept / decline / maybe                                                                                                                                                                                 | Until the Follow-up date + 7 days                                                  | ~300 B                                              |
| Invite (buddy)                     | inviter inbox `invites` + link fragment                                                                       | sealed offer (pubs, name, slot, cap)                                                                                                                                                                                                                                                                                                                                             | 7 days, single use                                                                 | ~400 B                                              |
| Roster (self-state)                | inbox `roster`, encrypted with `rosterKey`                                                                    | buddy list incl. pair keys, grants, mutes, pending invites, sent Follow-up invitations index                                                                                                                                                                                                                                                                                     | Overwritten                                                                        | ≤8 KB                                               |
| NSE snapshot                       | App Group file, encrypted with `nseKey`, protection class _CompleteUntilFirstUserAuthentication_              | per-slot receive keys, names, mutes, pending offer keys                                                                                                                                                                                                                                                                                                                          | Rewritten on roster change                                                         | <4 KB                                               |
| Award / badge (later)              | Computed locally from own data; shared as events plus a card `progress` block                                 | badge ID, period, value                                                                                                                                                                                                                                                                                                                                                          | Events TTL; card overwritten                                                       | small                                               |

**Relay storage:** ≈20–70 KB per active inbox. Budget 50 KB. Inactive inboxes are garbage-collected after 180 days.

---

## 6. Usage-optimized sync strategy

1. **Snapshot, not delta, for schedules.**
   - Plans are tiny (≤2 KB compressed for ~120 days).
   - Recurring Plan edits, overrides and skips make deltas complex.
   - Snapshots are idempotent, self-healing after offline gaps, safe across devices (highest HLC `version` wins), and bounded (one row per sender per inbox).
   - Delta/op logs are reserved for territory collaboration (§10).
2. **Publish policy (sender):**
   - Subscribe to Plans, Visits and progress, but **only local user edits**. iCloud Sync write-backs set an "applying remote" flag that the publisher ignores, so a Supporter's iPad doesn't re-publish what the iPhone already published.
   - Rebuild the card, then skip if the hash equals the last published hash.
   - Debounce 30 s trailing with a 5-minute max wait. Flush on app background, mirroring iCloud Sync's flush.
   - One request carries all buddies' ciphertexts (≤10 items).
   - Republish on the first foreground of a new month, because the window rolls.
   - **Never publish on boot or foreground by itself.**
3. **Receive policy:**
   - On foreground, sync if more than 10 minutes since the last sync, or if a push arrived, or if the Schedule screen opens and it's been more than 2 minutes.
   - One `/sync` request returns everything since the device's own cursor. The cursor is **client-side**, so the server does no write per sync.
   - No background fetch in v1. The widget's existing BGTask can host an optional sync later.
4. **Push only user-visible events:**
   - invitations, invitation changes within 48 h, replies, invite accepted
   - opt-in Milestones and Achievement Tiers (`passive`)
   - **no** pushes for schedule changes, and **zero silent pushes**
   - This stays well inside iOS's "2–3 background pushes per hour" guidance and costs no NSE time for non-events.
5. **Coalescing:**
   - `apns-collapse-id` per invitation.
   - Activity events may be batched into a daily digest event per sender (optional knob). This caps activity pushes at ≤1 per buddy per day.
6. **Multi-device dedup:**
   - _Sending:_ deterministic `eventId = HMAC(eventIdKey, type|period|value)` means both of a user's devices produce the same event and the inbox `INSERT OR IGNORE`s it, with one push only. Cards are last-writer-wins by HLC, and identical hashes cost no write.
   - _Receiving:_ every device of B gets the alert (desired). Each device syncs its own cursor. The local feed dedups by `eventId`.
7. **Offline:**
   - Sender: MMKV outbox keeps only the **latest** card per buddy, plus pending events. Retry with exponential backoff on foreground or connectivity. Events are idempotent.
   - Receiver: shows cached cards with an "updated 3 h ago" staleness label. The inbox holds events for 30 days.
8. **Battery/network per active device per day:** about 6 small HTTPS requests (a few KB each), no persistent sockets, and NSE work is local AES-class decryption.

**Request budget per adopter per day** (assumptions in §7; the ×1.2 overhead is applied in §7):

| Operation                                                                | Worker req | DO req   | Rows written |
| ------------------------------------------------------------------------ | ---------- | -------- | ------------ |
| Inbox sync: 6/device × 1.3 devices                                       | 7.8        | 7.8      | 0            |
| Card publish: 2/day, fan-out 2                                           | 2          | 4        | 4            |
| Events: 0.5/day, fan-out 2 (UNIQUE index = 2 rows; prune later = 2 more) | 0.5        | 1        | 4            |
| App Attest session: 1/device/day (challenge + assert)                    | 2.6        | 2.6      | ~5.2         |
| Token / roster / invites / alarms / pruning                              | 0.46       | 0.61     | ~0.5         |
| **Total (×1.2 overhead)**                                                | **16**     | **19.2** | **~16.5**    |

---

## 7. Cost model (Option C/D) with math

### 7.1 Assumptions

PostHog was unavailable (`posthog-cli` is not installed here), so these are conservative guesses:

- Adoption: 25% of MAU use Buddies, so adopters U = 0.25 × MAU.
- 2 buddies on average (cap 5); 1.3 devices per adopter.
- Receive syncs: 6 per device per day (after throttling, from roughly 8 foreground opens).
- Card publishes: 2 per adopter per day (after coalescing).
- Events: 0.5 per adopter per day (Follow-up invitations, replies, milestones), fan-out 2.
- Pushes: 1.3 APNs sends per adopter per day. Each adopter receives about 1 event per day across 1.3 devices.
- Sessions: 1 per device per day. Each session is 2 Worker requests + 2 DO requests + ~4 rows written.
- DO wall time: 50 ms per request (no outbound I/O in DOs).
- Worker CPU: 3 ms per request.
- Overhead factor: ×1.2 for retries and misc.
- Storage: 50 KB per adopter.
- KV reads: 1 per push (worst case, for the APNs JWT).

### 7.2 Per-adopter monthly units

| Unit            | Value                                  |
| --------------- | -------------------------------------- |
| Worker requests | 16 × 30 = **480**                      |
| Worker CPU      | 480 × 3 ms = **1,440 ms**              |
| DO requests     | 19.2 × 30 = **576**                    |
| DO duration     | 576 × 0.05 s × 0.125 GB = **3.6 GB-s** |
| Rows written    | 16.5 × 30 ≈ **500**                    |
| Rows read       | ≈ **4,000**                            |
| Storage         | **50 KB**                              |
| KV reads        | **39**                                 |
| APNs sends      | **39** (free)                          |

### 7.3 Monthly totals and cost

| MAU  | Adopters | Worker req | CPU-ms | DO req | DO GB-s | Rows written | Rows read | Storage | APNs sends | **Incremental cost, allowances available** | **Worst case at list rates** |
| ---- | -------- | ---------- | ------ | ------ | ------- | ------------ | --------- | ------- | ---------- | ------------------------------------------ | ---------------------------- |
| 1k   | 250      | 0.12M      | 0.36M  | 0.144M | 900     | 0.125M       | 1.0M      | 12.5 MB | 9.75k      | **$0.00**                                  | **$0.21**                    |
| 10k  | 2,500    | 1.2M       | 3.6M   | 1.44M  | 9,000   | 1.25M        | 10M       | 125 MB  | 97.5k      | **$0.07**                                  | **$2.09**                    |
| 50k  | 12,500   | 6.0M       | 18M    | 7.2M   | 45,000  | 6.25M        | 50M       | 0.63 GB | 488k       | **$0.93**                                  | **$10.47**                   |
| 200k | 50,000   | 24M        | 72M    | 28.8M  | 180,000 | 25M          | 200M      | 2.5 GB  | 1.95M      | **$9.21**                                  | **$41.89**                   |

**Math, 200k MAU, worst case** (no included allowance left, because existing ww-proxy traffic such as Notes Import and geocode shares it):

| Item            | Calculation             | Cost       |
| --------------- | ----------------------- | ---------- |
| Worker requests | 24M × $0.30/M           | $7.20      |
| CPU             | 72M × $0.02/M           | $1.44      |
| DO requests     | 28.8M × $0.15/M         | $4.32      |
| DO duration     | 180,000 GB-s × $12.50/M | $2.25      |
| Rows written    | 25M × $1/M              | $25.00     |
| Rows read       | 200M × $0.001/M         | $0.20      |
| Storage         | 2.5 GB × $0.20          | $0.50      |
| KV reads        | 1.95M × $0.50/M         | $0.98      |
| **Total**       |                         | **$41.89** |

**Math, 200k MAU, included allowances available to Buddies:**

| Item                        | Calculation             | Cost      |
| --------------------------- | ----------------------- | --------- |
| Worker requests             | (24M − 10M) × $0.30/M   | $4.20     |
| CPU                         | (72M − 30M) × $0.02/M   | $0.84     |
| DO requests                 | (28.8M − 1M) × $0.15/M  | $4.17     |
| Duration, rows, storage, KV | within included amounts | $0        |
| **Total**                   |                         | **$9.21** |

- **50k MAU, allowances available:** (7.2M − 1M) × $0.15/M = $0.93.
- **10k MAU:** 0.44M × $0.15/M = $0.07.
- **Base:** +$5/month Workers Paid, assumed already paid for ww-proxy.

**Stress case:** 200k MAU, **100% adoption, 5 buddies each**, 1 event per day, fan-out 5.

- Per adopter per month: Worker ≈ 499, DO ≈ 936, rows written ≈ 1,296, storage ≈ 120 KB.
- Totals: 99.8M Worker requests, 187M DO requests, 259M rows written, 1.17M GB-s, 24 GB, 299M CPU-ms.
- **Worst case ≈ $344 per month; with included allowances ≈ $283 per month.** Row writes are $209–259 of that.
- **Levers**, if this ever materializes:
  - Skip fan-out to dormant inboxes (not synced for 14 days). A woken inbox asks for a refresh.
  - Raise the publish max-wait to 15 minutes.
  - Use a daily digest for activity.
  - Extend session tokens to 7 days (cuts App Attest writes about 85%).
  - A per-sender single-copy card (sender key) trades writes for per-sync reads.

**Push relay add-on:**

| Path             | Cost                                                                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Direct APNs      | $0                                                                                                                              |
| Expo Push        | $0 (600/s limit; peak need ≪ 1/s average at 200k MAU)                                                                           |
| Containers relay | about $2/month: memory 0.25 GiB × 2.592M s = 648k GiB-s − 90k included = 558k × $0.0000025 = $1.40; disk ~$0.31; CPU negligible |
| SNS              | about $0.48/month at 1.95M sends (1M free)                                                                                      |

**Options A and B: developer cost ≈ $0.**

- **A.** Requests ≈ 12 CloudKit requests per adopter per day → 50k × 12 / 86,400 ≈ **6.9 req/s average, ~25–35 req/s at peaks**. The historical allowance was ~10 req/s per 100k users (~20 req/s at 200k). That risks `requestRateLimited` throttling and possible overage. Storage is trivial.
- **B.** Storage lands on owners' iCloud quotas (KBs). There is no developer quota, but Apple's per-user throttles are unpublished.

---

## 8. Multi-device identity

| Approach                                                        | E2EE                                             | Needs Supporter?                                  | NSE access                      | Failure modes                                                                                       | Verdict                 |
| --------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------- |
| **iCloud Keychain synchronizable `rootSeed`** + roster on relay | Yes (Keychain is E2EE under standard protection) | No                                                | Yes (App Group as access group) | iCloud Keychain off → device-local identity; sync latency; first-enable race on two devices         | **Recommended**         |
| iCloud Drive payload / file (old plan)                          | **No** (Apple holds keys unless ADP)             | Payload yes (the account-file style is not gated) | Needs an App Group mirror       | Leaks pair keys to Apple for non-ADP users                                                          | Reject for keys         |
| Per-device keys + device list                                   | Yes                                              | No                                                | Yes                             | Senders fan out per device; device-list authentication (Signal-style) needs a user-level key anyway | Overkill for ≤5 buddies |

**Details:**

- **Create-if-absent:** read the synchronizable item first. If it's absent, write a new seed, then re-read after about 3 s.
- **Two-device race:** if two seeds exist, the lexicographically smaller `inboxId` wins. The loser migrates by re-publishing its roster into the winner's inbox (rare).
- **New device:** seed from Keychain → derive `inboxId`/`ownerSecret` → `/sync` returns the encrypted roster → full state. **No iCloud Drive and no Supporter status needed.**
- **Fallback when iCloud Keychain is off:** "Link a device" QR from an existing device, transferring the seed over an ephemeral X25519 channel through the relay (Phase 6).

**Should Buddies depend on iCloud Sync (Supporter-gated)?** Technically **no**. Trade-offs for the product owner (pricing not decided here):

- Relay cost is small, so cost is no reason to gate.
- Server-side gating would link sessions to the RevenueCat account ID, a privacy cost. If gating is wanted, gate client-side.
- Caveat: a multi-device user **without** iCloud Sync has divergent Plans per device. Rule: publish only on local edits (last edit wins). The card carries a publishing-device tag for diagnostics.
- Buddies data is **excluded** from `src/app/sync/payload.ts` (add a regression test, as the calendar plan does).

---

## 9. Repo integration plan

### 9.1 Client (three tiers)

**Feature tier**

`src/features/buddies/` contains:

- `screens/`:
  - `BuddiesScreen` (list, invite, per-buddy sharing toggles, mute, end)
  - `BuddyDetailScreen`
  - `AcceptBuddyInviteScreen`
  - `FollowUpInviteScreen` (route params `{ visitId }`)
- `components/`: `BuddyRow`, `InviteBuddySheet` (no Cancel button, per CLAUDE.md), `SafetyCode`, `BuddyInviteListener`, `BuddyPlansLegend`
- `hooks/`: `useBuddies`, `useBuddyCards`, `useBuddyInvitations`
- `stores/buddies.ts`: MMKV, excluded from the iCloud Sync payload
- `lib/` (pure, unit-tested):
  - `card.ts`: build a card from Day Plans and Recurring Plans using `src/lib/recurrence.ts`; window; compaction; hash
  - `events.ts`, `inviteLink.ts`, `protocol.ts` (zod), `hlc.ts`

**Shared tier**

- `src/lib/appAttest/`: the generic v2 client lifted from `features/notes-import/lib/notesImportAppAttest*.ts`. Notes Import keeps a thin adapter. **Prerequisite refactor.**
- `src/lib/crypto/`: a TypeScript wrapper over the native module (seal/open envelope, HKDF, X25519).
- `src/lib/wwProxy/`: base URL and dev-bypass handling, shared by both features.

**App tier**

- `src/app/buddies/`:
  - `installBuddiesSync.ts`: AppState foreground sync, outbox flush on background, push-token registration via `expo-notifications` `getDevicePushTokenAsync()`, notification-tap routing
  - `nseSnapshot.ts`: writes the App Group snapshot
- It is mounted in `src/app/App.tsx` like iCloud and widget sync.
- `src/app/deep-links/DeepLinkListeners.tsx` mounts `BuddyInviteListener`.

**Composition** (no boundary violations)

- `features/plans` (app-classified) renders faded buddy Plans. It passes `buddyPlans` props into shared `components/CalendarDay` and `CalendarHeader`, so shared components never import the feature.
- `features/visits` (feature tier) adds "Invite a buddy" by **navigating** to a `RootStack` route (`types/rootStack.ts`) instead of importing `features/buddies`.
- `features/settings` (app-classified) adds a Buddies entry.
- Home and Progress may show a buddy activity card later, from `features/buddies/components`.

**Calendar sync (#265)**

- The engine moves to `src/app/calendar-sync/`. The plan's `src/lib/calendarSync` + `useCalendarSyncEngine` become app-level infrastructure mounted in `App.tsx`.
- The screen becomes `src/features/settings/screens/CalendarSyncScreen.tsx`.
- Pin `expo-calendar` to an exact patch version.
- Later, an optional local "WitnessWork Buddies" calendar can be written from decrypted cards. It is off by default.

**i18n:** new strings go in `src/locales/en-US.json` only. A script generates the NSE `.strings`/`.xcstrings` from the approved locale JSONs.

### 9.2 Native

- **`modules/ww-crypto`** (new Expo module, Swift CryptoKit):
  - X25519, Ed25519, HKDF-SHA256, ChaChaPoly, SHA-256, random
  - `getOrCreateSyncSeed(accessGroup)` using **synchronizable** Keychain, deliberately separate from `keychain-uuid`'s this-device-only invariant
  - `writeAppGroupFile`
  - Shared Swift (`BuddyEnvelope.swift`, `BuddyKeys.swift`) is copied into the NSE by extending `scripts/sync-widget-shared.mjs`.
- **NSE:** `targets/notification-service/` (`expo-target.config.js` type `notification-service`, deployment 16.4 or 17.0, App Group entitlement auto-mirrored). `NotificationService.swift` + the shared crypto + generated strings. No iCloud or CloudKit entitlement.
- **Entitlements and config:**
  - `aps-environment` via an explicit `['expo-notifications', { mode: IS_DEV ? 'development' : 'production' }]`
  - App Group already exists
  - Associated Domains already exists (server adds `/b`)
  - **No** `remote-notification` background mode
  - **No** filtering entitlement
  - **No** CloudKit
  - EAS credentials: enable Push on the prod and dev App IDs (verify; may already be on)

### 9.3 Backend (ww-proxy)

- **New module `src/buddies/`:**
  - `route.ts` (Hono handlers)
  - `inboxDO.ts` (`BuddyInbox` class, SQLite, RPC: `deliver`, `sync`, `putRoster`, `slots`, `devices`, `invites`, `alarm`)
  - `session.ts` (HMAC tokens)
  - `apns.ts` (ES256 JWT via WebCrypto, KV-shared; `fetch` to the sandbox or production host chosen by `device.env`)
  - `contracts.ts` (zod v4, matching the repo)
  - `config.ts`
  - Pure-logic splits like `cap.ts` for tests that can't import `cloudflare:workers`
- **`src/index.ts`:**
  - export `BuddyInbox`
  - routes `/buddies/v1/*`
  - Buddies rate limiter keyed by session device tag (unauthenticated routes keyed by IP)
  - `GET /b` fallback page
- **`src/contactLink.ts`:** AASA `components` gains `{ "/": "/b", "comment": "buddy invites (secret in #fragment)" }`. Ship it **one app version before** the UI, because of AASA caching.
- **`src/appAttest/protocol.ts`:** add purpose `buddies-session`; reuse the `AppAttestIdentity` DO.
- **`wrangler.toml`:**
  - `[[durable_objects.bindings]] name="BUDDY_INBOX" class_name="BuddyInbox"`
  - `[[migrations]] tag="v3" new_sqlite_classes=["BuddyInbox"]`
  - `[[ratelimits]] BUDDIES_RATE_LIMITER`
  - **all repeated under `[env.dev]`**
  - vars: `APNS_TOPIC` = bundle ID per env
  - secrets per env: `APNS_KEY_P8`, `APNS_KEY_ID`, `BUDDIES_SESSION_SECRET`
  - KV keys in the existing `NOTES_KV` namespace: `buddies:enabled` (kill switch), `buddies:min-version`, `buddies:apns-jwt`
- **Privacy hygiene:** IDs and caps only in POST bodies; never `console.log` them; Sentry scrubbing for `/buddies/*` bodies.
- **Tests (vitest):** capability checks, dedup, TTL prune, invite single-use, session HMAC, APNs payload ≤4096 B, JWT bucket sharing.

---

## 10. Future-proofing for territory collaboration (≤10 multi-writer, #434)

**What changes**

- A new `GroupMailbox` DO per group. It holds an append-only log of encrypted operations (Contact/Visit/territory-marker upserts and tombstones) plus client-produced encrypted checkpoints for compaction. Members pull `since seq`, the same way as the inbox.
- **Group key:** start with an epoch key wrapped to each member's identity key (X25519 + HKDF + ChaChaPoly; HPKE once iOS 17 is the minimum). **Rotate on removal.** Ed25519-sign each op for authorship. Move to **MLS (RFC 9420)** only if forward secrecy / post-compromise security becomes a requirement; it needs a native library.
- **Merge:** per-field last-writer-wins with HLC timestamps plus tombstones fits the existing per-record LWW (`src/app/sync/merge.ts`). If richer CRDTs are needed, **Yjs is pure JS**. Automerge and Loro need WebAssembly, and **Hermes still has no WASM support** ([facebook/hermes#429](https://github.com/facebook/hermes/issues/429), open since 2020-12). They would need a native binding.
- Push fan-out ≤10 per op, digest-coalesced. Cost stays in the same order of magnitude.

**Design now**

1. Envelope `ver`/`suite` bytes.
2. A relay "mailbox" abstraction (seq log + capability slots + devices) that the inbox and the future group both instantiate.
3. Ed25519 identity keys generated from day one.
4. Client `relationship.kind: 'buddy' | 'group'`.
5. HLC timestamps and stable record IDs in shared payloads.
6. Capability-based ACLs (member caps generalize slots).
7. Shared data minimization. A Contact shared into a territory carries only what the group needs. The origin matters: #434 came from a Hmong-language field in Vietnam, and metadata minimization matters where ministry is restricted.

---

## 11. Phased rollout

| Phase                                                                              | Scope                                                                                                                                                                                                                                                                                                                     | Main risks / mitigations                                                                                                                                                                            |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **0: Spikes** (days)                                                               | (a) APNs via `fetch` from `ww-proxy-dev` to the sandbox, including JWT reuse across isolates. (b) NSE via `@bacons/apple-targets` decrypting an inline ChaChaPoly payload with the App Group Keychain seed while locked. (c) Universal link `/b#fragment` reaches JS intact on cold start through `ExpoAppSceneDelegate`. | (a) fails → Expo Push fallback. (b) Keychain access-group or accessibility pitfalls. (c) fragment loss → move the secret into the path and accept server-log exposure (mitigate by stripping logs). |
| **1: Device calendar sync (#265)** + lift App Attest client to `src/lib/appAttest` | Local EventKit only; zero server                                                                                                                                                                                                                                                                                          | Scope already planned; remap paths; permission UX.                                                                                                                                                  |
| **2: Buddies core (smallest valuable slice, #288)**                                | Seed, invite link, relay inbox (session, publish, sync), cards, **faded buddy Plans in the Schedule month calendar**, end buddy, per-buddy grants. No push.                                                                                                                                                               | Keychain race or edge cases; AASA caching (ship `/b` a version ahead); abuse (caps + rate limits); low adoption.                                                                                    |
| **3: Push + Follow-up invitations**                                                | Device registration, NSE, alerts for invite accepted and Follow-up invitations and replies, collapse and expiration, mute                                                                                                                                                                                                 | Prod `aps-environment` / App ID capability; NSE localization pipeline; notification fatigue (passive defaults).                                                                                     |
| **4: Buddy activity**                                                              | Opt-in progress block in cards, Milestone / Achievement Tier / goal events, activity feed, daily digest knob                                                                                                                                                                                                              | "Not social media" tone; no comparisons or leaderboards by default.                                                                                                                                 |
| **5: Awards** (Apple Fitness-style)                                                | Locally computed badges shared as events                                                                                                                                                                                                                                                                                  | Scope creep; keep them derived, never server-computed.                                                                                                                                              |
| **6: Hardening**                                                                   | Device linking without iCloud Keychain, safety codes, key rotation, delete-my-data, kill switch + min-version, Sentry scrubbing, dashboards                                                                                                                                                                               | Operational burden (keep to DO + KV + existing Sentry).                                                                                                                                             |
| **7: Territory groups (#434)**                                                     | `GroupMailbox`, group epoch keys, LWW/HLC ops                                                                                                                                                                                                                                                                             | Conflict UX; key rotation; data-protection expectations.                                                                                                                                            |

---

## 12. Security and privacy notes

| Threat                            | Mitigation                                                                                                                                                                                                                    |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Operator or Cloudflare reads data | Everything is ciphertext; keys are only on devices and in E2EE iCloud Keychain.                                                                                                                                               |
| Operator builds the social graph  | Opaque random inbox and slot IDs; no names or Apple IDs; the session carries no install or account ID; IDs stay out of URLs and logs. A malicious operator could still log edges live. That residual risk is stated honestly. |
| Spam / unsolicited contact        | No discovery; the invite link is single-use; writes need per-buddy caps; per-slot quotas; ending a buddy revokes the cap.                                                                                                     |
| Stolen invite link                | Single-use, 7-day TTL, revocable, inviter sees who accepted, optional safety code.                                                                                                                                            |
| Lost device                       | Session tokens expire in 24 h. The seed is protected by the Apple ID (2FA). Rotate the identity via "Reset Buddies".                                                                                                          |
| Apple reads iCloud data           | The seed is in iCloud Keychain (E2EE). No keys in iCloud Drive.                                                                                                                                                               |
| Push metadata                     | APNs sees a generic placeholder, ciphertext, device token and timing. Passive level for activity.                                                                                                                             |

---

## 13. Unverified claims and open questions

1. **Workers → APNs over HTTP/2 in production.** Supported by workerd issues #4841 and #5266 and by three open-source or blog implementations (2025–2026). **Not in Cloudflare's docs.** Phase 0 spike required. Local `wrangler dev` cannot do it.
2. **APNs provider-token reuse across isolates** (the `TooManyProviderTokenUpdates` risk) depends on how Cloudflare pools connections. The KV-shared JWT mitigation is untested.
3. **CloudKit public-DB quotas and overage** come from a Sep 2020 forum post quoting Apple's old terms. Apple publishes only "up to 1PB". Real quotas are visible only in the CloudKit Console.
4. The **AWS SNS rate** ($0.50/M after 1M free) comes from secondary sources. The AWS page didn't render rates.
5. The **Rate Limiting binding** is assumed free (no price on its doc page).
6. **Usage assumptions** (25% adoption, 6 syncs/device/day, and so on) are guesses. Validate with PostHog before Phase 2.
7. **Production `aps-environment` and Push capability on the prod App ID** are not verified. Only the dev prebuild was inspected.
8. **The universal-link fragment is delivered to JS** via `NSUserActivity.webpageURL` through `ExpoAppSceneDelegate` on cold start. The AASA `#` matcher is documented; end-to-end delivery is not verified.
9. **NSE reading a synchronizable Keychain item via the App Group access group while locked** follows from the docs but is untested. The NSE memory ceiling (commonly cited ~24 MB) is not in Apple docs.
10. **The DO wall time per request** (50 ms) and **rows written per App Attest session** (~4) are estimates.
11. **The fraction of users with iCloud Keychain sync disabled** is unknown. This sizes the need for the device-linking fallback.

---

## 14. Sources (all accessed 2026-09-23)

**Cloudflare**

- [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) (updated 2026-08-28)
- [DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/) (updated 2026-08-25)
- [DO limits](https://developers.cloudflare.com/durable-objects/platform/limits/) (2026-06-01)
- [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) (2026-09-05)
- [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) (2026-04-21)
- [Rate limit binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/) (2026-04-23)
- [Containers pricing](https://developers.cloudflare.com/containers/pricing/) (2026-08-28)
- [SQLite storage billing changelog](https://community.cloudflare.com/t/durable-objects-workers-billing-for-sqlite-storage/867188)

**APNs from Workers**

- [workerd #4841](https://github.com/cloudflare/workerd/issues/4841) (2025-08-20)
- [workerd #5266](https://github.com/cloudflare/workerd/issues/5266) (2025-10-04)
- [paje](https://github.com/jonesphillip/paje) (2026-02)
- [Codakuma pushy](https://codakuma.com/pushy/) (2026-04-11)
- [cloudflare-apns2](https://github.com/FiveSheepCo/cloudflare-apns2) (2025-01)

**Apple, push**

- [Sending notification requests to APNs](https://developer.apple.com/documentation/usernotifications/sending-notification-requests-to-apns)
- [Token-based connection](https://developer.apple.com/documentation/usernotifications/establishing-a-token-based-connection-to-apns)
- [Generating a remote notification](https://developer.apple.com/documentation/usernotifications/generating-a-remote-notification)
- [Pushing background updates](https://developer.apple.com/documentation/usernotifications/pushing-background-updates-to-your-app)
- [Modifying content in newly delivered notifications](https://developer.apple.com/documentation/usernotifications/modifying-content-in-newly-delivered-notifications)
- [UNNotificationServiceExtension](https://developer.apple.com/documentation/usernotifications/unnotificationserviceextension)
- [Filtering entitlement](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.usernotifications.filtering)

**Apple, CloudKit**

- [CloudKit](https://developer.apple.com/icloud/cloudkit/)
- [publicCloudDatabase](https://developer.apple.com/documentation/cloudkit/ckcontainer/publicclouddatabase)
- [privateCloudDatabase](https://developer.apple.com/documentation/cloudkit/ckcontainer/privateclouddatabase)
- [sharedCloudDatabase](https://developer.apple.com/documentation/cloudkit/ckcontainer/sharedclouddatabase)
- [Shared records](https://developer.apple.com/documentation/cloudkit/shared-records)
- [CKShare.Participant](https://developer.apple.com/documentation/cloudkit/ckshare/participant)
- [CKUserIdentity](https://developer.apple.com/documentation/cloudkit/ckuseridentity)
- [publicPermission](https://developer.apple.com/documentation/cloudkit/ckshare/publicpermission)
- [encryptedValues](https://developer.apple.com/documentation/cloudkit/ckrecord/encryptedvalues)
- [CKDatabaseSubscription](https://developer.apple.com/documentation/cloudkit/ckdatabasesubscription)
- [CKQuerySubscription](https://developer.apple.com/documentation/cloudkit/ckquerysubscription)
- [Forum 660009](https://developer.apple.com/forums/thread/660009) (2020-09)
- [Forum 740916](https://developer.apple.com/forums/thread/740916) (2023-11)
- [M. Tsai](https://mjtsai.com/blog/2026/06/05/permissions-in-the-cloudkit-public-database/) (2026-06-05)

**Apple, security**

- [iCloud data security overview](https://support.apple.com/en-us/102651) (2026-01-05)
- [kSecAttrSynchronizable](https://developer.apple.com/documentation/security/ksecattrsynchronizable)
- [Sharing keychain items](https://developer.apple.com/documentation/security/sharing-access-to-keychain-items-among-a-collection-of-apps)
- [App Attest prep](https://developer.apple.com/documentation/devicecheck/preparing-to-use-the-app-attest-service)
- [Validating apps](https://developer.apple.com/documentation/devicecheck/validating-apps-that-connect-to-your-server)
- [AASA components](https://developer.apple.com/documentation/bundleresources/applinks/details-swift.dictionary/components-swift.dictionary)
- CryptoKit availability from Apple doc metadata: `hpke`, `mlkem768`, `xwingmlkem768x25519`, `curve25519/keyagreement`, `chachapoly`

**Expo, tooling**

- [Expo sending notifications](https://docs.expo.dev/push-notifications/sending-notifications/) (2026-08-31)
- [Expo push FAQ](https://docs.expo.dev/push-notifications/faq/)
- [expo-background-task](https://docs.expo.dev/versions/latest/sdk/background-task/)
- [expo-apple-targets](https://github.com/EvanBacon/expo-apple-targets)
- [Hermes #429](https://github.com/facebook/hermes/issues/429)

**Other**

- [AWS SNS pricing](https://aws.amazon.com/sns/pricing/) (rates via secondary sources)
- RFC 9420, MLS (reference only; not fetched)

**Repo evidence (read-only):**

- witness-work: `docs/friend-sharing-plan.md`, `docs/calendar-sync-plan.md`, `docs/icloud-sync.md`, `docs/adr/0002`, `docs/adr/0007`, `docs/adr/0011`, `docs/architecture-features.md`, `app.config.ts`, `plugins/with-icloud-container.js`, `modules/*`, `targets/widgets/expo-target.config.js`, `src/types/timeEntry.ts`, `src/types/visit.ts`, `src/lib/account.ts`, `src/lib/accountFile.ts`, `src/app/widgets/widgetSync.ts`, `node_modules/expo/ios/AppDelegates/ExpoAppSceneDelegate.swift`, `node_modules/expo-notifications/plugin/build/withNotificationsIOS.js`, `ios/WitnessWorkDev/WitnessWorkDev.entitlements`
- ww-api (`/tmp/ww-api`): `wrangler.toml`, `AGENTS.md`, `src/index.ts`, `src/types.ts`, `src/crypto.ts`, `src/contactLink.ts`, `src/notesImport/{route,indexDO,runDO,cap}.ts`, `src/appAttest/{index,lifecycle}.ts`, `docs/notes-import-streaming-durable-objects.md`
