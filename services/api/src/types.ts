import type { Context } from 'hono';

export interface Environment {
  HERE_API_KEY: string;
  SENTRY_DSN: string;
  /**
   * Release name (git commit sha) injected at deploy time via
   * `--var SENTRY_RELEASE:$(sentry-cli releases propose-version)` so Sentry
   * can match events to uploaded source maps. Absent under `wrangler dev`
   * and legacy deploys that skip the flag.
   */
  SENTRY_RELEASE?: string;
  /**
   * Worker Version Metadata binding. Cloudflare populates this at runtime with
   * the deployed version's `id`/`tag`/`timestamp`, so `/health` can report the
   * actual deployed build instead of a stale plaintext var. Configured under
   * `[version_metadata]` in wrangler.toml (repeated for `[env.beta]` and
   * `[env.dev]`).
   */
  CF_VERSION_METADATA: WorkerVersionMetadata;
  /**
   * Apple Developer Team ID. Injected into the AASA response so iOS can
   * verify that the declared bundle IDs belong to this team. Also the App ID
   * prefix used to derive the App Attest relying-party id (`<team>.<bundle>`).
   */
  APPLE_TEAM_ID: string;
  /**
   * The web app's origin (`https://app.witnesswork.app`, Beta
   * `https://beta.app.witnesswork.app`, a local development worker
   * `http://localhost:8081`), for the contact and Buddies invite pages'
   * "Continue on the web". Unset = no such link.
   */
  WEB_APP_ORIGIN?: string;
  RATE_LIMITER: RateLimit;

  /**
   * PostHog project token (`phc_…`, write-only ingestion key, not secret) for
   * anonymous server-side usage events (`src/analytics.ts`). Unset = off.
   */
  POSTHOG_PROJECT_TOKEN?: string;

  /** PostHog ingestion host. Default `https://us.i.posthog.com`. */
  POSTHOG_HOST?: string;

  // --- Notes Import ------------------------------------------------------

  /**
   * KV namespace backing Notes Import. Stores ONLY non-content metadata:
   * legacy App Attest identity/challenge compatibility records and short-lived
   * SSE subscribe tokens. New App Attest lifecycle state is authoritative in
   * `APP_ATTEST_IDENTITY`.
   * Never notes text or model output (ADR 0008). The per-identity credit meter
   * moved OUT of KV into the `NotesImportIndex` DO (atomic, strongly consistent).
   * Also holds the public App Store ratings sweep (`app-store-ratings:*`).
   */
  NOTES_KV: KVNamespace;

  /**
   * Per-install App Attest identity lifecycle. SQLite is authoritative for the
   * active key, recovery verifier, challenges, operation replay, and counters.
   */
  APP_ATTEST_IDENTITY: DurableObjectNamespace<
    import('./appAttest/identityDO').AppAttestIdentity
  >;

  /**
   * Per-import Durable Object: runs the streaming model call in the background
   * and streams progress to the client over SSE (one instance per importId).
   */
  NOTES_IMPORT_RUN: DurableObjectNamespace<
    import('./notesImport/runDO').NotesImportRun
  >;

  /**
   * Per-user Durable Object (one instance per install uuid): enforces the
   * N-concurrent-imports cap, backs the app's active-imports list, and owns the
   * atomic free-credit meter (moved here from KV so check-then-charge can't race).
   */
  NOTES_IMPORT_INDEX: DurableObjectNamespace<
    import('./notesImport/indexDO').NotesImportIndex
  >;

  /**
   * Android's Play Integrity challenges (witness-work ADR 0017), one SQLite
   * instance per install uuid. Single-use and short-lived; no tokens/verdicts.
   */
  PLAY_INTEGRITY_CHALLENGES: DurableObjectNamespace<
    import('./playIntegrity/challengeDO').PlayIntegrityChallenges
  >;

  /** OpenRouter API key (secret). Routed ZDR-only to the inference host. */
  OPENROUTER_API_KEY: string;

  /** RevenueCat REST v1 secret key (`sk_...`) for server-side supporter checks (secret). */
  REVENUECAT_API_KEY: string;

  /**
   * The RevenueCat webhook's Authorization secret (witness-work ADR 0029).
   * Secret, distinct per prod/Beta worker; the integration sends
   * `Bearer <this>`. Unset, `POST /revenuecat/v1/webhook` answers `disabled`.
   */
  REVENUECAT_WEBHOOK_AUTHORIZATION?: string;

  /**
   * Development workers only: RevenueCat's REST origin for account Supporter
   * status, so the verify loop can point at a local fake. Production ignores
   * it.
   */
  REVENUECAT_API_URL?: string;

  /**
   * Development workers only: `"true"` counts RevenueCat Billing (web)
   * sandbox subscriptions toward Supporter status (witness-work ADR 0014).
   * Unset, or on production, they're ignored.
   */
  REVENUECAT_COUNT_WEB_SANDBOX?: string;

  /** Explicit Worker environment; production fails closed if a dev bypass exists. */
  APP_ATTEST_ENVIRONMENT: 'development' | 'production';

  /**
   * Primary iOS bundle id, e.g. `com.leviwilkerson.jwtime`. Part of the App
   * Attest app id; keys stored without a bound bundle id verify against it.
   */
  IOS_BUNDLE_ID: string;

  /**
   * Optional comma-separated extra bundle ids whose App Attest keys are also
   * accepted (prod: the internal TestFlight beta `com.leviwilkerson.jwtimebeta`).
   * Each key is bound to the bundle id it attested with; its assertions verify
   * only against that id.
   */
  IOS_ADDITIONAL_BUNDLE_IDS?: string;

  // --- Android / Play Integrity (ADR 0017) -------------------------------
  // Android Notes Import stays unavailable until the first three are all set.

  /** Android application id whose tokens are accepted, e.g. `com.leviwilkerson.jwtime`. */
  ANDROID_PACKAGE_NAME?: string;

  /**
   * Google Cloud project number linked to the app in Play Console. Not
   * secret: advertised on GET /notes-import/status so the app can prepare
   * standard integrity requests.
   */
  PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER?: string;

  /** Service-account JSON key in the linked Cloud project (secret). */
  PLAY_INTEGRITY_SERVICE_ACCOUNT_JSON?: string;

  /**
   * Optional comma-separated base64url SHA-256 digests of the Play app-signing
   * certificate. When set, the token's certificate must match one of them.
   */
  ANDROID_CERT_SHA256_DIGESTS?: string;

  /**
   * `MEETS_DEVICE_INTEGRITY` (default), `MEETS_BASIC_INTEGRITY`, or
   * `MEETS_STRONG_INTEGRITY`. Basic and strong labels must be opted into in
   * Play Console before Play returns them.
   */
  PLAY_INTEGRITY_REQUIRED_DEVICE_VERDICT?: string;

  /** @deprecated Ignored; Supporter status follows witness-work ADR 0014. */
  REVENUECAT_ENTITLEMENT_ID?: string;

  /** Override the model slug. Default `openai/gpt-6-luna`. */
  NOTES_IMPORT_MODEL?: string;

  /**
   * Comma-separated OpenRouter provider allowlist, in routing-priority order
   * (drives both `only` and `order`). Pins inference to vetted **Western** ZDR
   * hosts (ADR 0008) — keep it Western-only; `zdr: true` enforces retention
   * separately. Default `azure` (the only OpenRouter host for GPT-6 Luna). Previously `fireworks,digitalocean` (Fireworks preferred for
   * genuine reasoning, DigitalOcean the large 429 fallback; DeepInfra excluded —
   * mislabels reasoning).
   */
  NOTES_IMPORT_PROVIDERS?: string;

  /** Hard reject notes longer than this many characters. Default 100000. */
  NOTES_IMPORT_MAX_CHARS?: string;

  /** `maxOutputTokens` ceiling for the model call. Default 16000. */
  NOTES_IMPORT_MAX_OUTPUT_TOKENS?: string;

  /** Free-tier imports per fixed window. -1 unlimited, 0 none, default 5. */
  NOTES_IMPORT_FREE_CREDITS?: string;

  /** Supporter imports per fixed window. -1 unlimited, 0 none, default -1. */
  NOTES_IMPORT_FREE_CREDITS_SUPPORTER?: string;

  /** Free-tier lifetime refinements per content hash. Default 5. */
  NOTES_IMPORT_MAX_REFINEMENTS?: string;

  /** Supporter lifetime refinements per content hash. Default -1. */
  NOTES_IMPORT_MAX_REFINEMENTS_SUPPORTER?: string;

  /** Fixed import-window duration in days; positive fractions allowed. Default 30. */
  NOTES_IMPORT_WINDOW_DAYS?: string;

  /**
   * Minimum app version (`major.minor.patch`) allowed to use Notes Import;
   * surfaced as `minAppVersion` on GET /notes-import/status. KV
   * `notes-import:min-version` overrides. Unset = no floor.
   */
  NOTES_IMPORT_MIN_APP_VERSION?: string;

  /** Rolling window (seconds) for counting free Empty Imports. Default 604800 (7d). */
  NOTES_IMPORT_EMPTY_WINDOW_SECONDS?: string;

  /** Free Empty Imports per window before they charge a credit again. Default 5. */
  NOTES_IMPORT_EMPTY_WINDOW_LIMIT?: string;

  /** Max concurrent in-flight imports per identity (non-Supporter). Default 2. */
  NOTES_IMPORT_ACTIVE_CAP?: string;

  /** Max concurrent in-flight imports per identity (Supporter). Default 5. */
  NOTES_IMPORT_ACTIVE_CAP_SUPPORTER?: string;

  /** Seconds a finished import's result is retained for reconnect. Default 3600. */
  NOTES_IMPORT_RESULT_RETENTION_SECONDS?: string;

  /** TTL of a subscribe capability token. Default 3600. */
  NOTES_IMPORT_SUBSCRIBE_TOKEN_TTL_SECONDS?: string;

  /**
   * OpenRouter reasoning effort. For `deepseek-v4-flash` only `high` and `xhigh`
   * are valid; `xhigh` is the model's max ("Think Max"). DEFAULT `xhigh`. `max`
   * is accepted here but coerced to `xhigh` (raw `max` is invalid on OpenRouter
   * and silently degrades). `off`/`none`/empty disables. The model co-emits
   * reasoning + strict structured output; a buggy ZDR host's parser may misroute
   * the JSON into the reasoning channel, which the run DO recovers.
   */
  NOTES_IMPORT_REASONING_EFFORT?: string;

  /**
   * Vision model slug for Import from Paper page transcription. Must accept
   * image input on the ZDR provider allowlist. Default: NOTES_IMPORT_MODEL.
   */
  NOTES_IMPORT_TRANSCRIBE_MODEL?: string;

  /** Largest accepted page image in decoded bytes. Default 4194304 (4 MiB). */
  NOTES_IMPORT_TRANSCRIBE_MAX_BYTES?: string;

  /** `maxOutputTokens` for one page transcription. Default 8000. */
  NOTES_IMPORT_TRANSCRIBE_MAX_OUTPUT_TOKENS?: string;

  /** Pages per identity per rolling day (non-Supporter). Default 40. */
  NOTES_IMPORT_TRANSCRIBE_PAGES_PER_DAY?: string;

  /** Pages per identity per rolling day (Supporter). Default 200. */
  NOTES_IMPORT_TRANSCRIBE_PAGES_PER_DAY_SUPPORTER?: string;

  /**
   * When set, a request carrying header `x-ww-dev-bypass: <this value>` skips
   * App Attest verification. Set ONLY on a local development worker
   * (`.dev.vars`) so the iOS simulator (no Secure Enclave) can exercise the
   * flow. Never set on Beta or production.
   */
  NOTES_IMPORT_DEV_BYPASS_TOKEN?: string;

  /** Dedicated admin reset credential. Secret; distinct per prod/Beta worker. */
  ADMIN_API_TOKEN?: string;

  // --- Scribe AI (witness-work docs/scribe-ai-protocol.md) ----------------

  /**
   * One SQLite DO per account (`idFromName(accountId)`): Scribe AI's usage
   * windows, step keys, open turns, active steps, charges (31 days), and paper
   * pages (24 hours). No conversation content.
   */
  SCRIBE_METER: DurableObjectNamespace<import('./scribe/meterDO').ScribeMeter>;

  /** Step model slug when KV `scribe:model` has none. Default `openai/gpt-6-luna`. */
  SCRIBE_MODEL?: string;
  /** Comma-separated Western ZDR host allowlist, in priority order. Default `azure`. */
  SCRIBE_PROVIDERS?: string;
  /** `minimal`…`max`, or `off`. Default `low`. */
  SCRIBE_REASONING_EFFORT?: string;
  /** A step's output ceiling, reasoning included. Default 4096. */
  SCRIBE_MAX_OUTPUT_TOKENS?: string;
  /** Used when no allowlisted host for the model serves tool calls. Unset = none. */
  SCRIBE_FALLBACK_MODEL?: string;
  /** The fallback's hosts. Default: `SCRIBE_PROVIDERS`. */
  SCRIBE_FALLBACK_PROVIDERS?: string;
  /** Paper pages' vision model. Default: the step model. */
  SCRIBE_TRANSCRIBE_MODEL?: string;
  /** Advisory `minAppVersion` on GET /scribe/v1/status when KV `scribe:min-version` is absent. */
  SCRIBE_MIN_APP_VERSION?: string;
  /**
   * Every field of the `scribe:limits` document also reads
   * `SCRIBE_<SNAKE_CASE_PATH>` when KV has no valid value for it
   * (`SCRIBE_FREE_MONTHLY`, `SCRIBE_SUPPORTER_SESSION`,
   * `SCRIBE_WINDOW_LENGTHS_SESSION_HOURS`, `SCRIBE_MAX_INPUT_TOKENS`, …;
   * `limitEnvName` in src/scribe/config.ts).
   */
  SCRIBE_FREE_MONTHLY?: string;
  SCRIBE_SUPPORTER_SESSION?: string;
  SCRIBE_SUPPORTER_WEEKLY?: string;

  // --- Accounts ------------------------------------------------------------

  /**
   * The accounts database (src/accounts/schema.ts, witness-work ADR 0024):
   * anonymous accounts, their status, and which Buddies inboxes they own.
   * Without it, accounts are off: `account/register` answers `disabled` and
   * `inbox/register` ignores account proofs.
   */
  ACCOUNTS_DB?: D1Database;

  /**
   * One SQLite DO per handoff `channelId` (Set Up Another Device, witness-work
   * ADR 0026): the opening account, the claim verifier, a temporary public
   * key, and two sealed blobs, for at most ten minutes.
   */
  ACCOUNT_HANDOFF: DurableObjectNamespace<
    import('./accounts/handoffDO').AccountHandoff
  >;

  /**
   * End-to-end encrypted backups, one object per device slot at
   * `v1/<accountId>/<slotId>` (ciphertext only). Without it, `backup/*`
   * answers `disabled`.
   */
  ACCOUNT_BACKUPS?: R2Bucket;

  /**
   * Cloud Sync's ciphertext (witness-work ADR 0030): one end-to-end
   * encrypted snapshot per device slot at `v1/<accountId>/<slotId>`. Without
   * it, `sync/*` answers `disabled`.
   */
  ACCOUNT_SYNC?: R2Bucket;

  /**
   * Cloud Sync's photos (witness-work ADR 0040 §6): one end-to-end encrypted
   * blob per put at `v1/<accountId>/<name>/<putId>`, written once. No age
   * rule. Without it, `sync/photos/*` answers `photos_disabled`.
   */
  ACCOUNT_PHOTOS?: R2Bucket;

  /**
   * Cloud Sync photos' switch fallback when KV `sync:photos` is absent:
   * `"off"` (or `"false"`) turns photo puts off, anything else (or unset) on.
   */
  SYNC_PHOTOS?: string;

  /**
   * Record changes' switch fallback when KV `sync:changes` is absent
   * (witness-work ADR 0060): `"true"` (or `"on"`) on, anything else (or
   * unset) off.
   */
  SYNC_CHANGES?: string;

  /**
   * An account's photo storage limit in bytes, when a positive integer; else
   * 2,000,000,000. For tests and trying the full state on a local worker.
   */
  SYNC_PHOTO_LIMIT_BYTES?: string;

  /**
   * One SQLite DO per account (`idFromName(accountId)`): Cloud Sync's slot
   * metadata, change `seq`, put limits, retention alarm, and live sockets.
   */
  ACCOUNT_SYNC_INDEX: DurableObjectNamespace<
    import('./accounts/syncDO').AccountSync
  >;

  /**
   * Cloud Sync's kill-switch fallback when KV `sync:enabled` is absent:
   * `"true"` (or `"on"`) on, anything else off.
   */
  SYNC_ENABLED?: string;

  /**
   * Who gets Cloud Sync when KV `sync:entitlement` is absent: `"supporter"`
   * makes it a Supporter benefit, anything else (or unset) everyone
   * (witness-work ADR 0040).
   */
  SYNC_ENTITLEMENT?: string;

  /**
   * The web app's origins (witness-work ADR 0038 §10), comma-separated, each
   * matched exactly against `Origin`: CORS (src/cors.ts) and the browser's
   * live sockets (src/liveSubprotocol.ts) admit only these. Unset: no
   * browser access.
   */
  WEB_APP_ORIGINS?: string;

  /**
   * Signs session access tokens (HS256, witness-work ADR 0027). Secret, at
   * least 32 characters, distinct per prod/Beta worker. Without it, the
   * session routes (`/accounts/v1/sessions*`) answer `disabled` and bearer
   * tokens never pass.
   */
  ACCOUNT_TOKEN_SECRET?: string;

  /**
   * The secret `ACCOUNT_TOKEN_SECRET` replaced, while its tokens (15 minutes)
   * run out. Secret; optional. Verifies only, never signs.
   */
  ACCOUNT_TOKEN_SECRET_PREVIOUS?: string;

  /**
   * Passkeys (witness-work ADR 0038): the RP IDs this worker accepts,
   * comma-separated; the first is the default and the one Android origins
   * pair with. Without it (or `PASSKEY_ORIGINS`), the passkey routes answer
   * `disabled`.
   */
  PASSKEY_RP_IDS?: string;

  /**
   * Each RP ID's origins, as a JSON object (or TOML table) from RP ID to an
   * array of origins (web origins and `android:apk-key-hash:` ones). A
   * response's origin must pair with its RP ID here.
   */
  PASSKEY_ORIGINS?: string | Record<string, string[]>;

  /**
   * Signs passkey challenge tokens (`ww-challenge`). Secret, at least 32
   * characters, distinct per worker, never the access token's. Without it,
   * the passkey routes answer `disabled`.
   */
  PASSKEY_CHALLENGE_SECRET?: string;

  /**
   * Signs the tickets a browser opens a web session with (`ww-ticket`:
   * passkey, approval, recovery). Secret, at least 32 characters, distinct
   * per worker. Without it, ticket sessions and the passkey routes answer
   * `disabled`.
   */
  ACCOUNT_TICKET_SECRET?: string;

  /**
   * Web sign-up's kill-switch fallback when KV `accounts:web-signup` is
   * absent: `"off"` (or `"false"`) refuses both sign-up routes with 503
   * `disabled`; anything else (and unset) leaves them on.
   */
  WEB_SIGNUP?: string;

  /** Web sign-ups per caller IP (IPv6 by /64) a rolling day. Default 3. */
  WEB_SIGNUP_PER_IP_DAY?: string;

  /** Web sign-ups per network (ASN) a rolling hour. Default 30. */
  WEB_SIGNUP_PER_ASN_HOUR?: string;

  /** Web recoveries (`web/recovery`) per caller IP a rolling day. Default 10. */
  WEB_RECOVERY_PER_IP_DAY?: string;

  /**
   * Turnstile's site key for web sign-up and recovery, served by
   * `GET /app/v1/config` (`webSignup.turnstileSiteKey`). Not a secret.
   * Development workers fall back to Cloudflare's always-passing test key.
   */
  TURNSTILE_SITE_KEY?: string;

  /**
   * The hostnames Siteverify may answer for a token (comma-separated): the web
   * app's Turnstile frame (`verify.witnesswork.app`), where the widget runs.
   * Unset, web sign-up and recovery are off, unless a development worker
   * uses a test secret. Bare hostnames only; an origin or path is ignored.
   */
  TURNSTILE_HOSTNAMES?: string;

  /**
   * Turnstile's secret for Siteverify. Secret. Development workers fall back
   * to Cloudflare's always-passing test secret; production without it has
   * web sign-up and recovery off.
   */
  TURNSTILE_SECRET_KEY?: string;

  /**
   * Rolling-window counters for the accounts routes (passkey sign-in failures
   * per IP; web sign-up and recovery caps in one `web-caps` instance), one
   * SQLite DO per hashed name (`src/accounts/rateCounterDO.ts`).
   */
  ACCOUNT_RATE_COUNTER: DurableObjectNamespace<
    import('./accounts/rateCounterDO').AccountRateCounter
  >;

  /**
   * One SQLite Durable Object per approval channel (a browser approved from a
   * phone, docs/passkeys-protocol.md): the browser's verifiers, sealed hello,
   * and coarse location, the claiming phone session, the sealed key, and the
   * `approval` ticket, for 75 seconds unclaimed or 5 minutes claimed.
   */
  ACCOUNT_APPROVAL: DurableObjectNamespace<
    import('./accounts/approvalDO').AccountApproval
  >;

  /**
   * Signs browser live socket tickets (`POST /accounts/v1/live/ticket`,
   * src/accounts/liveTickets.ts). Secret, at least 32 characters, distinct
   * per prod/Beta worker and from `ACCOUNT_TOKEN_SECRET`. Without it, the
   * ticket route and browser live sockets answer `disabled`; native sockets
   * are unaffected.
   */
  LIVE_TICKET_SECRET?: string;

  /**
   * Legacy-auth fallback when KV `auth:legacy` is absent: `"off"` refuses the
   * pre-session ways of authenticating with 426 `upgrade_required`; anything
   * else (and unset) accepts them. A failed KV read counts as off.
   */
  AUTH_LEGACY?: string;

  /**
   * Minimum app version (`major.minor.patch`) for the whole app, served by
   * GET /app/v1/config. KV `app:min-version` overrides. Unset = no floor.
   */
  APP_MIN_VERSION?: string;

  // --- Buddies relay -------------------------------------------------------

  /**
   * One SQLite DO per `inboxId`: owner key, slots, cards, events, devices,
   * roster, nonce cache, per-inbox `seq`, and open-invite bookkeeping.
   */
  BUDDY_INBOX: DurableObjectNamespace<import('./buddies/inboxDO').BuddyInbox>;

  /** One SQLite DO per `inviteId`, deleted once the invite ends or expires. */
  BUDDY_INVITE: DurableObjectNamespace<import('./buddies/inviteDO').BuddyInvite>;

  /**
   * Per-caller (client IP, IPv6 by /64) limiters, one per op tier; sizes in
   * `BUDDIES_ABUSE_LIMITS.edge` (src/buddies/limits.ts). This one covers the
   * unsigned `invite/fetch` and `invite/claim`.
   */
  BUDDIES_RATE_LIMITER: RateLimit;
  /** Per-caller limiter for `inbox/register`. */
  BUDDIES_REGISTER_LIMITER: RateLimit;
  /** Per-caller limiter for `inbox/sync` and the `inbox/live` upgrade. */
  BUDDIES_READ_LIMITER: RateLimit;
  /** Per-caller limiter for every other signed op. */
  BUDDIES_WRITE_LIMITER: RateLimit;
  /** Per-caller limiter for `blob/put` (photo uploads). */
  BUDDIES_BLOB_PUT_LIMITER: RateLimit;
  /** Per-caller limiter for `blob/get` (photo downloads). */
  BUDDIES_BLOB_GET_LIMITER: RateLimit;

  /**
   * Encrypted Buddies note photos, one object per blob at
   * `v1/<inboxId>/<blobId>` (sealed bytes only; keys never reach the relay).
   * Bookkeeping (size, read-token hash, expiry) lives in the sender's inbox
   * DO. Without the binding, photo ops answer `photos_disabled`.
   */
  BUDDY_BLOBS?: R2Bucket;

  /**
   * Photos switch fallback (`"on"` enables) when KV `buddies:photos` is
   * absent. `"on"` in Beta and dev; unset (off) in prod.
   */
  BUDDIES_PHOTOS?: string;

  /**
   * One SQLite DO per caller (hashed client IP, IPv6 by /64): its signed
   * `inbox/register` calls per hour over the last day.
   */
  BUDDY_REGISTRATION_QUOTA: DurableObjectNamespace<
    import('./buddies/registrationQuota').BuddyRegistrationQuota
  >;

  /** Kill-switch fallback (`"true"` enables) when KV `buddies:enabled` is absent. */
  BUDDIES_ENABLED?: string;

  // --- Shared Spaces (witness-work ADR 0037) -------------------------------

  /**
   * One SQLite DO per space (`idFromName(spaceId)`): sealed records, members
   * by token hash, wraps, invites, the change `seq`, put limits, the
   * retention alarm, and live sockets. Never an account.
   */
  SHARED_SPACE: DurableObjectNamespace<
    import('./spaces/spaceDO').SharedSpace
  >;

  /**
   * Shared Spaces' kill-switch fallback (`"true"` enables) when KV
   * `spaces:enabled` is absent. `"true"` in Beta and dev, `"false"` in prod.
   */
  SPACES_ENABLED?: string;

  /**
   * The guest ops' kill-switch fallback (`"true"` enables) when KV
   * `spaces:guests` is absent (witness-work ADR 0047). `"true"` in Beta and
   * dev, `"false"` in prod.
   */
  SPACES_GUESTS?: string;

  /**
   * Per-network limiter for the public guest ops (`guest/sync`,
   * `guest/put`), keyed by an HMAC of the client IP (IPv6 by /64), never
   * the IP. Size in `SPACES_LIMITS.guestRequestsPerMinute`.
   */
  SPACES_GUEST_LIMITER: RateLimit;

  /** APNs auth key id (secret). Pushes are skipped when unset. */
  APNS_KEY_ID?: string;

  /** APNs `.p8` auth key, PKCS#8 PEM (secret). Pushes are skipped when unset. */
  APNS_PRIVATE_KEY?: string;

  /**
   * Service-account JSON key allowed to send Firebase Cloud Messaging messages
   * (secret). Its `project_id` is the Firebase project. Android pushes are
   * skipped when unset.
   */
  FCM_SERVICE_ACCOUNT_JSON?: string;

  // --- Route planning ------------------------------------------------------

  /**
   * One SQLite DO per caller and limit holding only the timestamps of its
   * charged calls from the last 24 hours (per-account daily/minute limits):
   * route optimizations, directions, and MapKit JS tokens.
   */
  ROUTE_PLANNING_QUOTA: DurableObjectNamespace<
    import('./routePlanning/quotaDO').RoutePlanningQuota
  >;

  // --- Maps (witness-work ADR 0037 §8) -------------------------------------

  /**
   * MapKit JS key, the `.p8` PKCS#8 PEM (secret). With `MAPKIT_JS_KEY_ID`,
   * `APPLE_TEAM_ID`, and a frame origin, `POST /maps/v1/mapkit-tokens` mints
   * tokens; without them it answers 503 `maps_unconfigured`.
   */
  MAPKIT_JS_PRIVATE_KEY?: string;

  /** The MapKit JS key's 10-character id (secret), the JWT's `kid`. */
  MAPKIT_JS_KEY_ID?: string;

  /**
   * Comma-separated origins of the MapKit JS frame that tokens may name
   * (`https://maps.witnesswork.app`). `http://localhost` and `127.0.0.1`
   * origins count only on development workers. The first is the default.
   */
  MAPKIT_JS_ORIGINS?: string;

  /**
   * The Overpass API interpreter `POST /maps/v1/addresses` asks for
   * OpenStreetMap house numbers. Defaults to
   * `https://overpass-api.de/api/interpreter`.
   */
  OVERPASS_URL?: string;
}

/** Request-scoped values routes share through `c.var`. */
export interface AppVariables {
  /**
   * The caller's account and session, set by `requireAccount()` and
   * `bearerOrLegacy()` (src/accounts/auth.ts) on bearer requests only.
   * Read it with `accountOf(c)`.
   */
  account?: import('./accounts/auth').AccountAuth;
}

/** The Hono environment every app and route group uses. */
export type AppEnv = { Bindings: Environment; Variables: AppVariables };

export type AppContext = Context<AppEnv>;

export interface HealthCheckResponse {
  status: 'ok';
  /** Current server time (request handling time). */
  timestamp: string;
  /** The same instant as epoch milliseconds, for clock calibration. */
  serverTime: number;
  /** Deployed Worker version id (from the version_metadata binding). */
  versionId: string;
  /** Optional version tag, if one was set at upload (`wrangler versions upload --tag`). */
  versionTag?: string;
  /** ISO timestamp of when this Worker version was uploaded (from version_metadata). */
  deployedAt: string;
}

/** Notes Import's error body: the shared envelope (src/errors.ts) plus extras. */
export interface ErrorResponse {
  ok: false;
  /** Human-readable message, kept for shipped builds; branch on `code`. */
  error: string;
  /** Stable machine-readable code so the app can branch (e.g. show the paywall). */
  code: string;
  /** Seconds to wait before retrying; repeats the `Retry-After` header. */
  retryAfter?: number;
  /** Stable App Attest or Play Integrity failure reason (additive to `code`). */
  reason?:
    | import('./appAttest/errors').AppAttestReason
    | import('./playIntegrity/errors').PlayIntegrityReason;
  /** Recovery-safe next action; transient failures never request key rotation. */
  action?:
    | import('./appAttest/errors').AppAttestAction
    | import('./playIntegrity/errors').PlayIntegrityAction;
  /**
   * Underlying error detail, surfaced ONLY to dev-bypass callers (i.e. DEV app
   * builds) so the real cause of an otherwise-opaque failure (e.g. `model_error`)
   * is visible on-device. Never populated for attested production requests.
   */
  detail?: string;
  /** Required authoritative state on structured usage denials. */
  credits?: import('./credits').CreditsSnapshot;
}
