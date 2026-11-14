# Agent guide — ww-proxy

This codebase is the backend API that powers the WitnessWork expo (react native) application. The app is this same repository: its code is at the repo root (`../..` from here), and the API lives in `services/api` with its own pnpm workspace and lockfile, so run every `pnpm` and `wrangler` command below from `services/api`.

"witness-work ADR NNNN" in this file and in source comments is `../../docs/adr/NNNN-*.md`, and a witness-work doc is under `../../docs/` (for example `../../docs/accounts-protocol.md`). A plain `docs/…` path is this folder's own `docs/`.

A Cloudflare Workers API/proxy (HERE API, iOS universal links, Notes Import). See
`README.md` for general setup; this file documents agent-relevant operational
details, primarily the **environments**.

## Environments

There are three environments, defined in `wrangler.toml`. Two are deployed API
Workers; development runs only on your own machine:

| Env  | Worker name     | URLs                                                                 | Wrangler env                                  | Deploys |
| ---- | --------------- | -------------------------------------------------------------------- | --------------------------------------------- | ------- |
| prod | `ww-proxy`      | `https://api.witnesswork.app`, `https://ww-proxy.leviwilkerson.com`  | top level (no flag)                           | on request: `gh workflow run api-deploy.yml -f environment=production` (the release process does this) |
| beta | `ww-proxy-beta` | `https://api-beta.witnesswork.app`                                   | `[env.beta]` (`--env beta`)                   | automatically: every push to `main` that touches `services/api` |
| dev  | none deployed   | `http://localhost:8787` (`pnpm dev`), or the verify loop's 8790-8799 | `[env.dev]` (`--env dev`, local config only)  | never |

What each one is for:

|                    | prod | beta | dev |
| ------------------ | ---- | ---- | --- |
| Clients            | App Store app, production web | TestFlight "WitnessWork Beta" iOS app (`com.leviwilkerson.jwtimebeta`), web beta | development builds (`com.leviwilkerson.jwtimedev`), simulators, local web |
| Web app origin     | `https://app.witnesswork.app` | `https://beta.app.witnesswork.app` | `http://localhost:8081` and the other local ports |
| Link-page host     | `witnesswork.app` | `beta.witnesswork.app` | none |
| App Attest         | production | production | development, plus the dev bypass |
| Data (D1, KV, R2, Durable Objects) | `ww-accounts`, the prod buckets | its own: `ww-accounts-beta`, the `*-beta` buckets, its own KV, rate-limit namespaces 3001-3008 | simulated on disk |
| Feature fallbacks (Buddies, Cloud Sync, Shared Spaces) | mostly off, `AUTH_LEGACY` on | on, `AUTH_LEGACY` off | on, `AUTH_LEGACY` off |
| Passkey RP ID      | `app.witnesswork.app` | `beta.app.witnesswork.app` | `beta.app.witnesswork.app` (native development builds borrow it) and `localhost` |

New clients use the `witnesswork.app` hosts (witness-work ADR 0042). The old
production host serves the same Worker for good and is never redirected:
shipped builds call it, and WebSockets don't follow redirects. Each deployed
Worker also answers a few exact paths on the website apex (`witnesswork.app`,
Beta `beta.witnesswork.app`): the link pages and association files, below.

Three app-update Workers (Hot Updater) are defined separately in
`wrangler-updates.json`, one per app channel, each with its own D1 database and
private R2 bucket of the same name:

| Env  | Worker / D1 / R2  | URL                                                  | Deploy command                                          |
| ---- | ----------------- | ---------------------------------------------------- | ------------------------------------------------------- |
| dev  | `ww-updates-dev`  | `https://ww-updates-dev.levi-wilkerson.workers.dev`  | `pnpm updates:migrate:dev && pnpm updates:deploy:dev`   |
| beta | `ww-updates-beta` | `https://ww-updates-beta.levi-wilkerson.workers.dev` | `pnpm updates:migrate:beta && pnpm updates:deploy:beta` |
| prod | `ww-updates-prod` | `https://ww-updates-prod.levi-wilkerson.workers.dev` | `pnpm updates:migrate:prod && pnpm updates:deploy:prod` |

They share no bindings with ww-proxy, and plain `wrangler deploy` never touches
them. The dev update channel still exists, for development-channel builds, even
though the API has no deployed dev tier. The API deploy workflow migrates and
deploys them alongside ww-proxy: `ww-updates-prod` with production, and
`ww-updates-beta` and `ww-updates-dev` with Beta. Setup, credentials and
verification are in [`docs/ota-updates.md`](./docs/ota-updates.md).

### Deploying

Deploys run in GitHub Actions: the **API deploy** workflow
(`.github/workflows/api-deploy.yml`, at the repo root).

- **Beta** deploys by itself on every push to `main` that touches
  `services/api`, so it always runs the tip of `main`. To run it again:
  `gh workflow run api-deploy.yml -f environment=beta`.
- **Production** never deploys by itself. The release process asks for it
  (`../../scripts/release-api.sh`), or you do:
  `gh workflow run api-deploy.yml -f environment=production`.
- **Development** is never deployed.

The workflow runs typecheck and the unit tests, creates the R2 buckets and
their lifecycle rules, applies the accounts database's migrations, deploys the
update Workers, deploys the API Worker, uploads its source maps to Sentry (see
[Sentry source maps](#sentry-source-maps) below), and then checks that
`/health` answers with the new commit. Pull requests are checked by
`.github/workflows/tests.yml` (typecheck, unit tests, the local end-to-end
suite, and the fuzzer), never deployed.

There are no `v*` release tags or "chore: release" commits for the API. A
deploy is identified by its commit: the workflow passes
`wrangler deploy --tag <commit sha>`, and `/health` reports it as `versionTag`.
`../../scripts/release-api.sh` reads that to tell whether an environment
already serves the API code on `main`.

`pnpm run deploy` (prod) and `pnpm run deploy:beta` deploy from your own
machine. Use the workflow instead unless it can't run. When you must deploy by
hand, prefer these scripts over raw `wrangler deploy`: they also inject the
`SENTRY_RELEASE` var and upload source maps to Sentry. They don't apply the
accounts migrations or pass `--tag`, so apply the migrations first, and expect
`/health` to report no `versionTag` until the workflow next deploys.

Beta is a **fully separate Worker** — its own name, KV namespace, D1 database,
R2 buckets, Durable Objects, rate-limit namespaces, and secrets. Nothing is
shared with production. `wrangler deploy --env beta` can never overwrite prod.
Plain `wrangler deploy` always targets prod, so the `--env beta` flag is the
isolation boundary.

The Beta app used to call the production API. It now calls the Beta API, so
Beta accounts, backups, Buddies, and Cloud Sync data are separate from
production's. Android has no Beta app: a beta-profile Android build is the
production package and calls production.

### Development (local only)

`[env.dev]` is the config a local `wrangler dev --env dev` runs (`pnpm dev`,
and the verify loop in `scripts/verify/dev.mjs`). Nothing is deployed from it:
there is no `ww-proxy-dev` Worker, and no `api-dev`, `app-dev`, `dev`,
`maps-dev` or `verify-dev` host on `witnesswork.app`. Its bindings are simulated
on disk, so the ids under `[env.dev]` name no Cloudflare resource, and its
`routes = []` keeps it from inheriting prod's hosts (routes are inherited), so
the local worker answers as the host it was reached on.

It pins to the dev iOS bundle id `com.leviwilkerson.jwtimedev` (from
`../../app.config.ts`, `IS_DEV` branch), accepts development App Attest
receipts, and is the only place `NOTES_IMPORT_DEV_BYPASS_TOKEN` and every other
development-only behaviour exists — **never on Beta or prod.** Both of those
attest in Apple's production environment, ignore the bypass header, and fail
loudly if the token is ever set there.

### Web app origins (CORS)

The web app (witness-work ADR 0038 §10) calls this API cross-origin from a
browser, so CORS (`src/cors.ts`, registered first in `src/app.ts`) admits an
exact allow-list per environment, the `WEB_APP_ORIGINS` var (comma-separated;
`Origin` must equal an entry byte for byte, no wildcards or suffixes):

| Env  | `WEB_APP_ORIGINS` |
| ---- | ----------------- |
| prod | `https://app.witnesswork.app`, `https://beta.app.witnesswork.app` |
| beta | `https://beta.app.witnesswork.app` |
| dev  | `http://localhost:8081`, `:8082`, `:19006`, `:4173`, `:5173` |

Production still lists `beta.app` for web beta builds from before the Beta API;
treat it as transitional. Beta and production never list a localhost origin.
`pnpm dev` and the verify launcher run `--env dev`, so local web dev servers on
those ports work against them; the test harness sets `http://localhost:8081`
and `https://beta.app.witnesswork.app`.
Unset, no browser gets in. Native apps send no `Origin` and see no change.

- **Every answer** to an allowed origin, errors included (`apiError`, 401
  with `WWW-Authenticate`, 404, 426, 429, 503, `onError`'s 500), carries
  `Access-Control-Allow-Origin: <that origin>`, `Vary: Origin`, and
  `Access-Control-Expose-Headers: ETag, Retry-After, Date, WWW-Authenticate,
  x-ww-updated-at`. Never `Access-Control-Allow-Credentials` (no cookies).
  101 upgrades are left alone; a response with immutable headers is copied.
  Any other `Origin`, or none: no CORS headers.
- **Preflights** (`OPTIONS` with `Access-Control-Request-Method`) are
  answered by the middleware before any limiter, auth, KV read, or Durable
  Object, so they never count against a limit: 204 with
  `Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS`, the
  requested headers echoed in `Access-Control-Allow-Headers`, and
  `Access-Control-Max-Age: 7200`, when the origin is allowed and every
  requested header is `authorization`, `content-type`, `if-match`,
  `if-none-match`, `sentry-trace`, `baggage`, `x-ww-*`, or `x-buddies-*`,
  but never `x-ww-admin-token`, and `x-ww-dev-bypass` only on a worker with
  `NOTES_IMPORT_DEV_BYPASS_TOKEN` set (local dev); else 403 with no CORS headers.
- **Live sockets** from a browser authenticate with a live ticket in
  `Sec-WebSocket-Protocol` instead of headers and must come from an allowed
  `Origin`; see
  "Browser live sockets" under [Accounts](#browser-live-sockets).

### App Attest bundle ids

Each environment pins its own app: prod the App Store app
(`IOS_BUNDLE_ID = com.leviwilkerson.jwtime`), Beta the TestFlight
"WitnessWork Beta" app (`com.leviwilkerson.jwtimebeta`), and local dev the
development build (`com.leviwilkerson.jwtimedev`). TestFlight builds always use
Apple's production App Attest environment, so the Beta worker's
`APP_ATTEST_ENVIRONMENT` is `production`, like prod's; only local dev is
`development`.

Prod also still accepts the Beta app's keys
(`IOS_ADDITIONAL_BUNDLE_IDS = com.leviwilkerson.jwtimebeta`, comma-separated,
top-level `[vars]` only), because Beta builds from before the Beta API call
production. Treat that as transitional: remove it once no such build is in
use.

An attestation must match one accepted App ID (`<APPLE_TEAM_ID>.<bundle id>`);
the matched bundle id is stored on the key's `AppAttestIdentity` row (and its
KV mirror), and every later assertion for that key verifies against that bound
id only. Keys stored before binding (NULL / absent) are bound to
`IOS_BUNDLE_ID`. Removing a bundle id from config makes its bound keys fail
closed. `APP_ATTEST_ENVIRONMENT` is independent of the bundle id.

Note: in Wrangler, `vars`, `kv_namespaces`, and `ratelimits` are **not inherited**
by a named env, so they are repeated under `[env.beta]` and `[env.dev]` in
`wrangler.toml`. Keep them in sync with the top-level prod config when adding
new bindings (`src/environments.test.ts` checks that all three bind the same
things). Routes **are** inherited, so `[env.beta]` lists its own and
`[env.dev]` sets `routes = []`.

### Android Notes Import (Play Integrity)

Android authenticates Notes Import with Google Play Integrity standard requests
instead of App Attest (witness-work ADR 0017; code in `src/playIntegrity/`). A
request opts in with `attestationProvider: "play-integrity"` on
`/attestation/v1/challenge`, `/attestation/v1/verify`, and
`/notes-import/kickoff` (and `/transcribe`); bodies without it take the
unchanged App Attest paths. Challenges live in the
`PLAY_INTEGRITY_CHALLENGES` Durable Object (migration `v4`), never in
`AppAttestIdentity`. The worker decodes each token through Google's
`decodeIntegrityToken` with a service account, then requires the request
binding, `PLAY_RECOGNIZED`, and `MEETS_DEVICE_INTEGRITY`. Licensing is not
required.

Production is configured. Beta and local dev carry the same vars, but Android
has no Beta app (a beta-profile Android build is the production package and
calls production), so nothing calls them on Beta unless a Play test build is
pointed at it by hand, and then Beta needs its own
`PLAY_INTEGRITY_SERVICE_ACCOUNT_JSON` secret. Android is on only while all three
required settings are present; only then does `GET /notes-import/status`
advertise `capabilities.playIntegrity`:

| Setting | Kind | Value |
| --- | --- | --- |
| `ANDROID_PACKAGE_NAME` | var | `com.leviwilkerson.jwtime` |
| `PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER` | var | Google Cloud project number (not the id) |
| `PLAY_INTEGRITY_SERVICE_ACCOUNT_JSON` | secret | Service-account JSON key |
| `ANDROID_CERT_SHA256_DIGESTS` | var, optional | base64url SHA-256 of the Play app-signing certificate |
| `PLAY_INTEGRITY_REQUIRED_DEVICE_VERDICT` | var, optional | `MEETS_DEVICE_INTEGRITY` (default), `MEETS_BASIC_INTEGRITY`, `MEETS_STRONG_INTEGRITY` |

To rotate the key, create a new JSON key for the service account in the
linked Cloud project, `wrangler secret put PLAY_INTEGRITY_SERVICE_ACCOUNT_JSON
< key.json` (and `--env beta` if Beta has one), then delete the downloaded file. Basic/strong
verdicts need an opt-in in Play Console under Play Integrity API → Change
responses.

Development builds (`com.leviwilkerson.jwtimedev`) aren't on Play and
emulators fail device integrity, so exercise real tokens with a
Play-installed `com.leviwilkerson.jwtime` build (an internal testing track);
use the dev bypass otherwise. Failures return `attestation_failed` with a
stable `reason`: `device_integrity_failed`, `app_not_recognized`,
`integrity_token_invalid`, `integrity_unavailable` (Google, credentials, or
quota; reported to Sentry), or a challenge reason. The default quota is 10,000
decodes per day; request more through Google's quota form before it matters.

## Attestation

Device attestation is API-wide, under `/attestation/v1/` (code in
`src/attestation/`): App Attest on iOS, Play Integrity on Android.

| Route | What |
| --- | --- |
| `POST /attestation/v1/challenge` | One-time challenge (App Attest v1/v2, Play Integrity) |
| `POST /attestation/v1/register` | Bind an App Attest key, or enroll a v2 recovery token |
| `POST /attestation/v1/verify` | Attested no-op for the app's developer tools |
| `GET /attestation/v1/status` | Accepted providers (Play Integrity once configured) |

- **Purposes**: every App Attest v2 / Play Integrity assertion signs a
  `purpose`, and each protected route accepts only its own. The registry is
  `ATTESTATION_PURPOSES` in `src/attestation/purposes.ts`. Installed apps sign
  these strings, so **never rename a shipped purpose**. `attestation-verify`
  is verify's purpose; `notes-import-verify` (what deployed apps sign) is
  accepted on verify too. `account-session` opens an account session
  ([Sessions](#sessions-and-bearer-tokens)).
- **Protecting a new route**: add a purpose, have the route recompute its
  `contentHash`/`requestHash` from the payload and reject a mismatch, then
  call `requireAttestation(ctx, body, purpose)` (`src/attestation/http.ts`;
  App Attest v2 or Play Integrity, never v1). A route with its own error
  format calls `verifyAttestation` instead, which resolves with the platform
  (`ios`, `android`) or throws the provider's error with its `reason`.
  Notes Import kickoff keeps its own gate because it still accepts v1. A
  user-scoped route shouldn't attest at all: it takes the session's bearer
  token (see Accounts).
- **Old paths**: `POST /notes-import/challenge`, `/notes-import/attest`, and
  `/notes-import/verify` serve the same handlers for deployed apps. They add
  `Deprecation: @1792022400` (2026-10-15) and
  `Link: </attestation/v1/…>; rel="successor-version"`, are documented as
  deprecated, still count in the `notes-import` rate-limit bucket, and log
  `deprecated path: <old> -> <new>`. Remove them only after the minimum app
  version uses the new paths and those Workers Logs lines stop.
- New paths count in their own `attestation` per-IP bucket and keep 100%
  Sentry trace sampling (status excepted), as they had under Notes Import.

## Link pages

Universal links (and their no-app fallback pages) use readable paths under
their feature: `/contacts#<payload>`, `/buddies/invite#1…`,
`/accounts/handoff#1…`. Older app versions shared the short `/c#…` (and
`/c/<payload>`), `/b#1…`, and `/h#1…`. Those links live on in people's
messages and screenshots, so **the short paths stay routed and in the AASA for
good**; a redirect wouldn't do, because iOS decides from the AASA whether a
tapped URL opens the app. Each page's `og:url` is the path it was served on,
on the host it was served on (never a payload).

New links use the website apex (`https://witnesswork.app/contacts#…`), where
only the full-word paths are routed here and the AASA lists only those. The
contact and Buddies invite pages offer "Continue on the web" (`WEB_APP_ORIGIN`).
Hosts, routes, fragment formats and the web app's contract:
[`docs/link-pages.md`](docs/link-pages.md).

The app must parse the readable paths (and Android's intent filters must list
them) for at least one release before it starts generating them, or people on
older builds get the web page instead of the app.

## Deploying to Beta

Merge to `main`. Every push to `main` that touches `services/api` deploys Beta
(the **API deploy** workflow, [Deploying](#deploying) above), and the app's
Beta ship waits for it (`../../scripts/release-api.sh --env beta`), so there
is nothing to run by hand. To deploy Beta again without a new commit:

```bash
gh workflow run api-deploy.yml -f environment=beta
```

Beta's Durable Object migrations are production's list, tag for tag
(`[[env.beta.migrations]]`); add a new class at the end of every list
(`src/durableObjectMigrations.test.ts` pins them). `[[env.dev.migrations]]`
keeps another order from v10 on: it is what local `wrangler dev --env dev`
state on developers' machines already applied, so never renumber it either.

Secrets are per Worker and still set by hand: `wrangler secret put <NAME>` for
production, and add `--env beta` to keep one on Beta and off prod (the full
list is at the bottom of `wrangler.toml`). The deploy workflow never sets
them. Copies live in 1Password's Agents vault as "… (prod)" and "… (beta)".
`ADMIN_API_TOKEN`, `ACCOUNT_TOKEN_SECRET`, and `LIVE_TICKET_SECRET` differ
between the two workers. `NOTES_IMPORT_DEV_BYPASS_TOKEN` is local dev only: it
lives in `.dev.vars`, and is never a secret of either deployed worker.

## Local iteration (no deploy)

```bash
cp .dev.vars.example .dev.vars   # once; fill in what you need
pnpm dev                         # wrangler dev --env dev, on http://localhost:8787
```

That is the whole development environment: the `[env.dev]` config, every
binding simulated on disk under `.wrangler/state`, and the secrets in
`.dev.vars`. Point an app development build at it with
`EXPO_PUBLIC_API_BASE_URL=http://localhost:8787` and
`EXPO_PUBLIC_API_DEV_BYPASS` set to the same value as `.dev.vars`'s
`NOTES_IMPORT_DEV_BYPASS_TOKEN` (the repo root's `.env.example` and
`../../docs/build.md`). Don't use `wrangler dev --remote`: `[env.dev]` names no
real Cloudflare resource.

For verification, agents use the `verify-ww-api` loop below instead: it runs an
isolated worker on 8790-8799, and 8787 belongs to the user's own `pnpm dev`.

Neither gives a stable public URL for an iOS device. For a real-device
development App Attest test, reach the local worker over a `cloudflared` tunnel
(or the Mac's LAN address). The Beta worker takes production attestations only,
so a development build can't attest against it.

## Scribe AI

Scribe AI (witness-work ADR 0032) is one model step per request: the app sends
the conversation, its tool definitions, and an app context; the worker adds the
static system prompt (`src/scribe/prompt.ts`), streams the model's text and
tool calls back as SSE, and charges the step's units to the account's
`ScribeMeter` Durable Object. The device runs every tool. The wire contract is
[`../../docs/scribe-ai-protocol.md`](../../docs/scribe-ai-protocol.md);
implement it as written and list any deviation in the PR. Code: `src/scribe/`
(`route.ts` handlers, `validate.ts` request rules, `render.ts` wire → model
input, `step.ts` the model call, `meter.ts` + `meterDO.ts` metering,
`status.ts` kill switch and provider health, `legacy.ts` the Notes Import
cutover, `territoryNotes.ts` territory notes).

`POST /scribe/v1/territory-notes` reads a publisher's door-to-door notes (any
language, any shorthand) into door results for the app's Add Results From
Notes review: one non-streaming call on `model`, reasoning and prompt caching
off, behind the same session, kill switch and meter as a page (no page
ceiling), charged from its usage (≈ 1,550–1,700 units for a typical note). The
answer is validated (`parseTerritoryNotesOutput`: every number written on its
line, streets the territory's or written in the notes, no other words), so no
name or reason ever leaves the worker; a malformed answer is charged and
answered 502 `model_error` with `usage`, and the app falls back to its own
reader. The notes are never logged or stored. Quality is measured by the paid
eval `src/e2e/scribeTerritoryNotes.e2e.test.ts` (English, Spanish,
Portuguese and a messy note in `src/test/territoryNotesFixtures.ts`); run it
after any change to the instructions.

`app.platform` in the step body is `ios`, `android` or `web` (the browser app);
anything else is a 400 `bad_request` (rule `app`). Nothing branches on it:
analytics and limits use the session's platform. The list is
`SCRIBE_APP_PLATFORMS` in `src/scribe/wire.ts`.

A Cancel or a dropped connection stops the model call through
`c.req.raw.signal`, which aborts only under the `enable_request_signal`
compatibility flag in `wrangler.toml`; keep it. The step is then charged as an
abort (`error_code: "cancelled"`, `usage_estimated`). Under `wrangler dev` the
signal fires on the stream's next write (model output or the 15 s heartbeat),
not at the disconnect itself.

### Configuration (KV and vars)

Every switch lives in `NOTES_KV` and is edge-cached for 60 seconds. Each limit
and model field resolves on its own: KV → environment variable → the code
default (`src/scribe/config.ts`), so one bad KV field falls through without
taking the others with it. A failed KV read counts as absent (fail open).

| Key | Value | Effect |
| --- | --- | --- |
| `scribe:enabled` | `off`/`false`/`0`/`no`/`disabled`, JSON `false`, or `{"available":false}`; absent is on | Kill switch: status says `enabled: false, reason: "disabled"`; step and transcribe answer 503 `disabled` |
| `scribe:disabled-tools` | JSON array or comma list of tool names | Denylist: those tools leave the offered set (`start.dropped`, reason `disabled`) |
| `scribe:protocol-min` | integer ≥ 1 | Steps below it get 426 `upgrade_required` |
| `scribe:min-version` | `{"minVersion":"x.y.z"}` or `x.y.z` | Advisory floor in status (`SCRIBE_MIN_APP_VERSION` otherwise); the worker refuses nothing by version |
| `scribe:limits` | JSON, any subset of the protocol's limits | Windows, weights, grace, caps, sizes, `stepTimeoutMs`, `transcribePagesPerDay` |
| `scribe:model` | JSON `{ model, providers, reasoningEffort, maxOutputTokens, strictTools, cacheKeyBuckets, fallback: { model, providers }, transcribeModel }` | Model and hosts. `reasoningEffort` is `low`, `medium`, `high`, `xhigh`, `max` or `off` (Luna has no `minimal`). `strictTools` and `cacheKeyBuckets` are KV only |
| `scribe:provider-health` | written by the worker | Provider-health cache (300 s TTL, fresh for 60 s); delete it to re-probe now |
| `scribe:legacy-notes-import` | `on` | Re-opens the Notes Import routes (below) |
| `scribe:dev-session` | JSON `{"limits":"real","plan":"supporter"}`, either field | Dev sessions only (no effect on Beta or prod, which have none): keep the real limits instead of unlimited, and meter as that plan. For verifying the limit card and Supporter windows |

Environment variables are `SCRIBE_` plus the field path in snake case:
`SCRIBE_FREE_WEEKLY`, `SCRIBE_FREE_WELCOME`, `SCRIBE_SUPPORTER_SESSION`, `SCRIBE_SUPPORTER_WEEKLY`,
`SCRIBE_WINDOW_LENGTHS_SESSION_HOURS`, `SCRIBE_GRACE_UNITS`,
`SCRIBE_MAX_INPUT_TOKENS`, `SCRIBE_STEP_TIMEOUT_MS`,
`SCRIBE_TRANSCRIBE_PAGES_PER_DAY_FREE`, and so on, plus `SCRIBE_MODEL`,
`SCRIBE_PROVIDERS` (comma list), `SCRIBE_REASONING_EFFORT` (`off` for none),
`SCRIBE_MAX_OUTPUT_TOKENS`, `SCRIBE_FALLBACK_MODEL`,
`SCRIBE_FALLBACK_PROVIDERS`, and `SCRIBE_TRANSCRIBE_MODEL`.

```bash
# Kill switch (on again: delete the key)
wrangler kv key put --binding NOTES_KV scribe:enabled off
# Withdraw a tool the app defines
wrangler kv key put --binding NOTES_KV scribe:disabled-tools '["visits_log"]'
# Change limits (fields not named keep their var or default). `free.welcome`
# is a free account's limit in its first week; it never goes below `free.weekly`.
wrangler kv key put --binding NOTES_KV scribe:limits '{"free":{"weekly":30000}}'
# Less reasoning (faster and cheaper, but drops actions more often; see below)
wrangler kv key put --binding NOTES_KV scribe:model '{"reasoningEffort":"low"}'
# Spread prompt-cache traffic over 4 keys (see Model notes before turning it on)
wrangler kv key put --binding NOTES_KV scribe:model '{"cacheKeyBuckets":4}'
# A fallback for when no allowlisted host serves tool calls for the model
wrangler kv key put --binding NOTES_KV scribe:model '{"fallback":{"model":"openai/<model>","providers":["azure"]}}'
```

These are production's; add `--env beta` for the Beta worker, and use `node
scripts/verify/dev.mjs kv put …` for the local one. `providers` is the ZDR
allowlist (ADR 0008): only Western zero-retention hosts, and it's never widened
automatically. A dev session (opened with the dev bypass, so on a local
worker only) gets unlimited windows and pages, metered as free, unless
`scribe:dev-session` keeps the real limits or names the Supporter plan;
request caps still apply. Locally: `node scripts/verify/dev.mjs kv put
scribe:dev-session '{"limits":"real","plan":"supporter"}'` plus a small
`scribe:limits` reaches the limit card in a minute.

### Model notes (measured)

- Azure serves `openai/gpt-6-luna` without `parallel_tool_calls`, so the
  worker doesn't send it (with `require_parameters` OpenRouter would find no
  host). The model makes parallel calls anyway.
- Every step and page read sends OpenRouter's `user`: `providerUserId`, a
  SHA-256 of the account id under its own label (`ww_` + 32 hex), never the
  id itself and not the analytics id. Without it OpenRouter sends the whole
  key's identity upstream, so one User's provider policy block (GPT-6's
  `bio_policy`/`cyber_policy` 403s) would block every User. Azure still
  routes with `require_parameters` (checked 2026-10-22).
- The app context goes in a user-role message ahead of the conversation, not a
  second system message: system messages are merged ahead of the tool
  definitions, so a per-User context there split the prompt + tools prefix
  every User shares, and step 0 got no cache hit. As a user message, step 0
  caches about 3,500 of its 4,900 input tokens.
- At `low` reasoning the model sometimes leaves out the second of two actions
  in one message (9–10 of 12 multi-action utterances complete, 1.4–3.8 s a
  step); `medium` completed 12 of 12 at 3.6–10 s a step and about 500–1,000
  more units a step. The default is `medium` because a dropped action is worse
  than a slower step; `scribe:model` `{"reasoningEffort":"low"}` trades back.
- OpenRouter's account guardrail answers 403 "Request blocked: prompt
  injection patterns detected" (nothing charged) when the input contains text
  like "ignore previous instructions". A Visit note is enough, and since the
  app resends the whole conversation, every later step would be blocked too.
  So a blocked step is sent once more with every untrusted tool result
  withheld (`render.ts` `WITHHELD_NOTICE`; the model says it couldn't read
  it), and a step blocked again, or with no untrusted text to withhold, ends
  as `done` `refused` instead of a retryable `model_error`. `injection_block`
  in `api_scribe_step` counts both.
- Prompt caching (measured October 2026; `cost` matched to the micro-dollar):
  - GPT-6 Luna on Azure caches implicitly and **writes every uncached token**
    of a prompt of 1,024 tokens or more (all but ≈ 3), billed at 1.25× input.
    Usage reports them (`cache_write_tokens`), and the meter charges them at
    `weights.cacheWrite` (1.25), so 1 unit ≈ $0.0000001 of real cost.
  - The system prompt + tools prefix (≈ 3,860 tokens) is shared across Users
    and conversations without any breakpoint: a new conversation's step 0
    reads it and writes only its context and message.
  - A page is read with caching off (`prompt_cache_options: { mode:
    'explicit' }`, no breakpoints): nothing written or read, 17.6 % cheaper a
    page. A 2,000 px page is ≈ 4,450 input tokens.
  - OpenRouter sends a `prompt_cache_key` of its own when we send none, so
    every step shares one key. Ours (`cacheKeyBuckets`) reaches Azure and
    partitions the cache: each bucket keeps its own copy of the shared prefix
    (one cold write, ≈ 4,800 units, per bucket idle 30 minutes), and turning
    it on costs every User one cold step. Leave it at 0 until Azure's
    overflow applies: sustained traffic above ≈ 15 requests a minute on one
    key (watch step-0 `cached_input_tokens` and `turn_gap` in
    `api_scribe_step`); then set it to about peak Scribe requests a minute ÷
    10.
- Limits are sized from these measurements at medium reasoning and a 50 %
  cache hit rate (real sessions pause between turns, so the prefix cache often
  goes cold), with cache writes at 1.25×: a 7-turn conversation ≈ 54.6k units
  and a quick edit ≈ 7.2k. The limits were resized in November 2026 from three
  weeks of production usage (`../../docs/scribe-ai-protocol.md` →
  Measured usage): free 25k per week (three or four quick edits), 150k in an
  account's first week; Supporter 200k per 5 hours and 500k per week, about
  three times the heaviest use seen.
- Steps and pages read the account's plan through a 30-second per-isolate
  cache (`src/scribe/plan.ts`), started alongside the body read. `GET
  /scribe/v1/usage` always asks afresh, and a refusal never rests on a cached
  plan (it's asked again first), so a new Supporter is never held back.
- `done` is sent only after `settleStep` returns: the next step's admission
  must see this step's charge, and a failed settle must end the step as an
  error rather than leave an answered step uncharged.

### Release and cutover

**Before** a deploy carrying Scribe AI reaches prod or Beta, set
`scribe:legacy-notes-import` to `on` in that namespace, or every installed app
on a Notes Import version gets 426 for imports:

```bash
wrangler kv key put --binding NOTES_KV scribe:legacy-notes-import on
wrangler kv key put --binding NOTES_KV scribe:legacy-notes-import on --env beta
```

With it off (or absent), every `/notes-import/*` route except
`GET /notes-import/status` answers 426 `upgrade_required` before its rate
limit, auth, or kill switch, and `/admin/notes-import/reset` is 404. `GET
/notes-import/usage` is 404 too: older composers read it on every open
through the session client, which shows Update Required over the whole app
on a 426, so they'd lose the app instead of seeing the composer's own update
message. A failed
KV read lets the request through. The cutover, once the user decides to run
it, in order:

1. The Scribe AI app version is live on both stores.
2. Older composers show their update message:
   `wrangler kv key put --binding NOTES_KV notes-import:min-version '{"minVersion":"X.Y.Z"}'`
   (that version).
3. Close the old routes:
   `wrangler kv key put --binding NOTES_KV scribe:legacy-notes-import off`.
4. Watch `api_scribe_step` errors and Notes Import 426 counts for a week; then
   a follow-up deletes the Notes Import code.

Undo step 3 with `scribe:legacy-notes-import on`. Each step takes up to 60
seconds to reach every colo.

### Usage reset

`pnpm run admin:reset-usage [--beta] <accountId>` calls `POST
/admin/scribe/reset`: every window of the account back to unused, and its
pages for the day (the log line carries only the previous totals). Without a
flag it resets on production, with `--beta` on Beta. There's no flag for the
local worker: call the route with curl and the launcher's admin token
(`../../.agents/skills/verify-ww-api/features/admin.md`).
`--notes-import` calls the old `POST /admin/notes-import/reset` instead, which
answers only while `scribe:legacy-notes-import` is on.

### Logging and analytics

One JSON line per step (`console.info`) and the same properties to PostHog as
`api_scribe_step` (and `api_scribe_transcribe` per page), with `distinct_id`
the hashed account id and no person profile (territory notes log
`api_scribe_territory_notes` with counts and usage only). Properties:
`protocol`, `step`, `plan`, `platform`, `app_version`, `conversation_id`, `turn_id`, `offered`
(tool names), `offered_count`, `dropped`, `tool_calls` (names), counts of
unknown-tool and bad-args calls, `finish`, token counts (including
`cache_write_tokens`), `units`, `usage_estimated`, `cost_usd` (OpenRouter's
billed USD), `turn_gap` (step 0 of a later turn: minutes since the previous
user message, `<5`, `5-30`, `30-120` or `>120`), `model`, `provider`,
`latency_ms`, `ttft_ms`, `tainted`,
`grace`, `retried_without_reasoning`, `injection_block` (`withheld` or
`refused`, below), `rule` (the validation rule that refused the request), and
`error_code`. **Never** add message text, the context, tool
descriptions or schemas, call arguments, tool results, Refs, names, or
provider error bodies: Sentry gets `ScribeModelError` (error class, HTTP
status, provider code) instead of the AI SDK's error, and `streamText`'s
`onError` is silenced because its default logs the whole provider response.

### Verifying with a real model

The free e2e (`src/e2e/scribe.e2e.test.ts`) covers every refusal without the
model. The real-model suite costs a few cents:

```bash
# A file holding only OPENROUTER_API_KEY=… (mode 600, outside the repo)
node scripts/verify/dev.mjs up --secrets-from /path/to/openrouter.env
WW_API_E2E_ALLOW_PAID=1 pnpm exec vitest run --config vitest.e2e.config.ts src/e2e/scribeModel.e2e.test.ts
node scripts/verify/dev.mjs down
```

It drives a 16-tool manifest (`src/test/scribeFixture.ts`) through tool
calls, read → write, parallel calls, caching, units against the window,
`limit_reached` with turn grace, `strictTools`, the legacy 426, and a 7-turn
conversation, and writes `.verify/artifacts/scribe-model-<timestamp>.json`.

Model quality (does each message become the right calls and reply) is
measured from the app instead, with its real tools, context and turn loop: the
app's `src/features/scribe/evals` runs about 60 spoken-style scenarios against
this worker (`SCRIBE_EVAL_WORKER=services/api pnpm exec vitest run
src/features/scribe/evals` from the repo root; its README-style header has the
options). Run it after any change to `prompt.ts`.

## Notes Import runtime limits and admin reset

Allowance policy lives in each environment's `NOTES_KV` under
`notes-import:limits` and is edge-cached for 60 seconds. Its JSON shape is:

```json
{"importsFree":3,"importsSupporter":-1,"refinementsFree":5,"refinementsSupporter":-1,"windowDays":30}
```

Each field independently resolves KV → the matching `wrangler.toml` env var →
code default. Allowances accept integer `-1` (unlimited), `0` (none), or a
positive value; `windowDays` accepts any positive finite number, including
fractions for short dev windows.

### Minimum app version

`GET /notes-import/status` also returns `minAppVersion` (`major.minor.patch`)
when a floor is configured. The app compares it against its own
`app.config.ts` version; below the floor it disables the Notes Import composer
and shows an "update required" message with an App Store link. The worker does
not reject requests — this is a client-side gate only. Bump it right after
deploying a contract-breaking change:

```bash
wrangler kv key put --binding NOTES_KV notes-import:min-version '{"minVersion":"1.42.0"}'            # production
wrangler kv key put --binding NOTES_KV notes-import:min-version '{"minVersion":"1.42.0"}' --env beta # Beta
wrangler kv key delete --binding NOTES_KV notes-import:min-version                                   # remove the floor
```

Resolution is KV → `NOTES_IMPORT_MIN_APP_VERSION` env var → unset (no floor);
invalid values are logged and ignored. The read is edge-cached for 60 seconds.

To reset one Notes Import meter's rolling aggregate and Empty Import rows
while preserving permanent replay/refinement records (only while
`scribe:legacy-notes-import` is on), copy `.env.example` to the gitignored
`.env`, set the environment-specific token/URL, then run:

```bash
pnpm run admin:reset-usage --notes-import <meterId>         # production
pnpm run admin:reset-usage --beta --notes-import <meterId>  # Beta
```

The meter id is the account id for app versions with sessions (from an inbox
id: `POST /admin/accounts/lookup`), else the shared account id or install uuid.

`ADMIN_API_TOKEN` and `ADMIN_API_TOKEN_BETA` must match separate Wrangler
`ADMIN_API_TOKEN` secrets in prod/Beta (`WW_API_BETA_URL` and
`WW_API_PROD_URL` override the hosts). Never reuse the development bypass token.

## Notes Import on account sessions

Notes Import identifies the caller by the session's account (witness-work ADR
0027). The wire contract is in README.md ("Who's calling") and `/docs`.

- **Bearer**: kickoff, the synchronous `POST /notes-import`, and transcribe
  take `Authorization: Bearer` and plain fields (no attestation, no hashes);
  `meterId` is the token's account id. They refuse a suspended account
  (`requireActive`, 403). Run routes (`events`, `result`, `cancel`, `destroy`)
  take the token instead of `?token=` and serve only that account's imports:
  anything else is 404 `not_found`, unknown and foreign alike. Kickoff mints no
  subscribe token.
- **Ownership**: a bearer run stores `owner` =
  `importOwnerKey(accountId)` (a SHA-256, not the id) in its `meta` table at
  `start()`; `NotesImportRun.isOwnedBy` compares it and stores nothing for an
  unknown id (tables are created on the first write). Bearer import ids hash
  `account:<accountId>:<contentHash>[:r:<SHA-256 of the instruction>]`, which
  has no `|`, so no legacy basis (`<meter>|<contentHash>…`, any uuid) can
  produce one: a legacy kickoff can never get a subscribe token for an
  account's run.
- **Supporter**: one seam, `isAccountSupporter`
  (`src/accounts/supporter.ts`), at kickoff and settlement: the account's
  own status (see [Supporter status](#supporter-status-revenuecat)). An
  account with no linked RevenueCat customer is free. A
  `revenueCatAppUserId` from builds before ADR 0029 is ignored.
- **Dev**: a `dev` session gets the dev bypass's allowances only where
  `NOTES_IMPORT_DEV_BYPASS_TOKEN` is set (a local worker); the bypass header is
  ignored on bearer requests.
- **Errors**: Notes Import's shape (message in `error`) for every refusal,
  bearer and legacy: 401 `unauthorized` with `WWW-Authenticate`, 403
  `suspended`, 503 `disabled`, and 426 `upgrade_required` (no `Retry-After`)
  for a legacy request once `auth:legacy` is off.
- **Allowances don't carry over**: usage under an install uuid or shared
  account id stays on that meter; each account starts a fresh window.
- `GET /notes-import/status` is unchanged: public, the same for everyone, and
  cached per isolate as below. It never reads `Authorization`.
- **Usage**: `GET /notes-import/usage` (bearer only, read-only) is the
  account's allowance for the app's composer and credits sheet: `imports`
  (`limit`, `used`, `remaining`, `resetsAt`), `refinements.limitPerImport`,
  `windowDays`, `supporter`, `supporterCheckFailed`, and `accountStatus`.
  It runs kickoff's own code (`resolveAccountSupporter`,
  `resolveMeterAllowances`, then `NotesImportIndex.usage`, built on the
  same `normalizeImportWindow`/`computeCreditsSnapshot`), so it can't
  disagree with kickoff; change those together. It charges nothing, holds
  no slot, and emits no operational event. RevenueCat unreachable answers
  free with `supporterCheckFailed: true` (kickoff meters it free too), never
  a 5xx. A suspended account still reads it (`accountStatus: "suspended"`).
  It counts in the read edge tier per IP (`BUDDIES_READ_LIMITER`, 600/min),
  not the `notes-import` bucket (`rateLimit`'s `except`), so every device
  opening the composer never spends the imports' budget. Refinements are
  per notes text, so there's no account-wide refinement balance.

## Status caching and trace sampling

`GET /notes-import/status` reuses completed public responses in each Worker
isolate for up to 30 seconds, scoped to the current environment. Degraded
fail-open responses without limits are not cached. The response uses
`Cache-Control: no-store`; no CDN or browser cache should add another window.
The app shares concurrent availability probes and may reuse a valid result for
another 30 seconds. Together these UI hints can lag by up to 60 seconds beyond
existing KV propagation/cache delays (limits and minimum version use 60-second
KV edge caching). This is a reuse window, not automatic client polling.

Import enforcement bypasses the public-response cache and still checks the
kill-switch and authoritative allowances. The OpenRouter metadata probe has a
2-second deadline covering both headers and body consumption. Worker requests
do not share pending I/O promises; simultaneous cold misses may probe separately.

Its result lives in KV `notes-import:provider-health` as `{healthy, checkedAt}`
for 5 minutes. Under a minute old it is served as is; older, it is still served
while `waitUntil` re-probes and rewrites it, so a request only waits on
OpenRouter when no result is stored. A provider outage can therefore take a
minute plus one request to show. The kill-switch, provider, allowance, and
minimum-version KV reads all start at once.

Sentry traces retain 100% of development (a local worker) and Notes Import
operation traffic. Beta counts as production here (its `APP_ATTEST_ENVIRONMENT`
is `production`). Production status, HERE proxy, health, contact-link and other routine routes use
10% trace sampling, overriding propagated parent sampling decisions. Error
capture and contact-data redaction remain unchanged; Cloudflare logging retains
its existing sampling configuration.

Because those traces record request URLs whole, `src/sentry.ts` cuts the value
of every `token` query parameter (legacy run routes' subscribe token, `?token=`)
and `apiKey` (a client-sent HERE key) from every string in an event,
transaction, span, and breadcrumb (`token=[redacted]`), and from an object or
pair-list `request.query_string`. It cuts the HERE proxy's `q` and `qq` (what
the user typed, often a contact's address) and `at` and `in` (the user's
location) the same way, since `/geocode` and `/autocomplete` trace at 10%.
Names match as the worker reads them, percent-escapes decoded (`?to%6Ben=` is
`token` to Hono), and without regard to case. A new route that takes a
credential or user data in its query string adds its name to
`SECRET_QUERY_PARAMETERS` (better: take it in a header or body).

## Buddies

`POST /buddies/v1/{op}` is the Buddies relay, built to the wire contract in
[`docs/buddies-protocol.md`](docs/buddies-protocol.md) (the canonical copy is
the repo root's [`../../docs/buddies-protocol.md`](../../docs/buddies-protocol.md)).
Code lives in `src/buddies/`.
`GET /buddies/invite` is the no-app fallback page for invite links (App Store
and Google Play buttons), and the short `/b` serves it for invites already
sent. The AASA matches `/buddies/invite#1…` and `/b#1…`, and
`public/.well-known/assetlinks.json` verifies the whole host for Android App
Links. Clients are iOS and Android
(witness-work ADR 0020).

- **Authentication** (witness-work ADR 0027; "Authentication (sessions)" in
  the protocol): a request with an `Authorization` header is a bearer
  request, and its access token must verify (401 `unauthorized`, never a
  fallback). `inbox/register` sends the token plus its self-signed
  envelope, whose `account` proof is then required (400) and must name the
  token's account (403 `forbidden`). Owner ops send their fields as plain
  JSON, no envelope, `ts`, or `nonce` (`inbox/live` and `blob/put` in
  `x-buddies-payload`, no signature header); the inbox DO compares the
  token's account with its `owner_account` row: another account is 403
  `forbidden`, none 409 `not_linked` (an inbox registered before accounts,
  or whose link isn't confirmed; the app links it with `inbox/register`
  and retries). The row counts only once `confirmed`, meaning D1's
  `account_inboxes` holds the same link, where moderation finds it: the
  Worker passes an existing D1 link along with the registration, and
  confirms a new one (D1's winner, so concurrent claims agree; the loser
  gets 409 `conflict`) only after D1 wrote it. A registration that fails
  between the two leaves the inbox `not_linked` until a retry gets
  through. Rows from before the column (added in place as 0) count as
  unconfirmed: their owner's first bearer owner op gets `not_linked`, and
  the relink confirms it. Writer ops send the
  token plus the writer-signed envelope, still the slot's capability; the
  token's account is never compared with the slot or stored. Invite and
  blob reads send the token plus today's body. Without the header it's a
  legacy request, served byte for byte as before while `auth:legacy` is on,
  and 426 `upgrade_required` once it's off, leaving ops included. One
  exception outlives the switch: the iOS Notification Service Extension
  fetches events too big for a push with an owner-signed `inbox/sync`
  (it can't hold the session's rotating refresh token without racing the
  app) and sends `x-buddies-client: notification-service`. With the switch
  off, the Worker admits that one legacy request (`admitCaller`, as
  `linkedOnly`), and the inbox DO checks the signature, `ts`, nonce, and
  suspension as ever, then serves it only for an inbox with a **confirmed**
  `owner_account` link, else 426. Any other op with the header, or a wrong
  value, is 426 as before; the header changes nothing while the switch is
  on or on a bearer request. Nothing logs it. The live
  upgrade reaches the inbox DO with the token's account in the internal
  `x-buddies-session-account` header, which the Worker always strips from
  client requests (the DO trusts it). Both switches work as before in both
  forms, and so does suspension of the account's own inbox (its owner ops).
  A bearer op that reaches someone else's inbox (`card/put`, `event/put`,
  `invite/claim`: `BUDDIES_SUSPENDED_REFUSED_OPS`) is also refused with 403
  `suspended` when the token's account is suspended, in `admitCaller` after
  the edge limit, from the cached `requireActive` status
  (`refuseInactiveAccount`, 30 s per isolate; the admin route drops its own
  isolate's entry). The target inbox never sees which account wrote, and
  nothing logs or stores it. `slot/leave` and reads stay open. A legacy
  writer op names no account, so a suspended User's legacy writes still get
  through: one more reason to turn `auth:legacy` off before relying on
  suspension. `owner_account` needs no migration (created in
  place at registration, `confirmed` added in place).
- **Inbox successor** (witness-work ADR 0039 §5; the protocol's "Inbox
  successor"): after a key change the app deletes its old inbox with
  `inbox/delete` `{ inboxId, successor }`, and buddies check a
  `pair.reconnect` with `POST /buddies/v1/inbox/successor` `{ inboxId }` →
  `{ ok, successor }` (any account's bearer token, read tier, kill switch
  applies, no legacy form). Code in `src/accounts/inboxSuccessors.ts` and
  `deleteWithSuccessor`/`handleSuccessor` in `route.ts`; D1 table
  `inbox_successors` and `account_inboxes.key_epoch` (migration
  `0008_inbox-successor.sql`, which backfills each link with the epoch its
  account had when it was linked, from `retired_account_keys`: 0 for every
  account that never changed its key; a link made within a second after a
  change counts as the old key's). A link records the epoch of the key
  that verified its proof (read with that key, so a key change landing in
  between leaves it at the old epoch), and a later proof by a newer key
  moves an existing link up (`confirmInboxLink`). Recording is one
  insert-select (`recordInboxSuccessor`) gated on the deleted inbox being
  the token's account's (linked, or already replaced by it), the successor
  being another inbox linked to it at its current epoch with no successor
  of its own, and the caller's session being live at that epoch, after the
  successor's DO said it's registered (`isRegistered`, read-only); then the
  inbox DO deletes, and the deleted inbox's link is dropped
  (`unlinkReplacedInbox`). An inbox with any successor recorded is never
  registered again (409 `conflict` in `checkInboxAccount`, bearer or legacy,
  proof or not; a legacy registration while D1 is down still falls back to
  registering unlinked, as before). A legacy request naming `successor` is 403
  `forbidden`, another account's inbox 403, a suspended account 403
  `suspended` (deleting without a successor still works), an ended session
  401, a bad successor 409 `conflict` with nothing deleted. The first record wins
  while it still qualifies (another successor is 409; the same one
  refreshes it), and one that no longer does (from before a key change) is
  replaced, in the upsert's own `WHERE`. A repeat answers `ok` once the DO
  says `not_found` (`buddies.deleted` is logged only for the real
  deletion), and a DO refusal or a throw drops the record again (a retry
  records it once more). The read checks every time that the successor is
  still linked to the same account at its current epoch and that the
  account isn't suspended, and answers `null` otherwise (so a K1 holder's
  record from before the change is never vouched for after it), or after
  90 days; the hourly cron prunes rows 90 days old. It tells anyone with a
  token who knows the old inbox id that it was replaced, and by which inbox.
  The guarantee holds only after the key change: buddies who accept a K1
  holder's reconnect before it aren't recovered, and the old inbox must be
  linked to the account before the change (the app links it first and
  skips the invites if it can't), since another account holding the old
  key could link an unlinked old inbox and name its own successor.
- **Old-key owner ops** (witness-work ADR 0039): an inbox's owner key comes
  from the account key, so after a key change whoever holds the old key
  could keep reading the old inbox with owner-signed requests until the
  User's device deletes it (never, if that device is gone). So an
  owner-signed (legacy) owner op, `inbox/live` upgrade, or `blob/put` on an
  inbox whose `account_inboxes.first_key_epoch` (the epoch it was first
  linked at; never moves, migration `0009_inbox-first-key-epoch.sql`,
  backfilled from `key_epoch`) is below its account's `key_epoch` is 401
  `unauthorized` with `reason: "key_changed"`, for good, legacy switch on
  or off, the Notification Service Extension's `linkedOnly` sync included
  (`ownedByOldKey` in `route.ts`, `isOldKeyLink` in `inboxSuccessors.ts`).
  A registration with the new key's proof moves `key_epoch` up for
  successors only: the owner key is still the old one's. The old inbox is
  usable only through bearer owner ops, and the app deletes it with a
  successor. A legacy `inbox/register` of it is 401 `key_changed` too,
  proof or not, so the old key can't keep it from ageing out
  (`checkInboxAccount`, after the signature and quota; a legacy
  registration while D1 is down still falls back to registering unlinked).
  It's one D1 read by primary key per such request (a join on `accounts`),
  after the shape and `ts` checks and before the inbox DO wakes, so no
  nonce is spent; never cached, and a D1 failure is a 500, never a pass.
  The Worker can't check the owner signature, so anyone who knows the inbox
  id learns it predates a key change (buddies learn it from the reconnect
  anyway). Unlinked inboxes, workers without `ACCOUNTS_DB`, and bearer
  requests are unchanged.
- **Slot seal** (witness-work ADR 0039 §5; the protocol's "Sealing a
  slot"): the User's writer keys into buddies' inboxes also come from the
  account key, and a writer op is authorized by the writer signature alone
  (a bearer token's account is never compared with the slot; a legacy one
  names none). So after a key change the old key's holder could keep
  writing as the User until the User's device leaves each slot, which it
  delays until the buddy claims the reconnect (or 24 h). `slot/seal` is a
  writer op (`{ inboxId, slotId }` → `{ ok }`; bearer with any session, or
  legacy while `auth:legacy` is on; kill switch and suspension don't stop
  it, like `slot/leave`) that sets `slot.sealed = 1` in the inbox DO (column
  added in place by `#ready`). From then on `#commit` refuses every writer
  op from that slot with 403 `sealed` unless the caller passes
  `whileSealed` (only `slot/leave` and `sealSlot`), so a new writer op is
  refused by default. The check runs inside the write's own transaction,
  after the signature's await, so a racing write lands before the seal or
  is refused. Idempotent, final (nothing unseals; `slot/remove` and `slot/leave`
  still delete it, and a slot added again starts open), `not_found` /
  `gone` for an unknown inbox / slot. The owner's `inbox/sync` lists the
  slot with `sealed: true` (absent when open) and live sockets get one
  `changed`. Nothing else is stored: no account or session. The first seal
  of an open slot skips the writer's signer budget (`#authenticate`), so a
  holder of the key can't spend it to keep the slot open; re-seals count. `slot/leave` of
  a sealed slot (`#departSealedSlot`) drops the slot and its card but keeps
  its events and their `slot_usage` row until retention prunes them (then
  `#prune` drops the orphaned usage row), so the old key's holder can't
  delete the reconnect invite by leaving first; the owner's `slot/remove`
  of the id still deletes them.
- **Bindings** (repeated under `[env.beta]` and `[env.dev]`): `BUDDY_INBOX` (`BuddyInbox`, one
  SQLite DO per `inboxId`), `BUDDY_INVITE` (`BuddyInvite`, one per `inviteId`),
  migration `v3`, `BUDDY_REGISTRATION_QUOTA` (`BuddyRegistrationQuota`, one per
  caller), migration `v6`, six per-caller rate limiters (below), the
  `BUDDY_BLOBS` R2 bucket (photo blobs: `ww-buddy-blobs` prod,
  `ww-buddy-blobs-beta` Beta, simulated on disk locally), and the
  `BUDDIES_ENABLED` var (`"false"` prod, `"true"` Beta and dev) and
  `BUDDIES_PHOTOS` var (`"on"` on Beta and dev only).
- **Abuse limits**: all in `BUDDIES_ABUSE_LIMITS` (`src/buddies/limits.ts`),
  each with its sizing rationale. They only stop scripted abuse; size them
  from the heaviest real use with at least 10× headroom. Hits log
  `buddies: limit hit {op, limit}` (nothing else), so tune from Workers Logs.
  - Per caller, in the Worker before any DO wakes: for a bearer request the
    session's account (`account:` + a SHA-256 of its id, so the limiter never
    sees the id and people behind one NAT stop sharing a budget), else the
    client IP (IPv6 by /64); never the target inbox. The budgets were sized
    per IP, so one account gets the same. `BUDDIES_RATE_LIMITER` 120/min for
    `invite/fetch` + `invite/claim`, `BUDDIES_REGISTER_LIMITER` 60/min for
    `inbox/register`, `BUDDIES_READ_LIMITER` 600/min for `inbox/sync`,
    `inbox/live`, and `inbox/successor`, `BUDDIES_BLOB_PUT_LIMITER` 60/min
    for `blob/put`,
    `BUDDIES_BLOB_GET_LIMITER` 600/min for `blob/get`,
    `BUDDIES_WRITE_LIMITER` 600/min for every other op (namespaces 1002-1007
    prod, 3002-3007 Beta, 2002-2007 local dev; `limits.test.ts` keeps `wrangler.toml` equal to the
    constants). Refusals are 429 `rate_limited`
    with `Retry-After: 60`. Every relay error is `{ok: false, error, code}`
    (`src/buddies/errorResponse.ts`); `rate_limited` and `disabled` always
    carry `Retry-After`/`retryAfter`, computed from the limit's window inside
    the Durable Objects, and `stale` carries `serverTime` and `Date`. The Worker also refuses stale `ts` and badly
    signed `inbox/register` before any DO. A limiter outage lets requests
    through.
  - `inbox/register`: 2,000 validly signed calls per caller (account or IP,
    as above) per rolling day (`BuddyRegistrationQuota`, hourly counts under
    a hashed caller key).
  - Per inbox, after the signature check: stored events per slot (10,000,
    16 MiB) and per inbox (128 MiB). `event/put` past them is 429
    `rate_limited`; nothing stored is dropped. `slot_usage` keeps the running
    totals. Each signer (the owner, or a writer slot) gets 10,000 / 1,000
    requests that take effect per 10 minutes (in memory). Sync pages stop at
    10,000 events as well as 4 MiB.
  - Per inbox, photo blobs: 300 live blobs and 150 MiB live, and 100
    uploads (object writes) per rolling day; `blob/put` past them is 429
    `rate_limited` with `Retry-After` until the soonest blob expires or the
    oldest upload ages out.
  - Only requests that take effect record a nonce, so refused ones add no
    rows; replay protection is unchanged.
- **Secrets** (per environment): `APNS_KEY_ID` and `APNS_PRIVATE_KEY` (the
  `.p8` PEM). `APPLE_TEAM_ID` is the JWT issuer and `IOS_BUNDLE_ID` the
  default APNs topic (a device may register `apnsTopic`, any of
  `IOS_BUNDLE_ID` or `IOS_ADDITIONAL_BUNDLE_IDS`). `FCM_SERVICE_ACCOUNT_JSON`
  is the key of `buddies-fcm-sender@turing-striker-403102`, whose custom role
  `fcmSender` holds only `cloudmessaging.messages.create`; its `project_id` is
  the Firebase project. A copy is in the 1Password Agents vault ("Buddies FCM
  sender service account key (ww-api)"). Without the APNs secrets or the FCM
  key the relay still works but skips that service's pushes, logging once per
  isolate.
- **Kill switch**: KV `buddies:enabled` in `NOTES_KV`. `"true"` enables, any
  other value disables, and an absent key falls back to `BUDDIES_ENABLED`. The
  read is edge-cached for 60 seconds. `inbox/delete`, `slot/remove`, and
  `slot/leave` work even when disabled.
- **Photo blobs** (photos in Plan notes; contract in the protocol's "Photo
  blobs"): `POST /buddies/v1/blob/put` takes the raw sealed bytes as its body
  with the owner-signed envelope (op `blob/put`) in `x-buddies-payload` /
  `x-buddies-signature`; the Worker reads at most 1 MiB, recomputes
  `blobId = b64u(SHA-256(body))`, and hands the bytes to the sender's inbox
  DO, which checks the signature, nonce, and caps and writes R2 object
  `v1/<inboxId>/<blobId>`. `blob/get` (unsigned; the read token is the
  capability, only its hash is stored) streams the object back with
  `Cache-Control: no-store`; every miss is the same 404. `blob/delete` is an
  owner op, and only an inbox with a slot (a buddy) can put (`no_buddies`).
  Bookkeeping is the inbox's `blob`, `blob_upload`, `pending_blob_delete`,
  `blob_delete_backoff`, and `blob_sweep` tables (created in place on first
  use, no wrangler migration). The inbox alarm deletes blobs at `expiresAt`,
  retries failed R2 deletes after 1 min doubling to 6 h, and sweeps the
  inbox's `v1/<inboxId>/` prefix weekly for objects with no row; a failed put
  keeps its unwritten row 10 min so its expiry deletes an object that landed
  anyway. `inbox/delete` and the 180-day wipe delete every blob and list the
  prefix for leftovers. `expiresAt` is at most 90 days out and a re-put that
  moves it rewrites the object, so no live object is older than 90 days and
  the bucket's 91-day lifecycle rule (`scripts/r2-lifecycle.mjs`, run by every
  deploy) is only a backstop. Switch: KV `buddies:photos` in `NOTES_KV`, `"on"` (or `"true"`)
  enables, any other value disables, absent falls back to `BUDDIES_PHOTOS`
  (Beta and dev `"on"`, prod unset = off); edge-cached 60 s. Off (or no bucket bound),
  all three return 503 `photos_disabled` and `inbox/sync` reports
  `capabilities.photos: false`, the flag the app gates its photo picker on.
  Buddies' own switch wins (`disabled`).
- **Push**: each device registers `pushService` `apns` (iOS; the default) or
  `fcm` (Android), stored in the inbox's `push_device` table (inboxes from
  before FCM move their `device` rows there on first use). `src/apns.ts` is
  the feature-neutral APNs sender (provider token cached in KV
  `apns:provider-token`, per-device topic, one outcome per notification, one
  retry for network errors, 429, 5xx, and rejected provider tokens).
  `src/fcm.ts` is its FCM HTTP v1 counterpart (OAuth token from
  `src/googleAuth.ts`, cached per isolate; one retry for network errors, 429,
  5xx, and a rejected token). `src/buddies/push.ts` builds both payloads,
  routes each device to its service, and deletes devices either reports as
  unregistered. Other features should build on `sendApnsNotifications` and
  `sendFcmNotifications`, not on the Buddies layer. Every alert's `ww`
  marker carries the event's `seq` and, when it fits (APNs 4 KB, FCM 4,000
  bytes of data), the still-sealed event (`eventId`, `blob`), so the app can
  name the sender without the relay seeing a name. APNs alerts carry the
  device's generic template with `mutable-content: 1` (the app's Notification
  Service Extension rewrites it) and `content-available: 1` so iOS can wake
  the app to sync; badge news (`BUDDIES_PASSIVE_PUSH_KINDS`) is passive, with
  no sound. FCM messages are data-only and high priority. A device registered with
  `appAlerts: true` (builds with named alerts) gets the template as
  `fallbackTitle`/`fallbackBody` and no `title`/`message`, so
  expo-notifications shows nothing itself and the app's background task posts
  the alert; any other device gets `title`/`message`, which expo-notifications
  shows, so the relay can ship ahead of the app (`push_device.app_alerts`,
  added in place to older inboxes). Invitations and answers (`isImmediatePushKind` in `contracts.ts`)
  skip the 60 s per-slot spacing but still count toward the daily cap.
- **Live socket**: `GET /buddies/v1/inbox/live` upgrades to a WebSocket. The
  owner-signed envelope (op `inbox/live`) rides in the `x-buddies-payload`
  and `x-buddies-signature` headers. The inbox DO accepts it with the Hibernation API
  (`ping` gets `pong` without waking it, at most 10 sockets per inbox) and
  sends `{"type":"changed","seq":…}` after each write that changes
  `inbox/sync`. Sentry events drop `x-buddies-*` headers. Under `wrangler
  dev`, the TCP connection lingers about 10 s after a server-sent close frame;
  the frame itself arrives at once. Browsers offer a live ticket naming the
  inbox as a subprotocol entry instead
  ([Browser live sockets](#browser-live-sockets)).
- **Privacy**: every id travels in the body (for the live socket, in headers;
  never the URL). Never log or report bodies, headers, blobs,
  ids, account ids, or tokens (access tokens included; Sentry drops
  `Authorization`, `Sec-WebSocket-Protocol`, and `x-buddies-*`). APNs and FCM requests use the `fetch` captured before
  Sentry wraps the global, so device tokens in APNs URLs stay out of Sentry
  spans (FCM tokens travel only in request bodies). The Beta worker's 100%
  Workers traces do record subrequest URLs, APNs included.
- **Not yet built** (required before any production rollout): bearer
  requests are attested once, when their session opens (App Attest or Play
  Integrity), so nothing per request is needed for them; legacy requests
  stay unattested until the legacy switch is off (`attest` is accepted and
  ignored), which is the remaining step before production. The protocol's durable push outbox (retries for
  6 h, outcome history, deferred instead of dropped alerts inside the 60 s
  spacing, `apns-expiration`) is specified but not built either;
  today each push gets one immediate attempt plus one retry.

Secrets: `APNS_KEY_ID`, `APNS_PRIVATE_KEY` (`< AuthKey_XXXXXXXXXX.p8`), and
`FCM_SERVICE_ACCOUNT_JSON` (`jq -c . buddies-fcm-sender.json | wrangler secret
put FCM_SERVICE_ACCOUNT_JSON`), each with `--env beta` for Beta. Buddies stays
off in prod (`BUDDIES_ENABLED = "false"`) until the KV key flips it.

Every deploy runs `scripts/r2-lifecycle.mjs` first, which creates the photo
bucket if it's missing (a deploy naming a missing bucket fails) and sets its
rules (`v1/` objects deleted 91 days after their last write); the API deploy
workflow's `CLOUDFLARE_API_TOKEN` needs **Workers R2 Storage: Edit**.
`node scripts/r2-lifecycle.mjs <bucket> --check` only reads.

```bash
# Production photos stay off until:
wrangler kv key put --binding NOTES_KV buddies:photos on
# Off again (stored blobs stay until they expire):
wrangler kv key put --binding NOTES_KV buddies:photos off
```

## Accounts

Anonymous accounts (witness-work ADR 0024, `../../docs/accounts-protocol.md`):
one row per User, with no name, email, or phone number. The server mints a
random `accountId` and stores only the public key of the account signing key,
which every device derives from the User's account key. Accounts let us
suspend someone for abuse; later phases add moving between iOS and Android.
Code in `src/accounts/`, schema in `src/accounts/schema.ts` (Drizzle on D1).

**The account is the source of truth for who a User is** (witness-work ADR
0027). Every user-scoped route identifies the caller by the `accountId` of an
attested session's bearer token, through the `requireAccount()` middleware,
and keys its authorization, metering, limits, and audit records on that id.
Don't add a route that trusts a client-sent install id, RevenueCat id, or
inbox id to say who the User is, or that builds its own signed envelope or
per-request attestation: attestation happens once, when a session opens
(`POST /accounts/v1/sessions`). Feature ids (inboxes, backup slots, imports)
belong to an account. The RevenueCat identity is being linked to the account
so Supporter status is kept in step from RevenueCat webhooks and answered from
the account, not from an id the app sends. The pre-session ways of
authenticating survive only behind the legacy switch (`auth:legacy`), for app
versions from before sessions.

- `GET /accounts/v1/account`: Bearer, read-only. Returns the token's
  account (`accountId`, `accountPub`, `status`, `createdAt`, `keyEpoch`,
  `inboxIds`, and `statusChanges` without their reasons) for Settings →
  Account and the developer tools. Counts against the Buddies read edge tier.
- `POST /accounts/v1/account/register` (legacy): self-signed under the
  `ww-account/v1` context; idempotent per key. Counts against the Buddies
  register edge tier and the per-caller daily quota. Replaced by opening a
  session; 426 `upgrade_required` once the legacy switch is off.
- `POST /accounts/v1/account/info` (legacy): `GET /account`'s answer for
  builds before it. A bearer request with no body reads the token's account;
  while the legacy switch is on it also takes the old self-signed envelope
  (op `account/info`), where an unregistered key is 404 `unknown_account`.
- `inbox/register` takes an optional `account: { accountId, signature }`
  (required in a bearer request, for the token's account), the account
  key's signature over the inbox id and owner key. The link
  (`account_inboxes`) is written only after the inbox accepted the
  owner-signed registration, so it takes both keys (Option A in the ADR).
- A suspended account's inboxes refuse every owner op except `inbox/delete`
  and `slot/remove` with `403 suspended`, and its live sockets close with
  4003. The database is the authority (registration checks it); each inbox
  keeps a copy so its hot path never reads D1. Its bearer writes into
  buddies' inboxes and invite claims are refused too, by the Worker from the
  token's account (Buddies → Authentication); legacy ones can't be.

Without the `ACCOUNTS_DB` binding, accounts are off: every accounts route
answers `disabled` and proofs are ignored. Prod uses `ww-accounts`, Beta
`ww-accounts-beta`; local dev's `ww-accounts-dev` exists only on disk.

```bash
# Schema change: edit src/accounts/schema.ts, then
pnpm db:generate --name <change>
wrangler d1 migrations apply ww-accounts-dev --env dev --local   # local (the verify loop does this on `up`)
# Beta and prod: the API deploy workflow (.github/workflows/api-deploy.yml)
# applies them before it deploys the Worker. Before a deploy by hand:
#   wrangler d1 migrations apply ww-accounts-beta --env beta --remote
#   wrangler d1 migrations apply ww-accounts --remote
```

Moderation, with `x-ww-admin-token: $ADMIN_API_TOKEN` (404 without it). The
tokens are in 1Password's Agents vault, "ww-api admin token (prod)" and
"(beta)"; locally, the launcher's own token (`.verify/state.json`):

```bash
# A report names the buddy's inboxId; find the account behind it.
curl -sX POST "$BASE/admin/accounts/lookup" -H "x-ww-admin-token: $TOKEN" \
  -H 'content-type: application/json' -d '{"inboxId":"<22 chars>"}'
# Suspend (reason: report | automated | appeal | admin); "active" reinstates.
curl -sX POST "$BASE/admin/accounts/status" -H "x-ww-admin-token: $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"accountId":"<22 chars>","status":"suspended","reason":"report"}'
```

`/status` records every change in `account_status_events` and updates each
of the account's inboxes. If `inboxesFailed` is above 0, send the same
request again. Routes that refuse suspended accounts through
`requireAccount({ requireActive: true })` (and Buddies' bearer writer ops)
see the change within 30 seconds (per-isolate cache), at once in the
isolate that served `/status`.

### Sessions and bearer tokens

Attest once, then bearer tokens (witness-work ADR 0027; "Sessions" in 
`../../docs/accounts-protocol.md`). Code in `src/accounts/session.ts` (handlers),
`attestation.ts`, `tokens.ts`, `sessionStore.ts`, and `auth.ts`.

| Route | What |
| --- | --- |
| `POST /accounts/v1/sessions` | Open a session: self-signed, attested; 201. With `renews` and Bearer, renew one |
| `POST /accounts/v1/sessions/refresh` | `{ refreshToken, appVersion?, capabilities? }` → new token pair |
| `DELETE /accounts/v1/sessions/current` | Bearer; end the token's session |
| `GET /accounts/v1/account` | Bearer; the token's account |
| `GET /accounts/v1/sessions`, `POST …/sessions/revoke` | Bearer; devices ([Activity and devices](#activity-and-devices)) |

- **Attesting**: `POST /attestation/v1/challenge` with purpose
  `account-session`, App Attest v2 `assert` (the install's key, bound
  through `/attestation/v1/register`) or Play Integrity v1, with
  `contentHash` = `requestHash` = `hex(SHA-256(UTF-8("ww-account/v1/session\n"
  + accountPub)))`. The answer rides in the open request's `attestation`.
- **Open**: an envelope (`{ payload, signature }`, op `session/open`)
  self-signed by the account key like `account/register`, carrying that
  attestation. Its hashes must name the envelope's own key and purpose (400
  `bad_request` otherwise); `verifyAttestation` checks the rest. Creates the
  account if needed, stores a session, and answers 201 with `Location:
  /accounts/v1/sessions/current` and `{ ok, accountId, status, sessionId,
  accessToken, accessExpiresAt, refreshToken, sessionExpiresAt }`. A refused
  attestation is 403 `attestation_failed` with the attestation routes'
  `reason` and `action`. Optional sealed `device` label (≤ 512 chars, else
  `too_large`), stored opaque. Optional `appVersion` and `capabilities`
  (at most 16 names of ≤ 32 chars, `a-z0-9-`; unknown names dropped,
  malformed is `bad_request`), stored on the session; `sync-everyone` is
  the only one so far ([Cloud Sync](#cloud-sync)). An eleventh live session ends the account's
  oldest. Limits: the register edge tier, and 20 a rolling day per account
  key (`BUDDY_REGISTRATION_QUOTA` under a hashed `session-open` name),
  counted before the attestation.
- **Renew**: the open's request plus `renews` (the live session's id) in
  the signed payload and that session's access token as `Authorization:
  Bearer`, so a stolen Bearer alone can't extend a session: it takes the
  account key and a fresh attestation, as an open does. The app renews in
  its session's last 30 days (its own window; the server doesn't enforce
  one), so its phone doesn't show up as a new sign-in every 90 days. Checked before the attestation is spent (`renewableSession`
  in `session.ts`): the token is that session's and live
  (`requireLiveSession`), a phone's (never `web`, which slides instead), and
  `accountPub`'s account's; after it, the attested platform must be the
  session's. Any of those is 401 `unauthorized` and the app keeps its
  session until it ends, then opens as usual. One batch
  (`prepareSession`'s `renews`): the new session's insert (only while the
  old one is still live, so of two renewals one wins), `session.renewed`
  (session the new one, actor the old one, `method` as for an open; no
  `session.opened`), the old one ended `renewed` (a refresh of it is 401
  `reason: renewed`), and only then the cap, so a renewal never replaces
  another device's session. The new session gets a full 90 days and keeps
  the old one's account and platform, and its label, app version, and
  capabilities unless the request sends new ones. Phones never step up
  (`STEP_UP_EXEMPT`), so no step-up carries over. Counts toward the 20 opens
  a day.
  - **A successor nobody holds**: when the renewal's answer is lost, or the
    app is stopped before saving it, the device keeps presenting the old
    session's refresh token. A refresh with that session's current (or just
    replaced) token, refused `renewed`, also ends the session that renewed it
    (found through `session.renewed`, `renewedBy`) with `session.signed_out`,
    only while that one was never refreshed (`rotated_at IS NULL`), so it
    doesn't sit live for 90 days counting toward the cap. A successor its
    device refreshed is left alone. The app also closes a renewal it couldn't
    save.
  - **Signing out an old id**: `POST /sessions/revoke` for a session that
    ended `renewed` follows `session.renewed` (up to 8 renewals) to the live
    successor and signs that out, or the caller itself when the successor is
    its own session, since a device list read before the renewal names the
    old id.
- **Refresh**: plain JSON `{ refreshToken, appVersion?, capabilities? }`;
  each one sent replaces the session's. A refresh token is
  `<sessionId>.<secret>.<mac>` (b64u, 16, 32, and 32 bytes; opaque to the
  app), so the session is found by id. The MAC is HMAC-SHA256 over
  `<sessionId>.<secret>` under its own key from `ACCOUNT_TOKEN_SECRET` (or
  the previous secret), proving the worker issued it: the session id is no
  secret (every access token's `sid`), so a made-up token for it must not
  end the session. A malformed token, or one whose MAC doesn't verify
  (two-part tokens from before the MAC included), is 401 before any D1
  read and ends nothing. Each refresh replaces the token with one derived
  from it (HMAC under another key from the secret), with a compare-and-swap
  on the hash it read, so the row rotates once and every refresh presenting
  the same token gets the same next one. The one just replaced gets it
  again for 60 seconds from its rotation (a lost response, or two refreshes
  at once; retries don't extend it and write nothing), so a device's double
  refresh can't strand it with a dead token. Presenting it later, or any older token of a
  live session that carries a valid MAC, ends the session, and logs
  `accounts: refresh token reused` with `predecessor` (the token just
  replaced, as a device that lost a refresh's answer presents, or an older
  one), `sinceRotationSec`, and `platform`: no ids or tokens. An unknown,
  ended, or expired session is 401 `unauthorized`; a refresh that lost its
  rotation race to a session that has since moved on again is 401 without
  ending it. Phone sessions last 90 days from opening and refreshing never
  extends them; a web session (platform `web`, opened with a ticket: see
  [Passkeys and web sessions](#passkeys-and-web-sessions)) lasts 180 days
  from its last refresh, with no absolute limit. A refusal carries `reason`
  (`REFRESH_REFUSALS`). Read edge tier.
- **Close**: `DELETE /sessions/current`, Bearer, no body; ends the token's
  own session, idempotent. Read tier. Session ids never go in URLs.
- **Storage**: D1 `account_sessions` (migration
  `migrations/accounts/0001_account-sessions.sql`): id, account, platform
  (`ios`, `android`, `dev`, `web`), sealed device label, SHA-256 of the current
  and previous refresh token, and times. No install id, App Attest key,
  `accountPub`, or IP. The hourly cron deletes sessions a week after they
  were revoked or expired.
- **Access tokens**: HS256 JWTs, 15 minutes (never past the session's end),
  claims `sub` (account), `sid` (session), `platform`, `kep` (the
  session's key epoch; absent counts as `0`), `iss`
  `ww-api/<APP_ATTEST_ENVIRONMENT>`, `aud` `ww-account`, `iat`, `exp`.
  Nothing is stored; a token is valid until it expires, so closing a
  session stops its refresh token at once and its access token within 15
  minutes, except on the security surfaces (`requireLiveSession`, below),
  which refuse it at once. Without a usable `ACCOUNT_TOKEN_SECRET` (at least 32 characters)
  the session routes are 503 `disabled` and no bearer token passes.
- **Dev bypass**: on a local development worker (`pnpm dev`, the verify
  loop), `x-ww-dev-bypass` with `NOTES_IMPORT_DEV_BYPASS_TOKEN` stands in for
  the attestation (platform `dev`; `src/devBypass.ts`). Beta and production
  ignore it (and fail loudly if the token is set there), and a `dev` token
  never verifies there.

`ACCOUNT_TOKEN_SECRET` takes a different value per worker (prod, Beta); keep a
copy in 1Password's Agents vault ("… (prod)", "… (beta)"), since a rotation
needs the old value:

```bash
openssl rand -base64 32 | wrangler secret put ACCOUNT_TOKEN_SECRET   # add --env beta for Beta
# Rotation: move the current value to the verify-only slot, then set a new
# one. Its kid is derived from the secret, so old tokens keep verifying.
wrangler secret put ACCOUNT_TOKEN_SECRET_PREVIOUS   # the old value
openssl rand -base64 32 | wrangler secret put ACCOUNT_TOKEN_SECRET
# Routine rotation: after 90 days (the longest a session lasts). After a
# leak: at once.
wrangler secret delete ACCOUNT_TOKEN_SECRET_PREVIOUS
```

The previous slot keeps access tokens verifying for their 15 minutes and,
because refresh tokens carry a MAC under the secret, keeps refresh tokens
issued under the old secret refreshing; each refresh signs its replacement
under the new one. Once the slot is gone, a device still holding an old
refresh token gets 401 and opens a new session (attesting again), so
deleting it before 90 days sends every device that hasn't refreshed since
the rotation through a new session, and skipping it sends every device.
After a leak that's what you want: the old secret could mint access tokens
and MACs. Local
`wrangler dev` reads `ACCOUNT_TOKEN_SECRET` from `.dev.vars`
(`.dev.vars.example`); the verify launcher and the test harness set their
own.

Building a route on accounts (`src/accounts/auth.ts`):

- `requireAccount(options?)`: Hono middleware for bearer-only routes. Sets
  `c.var.account = { accountId, sessionId, platform }` (read it with
  `accountOf(c)`). `{ requireActive: true }` also refuses a suspended
  account with 403 `suspended` (one D1 read, cached 30 s per isolate).
  `{ requireLiveSession: true }` also refuses a token whose session has
  ended (signed out, revoked, replaced, expired, or deleted) with the same
  401 `unauthorized` and `WWW-Authenticate` an expired token gets, so the
  app's refresh → 401 → open path signs it back in. One D1 read
  (`liveSessionKeyEpoch`), **never cached**: revocation bites at once. The
  same read compares the token's `kep` with the session's `key_epoch`: a
  token from before the session's key change is 401 `unauthorized` with
  `reason: "key_changed"` (the app refreshes). Use it on security surfaces a
  signed-out device must not act on in its token's last 15 minutes: today
  `GET /sessions`, `POST /sessions/revoke`, `GET /activity`, `GET /account`
  (and `account/info`'s bearer form), `handoff/open` and `handoff/send`, the
  passkey routes, `account/rekey`, `account/key-history`, and every write
  of re-sealable data:
  `sync/put`, `sync/delete`, `sync/photos/put`, `sync/photos/delete`,
  `backup/put`, `backup/delete` (ADR 0039). Leave it off hot paths (Buddies,
  Notes Import, route planning, backup list/get, Cloud Sync reads,
  Supporter, handoff status/cancel), where ADR 0027's 15 minutes stand, and
  off `DELETE /sessions/current`, which must always succeed.
- `authenticateAccount(c, options?)`: the same check as a call, for routes
  that order their own gates (`GET /account` counts its edge tier first).
  Returns `{ ok: true, account }` or `{ ok: false, error, response }`
  (`unauthorized`, `suspended`, `disabled`, `internal`), so routes with
  their own error format can map `error`.
- `bearerOrLegacy(c, { bearer, legacy }, options?)` (and `accountCall`'s
  last argument): for converted routes.
  A request with an `Authorization` header is a bearer request, always (a
  bad token is 401, never a fallback to the envelope). Without one, `legacy`
  runs while the legacy switch is on, else 426.
- `isLegacyAuthEnabled(env)` and `refuseLegacyAuth(env)`
  (`src/accounts/legacySwitch.ts`) for legacy-only paths.
- `unauthorized` (401, always with `WWW-Authenticate: Bearer
  error="invalid_token"`), `upgrade_required` (426, no `Retry-After`), and
  `attestation_failed` (403) are in the shared Buddies codes
  (`buddiesErrorResponse`).
- Name new routes as resources (REST), with ids out of URLs; document the
  bearer requirement with `security: [{ bearerAuth: [] }]` in the route's
  `openapi.ts`.
- Tests: `createHarness()` turns sessions on by default, `openTestSession()`
  in `src/test/accounts.ts` opens one with the bypass, and `requestJson()`
  sends any method.

**Privacy**: never log or report access or refresh tokens, account ids,
session ids, or device labels. Sentry drops `Authorization` and
`Sec-WebSocket-Protocol` (a browser socket's ticket). Drizzle's
query errors quote the query's parameters (ids, token hashes), so report a
caught error with `captureFailure(error, operation)` (`src/sentry.ts`),
never `Sentry.captureException`: a database error, or one it caused, goes
out as a `DatabaseError` naming the operation only. As a backstop,
`beforeSend` cuts `Failed query:`, `params:`, and `D1_…:` text from every
string and drops the exceptions chained under it.

### Browser live sockets

Browsers can't set headers on a WebSocket (witness-work ADR 0038 §10), so a
web client authenticates `GET /accounts/v1/sync/live` and
`GET /buddies/v1/inbox/live` with a live ticket in `Sec-WebSocket-Protocol`
(code in `src/liveSubprotocol.ts` and `src/accounts/liveTickets.ts`). A
request with that header takes this path; one without it takes the native
header path, unchanged.

**Why a ticket, not the access token:** `wrangler tail`, and so Workers Logs,
records `Sec-WebSocket-Protocol` in full, while it redacts `Authorization`.
A 15-minute access token there would be a credential in Cloudflare's logs.
A ticket that lands there names no id (its claims are encrypted), opens one
socket kind for one id for 30 seconds, one socket at a time, and calls no
other route.

| Step | Wire |
| --- | --- |
| Mint | `POST /accounts/v1/live/ticket` (Bearer, live session) `{ "socket": "sync" \| "buddies", "id": "<slotId \| inboxId>" }` → `{ "ok": true, "ticket", "expiresAt" }` |
| Cloud Sync | `Sec-WebSocket-Protocol: ww.v1, ticket.<sync ticket>` |
| Buddies | `Sec-WebSocket-Protocol: ww.v1, ticket.<buddies ticket>` |

- **The ticket**: `b64u(iv ‖ AES-256-GCM(UTF-8 JSON claims)).b64u(HMAC-SHA256)`,
  466 characters: the claims are padded with spaces to 288 bytes, so the
  length shows neither the socket nor the id's. A random 12-byte IV; the MAC covers the
  first part. Two keys from the Worker secret `LIVE_TICKET_SECRET`, each the
  SHA-256 of its own label and the secret (`ww-live/v1/ticket-cipher`,
  `ww-live/v1/ticket`), as `ACCOUNT_TOKEN_SECRET`'s derived keys are.
  Claims, epoch seconds: `typ` `ww-live`, `iss`
  (`ww-api/<APP_ATTEST_ENVIRONMENT>`), `sub` (account), `sid` (session),
  `platform`, `socket`, `id`, `tokenExp` (the access token's `exp`), and
  `exp` (30 s after minting, or `tokenExp` if sooner). `expiresAt` in the
  answer is `exp` in epoch ms. Nothing is stored.
- **Minting**: `requireLiveSession`, so a signed-out or revoked session
  mints none (401 `unauthorized`); a token with under a second left is 401
  too, so the app refreshes it first. Counts against the read edge tier and
  checks only the id's shape (a sync slot id; a 22-character inbox id), 400
  `bad_request` otherwise; 503 `disabled` without the secret.
- **One open socket per ticket, not single-use**: within its 30 seconds a
  ticket reopens its socket after a drop. But the Worker hands the DO the
  ticket's hash (b64u SHA-256 of its MAC, `x-ww-live-ticket`; it opens
  nothing), the DO keeps it in the socket's attachment (already written on
  connect, so no extra storage write), and refuses a second socket on the
  same hash while one is open with 409 `conflict`, before it accepts
  anything. A logged copy so can't open sockets that push the User's own
  past the cap (`4000`/`4002 "replaced"`). Burning tickets would put a
  Durable Object or KV write in every connect; sockets carry change notices
  only, never data.
- **Session liveness is checked at the mint, not at the upgrade.** Neither
  socket path checks that the session is still live (the native one never
  did); a ticket minted just before sign-out still opens within its 30
  seconds, and the socket closes when the token expires.
- **The secret**: its own value per worker, never `ACCOUNT_TOKEN_SECRET`'s:
  `openssl rand -base64 32 | wrangler secret put LIVE_TICKET_SECRET` (add
  `--env beta` for Beta). Shorter than 32 characters (warned once per
  isolate), or equal to `ACCOUNT_TOKEN_SECRET` or
  `ACCOUNT_TOKEN_SECRET_PREVIOUS` (warned too), it's ignored and tickets are
  off (503 `disabled`). There's no previous slot: rotating it fails the
  tickets minted in the last 30 seconds once, and the app mints another.
  The verify launcher, `.dev.vars.example`, and the test harness set their
  own.
- **Check order on the socket**, all in the Worker before any Durable
  Object: `Origin` in `WEB_APP_ORIGINS`, else 403 `forbidden`, first, so a
  foreign page learns nothing of an offer's shape; then the offer's shape,
  else 400 `bad_request`: a comma-separated list of RFC 9110 tokens,
  trimmed, at most 2,048 characters, `ww.v1` and `ticket.<ticket>` each
  once, nothing else, `ww.v1` present, and no `Authorization` header
  alongside; then the kill switch (503) and, for Cloud Sync, the edge tier
  (429); then the ticket, else 401 `unauthorized` with the
  `WWW-Authenticate` a bad token gets; then the header path's checks in its
  order (Cloud Sync: entitlement, upgrade; Buddies: edge tier, upgrade, the
  inbox's ownership, `not_linked`, suspension); then the DO's 409
  `conflict` for an open ticket. No id goes in the URL, and none reads in
  the offer: the ticket names them, sealed.
- **Verifying the ticket**: length, two parts, the MAC, before anything is
  decrypted or parsed; then the seal, `typ`, `iss`, `socket` (the route's: a
  Buddies ticket never opens Cloud Sync), `exp` and `tokenExp` not passed,
  `exp` no later than `tokenExp`, `exp` at most 30 s and `tokenExp` at most
  one access token lifetime (plus its 60 s `iat` skew) from now, each plus
  5 s of skew, and the claims' shapes. A missing, forged, expired, or
  other-socket ticket is 401; 503 `disabled` without `LIVE_TICKET_SECRET`.
- **The browser can't see any of these statuses**: a failed handshake is
  only a close (1006) to page script. So the web app mints a fresh ticket
  on every connect, never reuses one, and reconnects with backoff; when
  the mint itself answers 401, it refreshes its access token first.
- **Forwarding, Cloud Sync**: the Worker tells the DO who the socket is for
  in a call (`admitLive`: account, session, slot, the token's `kep` and
  expiry, the ticket's hash), and the forwarded upgrade carries only the
  one-use id that call answers with (`x-ww-sync-admission`, good for 30 s).
  Nothing about the caller is in a forwarded header, because **Workers Logs
  record every request header, a forwarded request's too**
  (`$workers.event.request.headers.*`). Don't put an id in a header the
  Worker sets.
- **Forwarding, Buddies**: the DO gets the internal headers it already trusts
  (`x-buddies-session-account` and
  `x-buddies-payload`, built from the ticket's inbox id) plus `tokenExp`
  (epoch ms) in `x-buddies-session-expires-at`,
  and the ticket's hash in `x-ww-live-ticket`. The Worker drops
  `Sec-WebSocket-Protocol` and `Authorization`, so the ticket never reaches
  the DO, overwrites a client's `x-buddies-payload` with
  the ticket's id, and drops a client's copy of the expiry and ticket
  headers on the native path.
- **101**: carries `Sec-WebSocket-Protocol: ww.v1` (a browser fails the
  handshake otherwise); native upgrades get no subprotocol header.
- **Expiry**: the DO keeps `expiresAt` (the access token's, from the
  ticket) in the socket's attachment and closes it with `4004 "expired"`
  once it passes (the app refreshes, mints a ticket, and reconnects).
  Pings are auto-responses that don't wake a hibernated DO, so
  the DO alarm does it: `BuddyInbox` counts each socket's expiry among its
  `#nextDeadline` deadlines; `AccountSync` keeps its next retention run in
  `alarm_schedule.retention_at` and sets the alarm for the sooner of that and
  the soonest expiry, running retention only when it's due (an object from
  before the table treats its pending alarm as retention's). Native sockets
  keep outliving their token, as before.

### Activity and devices

The account's security history and its signed-in devices (witness-work ADR
0028; "Activity and devices" in `../../docs/accounts-protocol.md`). Code in
`src/accounts/activity.ts` (recorder, list, prune), `activityRoute.ts`, and
`session.ts`/`sessionStore.ts` (devices). Table `account_activity`
(migration `migrations/accounts/0002_account-activity.sql`).

| Route | What |
| --- | --- |
| `GET /accounts/v1/activity?limit=&before=` | Bearer; newest first, `nextCursor` |
| `GET /accounts/v1/sessions` | Bearer; live sessions, `current` marks the caller's |
| `POST /accounts/v1/sessions/revoke` | Bearer, `{ sessionId }`; signs a device out |

All three count against the read edge tier and work for suspended accounts.
Revoke is a `POST` so the session id stays out of the URL; another account's
session (or none) is 404 `not_found`, and the caller's own is signed out.

- **Signed-out callers**: all three take `requireLiveSession`, so a session
  that was signed out (or revoked, replaced, or expired) is 401
  `unauthorized` at once, even with an unexpired access token: it can't sign
  the device that signed it out back out, or show a device list without
  itself. Revoke also ends another session only while the caller's own is
  live, in the same D1 statements (`endSession`'s `actorSessionId`), so of
  two devices revoking each other at once only the first wins; the loser
  gets 401 (`RevokeOutcome` `caller_ended`).
- **Ids and cursors** (`src/accounts/activityIds.ts`): `account_activity.id`
  is a global autoincrement, so it never leaves the worker; diffing one's
  own ids would measure everyone's activity. Each entry's `id` (also the
  cursor, `nextCursor`, and `before`) is the row id sealed for its account:
  AES-256-GCM with the account id as associated data and a synthetic nonce
  (HMAC-SHA256 of the account id and row id), 48 base64url characters. It's
  deterministic (an entry keeps its id across pages, which the app keys its
  list on) and unlinkable across accounts. Another account's cursor, a
  forged or altered one, or a bare row id is 400 `bad_request`. The keys
  derive from `ACCOUNT_TOKEN_SECRET` (`activityIds` in `tokens.ts`): ids
  are sealed under the current secret and cursors open under it or
  `ACCOUNT_TOKEN_SECRET_PREVIOUS`, so a rotation changes every id (the app
  reloads its list) and cursors from before it page on while the previous
  slot is set.

- **Kinds**: `account.created`, `session.opened`, `session.renewed` (a
  phone renewed its session: session the new one, actor the old one; not a
  sign-in), `session.signed_out`,
  `session.revoked`, `session.replaced` (the 10-session cap),
  `session.refresh_reused` (a replaced refresh token after its grace minute;
  the app flags it), `handoff.sent`, `backup.deleted` (no `slotId` = all),
  `backup.downloaded` (once per slot, session, and day),
  `account.suspended`/`.reinstated` (never the reason),
  `buddies.inbox_linked` (a new link, in `linkInbox`'s batch),
  `buddies.deleted` (the Worker, after the inbox DO accepted `inbox/delete`;
  never in the DO), `passkey.added`/`.removed`, `device.approved`,
  `account.key_changed` (the session that changed it; the sessions it ended
  are `session.revoked` with it as actor). Writer ops log nothing, so
  nothing ties a writing account to another account's inbox. Expiry,
  refreshes, reads, and uploads aren't logged. Clients skip unknown kinds,
  so adding one is safe.
- **Recording a new action**: add the kind to `ACTIVITY_KINDS`
  (`schema.ts`; no migration, it's a text column), then put
  `activityInsert(db, { accountId, kind, sessionId })` in the action's own
  D1 batch, with `onlyIf` when it should only log a real change. Actions
  outside D1 call `recordActivity`: before an R2 change (backup), or after
  a Durable Object accepted it, reporting a failed write (handoff). Pass the
  bearer session (`c.get('account')?.sessionId`); the platform and sealed
  device label are copied from that session's row, only within the same
  account. Document the kind in `activityListDocs` and the protocol.
- **Retention**: the hourly cron deletes entries over 400 days old
  (`pruneActivity`, beside `pruneEndedSessions`).
- **Privacy**: no IP, location, user agent, content, or anything about
  buddies. Device names stay inside the sealed labels. Never log entries,
  session ids, or slot ids.

### Updates and the legacy switch

`GET /app/v1/config` (no auth, `src/appConfig.ts`) returns `{ ok,
minAppVersion? }`. The value comes from KV `app:min-version`
(`{"minVersion":"x.y.z"}`), then the `APP_MIN_VERSION` var, else it's
absent. Invalid values are logged and ignored, and the KV read is
edge-cached for 60 seconds; the response itself is `no-store`. It has its own per-IP bucket (`app`). App
versions from sessions on read it at launch and on returning to the
foreground, and show Update Required below it. It also carries Cloud
Sync's `sync: { enabled, entitlement }`, where `entitlement` is `everyone`
only when `?capabilities=` (comma-separated) has `sync-everyone`. And it
always carries the caller's coarse location for the app's sales-region check
(witness-work ADR 0041 §3, `../../docs/web-purchases.md`), from Cloudflare's
`request.cf` (`requestRegion`): `country`, the upper-case ISO 3166-1 alpha-2
code, null when unknown (`XX`), Tor (`T1`), or malformed; and `regionCode`,
the ISO 3166-2 subdivision without its country prefix (`MB` for Manitoba),
null when unknown or malformed and whenever `country` is. Null means
unknown: the web app treats `CA` with no `regionCode` as possibly Manitoba or
Saskatchewan, and doesn't sell there. A missing `cf`
gives both null, never an error. Never store or log them.

KV `auth:legacy` (`"off"` or `"on"`; absent falls back to the `AUTH_LEGACY`
var, then on; edge-cached 60 s). **A failed KV read counts as off**
(witness-work ADR 0038 §11): the old ways of signing requests never come back
because KV is down. Beta's and local dev's `AUTH_LEGACY` is `off`; production's
is still `on` until the web launch writes KV `auth:legacy` = `off` (below). The
e2e suites and the fuzzer turn it on in the local launcher's KV for their run,
since production still serves legacy requests. While it's on, converted
routes also take the way they authenticated before sessions. Off, those requests get 426
`upgrade_required`, `account/register` included, except the iOS
Notification Service Extension's owner-signed Buddies `inbox/sync`
(`x-buddies-client: notification-service`) for an inbox with a confirmed
account link (see Buddies → Authentication).

#### Turning off backward compatibility

This is the web launch's runbook (witness-work ADR 0038 §11): requests signed
the pre-session way are refused once the web launches, and app versions
before 1.45.0 (the first that opens sessions) lose Buddies and Notes Import
until they update. Production's `AUTH_LEGACY` var stays `on`; step 3 is what
turns it off, and deleting the key turns it back on. Beta and local dev are
already off by their vars.

Do these in order. Each step takes up to 60 seconds to reach every colo.

Pick `X.Y.Z` as the first version that opens sessions **and** whose
Notification Service Extension sends `x-buddies-client: notification-service`
on its `inbox/sync`. An older extension's fetch gets 426, so its named
Buddies alerts for events too big for the push fall back to the template.

```bash
# 1. Raise the app-wide floor to the first version that opens sessions, so
#    current apps show Update Required before anything is refused.
wrangler kv key put --binding NOTES_KV app:min-version '{"minVersion":"X.Y.Z"}'
# 2. Raise Notes Import's floor too: versions before sessions never read
#    app:min-version, but their composer honors this one.
wrangler kv key put --binding NOTES_KV notes-import:min-version '{"minVersion":"X.Y.Z"}'
# 3. Refuse the old ways of authenticating (426 upgrade_required).
wrangler kv key put --binding NOTES_KV auth:legacy off
```

Add `--env beta` to each for the Beta worker (step 3 isn't needed there; its
var is off). To undo, take them back in reverse: `wrangler kv key delete
--binding NOTES_KV auth:legacy` (back to `AUTH_LEGACY`: on in production, off
on Beta; `put auth:legacy on --env beta` re-allows Beta), then put the previous floors
back, or delete `app:min-version` and `notes-import:min-version` to remove
them.

### Passkeys and web sessions

Passkeys are credentials of an existing account, never an identity of their
own (witness-work ADR 0038; the wire contract is 
`../../docs/passkeys-protocol.md`, implement it as written and list any deviation
in the PR). Code in `src/accounts/passkeys.ts` (handlers),
`passkeyStore.ts` (passkeys, wraps, user handle, used token ids),
`webauthn.ts` (ceremony checks around `@simplewebauthn/server`),
`passkeyTokens.ts` (challenges and tickets), `passkeyConfig.ts` (RP pairs),
`stepUp.ts`, and `rateCounterDO.ts`; docs in `passkeyOpenapi.ts`. Tables
`passkeys`, `passkey_wraps`, `used_token_ids` (migration
`migrations/accounts/0004_passkeys.sql`).

| Route | What |
| --- | --- |
| `POST /accounts/v1/passkeys/challenge` | `sign-in` (no auth) or `step-up` (Bearer) challenge |
| `POST /accounts/v1/passkeys/assert` | Sign-in → account, wraps, `passkey` ticket; step-up → `stepUpAt` |
| `POST /accounts/v1/passkeys/register/options` | Bearer; creation options, mints the user handle |
| `POST /accounts/v1/passkeys` | Bearer + signed `passkey/add`, step-up |
| `POST /accounts/v1/passkeys/wrap` | Bearer + signed `passkey/wrap` |
| `GET /accounts/v1/passkeys` | Bearer; the account's passkeys |
| `POST /accounts/v1/passkeys/remove` | Bearer + signed `passkey/remove`, step-up |
| `POST /accounts/v1/sessions` with `ticket` | A browser's web session, in place of attestation |
| `POST /accounts/v1/web/signup/options` | No auth; Turnstile, caps → the new account's creation options |
| `POST /accounts/v1/web/signup` | Signed `web/signup` by the new key: account, passkey, wrap, web session |
| `POST /accounts/v1/web/recovery` | Signed `web/recovery`; Turnstile → a `recovery` ticket |
| `POST /accounts/v1/approval/{open,status,receive,done,cancel}` | The browser: none (`open`) or `browserToken` |
| `POST /accounts/v1/approval/{claim,status,send,cancel}` | The phone: Bearer of the claiming phone session |

- **Relying party**: vars `PASSKEY_RP_IDS` (comma list; the first is the
  default and the one Android origins pair with) and `PASSKEY_ORIGINS` (JSON
  object from RP ID to its origins, web and `android:apk-key-hash:`). A
  challenge or creation options without `rpId` get the RP ID the request's
  `Origin` pairs with, else the first.
  Production: `app.witnesswork.app`. Beta: `beta.app.witnesswork.app`, its
  own RP ID, so a Beta passkey never shows up when signing in to production,
  and with no Android origins (Android has no Beta app). Local dev:
  `beta.app.witnesswork.app` (a native development build needs a real domain
  for its passkeys, so it borrows Beta's, whose association files list the dev
  app; the passkeys themselves are stored only in the local worker) and
  `localhost` (the local ports). Origin and RP ID are checked as a pair, and
  the authenticator data's `rpIdHash` against the challenge's RP ID. A new
  Android signing key is a var change; the RP ID never changes once the first
  passkey exists.
- **Checks and reasons**: `webauthn.ts` checks, in order, the client data's
  type (a create answering a get is `signature`, a get answering a create
  `registration`) and challenge (`challenge`), the origin pair (`origin`),
  `rpIdHash` (`rp_id`), UP (`user_presence`), UV (`user_verification`), the
  counter (`counter`: synced passkeys' 0 always passes, and the stored
  counter is `MAX(stored, reported)`, never lowered), then the library
  verifies the signature (`signature`) or attestation (`registration`). The route checks the
  credential (`unknown_credential`) and user handle (`user_handle`) first.
  Failed assertions count against 30 per caller IP an hour
  (`AccountRateCounter`, named by an HMAC of the IP under a key from
  `ACCOUNT_TICKET_SECRET`, src/accounts/rateCounter.ts; never a plain hash,
  which anyone could compute for every IPv4 address). `Retry-After` never
  passes the end of the window. Rotating `ACCOUNT_TICKET_SECRET` starts the
  counts over.
- **Challenges and tickets** are stateless HMACs (`passkeyTokens.ts`) under
  their own secrets, with `typ`, issuer, id, and expiry. Using one inserts
  its id into `used_token_ids` in the same D1 batch as what it authorizes
  (`batchUsing`); the hourly cron prunes expired ids. A ticket's session
  open records the session and a hash of the signed request, so the same
  request again within 2 minutes (a lost response) gets the same session and
  the same refresh token: a web session's first one is derived from its id
  (`repeatSession`, no write), or, once refreshed within the minute, the
  token it was replaced by. The first answer's token never counts as
  `reused`. An `approval` ticket opens a session only while the approving
  phone's session (`actorSessionId`) is live.
- **Signed envelopes work once**: `passkey/add`, `passkey/wrap`,
  `passkey/remove`, and bearer `backup/delete` record their envelope's
  nonce (per account key, until `ts` + 5 minutes; `envelopeNonce` in
  `used_token_ids`) in the action's own D1 batch (`backup/delete`: just
  before R2), so a captured envelope is 409 `replay`. `signedForToken`
  (`signed.ts`) checks it first. `session/open` doesn't: a phone's
  attestation is single-use already, and a ticket's repeat is the
  lost-response path. Legacy (pre-session) envelopes are unchanged.
- **Caps are atomic**: the 10th passkey is counted in its own insert
  (`passkeyInsert`), so parallel adds can't pass it.
- **Wrap ids** are unique per credential (`passkey_wraps`' key is
  `(credential_id, wrap_id)`), so another account's id never conflicts with
  or reveals anything about one's own.
- **Web sessions**: platform `web`, sliding 180 days from the last refresh,
  at most 3 per account apart from the phones' 10 (least recently active
  replaced, `session.replaced`), and stepped up when they open. Step-up
  (`refuseWithoutStepUp`; `STEP_UP_EXEMPT` lists the platforms that skip it:
  `ios`, `android`, `dev`) is required of web sessions within 5 minutes on
  passkey add/remove, `backup/delete`, and `account/rekey`. `GET /sessions`
  answers the server's `now` and the caller's `stepUpUntil` (`step_up_at` +
  5 minutes; null with none, and always for the exempt platforms), so a
  browser times the window on the server's
  clock, never its own. Every session
  records `method`, `app_version`, `key_epoch`, and `step_up_at`; refreshes
  refused with 401 carry `reason` (`revoked`, `replaced`, `expired`,
  `reused`, `key_changed`, `renewed` (a phone renewed it), `unknown`;
  `ended_reason` on the row).
  `key_changed` is only a session still live when another session changed
  the account key, and comes with `changedAt`; one signed out or revoked
  before it keeps `revoked` (and one already expired, `expired`), so a browser
  can tell a lost device signed out first (wipe) from one the change ended.
  On a call, `reason: "key_changed"` means something else: the access token
  is from before the session's own key change; refresh and retry.
- **Accounts** gain `passkey_user_handle` (minted with a conditional write),
  `key_epoch` (ADR 0039 raises it; wraps for another epoch are refused),
  `created_via` (`app` or `web`), and `key_changed_at`.
- **Privacy**: never log or report challenge tokens, tickets, registration or
  assertion bodies, user handles, credential ids, wraps, or anything near a
  PRF output (the server never sees one). Sentry drops request bodies
  (`dropRequestBody`). Logs name the op only (`guarded`).
- **Web sign-up** (`webSignup.ts`, `turnstile.ts`): there's no device
  integrity on the web, so sign-up has Turnstile (managed widget, actions
  `web-signup` and `web-recovery`; Siteverify gets `remoteip` and an
  `idempotency_key`, and the answer's action and hostname, one of
  `WEB_APP_ORIGINS`' hosts, must match, except under Cloudflare's test
  secrets on a development worker only), caps, and a kill switch. A
  `turnstileToken` over 2,048 characters is `bad_request`. Caps live in an
  `AccountRateCounter` per network (`capsShardName`: `web-caps:` and an HMAC
  of the ASN, so one request's IP and ASN limits are taken atomically in one
  object): `WEB_SIGNUP_PER_IP_DAY` (3, IPv6 by /64) and
  `WEB_SIGNUP_PER_ASN_HOUR` (30, from `request.cf.asn`; skipped without
  one), checked at `options` (an outage lets it through) and taken at
  `web/signup` before the D1 batch, given back if the batch fails; an outage
  there fails closed (503 `unavailable`, `Retry-After: 30`). Recovery:
  `WEB_RECOVERY_PER_IP_DAY` (10) per IP a day, checked before Siteverify and
  counted only after it passes, so junk can't lock a shared IP out (an outage
  lets it through: the envelope proves the key). Names are HMACs of the IP or
  ASN under a key derived from `ACCOUNT_TICKET_SECRET` and the UTC day
  (`counterName`, src/accounts/rateCounter.ts), each also counting
  yesterday's name so the windows still roll; no IP or ASN is stored. They
  depend on the secret alone, so counts hold across isolates, DO evictions,
  and restarts. Both envelopes work once (409 `replay`).
- **Approving a browser from a phone** (`approval.ts`, `approvalDO.ts`): the
  handoff with the roles turned around, one `AccountApproval` SQLite DO per
  channel (its own class, migration `v11`: roles, auth, lifetimes, location,
  and the ticket all differ from `AccountHandoff`). The browser opens it with
  the verifiers of the phone's `claimToken` and its own `browserToken` and a
  sealed hello; a phone session claims it (web sessions are `forbidden`); the
  claiming session sends the sealed key (logs `device.approved`); the
  browser's first `receive` while `sent` mints an `approval` ticket (the same
  one until it expires); the web session it opens needs the approving
  session still live. 75 seconds unclaimed, 5 minutes from the claim; five
  wrong tokens (claim and browser together) burn a channel in progress, and a
  finished one counts none and keeps its status. `done` and `cancel` keep
  only the status, the token verifiers, and a hash of the claiming session
  (so its phone can still read the status) until the alarm deletes it: the
  blobs, location, account id, and session id go. The DO keeps the browser's
  coarse location from `request.cf` (city, region, country, latitude,
  longitude; never the IP) and `claim` answers it with `far` (another
  country, or more than 200 km by haversine). `open` is 60 per caller IP an
  hour (`AccountRateCounter`, an HMAC name). Channel hashes (`sha256B64u`,
  `tokenDigest`) are shared with the handoff DO in `src/crypto.ts`.
- **Rate counters**: `refuseOverRateCounter` (src/accounts/rateCounter.ts)
  checks or takes limits in a named `AccountRateCounter` for the assert
  failure budget, the web caps, and approval opens: 429 `rate_limited` with
  `Retry-After`, an outage allowing (or, for web sign-up's take, 503
  `unavailable`). Docs are split by tag: `passkeyOpenapi.ts` (Passkeys),
  `webSignupOpenapi.ts` (Web sign-up), `approvalOpenapi.ts` (Approving a
  browser).
- **Web sign-up kill switch**: KV `accounts:web-signup` (`off`/`on`), then
  the `WEB_SIGNUP` var, then on; a failed read counts as on (`readKvSwitch`,
  shared with the legacy switch, whose failed read counts as off). Off refuses
  `web/signup/options` and `web/signup` with 503 `disabled`; recovery isn't
  affected. `GET /app/v1/config` answers `webSignup: { enabled,
  turnstileSiteKey }` (the site key whenever Turnstile is set up, since
  recovery uses it too).

  ```bash
  wrangler kv key put --binding NOTES_KV accounts:web-signup off   # pause (add --env beta)
  wrangler kv key delete --binding NOTES_KV accounts:web-signup    # back to the var
  ```

Secrets, each a different value per worker (prod, Beta), at least 32 characters, never
`ACCOUNT_TOKEN_SECRET`'s; without either, the passkey routes and ticket
sessions answer `disabled`. Keep a copy in 1Password's Agents vault. Rotating
one invalidates challenges (≤ 10 minutes) or tickets (≤ 2 minutes) in flight,
and rotating `ACCOUNT_TICKET_SECRET` also starts the rate counters (assert
failures, web caps) over, nothing else, so there's no previous slot:

```bash
openssl rand -base64 32 | wrangler secret put PASSKEY_CHALLENGE_SECRET --env beta
openssl rand -base64 32 | wrangler secret put ACCOUNT_TICKET_SECRET --env beta
# Production (the owner, at the launch):
openssl rand -base64 32 | wrangler secret put PASSKEY_CHALLENGE_SECRET
openssl rand -base64 32 | wrangler secret put ACCOUNT_TICKET_SECRET
```

Turnstile: the widget's site key is the `TURNSTILE_SITE_KEY` var and its
secret the `TURNSTILE_SECRET_KEY` secret. A development worker without them
uses Cloudflare's test keys (site key `1x00000000000000000000AA`, secret
`1x0000000000000000000000000000000AA`, which pass any token for any host);
that is the local worker only. Beta and production without them have web
sign-up and recovery off (`disabled`). **Beta has no Turnstile widget yet**,
so web sign-up and recovery answer `disabled` there, as in production. The
widget runs only in the web app's Turnstile frame
(`../../docs/web-turnstile.md`), never on the app's own host, so under a real secret
Siteverify's hostname must be in the `TURNSTILE_HOSTNAMES` var
(`verify.witnesswork.app`; Beta `verify-beta.witnesswork.app`, bare hostnames,
lowercased; an entry with `/` or `:` is ignored with an error in the log).
Unset, web sign-up and recovery are off (`disabled`, and `GET /app/v1/config`
says `webSignup.enabled: false`) rather than failing every token; only a
development worker on a test secret needs none. To set up a widget (dashboard
→ Turnstile, or the API with a token that has Account › Turnstile › Edit):
managed mode, hostname `verify.witnesswork.app` for production,
`verify-beta.witnesswork.app` for Beta, and nothing else; put the site key in
`[vars]` or `[env.beta.vars]` next to `TURNSTILE_HOSTNAMES`, then:

```bash
wrangler secret put TURNSTILE_SECRET_KEY --env beta  # paste the widget's secret
wrangler secret put TURNSTILE_SECRET_KEY             # production (the owner)
```

The verify launcher sets synthetic ones; `src/e2e/passkeys.e2e.test.ts`
drives the routes with a software authenticator (`src/test/webauthn.ts`), and
`src/e2e/webSignup.e2e.test.ts` signs up and recovers against the real
Siteverify with the test keys. `TURNSTILE_SECRET_KEY=2x0000000000000000000000000000000AA
node scripts/verify/dev.mjs up` makes every token fail (`3x…` answers "already
spent").

### Changing the account key

The same account under a new key (witness-work ADR 0039; the wire contract
is `../../docs/account-key-change.md`, implement it as written and list any
deviation in the PR). Code in `src/accounts/rekey.ts`; retired keys in
`store.ts` (`refuseRetiredKey`, `isRetiredKey`, `registerAccount`). Tables
`retired_account_keys` and `account_key_history`, and
`accounts.key_changed_at` (migration
`migrations/accounts/0006_account-key-change.sql`).

| Route | What |
| --- | --- |
| `POST /accounts/v1/account/rekey` | Bearer, live session; signed by the old key (op `account/rekey`) and the new (`newSignature`) → `{ ok, keyEpoch, accessToken, accessExpiresAt }` |
| `GET /accounts/v1/account/key-history` | Bearer, live session → `{ ok, keyEpoch, history }` (the sealed blob, or `null`) |

- **Who may**: phone sessions (`STEP_UP_EXEMPT`) at any age; a web session
  at least 24 hours old (403 `session_too_new`) with a step-up in the last 5
  minutes (`step_up_required`). Suspended accounts may.
- **One batch**, every statement after the swap gated on it having landed
  (`committed`: the account now has the new key, the new epoch, and this
  request's `key_changed_at`): the envelope's nonce (each works once, 409
  `replay`; no idempotent retry, the device refreshes and reads
  `GET /account`), the swap (a compare-and-swap on `account_pub` and
  `key_epoch`, also requiring the caller's session live, the new key never
  retired, and the limits), the retired key, the caller's session (new
  epoch, re-sealed `device`), `session.revoked` for and the end of every
  other live session (`ended_reason` `key_changed`; already ended ones keep
  theirs), every wrap deleted and `passkeyWrap` (only the session's
  step-up credential, a phone's too, else 404 `not_found`) stored at the
  new epoch, the history upserted, the account's RevenueCat customers
  locked and unlinked elsewhere (`keyChangeSupporterStatements`, ADR 0039
  §9; see Supporter), and `account.key_changed`. A lost swap is read
  again: a moved key or epoch is 409 `conflict` with the account's
  `keyEpoch` (another device won); a caller session that ended meanwhile is
  401 `unauthorized` with its `reason` (`revoked`, `replaced`, `expired`),
  so the app never drops its new key for a change nobody made. Then every
  Cloud Sync socket of the account closes with `4005 "key_changed"`
  (`closeForKeyChange`); the caller reconnects with the answer's token.
- **Retired keys** never open a session or make an account: `POST /sessions`
  (attested and every ticket), legacy `account/register`, `web/signup`, and
  `web/recovery` answer 403 `key_retired` with `changedAt`. The checks run
  before the attestation or ticket, and again inside the writes: a session
  row is inserted only while its key and epoch are still the account's
  (`prepareSession`), and an account only while its key isn't retired, so a
  key change racing a session open can't leave either behind.
- **Opening into a known account**: `POST /sessions` takes an optional
  `accountId` in its payload; then it opens only when `accountPub` is that
  account's current key (404 `unknown_account` otherwise) and never creates
  an account. A device resolving an interrupted key change uses it.
- **Re-sealing** (`sync/put` with `x-ww-reseal: 1`): it needs a strong
  quoted-ETag `If-Match` (`bad_request` without one or with a weak `W/"…"`
  one), so it never replaces bytes written after the device read the slot. Within 7 days of the account's last key
  change (`forbidden` otherwise), an existing slot (`precondition_failed`
  otherwise) takes the new bytes but keeps its session, platform, and
  `updatedAt` (in the DO and in R2's `customMetadata`), so retention and the
  Cloud Sync request see no new write.
- **Limits**: 3 changes per account a rolling day and 10 a rolling 30 days,
  counted from `account.key_changed` entries (checked first for
  `Retry-After`, and again in the swap's own statement), plus the register
  edge tier.
- **Buddies**: inbox links record the key epoch whose key signed them, and
  `inbox/delete` with `successor` records the new inbox for buddies' reconnect
  checks, only for a link at the current epoch (Buddies → Inbox successor).
  An inbox first linked at an older epoch refuses owner-signed requests
  (401 `key_changed`) for good; it's usable only through bearer owner ops,
  and the app deletes it with a successor (Buddies → Old-key owner ops).
- **Privacy**: never log or report keys, the history blob, wraps, credential
  ids, account ids, or session ids. The history is sealed by the devices; the
  server stores it opaque.

### Supporter status (RevenueCat)

The account is the authority on whether a User is a Supporter (witness-work
ADR 0029). Code in `src/accounts/supporter.ts` (store and `isAccountSupporter`),
`supporterRoute.ts`, and `revenueCatWebhook.ts`; the rule is still ADR 0014's
(`fetchSupporterStatus` in `src/revenuecat.ts`).

| Route | What |
| --- | --- |
| `POST /accounts/v1/revenuecat-customers` | Bearer; `{ appUserId }` → link it, `{ ok, supporter, expiresAt }` |
| `GET /accounts/v1/supporter` | Bearer; `{ ok, supporter, expiresAt, customers }` |
| `POST /revenuecat/v1/webhook` | RevenueCat's servers; `Authorization: Bearer <REVENUECAT_WEBHOOK_AUTHORIZATION>` |

- **Linking**: the app sends the RevenueCat app user id it's logged in as
  (ADR 0011's shared id, or the install id). The server reads that customer
  from RevenueCat's REST API and stores only what RevenueCat says; a client's
  claim never sets status. A customer RevenueCat doesn't know isn't linked.
  Repeating a link reads RevenueCat again (the app does after purchases and
  restores). At most 5 customers an account, 5 accounts a customer
  (`SUPPORTER_LINK_LIMITS`); past either, the least recently linked goes.
  A key change (ADR 0039 §9) dates each customer the account links by its
  earliest link to it (`first_linked_at`, under any of the customer's
  ids). It unlinks the customer from other accounts that first linked it
  later; earlier links stay. It locks the customer to the account for 90
  days (`revenuecat_customer_locks`, by the linked id and by RevenueCat's
  `original_app_user_id`) only when no other account links it from as
  early or earlier, so a later linker's change never locks out the owner.
  Customers match by `COALESCE(original_app_user_id, app_user_id)`,
  stored from each read. `first_linked_at` never moves; `linked_at` does on
  every repeat. While locked, a link from an account that doesn't still
  link the customer is 409 `conflict` with `reason: "customer_locked"`:
  checked on the id sent before RevenueCat is read, then on every id the
  read names (the id, the original, the aliases, as the webhook matches
  them) in the link's own statement. The cron prunes ended locks.
  Read edge tier per IP, plus the register tier (60 a minute) per account,
  since every link reads RevenueCat and the worker's RevenueCat key has one
  rate limit for everyone; works for a suspended account; RevenueCat
  unreachable is 503 `unavailable` (`Retry-After: 30`).
- **Threat model**: RevenueCat's SDK treats the app user id as the
  customer's capability (anyone with it can log in as it), so ours does too.
  Claiming someone else's purchases takes their id (122 random bits, never
  shown or logged) plus an attested session. Store-signed proof is deferred
  (ADR 0029 §2).
- **Answering** (`isAccountSupporter`): any linked customer active. A record
  read within 24 hours is the answer until its expiry; an older one is read
  again first, and so is a Supporter whose expiry passed since its read (a
  subscription renews at its end, and the webhook can be late), once. Reads
  run together; one that finds a Supporter answers, else a failed read throws
  `RevenueCatError` (route planning 503, Notes Import free). No link: false,
  no RevenueCat call. Every RevenueCat read has a 5-second deadline
  (`REVENUECAT_TIMEOUT_MS`), legacy checks included.
- **Webhook**: constant-time compare of the whole Authorization header (401
  otherwise; 503 `disabled` without the secret). The body is read only for
  `event.id` and the customers it names (`app_user_id`,
  `original_app_user_id`, `aliases`, `transferred_from`, `transferred_to`);
  each one some account links is read again from RevenueCat, all at once, so
  order and type don't matter, and a read only overwrites an older one
  (`checked_at`).
  Unlinked customers are ignored and never stored. Event ids are recorded
  after the reads (30 days) and a repeat is 200 `duplicate`. RevenueCat
  trouble is 503, so RevenueCat retries (5 times over ~80 minutes).
- **Storage**: D1 `revenuecat_customers`, `account_revenuecat_customers`,
  `revenuecat_webhook_events` (migration
  `migrations/accounts/0003_revenuecat-customers.sql`), and
  `revenuecat_customer_locks` with `first_linked_at` and
  `original_app_user_id` (`0007_rekey-supporter-lock.sql`). The hourly cron
  prunes event ids past 30 days, customers no account links, and ended
  locks.
- **Not logged** in the activity log: Supporter start and end are billing
  state (ADR 0029 §7).
- **Verify loop**: `REVENUECAT_API_URL` (local development workers only; Beta
  and production ignore it) points account reads at a fake. `pnpm test:e2e` serves one when
  the worker was started with
  `REVENUECAT_API_URL=http://127.0.0.1:18790 node scripts/verify/dev.mjs up`;
  the launcher sets a synthetic webhook secret.
- **Web sandbox**: `REVENUECAT_COUNT_WEB_SANDBOX = "true"` lives only in
  `[env.dev.vars]` (and `.dev.vars.example`), never in top-level `[vars]` or
  `[env.beta.vars]`, and is ignored unless `APP_ATTEST_ENVIRONMENT` is `development`. With it, a
  RevenueCat Billing sandbox subscription counts toward Supporter status
  (witness-work ADR 0014); without it, it doesn't.
- **Privacy**: never log or report app user ids, account ids, tokens, the
  webhook's Authorization header, or webhook bodies. The webhook logs only the
  event type and how many linked customers it read. Sentry drops
  `Authorization` from every event (`SECRET_HEADER` in `src/sentry.ts`), the
  webhook's included, and RevenueCat reads use the pre-Sentry `fetch`, so the
  app user id in RevenueCat's URL stays out of spans.

Each deployed worker has its own webhook secret; keep copies in 1Password's Agents
vault ("ww-api RevenueCat webhook secret (prod)" and "(beta)"). RevenueCat's
integration sends the header value exactly as entered, so enter `Bearer `
plus the secret.

```bash
openssl rand -hex 32   # the secret; store it in the Agents vault first
wrangler secret put REVENUECAT_WEBHOOK_AUTHORIZATION --env beta  # Beta
wrangler secret put REVENUECAT_WEBHOOK_AUTHORIZATION             # prod
```

RevenueCat dashboard → Integrations → Webhooks, one integration per deployed worker,
in the project whose secret key the worker holds (`REVENUECAT_API_KEY`):

| Worker | RevenueCat project | URL | Environment |
| --- | --- | --- | --- |
| prod | **WitnessWork** (`4c282809`; key "ww-proxy") | `https://ww-proxy.leviwilkerson.com/revenuecat/v1/webhook` | Both (Play test tracks, and Beta builds from before the Beta API, buy in sandbox and talk to prod) |
| beta | **WitnessWork** (`4c282809`), a second integration in the same project | `https://api-beta.witnesswork.app/revenuecat/v1/webhook` | Both (TestFlight Beta buys in sandbox). **Not yet created**: until it is, Beta learns of a change only when an account's status is next read |

Local development has no integration: RevenueCat can't reach a local worker,
and the e2e suite posts its own events. The old dev integration, in
**WitnessWork Dev** (`67824560`, Test Store only), pointed at the removed
`ww-proxy-dev` Worker; delete it if it is still there.

Authorization header value: `Bearer ` plus that worker's secret. Leave HMAC
signing off (the worker checks the Authorization header). "Send test event"
on the integration should answer 200 `customers: 0` (a test customer is
never linked).

### Handoff and backup

Moving the account to another phone and backing it up (witness-work ADR 0026;
"Handoff", "Backup", and "Recovery key" in `../../docs/accounts-protocol.md`).
Shared helpers for the self-signed ops, and `accountCall` (bearer or legacy
envelope, then the account), are in `src/accounts/signed.ts`. Both stay
`POST /accounts/v1/{op}` like Buddies, so channel and slot ids travel in
bodies and headers, never URLs.

- **Handoff** (Set Up Another Device): `POST /accounts/v1/handoff/open|claim|
  status|send|receive|done|cancel`, code in `src/accounts/handoff.ts`. The old
  phone's ops (`open`, `status`, `send`, and `cancel` without `claimToken`)
  are Bearer with their fields as plain JSON; while the legacy switch is on
  they also take envelopes (`payload`/`signature`) signed by the account key
  like `account/register`, which need a registered account
  (`unknown_account` otherwise). A suspended account may still hand off.
  `open` and `send` (which move the account) need a live session
  (`requireLiveSession`; a signed-out phone is 401 and signs in again). The
  new phone's (`claim`, `receive`, `done`, and `cancel` with `claimToken`)
  are plain JSON carrying `claimToken`, with or without an `Authorization`
  header. One `AccountHandoff` SQLite DO per `channelId`
  (binding `ACCOUNT_HANDOFF`, migration `v7`, `src/accounts/handoffDO.ts`)
  holds the opening account, `verifier = b64u(SHA-256(claimToken))`, the new
  phone's temporary key, and the sealed hello (≤ 2,048 chars) and key
  (≤ 1,024; over either is `too_large`). Status runs `open → claimed → sent →
  done`, or `cancelled` from any of them. The first valid claim wins and an
  identical repeat gets `ok`; five wrong tokens (on any new-phone op) burn the
  channel to `cancelled`. `done` and `cancel` clear the blobs at once, and the
  alarm deletes everything 10 minutes after `open`; expired and unknown
  channels are `not_found`. Another account as the old phone is 403
  `forbidden`. A wrong token is 401 `bad_signature`, and an op out of order is
  `conflict`. Limits: `open` uses the Buddies register edge tier plus 20 per
  account a rolling day (`BUDDY_REGISTRATION_QUOTA` under a hashed
  `handoff-open` name; `admit` takes the limit), and every other op the read
  tier.
- **Backup**: `POST /accounts/v1/backup/put|list|get|delete`, code in
  `src/accounts/backup.ts`. `put`, `list`, and `get` are Bearer. `put`
  sends the blob as the raw body, with `x-ww-slot-id`, `x-ww-sha256`, and
  `Content-Length` as its size. `delete` is Bearer **and** the account key's
  envelope; its key must be the token's account (403 `forbidden`), so a
  leaked token can't delete backups; it also needs a live session
  (`requireLiveSession`). While the legacy switch is on, all four
  also take the envelope alone; the old `put` sends it in
  `x-ww-payload`/`x-ww-signature` (or the short `x-ww-p`/`x-ww-s`). Sentry
  drops all four envelope headers and `x-ww-slot-id`. R2
  bucket `ACCOUNT_BACKUPS` (`ww-account-backups` prod,
  `ww-account-backups-beta` Beta), one object per device slot at
  `v1/<accountId>/<slotId>` with `customMetadata.uploadedAt` (epoch ms). `put`
  refuses a declared `Content-Length` or signed `size` over 20 MiB (413
  `too_large`) before reading the body, then reads at most `size` bytes and
  checks length and SHA-256 (`bad_request`). 8 slots an account (429 `limit`)
  and one `put` a slot a minute (429 `rate_limited` with `Retry-After`), both
  read from an R2 prefix listing, so two racing puts can each pass. `put`
  counts against the Buddies photo-upload edge tier, the rest the read tier.
  Each slot has an `etag` (R2's own, opaque): `list` returns it per slot,
  `get` sends it as `ETag`, and `put` returns it (body and `ETag`). An
  optional strong quoted `If-Match: "<etag>"` on `put` writes only while the
  slot still holds those bytes, so a re-seal after an account key change
  never rolls back a newer backup or re-creates a deleted one: other bytes or
  no slot is 412 `precondition_failed` (nothing written, no slot made); a
  weak `W/"…"`, unquoted, `*`, or list value is 400 `bad_request`. It is
  checked against the listing and again by R2 (`onlyIf.etagMatches`), so a
  put landing in between loses too. The per-slot minute limit applies first
  (429), as in `sync/put`. No header: unchanged (older apps).
  `delete` without `slotId` deletes every slot. Suspended accounts can still
  back up. Without the bucket or `ACCOUNTS_DB`, every op is 503 `disabled`.
- **`GET /accounts/handoff`** (and the short `/h`) is the page a camera
  opens for a handoff QR code (`/accounts/handoff#1<…>`): install or open
  WitnessWork on the new phone and scan from inside the app. Localized like
  `/contacts` (`?lang=`, then `Accept-Language`; strings in
  `src/accounts/handoffPageLocales.ts`), no script. The AASA matches both
  paths with `#1…`; `assetlinks.json` already covers the whole host.
- **Privacy**: handoff and backup log only the op name. Never log or report
  bodies, headers, keys, tokens, account ids, channel ids, or slot ids.

Every deploy (the API deploy workflow, and `pnpm run deploy` and
`deploy:beta` by hand) runs `scripts/r2-lifecycle.mjs` for both buckets first,
which creates a missing bucket and sets its rules: `v1/` objects deleted 400
days after their last upload (each `put` rewrites the object, restarting its
age), plus R2's default multipart-abort rule. By hand:

```bash
node scripts/r2-lifecycle.mjs ww-account-backups-beta         # Beta: create + 400-day rule
node scripts/r2-lifecycle.mjs ww-account-backups              # prod
node scripts/r2-lifecycle.mjs ww-account-backups --check      # read-only
# The same with wrangler alone:
wrangler r2 bucket create ww-account-backups
wrangler r2 bucket lifecycle add ww-account-backups account-backups-expiry v1/ --expire-days 400
```

### Cloud Sync

End-to-end encrypted, realtime sync of every device's data through this
worker, across iPhone and Android (witness-work ADR 0030; "Sync" in 
`../../docs/accounts-protocol.md`). It's one of the app's sync options, beside
iCloud and Google Drive; each device uses exactly one. Code in
`src/accounts/sync.ts` (routes), `syncDO.ts` (`AccountSync`),
`syncContracts.ts` (limits, headers), and `syncSwitch.ts` (switches).

| Route | What |
| --- | --- |
| `GET /accounts/v1/sync` | Bearer; `{ ok, enabled, entitled, entitlement, supporter, supporterCheckFailed?, requestedAt, photos, changes }` |
| `POST /accounts/v1/sync/put` | Bearer, live session; raw blob, `x-ww-slot-id`, `x-ww-sha256`, `Content-Length`, `If-Match`?, `x-ww-reseal`?, `x-ww-covers-sequence`? → `{ ok, etag, size, updatedAt, seq, floorSequence }` |
| `POST /accounts/v1/sync/list` | Bearer, `{}`, `x-ww-sync-changes: 1`? → `{ ok, seq, slots: [{ slotId, etag, size, updatedAt, platform, live }] }` |
| `POST /accounts/v1/sync/get` | Bearer, `{ slotId }` → the blob, `ETag`, `x-ww-updated-at` |
| `POST /accounts/v1/sync/delete` | Bearer, live session; `{ slotId }` or `{}` (every slot) → `{ ok, seq }` |
| `POST /accounts/v1/sync/request` | Bearer; `{ requested: true, payload, signature }` (self-signed, op `sync/request`) or `{ requested: false }` → `{ ok, requestedAt }` |
| `POST /accounts/v1/sync/changes/put` | Bearer; `{ slotId, changeId, blob }` → `{ ok, sequence, tailCount, tailBytes, snapshotReaders, changedAt }` |
| `POST /accounts/v1/sync/changes/list` | Bearer; `{ slotId, afterSequence }` → `{ ok, sequence, slots: [{ slotId, etag, size, updatedAt, platform, floorSequence, changedAt }], changes: [{ sequence, slotId, changeId, keyEpoch, createdAt, blob }], more, snapshotReaders, requestedAt, photos }` |
| `POST /accounts/v1/sync/changes/reseal` | Bearer, live session; `{ sequence, changeId, blob }` → `{ ok, sequence }` |
| `GET /accounts/v1/sync/live` | Bearer WebSocket, `x-ww-slot-id` (browsers: [subprotocol](#browser-live-sockets)): `hello`, then `changed`; after the device sends `{ type: "sync", afterSequence }`, also `sync` and `change` |
| `POST /accounts/v1/live/ticket` | Bearer `{ socket, id }` → `{ ticket, expiresAt }`: a browser's 30-second [live socket ticket](#browser-live-sockets) |
| `POST /accounts/v1/sync/photos/put` | Bearer; raw blob, `x-ww-photo-name`, `x-ww-sha256`, `x-ww-photo-meta`, `Content-Length`, `x-ww-slot-id`? → `{ ok, name, size, sha256, createdAt, existed, usage }` |
| `POST /accounts/v1/sync/photos/list` | Bearer, `{ cursor? }` → `{ ok, photos: [{ name, size, sha256, createdAt, meta }], cursor, usage }` |
| `POST /accounts/v1/sync/photos/get` | Bearer, `{ name }` → the blob, `ETag`, `x-ww-created-at` |
| `POST /accounts/v1/sync/photos/delete` | Bearer, live session; `{ names }` (1–100) or `{ all: true }`; `x-ww-slot-id`? → `{ ok, usage }` |
| `GET /accounts/v1/sync/photos/usage` | Bearer → `{ ok, usage: { bytes, count, limit } }` |

- **Storage**: one `AccountSync` SQLite DO per account (binding
  `ACCOUNT_SYNC_INDEX`, `idFromName(accountId)`, migration `v8`) holds each
  slot's metadata (slot id = the device's sync id, ETag = b64u SHA-256 of
  the blob, size, server time, writing session id), the account's change
  `seq`, the put limits, and the live sockets. The ciphertext is in R2
  `ACCOUNT_SYNC` (`ww-account-sync` prod, `ww-account-sync-beta` Beta) at
  `v1/<accountId>/<slotId>`, with the ETag and time in `customMetadata`.
- **Puts** run in three steps so the metadata never names missing bytes:
  the Worker reads and checks the body (size, SHA-256), the DO's
  `beginPut` checks the limits and `If-Match` (`"<etag>"`, or `*` for an
  existing slot; 412 `precondition_failed`) and reserves the slot, the
  Worker writes R2, and `commitPut` records it, advances `seq`, and sends
  `{"type":"changed","seq"}` to every socket but the writer's own slot. A
  failed R2 write frees the reservation (`abortPut`); one whose commit never
  comes frees it after 2 minutes, and the daily alarm deletes any object no
  slot names. A delete (one slot or all) deletes the objects, then the rows,
  and tells every socket.
- **Record changes** (witness-work ADR 0060): a slot's snapshot is its
  **base**, and a device sends each edit as a small sealed **change**
  (`sync/changes/put`), kept in the DO's `change` table under the account's
  next `seq` until the device folds it into its base. The new routes call
  that number `sequence`.
  - **The write path is one DO call**: the token, the switches (edge-cached
    KV), the body, then `putChange`. No D1 and no R2. Keep it that way: the
    baseline that led to this design showed each D1 read adds about 250 ms
    at p50 and over a second at p95. The entitlement needs no read because
    the access token carries the session's capabilities (`cap`, set at open
    and refresh; a token without it reads the session as before).
  - **What replaces `requireLiveSession` there**: the DO keeps the account's
    key epoch (`meta.key_epoch`: the rekey route tells it through
    `closeForKeyChange({ keyEpoch })`, and it takes the highest `kep` on any
    valid token) and the sessions that ended (`ended_session`, for 16
    minutes: a token's life and the skew). A token from before a key change
    is 401 `unauthorized` with `reason: "key_changed"`, an ended session's
    is 401. **Every route that ends a session calls `noteSessionsEnded`**
    (`src/accounts/sync.ts`): sign-out and revoke name the session; a
    session open, which may end the oldest past the cap, names none, and
    the DO then checks every socket's session against D1. A lost notice is
    bounded at a token's 15 minutes, and a change only adds to a tail. Base
    puts, deletes and re-seals keep `requireLiveSession`.
  - **A change**: unpadded base64url in JSON, a whole number of 256-byte
    blocks (the app pads, so the size doesn't say which kind of record
    changed), at most 256 KiB. The slot needs a base (409 `no_slot`). The
    same `changeId` again answers the first put's sequence.
  - **Folding** (`sync/put` with `x-ww-covers-sequence: N`): the slot's
    changes up to `N` are deleted and `N` becomes its `floor_sequence`. A
    put without the header (every app from before changes) deletes the
    whole tail and sets the floor to the put's own `seq`. A re-seal keeps
    the tail and the floor. Only the device can fold: the server can't read
    a change.
  - **Catching up** (`sync/changes/list`, or `{ type: "sync",
    afterSequence }` on the socket): every slot with its floor, and the
    other slots' changes after the cursor, a page at a time (256 KiB of
    sealed bytes or 500 changes, then `more`). A device reads a base only
    when the floor is past its cursor. The answer carries `requestedAt` and
    `photos`, so a launch needn't call `GET /sync`.
  - **The socket carries changes** to a socket that asked for a catch-up,
    never to another. Each socket is bound to its session (the Worker
    forwards it in `x-ww-sync-session`, with the token's `kep` and expiry)
    and closes with `4006 "session_ended"` when the session ends. It gets
    changes only while its session was confirmed live in the last 15
    minutes: the opening token counts until it expires, and after that the
    DO reads D1 in the background (`#confirmLive`), never while a writer
    waits, then sends `changed` so the device catches up.
  - **Older apps** read and write only snapshots. A `sync/list` without
    `x-ww-sync-changes: 1` notes the caller's session (`snapshot_reader`,
    at most hourly), and `snapshotReaders` is true while any session was
    noted in the last 14 days: devices then also write their base a few
    seconds after a change. A session stops counting when it reads changes
    (a catch-up, or a list with the header) or ends, so an account is done
    with this as soon as its last device has updated.
  - **Switch**: KV `sync:changes` (`true`/`on`; absent → `SYNC_CHANGES`:
    Beta and dev `"true"`, prod `"false"`). Off: `sync/changes/*` and the socket's
    catch-up answer `changes_disabled`, and devices publish whole
    snapshots. `GET /sync` and `GET /app/v1/config` (`sync.changes`) say
    it. The snapshot routes never depend on it.
  - **Limits** (`SYNC_CHANGE_LIMITS`): 200 changes and 1 MiB a tail (409
    `tail_full`: fold, then send again), 60 changes a slot a minute and
    3,000 an account a rolling day (`change_rate`, 429 with `Retry-After`).
    Put and re-seal count in the Buddies write edge tier, list in the read
    tier.
  - **Retention** counts a change as a write (`slot.changed_at`), and a
    catch-up marks the caller's slot as seen at most daily
    (`slot.seen_at`), which counts too. The Cloud Sync request counts a
    change as "this phone has written". A slot's tail is deleted with it.
  - **Re-sealing** (`sync/changes/reseal`): after a key change, one
    change's bytes under the new key. Sequence, slot and time stay, and no
    socket is told. Live session, 7 days, as `x-ww-reseal`.
- **Switches** (KV in `NOTES_KV`, edge-cached 60 s): `sync:enabled`
  (`true`/`on`, absent → `SYNC_ENABLED`: Beta and dev `"true"`, prod `"false"`) and
  `sync:entitlement` (`supporter` makes it a Supporter benefit again, anything
  else `everyone`; absent → `SYNC_ENTITLEMENT`, `"everyone"` in every
  environment, else `everyone`). Sync is free (witness-work ADR 0040);
  `supporter` is only the lever back. `everyone` reaches only apps and
  browsers that send the `sync-everyone` capability (`capabilities` on
  session open, refresh and web sign-up, stored on the session; a session
  with some is cached 60 s per isolate, one without isn't, and a refresh
  that sends a list clears its isolate's copy; `?capabilities=` on
  `GET /app/v1/config`). Apps that
  never send it, at any version, keep the Supporter rule, because they turn
  Cloud Sync on by themselves for any device that never chose (witness-work
  ADR 0040 §2). Off: put, list, get, live, and setting
  the request are 503 `disabled`. Not entitled: 403 `supporter_required`,
  from `accountSupporterStatus` (the account's own status), cached 60 s per
  isolate per account; RevenueCat unreachable is 503 `unavailable`, never
  "not a Supporter". Delete, clearing the request, and the status always
  work. `GET /app/v1/config` carries both as `sync: { enabled,
  entitlement }` for devices without a session. Turning it off refuses new
  sockets and doesn't close open ones.
- **Limits** (`SYNC_LIMITS`, each with its sizing): 20 MiB a blob (413
  `too_large` from `Content-Length` before the body is read), 20 slots an
  account (429 `limit`, new slots only), one put a slot every 2 seconds and
  one at a time, 1,000 puts and 2 GiB an account a rolling day (429
  `rate_limited` with `Retry-After`), 20 live sockets an account, browser
  sockets included (the oldest closes with `4000 "replaced"`). Put counts in the Buddies write edge tier,
  the rest in the read tier. Hits log `buddies: limit hit {op: 'sync/put',
  limit}`.
- **Retention** (the DO's daily alarm, while it has slots): a slot not
  written for 30 days whose writing session isn't live (`isSessionLive`; a
  deleted session row counts as ended) is deleted, and any slot not written
  for 400 days. R2's lifecycle rule (400 days on `v1/`, set by
  `scripts/r2-lifecycle.mjs` on every deploy) is the backstop. A failed
  session read keeps the slot until the next run.
- **Slot sessions**: each slot keeps the platform of the session that last
  wrote it (`slot.platform`, added to older indexes by `ADDED_COLUMNS`), and
  `sync/list` adds `platform` and `live` (that session is live, from D1's
  `sessionStates`). A slot put before the column reads its session's row,
  and says `platform: null, live: false` once that row is pruned. A failed
  D1 read says `live: true`, as retention does.
- **The Cloud Sync request** (witness-work ADR 0040 §5, the repo root's
  `../../docs/cloud-sync-photos.md`): a browser signed in to an account whose
  phones aren't on Cloud Sync sets `{ requested: true }` with a self-signed
  envelope (op `sync/request`) by the token's own account, as
  `backup/delete` does (`forbidden` for another account's key), so a leaked
  token alone can't move the User's phones. Each envelope is good once: its
  nonce is kept in the DO's `request_nonce` for twice the `ts` window, and a
  reuse is 409 `replay`, so a captured envelope can't undo a withdrawal.
  Phones read `requestedAt` in
  `GET /sync` and switch; they never clear it. Asking again keeps
  `requestedAt` and restarts the 30 days. It clears itself (checked on read)
  once every live `ios`, `android` or `dev` session has written a slot since
  `requestedAt` (an account without one clears at once), or 30 days after
  the last ask; `{ requested: false }` (bearer only) withdraws it. A failed
  session read keeps it standing. Stored in the `AccountSync` DO's
  `sync_request` table, not D1, and not in the activity log. Counts in the
  read tier.
- **Photos** (witness-work ADR 0040 §6, `../../docs/cloud-sync-photos.md`;
  code in `src/accounts/syncPhotos.ts` and `syncDO.ts`): each photo is an
  end-to-end encrypted blob under an immutable keyed name. The `AccountSync`
  DO holds a row per name (size, digest, sealed meta, current `put_id`,
  times, `deleted_at`), the live usage (`photo_state`, kept exact in every
  transaction), reservations, the purge queue (`photo_purge`), and
  one-minute rate buckets (`photo_rate`). R2 `ACCOUNT_PHOTOS`
  (`ww-account-photos` prod, `ww-account-photos-beta` Beta) holds each put at
  `v1/<accountId>/<name>/<putId>`, `putId` random per put.
  - **Put**: `beginPhotoPut` answers `existed` for a live name (nothing
    written; it counts as a put with no bytes), else checks one put a name
    at a time (429 `rate_limited`), a slot exists (409 `no_slot`), 20,000
    live photos (429 `limit`), the storage limit against live usage plus
    other uploads' reservations (429 `storage_full` with `usage`, no
    `Retry-After`; a put a delete cancelled doesn't count), and 4 GiB stored
    a rolling day, then counts the put and reserves the size. Refused puts
    don't count. A rate's `Retry-After` waits for the minute buckets that
    hold enough of it to age out, not just the oldest.
    The Worker then reads the body (the server always reads it to the end
    before answering, except a declared size over 25 MiB: 413 `too_large`),
    checks its digest, writes R2, and `commitPhotoPut` checks the limit and
    the slot again, makes the name live, advances `seq`, and sends `changed`
    to every socket but `x-ww-slot-id`'s. A bad body, a body that
    fails to arrive (the link dropped, the app was killed) or a failed write
    frees the reservation and the name at once, so the retry is accepted and
    the bytes stop counting; one whose commit never comes lapses after a minute
    plus the body at 50 KiB/s (`photoPutReservationMs`): 2 minutes for a
    small photo, about 9½ for 25 MiB, so a large upload survives a slow link.
  - **Delete** marks the rows deleted (usage drops at once), queues their
    put's object for the purge 30 days later, cancels any put of those names
    in flight (its commit answers 409 `conflict` and deletes its own
    object), advances `seq`, and tells the sockets. A re-put of a deleted
    name writes a new object, so the purge can't take it. `sync/delete {}`
    deletes every photo too.
  - **Alarm** (folded into the daily retention alarm, kept while the account
    has slots, photos, queued purges, puts in flight, or a sweep pending):
    an account with no slot for a day (`no_slot_since`, set when the last
    slot goes, cleared by a slot put, checked again right before deleting)
    has its photos deleted; queued objects 30 days old are purged; after a
    put lapsed or an R2 write failed, objects no row, purge entry or
    reservation names are swept (`photo_state.sweep` is a generation, so a
    sweep never clears a request made while it ran).
  - **Switches**: put, list and get need Cloud Sync on and an entitled
    account. KV `sync:photos` (`off`/`false` off; absent → `SYNC_PHOTOS`, on
    in every environment, else on) refuses only puts, 503
    `photos_disabled`. Without the photo bucket, put and get (which need R2)
    are `photos_disabled`, never `disabled`, and the status says `photos:
    false`; list, delete and usage read the index and keep working, and the
    rest of Cloud Sync carries on. Delete and usage always work.
  - **Limits** (`SYNC_PHOTO_LIMITS`): 25 MiB a blob, 2,000,000,000 bytes an
    account (`SYNC_PHOTO_LIMIT_BYTES` overrides it; locally `node
    scripts/verify/dev.mjs up --photo-limit-bytes 2000`), 20,000 live photos,
    20,000 puts and 4 GiB stored and 50,000 gets an account a rolling day. Put
    counts in the Buddies photo-upload edge tier (`blob/put`, 60/min), the
    rest in the read tier. Hits log `buddies: limit hit {op:
    'sync/photos/put', limit}`.
  - **R2 lifecycle**: none by age (photos are written once);
    `scripts/r2-lifecycle.mjs ww-account-photos` keeps only the
    multipart-abort rule, and `--check` fails if an expiry rule appears.
- **Suspended** accounts keep syncing (nothing reaches another person).
- **Privacy**: ciphertext only; the server can't read a device name or any
  data. Never log or report slot ids, account ids, session ids, sizes,
  bodies, or tokens. The socket carries change notices, and sealed changes
  to a socket whose session is known live (ADR 0060). The change routes put
  their ids in the JSON body, not in headers.

```bash
# Turn Cloud Sync on (prod starts off; before the app release that defaults to it)
wrangler kv key put --binding NOTES_KV sync:enabled true
# Off (kill switch): refuses put/list/get/live and setting the request with 503 disabled
wrangler kv key put --binding NOTES_KV sync:enabled false
# Free for everyone (the default, ADR 0040), or a Supporter benefit again
wrangler kv key put --binding NOTES_KV sync:entitlement everyone
wrangler kv key put --binding NOTES_KV sync:entitlement supporter
# Fall back to the SYNC_ENABLED / SYNC_ENTITLEMENT vars
wrangler kv key delete --binding NOTES_KV sync:enabled
wrangler kv key delete --binding NOTES_KV sync:entitlement
# Add --env beta to each for the Beta worker; locally, `node scripts/verify/dev.mjs kv put …`.
node scripts/r2-lifecycle.mjs ww-account-sync --check   # read-only bucket check
# Record changes on (prod starts off; after the app release that sends them),
# off (devices publish whole snapshots), and back to the SYNC_CHANGES var
wrangler kv key put --binding NOTES_KV sync:changes true
wrangler kv key put --binding NOTES_KV sync:changes false
wrangler kv key delete --binding NOTES_KV sync:changes
# Photo puts off (reads and deletes keep working), and back to the var
wrangler kv key put --binding NOTES_KV sync:photos off
wrangler kv key delete --binding NOTES_KV sync:photos
node scripts/r2-lifecycle.mjs ww-account-photos --check # no age rule, multipart abort only
```

## Shared Spaces

A blind, end-to-end encrypted record store shared by up to 10 members, one
space per shared car (witness-work ADR 0037; wire contract
`../../docs/shared-cars-protocol.md`; Shared Cars is the app feature). Code
in `src/spaces/`: `route.ts` (routes, gates), `spaceDO.ts` (`SharedSpace`),
`contracts.ts` (limits, parsers, headers, and `SPACES_ERROR_STATUS`: the
shared envelope's codes plus Spaces' own `stale_key`), `switches.ts`,
`openapi.ts`.

| Route | What |
| --- | --- |
| `POST /spaces/v1/create` | `{ spaceId, memberId, dhPub, tokenHash, wrap }` → `{ ok, seq, joinedAt }` |
| `POST /spaces/v1/sync` | member, `since`, `limit?` → records, members (`memberId`, `dhPub`, `joinedAt`), invites, owner, epoch, own wrap, `rekeyNeeded`, `more` |
| `POST /spaces/v1/put` | member, `records` (1-100) → `{ ok, seq, results }` |
| `POST /spaces/v1/invite/create`, `invite/delete` | member, `inviteId` (+ `joinVerifier`, `expiresAt`, `epoch`) → `{ ok }` |
| `POST /spaces/v1/join` | `{ spaceId, inviteId, joinSecret, epoch, memberId, dhPub, tokenHash, wrap }` → `{ ok, seq, epoch, joinedAt }` |
| `POST /spaces/v1/leave`, `member/remove`, `rekey`, `delete` | member (+ `removeId`; `epoch`, `wraps`, `link`) |
| `GET /spaces/v1/live` | Bearer WebSocket, `x-ww-space-auth` + `x-ww-space-token`: `hello`, then `changed` |

- **Authentication**: every route is bearer (the session proves an attested
  app and drives suspension and rate limits) but the session is never
  recorded against the space. Member ops carry `spaceId`, `memberId`, and
  `token` in the body; the Worker hashes the token and only the hash reaches
  the DO, which compares it with the member's stored hash in constant time
  (`join`'s secret likewise). A `memberId` not on an existing space is 410
  `gone`; a wrong token for one that is, 403 `forbidden`. `create` and
  `join` carry the member's X25519 `dhPub`, and the Worker refuses a
  `memberId` other than `b64u(SHA-256("ww-spaces/v1/member-id|" + spaceId +
  "|" + dhPub)[0..16])` (400 `bad_request`), so nobody can swap in a key.
  The live upgrade's ids ride in `x-ww-space-auth` (`b64u(JSON { spaceId,
  memberId })`, ≤ 1,024 characters) and the token in `x-ww-space-token`
  (`b64u(token)`); the names hold "auth" and "token" so Cloudflare's logs
  redact them.
  The Worker forwards the verified member and the member cap to the DO in
  `x-ww-space-member-token` (it carries the token's hash, so its name holds
  "token" too), without `Authorization` or either client header, replacing
  any client copy. Sentry drops all three headers.
- **Storage**: one `SharedSpace` SQLite DO per space (binding
  `SHARED_SPACE`, `idFromName(spaceId)`, migration `v10`): the current
  version of each sealed record with the `seq` it was stored at, members
  (token hash, `dhPub`, current wrap, `joinedAt`), invites (verifier,
  inviter, expiry; a used one is kept until it expires so a retried `join`
  gets its answer), the ids of invites closed before they were used
  (`closed_invite`, until they'd have expired), the change `seq`, running
  record and decoded-byte counts, hourly put counts, each member's puts
  over the last minute, the retention alarm, and the live sockets. No R2.
  Every change advances `seq`: each stored record takes the next one, and
  joins, leaves, removals, invite changes, and rekeys take one each (a
  rekey's link one more). The last member's `leave`, the owner's `delete`,
  and retention drop every table and write a tombstone in the same
  transaction as the check that allowed it, so every later request
  (`create` included) is `gone`. Then `deleteAll()` frees the storage
  (Cloudflare bills dropped tables' storage until `deleteAll()`) and the
  tombstone is written back, inside `blockConcurrencyWhile`
  (`deleteAllThen` in `src/durableObjectStorage.ts`). If that fails,
  workerd resets the object and the request fails with 500 although the
  space is gone (its retry is `gone`). An alarm set 10 minutes out first,
  and set again right after `deleteAll()` (from compatibility date
  2026-02-24 `deleteAll()` drops it), retries. If the failure came after
  `deleteAll()`, the next instance's constructor sees no space, no
  tombstone, and an alarm, and writes the tombstone back before any
  request, so `create` and `join` stay `gone`; the alarm does the same as a
  backup. `sync` reads records in whole chunks (`readSeqPage`): a `for …
  of exec()` loop that stops early leaves its statement running, and the
  wipe's `DROP TABLE` then fails with `SQLITE_LOCKED` until the object is
  evicted (`deleteAll()` isn't blocked by it; measured on `wrangler dev`).
- **Creating**: an identical retry of `create` (same `memberId`, `dhPub`,
  `tokenHash`, `wrap`) on a space nothing has changed since (`seq` 1) gets
  the same `{ ok, seq: 1, joinedAt }`; any other reuse is 409 `conflict`. The
  Worker asks the DO first (`existingCreate`), so a retry, a `conflict`, or a
  `gone` never counts against the account's 20 creates a day. Two first
  tries racing can both count.
- **Invites**: made at the current epoch (`invite/create` with another
  `epoch` is 409 `stale_key`), so an open invite always carries the current
  key. They close when used, deleted, burned, or expired; when their
  inviter leaves (freeing their places, and keeping a gone member from
  rejoining through their own invite); all of them when anyone is removed
  (so the removed member can't rejoin through another member's invite
  before the rekey; inviters send theirs again after it); and all of them
  at a rekey. A closed id is kept (`closed_invite`) until it would have
  expired, so an identical `invite/create` landing after the close is 409
  `conflict`, as is any reuse of a used or burned id; an identical retry is
  `ok` only while the invite is open. Closed ones count toward no cap and
  aren't in `sync`'s `invites`, and `join` with one is 404 `not_found`.
  `join` also refuses an invite whose inviter isn't on the space (404
  `not_found`). `join` carries the invitation's `epoch`: a fresh join at
  any other than the current one is 409 `stale_key` (checked after the
  secret, so a wrong secret still counts). A retried `join` (same secret,
  `memberId`, `dhPub`, `tokenHash`, whatever its `epoch`) gets the head,
  the current epoch, and its original `joinedAt`; any other join by a
  current member is 409 `conflict`. `invite/delete` of an unknown, closed,
  used, or expired invite is `ok` for any member and changes nothing; an
  open one is its inviter's or the owner's to close (403 `forbidden`).
- **Records**: the newest `stamp` wins per `recordId`; on a tie a deletion,
  then the lower SHA-256 of the decoded blob. Resending the held version is
  `stored: true` and takes no `seq`. Reserved ids (`mayPutRecord`):
  `m.<memberId>` is that member's alone (any other `m.` id, one naming
  nobody yet included) and `k.<x>` the owner's, so a put naming someone
  else's is 403 `forbidden` and nothing in it is stored (deletions
  included). Any record off the current epoch is 409 `stale_key` and
  nothing is stored; a stamp more than 24 h ahead is 400.
- **Roles**: the creator owns the space; an owner who leaves passes it to
  the member who joined first. `member/remove` (never yourself), `rekey`,
  and `delete` are owner only. `rekey` must be to the current epoch + 1
  (below 2 is 400, anything else 409 `stale_key`) and give a wrap to every
  current member exactly: naming one twice is 400 `bad_request`, missing one
  (an empty list included) or naming a non-member 409 `conflict` (the
  owner's device syncs and tries again). It closes every open invite. Its
  required `link: { stamp, blob }` is stored in the same transaction as the
  record `k.<epoch>` at the new epoch, at a `seq` of its own after the
  rekey's, replacing any version of that id whatever its stamp (so a link
  planted ahead can't block it); it's checked as a put record (413
  `too_large`, 400 for a stamp more than 24 h ahead) and counted in the
  record and byte caps (429 `limit`) but not the put rates (`put_hour`,
  `member_put`). The link is the owner's by construction. The answer's
  `seq` is the head, the link's. `rekeyNeeded` is set by a leave or removal
  and cleared by a rekey.
- **Switches** (KV in `NOTES_KV`, edge-cached 60 s): `spaces:enabled`
  (`"true"`; absent → `SPACES_ENABLED`: Beta and dev `"true"`, prod `"false"`). Off,
  everything is 503 `disabled` with `Retry-After` except `leave`,
  `member/remove`, and `delete`; open sockets stay open. `spaces:maxMembers`:
  members plus open invites a space holds (1-100; absent or invalid → 10),
  checked at `invite/create` and `join`. No Supporter check: it's free.
- **Suspended** accounts get 403 `suspended` on `create`, `put`,
  `invite/create`, and `join` (the cached `requireActive` status, 30 s);
  reads, leaving, removing, rekeying, and deleting still work.
- **Limits** (`SPACES_LIMITS`, each with its sizing): per caller, the
  Buddies edge tiers keyed on the hashed account (`sync` and `live` read,
  `join` unsigned, the rest write); 20 creates per account a rolling day
  (`BuddyRegistrationQuota` under a hashed `space-create` name, counted
  before the DO, only for a `create` that would make a space); 60 puts a
  rolling minute per member (counted in the space's SQLite in the put's own
  transaction once it passes the `forbidden` and `stale_key` checks, so it
  holds across eviction; a put refused `forbidden` or `stale_key` writes
  nothing and costs nothing, as does one whose transaction throws, while
  one refused with `limit` or the daily `rate_limited` counts); 10,000
  records a rolling day per space (hourly counts); 100 records and 1 MiB a
  put, 16 KiB a blob (a rekey's link too), 256 KiB any other body, declared
  or streamed (413 `too_large`); 50,000 records and 256 MiB of decoded
  blobs a space, deletions and links included (429 `limit`; a replaced
  version gives its bytes back); members plus open invites (429 `limit`);
  invites at most 7 days plus 5 minutes; 5 wrong join secrets burn an
  invite; 4 live sockets per member the cap allows, 40 at 10 (past it,
  `4002 "replaced"` closes, one at a time, the opener's own oldest while
  they hold 4 or more, else the oldest of whichever member holds the most,
  until the space is at the cap, an excess left by a lowered
  `spaces:maxMembers` included; so a member rotating their sockets can't
  keep the others out). The rolling counts share `rollingWindowWaitMs`
  (`src/buddies/limits.ts`) with the Buddies quotas. Sync pages stop at
  `limit` (≤ 1,000) or 4 MiB of blobs, with `more`. Hits log `spaces:
  limit hit {op: 'spaces/…', limit}` (edge tiers as `edge.<tier>`).
- **Live socket**: `hello` with the head, then `changed` to every socket on
  the space after each change (the writing device's included: a member's
  devices share one member id). `ping` gets `pong` without waking the DO.
  `4001 "gone"` closes a leaver's or removed member's sockets, and every
  socket when the space is deleted.
- **Retention**: the alarm deletes a space 400 days after its last `sync` or
  `put` (set at `create`, moved forward each time it fires early). A `sync`
  records the activity only when the recorded one is over a day old, so most
  syncs write nothing; the alarm waits 401 days from the recorded one to
  make up for it.
- **Privacy**: ciphertext, random ids, and per-space public keys only; the
  server never learns what a space is or which accounts are on it. Never
  log or report space, member, or invite ids, tokens, keys, hashes, wraps,
  or blobs. A failure reaches Sentry as an `OperationError` naming
  `spaces/<op>` alone (`captureOperationFailure`), since the DO's SQLite
  errors can quote what they hold. The socket carries only change notices.

```bash
# Turn Shared Spaces on in prod (before the app release that shares cars)
wrangler kv key put --binding NOTES_KV spaces:enabled true
# Off (kill switch): leave, member/remove, and delete keep working
wrangler kv key put --binding NOTES_KV spaces:enabled false
# Raise the member cap (members plus open invites)
wrangler kv key put --binding NOTES_KV spaces:maxMembers 12
# Fall back to the SPACES_ENABLED var / the default cap
wrangler kv key delete --binding NOTES_KV spaces:enabled
wrangler kv key delete --binding NOTES_KV spaces:maxMembers
# Add --env beta to each for the Beta worker; locally, `node scripts/verify/dev.mjs kv put …`.
```

### Territories: scoped spaces and guest links

Shared Territories (witness-work ADR 0047; wire contract
`../../docs/territories-protocol.md`) are Shared Spaces created with
`mode: "scoped"`. A space without a mode (every car) keeps every rule above,
unchanged; the mode never changes. Same files, plus `scoped.test.ts` and
`guest.test.ts`, and `src/e2e/territories.e2e.test.ts` for the local worker.

| Route | What |
| --- | --- |
| `POST /spaces/v1/create` | adds optional `mode: "scoped"` (part of an identical retry) |
| `POST /spaces/v1/invite/create` | adds `scopes?` (1-100 street ids; absent = whole territory) and `handoff?` (exactly one scope) |
| `POST /spaces/v1/member/scopes` | owner: member, `target`, `scopes` (or null) → `{ ok }` |
| `POST /spaces/v1/handoff/create`, `handoff/end` | member, `scopeId` (+ `target`) → `{ ok, seq }` |
| `POST /spaces/v1/link/create`, `link/end` | member, `linkId` (+ `verifier`, `scopes` 1-30, `expiresAt` ≤ 24 h 5 min, `epoch`) → `{ ok, seq }` |
| `POST /spaces/v1/guest/sync`, `guest/put` | **no session**: `spaceId`, `linkId`, `linkToken` (+ `since`/`limit` ≤ 500, or `records` 1-20) |

- **Streets are scopes**: opaque 22-character ids (`b64u` of the street
  UUID). Record ids must match the protocol's grammar (`h`, `s.<S>`,
  `s.<S>.w`, `s.<S>.<uuid>`, `d.<uuid>`, `m.`/`i.`/`g.<22>`, `k.<n>`;
  `SCOPED_RECORD_ID_PATTERN`), else 400. Each record is stored with its
  scope (`record.scope`, indexed with `seq`), `sync` leaves out what the
  caller may not read (they don't count toward `limit`), and `put` refuses a
  record the caller may not write (403, nothing stored, before `stale_key`).
  The rules (`#mayRead`, `#mayWrite`, `#mayWriteScope` in `spaceDO.ts`)
  follow the protocol's tables. A street held by a member is written by the
  holder and members they invited who have it; one held by a pending
  hand-off invite, by nobody; an unheld one by the owner, whole members, and
  members the owner invited who have it.
- **Roles are server state**: `member.scopes` (JSON, null = whole),
  `member.invited_by`, `holder` (street → member, or a pending hand-off
  invite), `link` (verifier, creator, scopes, times; kept for the space's
  life so ids never repeat), `invite_author` (who made each invite, for its
  `i.` record). The owner never changes: `leave` by the owner is 400 and
  nothing passes a scoped space on. Only the owner hands off
  (`invite/create` with `handoff`, `handoff/create`), so a holder is refused
  (403) both ways. A hold clears whenever its pending invite closes
  (delete, expiry at the next prune, a burn, a rekey, `member/remove`).
  `handoff/end` (`#endHold`) removes the street from the holder and their
  invitees, removes anyone left with none, ends the holder's links and open
  invites on it, and if anyone was removed closes every open invite and
  sets `rekeyNeeded`; a holder's `leave` or removal runs it for each street
  first, and any member who leaves or is removed ends the links they made.
  `join` refuses (404) a holder's invite for a street they no longer hold.
- **Guest ops** are the API's only writes without a session. Order: both
  switches (503 `disabled`), 120 a minute per network
  (`SPACES_GUEST_LIMITER`, keyed by `counterName(…, 'spaces-guest',
  buddiesCallerKey(ip))`, an HMAC under `ACCOUNT_TICKET_SECRET`; without
  that secret they answer `disabled`; a failing limiter allows), the body
  (64 KiB, 20 records, 4 KiB blobs, the grammar), and only then the space.
  There an unknown space, unknown link, wrong token, or a space without a
  mode are the same 404 `not_found`; a deleted space or ended link is 410
  `gone` with `reason: "ended"`, a lapsed one `reason: "expired"`. Then 120
  syncs and 30 puts a link a rolling minute and 2,000 records a link a
  rolling day (`link_request`, `link_record_hour`), then the records: only
  `s.<S>.w` and `s.<S>.<uuid>` on streets of the link its creator may write
  now (403 otherwise), then `stale_key` and the space's caps as `put`. A
  wrong token never ends or counts against a link. CORS is the global
  `WEB_APP_ORIGINS` list (`Date` and `Retry-After` exposed, no credentials).
- **Switches and suspension**: `handoff/end` and `link/end` work with
  `spaces:enabled` off, like `leave`. `member/scopes`, `handoff/create`, and
  `link/create` answer 403 `suspended` for a suspended account.
- **Privacy**: never log or report a link token, verifier, link id, IP, or
  blob. Sentry drops `cf-connecting-ip` and the other IP headers from every
  event (`SECRET_HEADER` in `src/sentry.ts`).
- **Schema**: added with `CREATE TABLE IF NOT EXISTS` and guarded `ALTER
  TABLE` (`ADDED_COLUMNS`) when an object starts, so older spaces pick it up
  with nulls and keep their rules. No new Durable Object class or migration
  tag.

```bash
# Guest links on (they also need spaces:enabled = true)
wrangler kv key put --binding NOTES_KV spaces:guests true
# Pause guest links only (link/create keeps working; pages show "paused")
wrangler kv key put --binding NOTES_KV spaces:guests false
# Fall back to the SPACES_GUESTS var (Beta and dev "true", prod "false")
wrangler kv key delete --binding NOTES_KV spaces:guests
# Add --env beta to each for the Beta worker; locally, `node scripts/verify/dev.mjs kv put …`.
```

## App Store ratings (paywall social proof)

`GET /app-store/ratings` returns `{complete: true, averageRating, ratingCount,
countryCount, updatedAt}` for the app's paywall. `countryCount` counts storefronts
with ratings, not publisher locations. App Store Connect's API only exposes written
reviews, so totals come from the JSON-LD on each public App Store page
(`apps.apple.com/{storefront}/app/id…`), summed across all 175 storefronts (`src/appStoreRatings/storefronts.ts`, from ASC
`/v1/territories`). The hourly cron (`[triggers]`) sweeps 40 storefronts per run
sequentially into `NOTES_KV` (`app-store-ratings:state:v2`), publishes
`app-store-ratings:summary:v2` only after every storefront has responded
successfully, then rests until that sweep is 7 days old. Failed or malformed
lookups remain pending for the next hourly run. A batch in which every lookup
fails logs a warning and pauses the sweep for 24 hours. The previous complete
summary stays available until its replacement is complete, and a sweep that finds
no ratings at all is not published. Sequential lookups prevent timeouts from
including time spent waiting for the Worker's outbound connections.

Don't switch back to `itunes.apple.com/lookup`: it has the same numbers (and more
decimals on the average) but answers Workers with 403. Don't sweep all storefronts
in one run either: the App Store site answered 429 after about 90 pages in a row.

The route serves from the colo Cache API (`s-maxage` 6h) with a 1h edge-cached
KV read on a miss, and returns `503 no-store` until the first complete sweep
(at least 5 hourly runs, longer on failures). Its internal edge-cache key is
versioned to avoid serving the old partial totals. The app rejects legacy
unverified bodies, persists complete snapshots for 7 days, and falls back to a
dated bundled snapshot until then.

## Notes Import analytics (PostHog)

The worker sends anonymous Notes Import usage events to the WitnessWork
PostHog project (US cloud), so adoption is measured over every import, not
only installs with app analytics on. Code: `src/analytics.ts` (feature-neutral
sender) and `src/notesImport/analytics.ts` (events). On when
`POSTHOG_PROJECT_TOKEN` is set: prod `[vars]` has it; `[env.beta.vars]` and
`[env.dev.vars]` leave it commented out, so test use stays out of the
production dashboards (Beta's events would carry `environment: production`).

| Event | When | Properties beyond the shared ones |
| --- | --- | --- |
| `api_notes_import_started` | An authenticated import starts a fresh model run (kickoff or legacy; not reconnects) | `notes_chars`, `new_content`, `imports_remaining` |
| `api_notes_import_finished` | Once per started run | `outcome` (`success`, `model_error`, `cancelled`, `interrupted`), `duration_ms`, `notes_chars`; on success: `empty`, `empty_charged`, record counts (`contacts`, `visits`, `time_entries`, `categories`, `warnings`, `publisher_detected`), `imports_remaining`, `model`, `provider`, `input_tokens`, `output_tokens`, `reasoning_tokens` |
| `api_notes_import_limit_reached` | An authenticated request is refused by an allowance or the concurrency cap | `limit` (`imports`, `refinements`, `active_cap`) |

Every event carries `platform` (`ios`, `android`, `dev`, `web`: the session's
platform on bearer requests, else App Attest, Play Integrity, or the bypass
header), `transport` (`stream`, `legacy`), `refinement`, `supporter`,
`has_account` (true on every bearer request), and `environment`. The internal-TestFlight Beta app talks to prod, so its imports
are counted as `ios`.

- **Identity**: `distinct_id` is `ww_` plus a truncated SHA-256 of the meter id
  (the session's account id on bearer requests; on legacy ones the shared
  account id, else the install uuid), so unique users, DAU/WAU/MAU and
  retention work without the id itself reaching PostHog. A User's bearer
  imports get a new `distinct_id`, not their legacy one. It can't be joined to the app's
  own anonymous PostHog ids. Events set `$process_person_profile: false` and
  `$geoip_disable: true`.
- **Privacy**: properties are structural only. Never add notes text, model
  output, names, ids, or tokens. Delivery uses the pre-Sentry `fetch`, runs in
  `waitUntil` with a 2-second timeout, and never fails a request; failures log
  `analytics: capture failed|rejected` with no payload.
- The app's in-app analytics switch does not reach the worker; these events
  are sent regardless of it.

## Route planning

`POST /route-planning/optimize` backs the app's Supporter-only "Plan today's
route". Code lives in `src/routePlanning/`; README documents the contract.

- **HERE product**: Waypoints Sequence v8 (`findsequence2`), one transaction per
  request up to 100 stops (2,500 free a month on the Base Plan, then about $5.83
  per 1,000). `mode=fastest;car;traffic:enabled`, `departure=now`, no `end` (the
  route finishes at the last stop). Matrix Routing would cost about 5 × N
  transactions plus our own solver, and Tour Planning bills every location.
- **Gate**: a bearer request (witness-work ADR 0029) is the token's
  account: `requireActive` (403 `suspended`), then `isAccountSupporter`, the
  account's own status. A legacy request (no `Authorization` header) still
  checks `isSupporter()` against the body's `accountId` (the RevenueCat app
  user id) while `auth:legacy` is on, and is 426 `upgrade_required` once it's
  off. Both fail closed: a RevenueCat error returns 503
  `supporter_check_failed`, never a route. On a local development worker a
  `dev` session (bearer) or the shared `x-ww-dev-bypass` token (legacy,
  `NOTES_IMPORT_DEV_BYPASS_TOKEN`) skips the Supporter check; Beta and
  production ignore both.
- **Limits** (`ROUTE_PLANNING_LIMITS` in `src/routePlanning/config.ts`): 10
  stops per request, and per account 10 optimizations in any rolling 24 hours
  and 3 per minute. Enforced by the `RoutePlanningQuota` SQLite DO (binding
  `ROUTE_PLANNING_QUOTA`, migration `v5`, one instance per caller:
  `account:<accountId>` for bearer, the app user id for legacy, which
  stores only optimization timestamps and deletes itself a day after the
  newest; directions and MapKit JS tokens count in their own instances). Every call that reaches HERE counts, including `no_route` answers.
  The per-IP `RATE_LIMITER` also applies.
- **Kill switch**: KV `route-planning:enabled` in `NOTES_KV`. `"false"` turns
  optimizing off (503 `unavailable`; the app says it's temporarily unavailable);
  absent or anything else leaves it on. Edge-cached for 60 seconds.

  ```bash
  wrangler kv key put --binding NOTES_KV route-planning:enabled false   # off
  wrangler kv key delete --binding NOTES_KV route-planning:enabled      # on
  ```

- **Privacy**: HERE receives only coordinates under opaque ids, in a form POST
  body so they never appear in a URL. RevenueCat and HERE calls use the fetch
  captured before Sentry wraps the global, so the account id (in RevenueCat's
  URL) and the HERE key stay out of trace spans. Nothing logs bodies,
  coordinates, or account ids.

## Maps on the web

The web app's map (witness-work ADR 0037 §8) is MapKit JS in a sandboxed frame
on `maps.witnesswork.app` (`maps-beta.witnesswork.app` for Beta, which local
dev borrows). Contract,
setup, and decisions: [`docs/maps.md`](docs/maps.md). Code in `src/maps/`.

- `POST /maps/v1/mapkit-tokens`: Bearer (`requireActive`), a 30-minute ES256
  MapKit JS JWT (`kid`, `typ: JWT`; `iss`, `iat`, `exp`, `origin`, `scope:
  mapkit_js`). 10 a minute and 500 a day per account, counted in the
  `RoutePlanningQuota` DO under `mapkit-token:account:<id>`, plus the per-IP
  `maps` bucket. 503 `maps_unconfigured` until `MAPKIT_JS_PRIVATE_KEY`,
  `MAPKIT_JS_KEY_ID` (secrets), `APPLE_TEAM_ID`, and a `MAPKIT_JS_ORIGINS`
  origin are all set. `MAPKIT_JS_ORIGINS` is a var per environment; an
  `http://localhost` origin counts only under `wrangler dev` (a development
  worker on a local host) and belongs in `.dev.vars`, never `wrangler.toml`.
  Never log the token or the key.
- `GET /places/v1/search`: HERE Discover for points of interest, public in the
  per-IP `places` bucket like `/autocomplete`. Reads only `q`, `at`, `limit`,
  `lang`; answers a trimmed shape, never HERE's raw body.
- Directions for the web are the existing `POST /route-planning/directions`.

## API docs (OpenAPI + Scalar)

`GET /docs` is the Scalar API reference and `GET /openapi.json` its OpenAPI
3.1 document, on both deployed workers (prod: https://api.witnesswork.app/docs,
also on the old host; Beta: https://api-beta.witnesswork.app/docs) and on a
local one.
The repo is public, so the docs are too, admin routes included (they still
need the token).

- `hono-openapi` builds the document from the routes themselves: each route
  carries a `describeRoute(...)` middleware, kept in an `openapi.ts` beside its
  handlers (`src/attestation/`, `src/notesImport/`, `src/buddies/`,
  `src/accounts/`, `src/spaces/`, `src/routePlanning/`; routes registered in `src/app.ts` use
  `src/openapi/coreDocs.ts`). Shared helpers and the error envelope are in
  `src/openapi/schemas.ts`; tags, servers, and the Scalar config in
  `src/openapi/route.ts`.
- The schemas describe the wire format for readers; they don't validate.
  Handlers keep their own parsing, so **a contract change means updating the
  route's `openapi.ts` in the same PR**.
- `src/openapi/openapi.test.ts` fails on any route without docs, and on any
  operation without a tag, summary, or responses.
- Signed Buddies/accounts ops document the envelope `{payload, signature}`
  and list the decoded `payload` fields as a table (`signedBody`).
- The legacy short names `p`/`s` (and `x-buddies-p`/`-s`, `x-ww-p`/`-s`) are
  accepted for shipped builds but appear in the docs only as a note; never
  add a new short name.
- The document is built once per isolate. Scalar's UI loads from jsDelivr.

## API design: readable, standard REST

This project is open source. Anyone can read this repo (the app and the API
together), the generated `/docs`, and `/openapi.json`, so hiding the API's shape buys no
security. Short or cryptic names (`p`, `s`, single letters, unexplained
abbreviations) only make the API harder to read, debug, and maintain.
Security comes from signatures, attestation, capability secrets, rate limits,
and end-to-end encryption, never from obscure names.

When adding or changing an endpoint:

- **Name things for a human reader.** Spell fields, headers, and query
  parameters out in full camelCase (`signature`, not `s`; `payload`, not
  `p`; `publicKey`, not `pub`). Abbreviate only where every developer knows
  the term (`id`, `url`, `nonce`), and give every number its unit in the
  name or its description (`durationSeconds`, `expiresAt` in epoch ms).
  Some shipped names predate this (`ts`, `*Pub`, `seq`); don't copy them
  into new routes.
- **Follow REST and HTTP conventions.** Resource-oriented paths, the right
  method and status code, `Content-Type` and `Retry-After` honoured, JSON
  bodies, errors in the shared `{ ok, error, code }` envelope. Where a route
  deliberately departs from REST (Buddies' and accounts' `POST /{op}` keeps
  ids out of URLs, which production logs), document why in its `openapi.ts`.
- **Document as you go.** Every field gets a description in the route's
  `openapi.ts`; `/docs` should be enough to call the API without reading the
  source.
- **Renaming a shipped field:** accept both names on the server, document
  only the new one (mention the old one as legacy), switch the app, and keep
  the alias as long as supported builds send it. Inside signed payloads the
  server verifies the exact bytes it got, so an alias there only needs the
  parser to read either name.

## Checks before deploy

```bash
pnpm test
pnpm exec tsc --noEmit
wrangler deploy --dry-run             # prod build
wrangler deploy --env beta --dry-run  # Beta build
```

## Verification loop

Before claiming backend work is done, run the `verify-ww-api` loop
(`../../.agents/skills/verify-ww-api/SKILL.md`): `node scripts/verify/dev.mjs up`,
`doctor`, `pnpm test:e2e`, `pnpm fuzz:buddies` for relay changes, then `down`.

## Architecture diagram

The diagram of how the app, this Worker, its Durable Objects, R2 and KV, and
outside services connect lives in the repo root's
[`readme.md`](../../readme.md#architecture).
When a change here adds, removes, or moves one of those connections, update
the diagram in the same PR, and run `pnpm readme:diagram-link` from the repo
root to refresh its Mermaid Live link. Examples: a new
route group the app calls; a new Durable Object, R2 bucket, KV namespace, or
cron job; or a new or different outside service, such as a model provider. A
new endpoint in an existing route group, or a change inside one service,
doesn't need it.

## Sentry source maps

Errors are reported with `release: SENTRY_RELEASE` (the git commit sha,
injected as a deploy-time var). The API deploy workflow, like the `pnpm run
deploy` / `deploy:beta` scripts, builds with `--outdir dist` and then runs
`pnpm run sentry:sourcemaps`, which
uploads `dist/` to Sentry tagged with that release so stack traces show
original TypeScript. Org/project defaults live in `.sentryclirc` (org
`levi-wilkerson`, project `ww-proxy`).

Auth: `sentry-cli` needs `SENTRY_AUTH_TOKEN` in the environment — an org auth
token with source map upload (`project:releases`) scope, created at
https://levi-wilkerson.sentry.io/settings/auth-tokens/. Locally export it in
your shell (or put it in `~/.sentryclirc`); in CI it is the `SENTRY_AUTH_TOKEN`
repo secret. Never commit it.

`wrangler.toml` also sets `upload_source_maps = true` (inherited by
`[env.beta]`), so Cloudflare's own dashboard/tail stack traces are mapped even
on raw `wrangler deploy`.

## Notes Import streaming

Each import runs in a `NotesImportRun` SQLite Durable Object (`NotesImportIndex`
per user holds the concurrency cap) via AI SDK v6 `streamText` +
`Output.object`: authenticated kickoff (`POST /notes-import/kickoff`) → SSE progress
(`GET /notes-import/:id/events`) → result snapshot (`/result`). The legacy
`POST /notes-import` remains as a fallback. Model, providers, reasoning effort,
and the output-token budget are `NOTES_IMPORT_*` vars in `wrangler.toml`
(defaults in `src/notesImport/config.ts`); the budget includes reasoning and
JSON. Strict structured output is validated locally against the same JSON
schema. Reasoning-only exhaustion gets one retry with thinking off; nonblank
invalid or truncated JSON never retries, cancellation prevents a retry, and
usage includes both attempts. Logs include model, host, finish reason, and
token/cache counts, never content. Architecture and decisions:
[`docs/notes-import-streaming-durable-objects.md`](docs/notes-import-streaming-durable-objects.md).
