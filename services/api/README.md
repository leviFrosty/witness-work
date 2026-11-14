# WW API

A lightweight Cloudflare Workers api and proxy service for HERE API endpoints, iOS universal links, etc. with Sentry monitoring.

## Open source, open API

WW API is open source, like the [WitnessWork app](https://github.com/leviFrosty/witness-work)
it serves, and lives in the app's repository, at `services/api` (its own pnpm
workspace: run every command below from this folder). Anyone can read the
code, the protocol docs in [`docs/`](docs/) and the repo root's
[`docs/`](../../docs/), and the generated API reference at
[`/docs`](https://api.witnesswork.app/docs).
The API is at `https://api.witnesswork.app` (Beta `https://api-beta.witnesswork.app`);
the original `https://ww-proxy.leviwilkerson.com` serves the same Worker for good.
There are three environments: production, Beta (always the tip of `main`), and
development, which runs only on your machine. [AGENTS.md](AGENTS.md#environments)
has the table.
Since the whole contract is public, there's nothing to gain by obscuring it:
short or cryptic field names, headers, or paths would only make the API harder
to read, debug, and build on.

So the API aims to be standard REST, carefully maintained, and easy for people
to read:

- **Plain names.** Fields, headers, and query parameters are spelled out in
  full (`payload` and `signature`, not `p` and `s`). Units go in the name or
  the description (`durationSeconds`, `expiresAt` in epoch ms).
- **Standard HTTP.** The right methods and status codes, JSON bodies, one
  error envelope (`{ "ok": false, "error", "code" }`), and `Retry-After` on
  every 429 and 503. Where a route departs from REST on purpose, its docs say
  why. For example, the Buddies relay and the accounts handoff and backup
  ops use `POST /{op}` so ids stay out of URLs, which production logs, while
  account sessions are plain resources (`POST /accounts/v1/sessions`,
  `DELETE /accounts/v1/sessions/current`).
- **Documented.** Every route and field is described in `/docs`, generated
  from the routes, so you can call the API without reading the source.

Security never depends on the API being hard to read. It comes from Ed25519
signatures, App Attest / Play Integrity, capability secrets, rate limits, and
end-to-end encryption (the Buddies relay only ever sees ciphertext).

Some names shipped before this rule. Those still work as legacy aliases (for
example, signed envelopes still accept `p`/`s` and the `x-buddies-p`/`-s` and
`x-ww-p`/`-s` headers from older app builds), but new code and docs use only
the full names.

## Prerequisites

- [pnpm](https://pnpm.io/) installed
- [Cloudflare account](https://dash.cloudflare.com/sign-up/workers-and-pages)
- [HERE API key](https://developer.here.com/)
- [Sentry account](https://sentry.io/) (optional but recommended for error logging)

## Setup

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure environment variables

Copy the example file and fill in your credentials:

```bash
cp .dev.vars.example .dev.vars
```

Edit `.dev.vars` with your actual values:

```bash
HERE_API_KEY=your_here_api_key
SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id
```

The example file also holds the local-only secrets an app development build
needs to sign in against this worker (the dev bypass token and the account,
ticket and passkey secrets); they work as copied.

### 3. Create the local accounts database

```bash
pnpm exec wrangler d1 migrations apply ww-accounts-dev --env dev --local
```

Run it again after pulling a change that adds a migration. It writes only to
`.wrangler/state` on your machine.

## Development

Run the development server:

```bash
pnpm run dev
```

The service will be available at `http://localhost:8787`. This is the whole
development environment: `wrangler dev --env dev`, with KV, D1, R2 and Durable
Objects simulated on disk. Nothing is deployed for development. To use it from
the app, set `EXPO_PUBLIC_API_BASE_URL=http://localhost:8787` and
`EXPO_PUBLIC_API_DEV_BYPASS` (the value of `NOTES_IMPORT_DEV_BYPASS_TOKEN` in
`.dev.vars`) in the app's env at the repo root.

### Test endpoints

```bash
# Autocomplete
curl "http://localhost:8787/autocomplete?q=cincinnati&limit=5"

# Geocode
curl "http://localhost:8787/geocode?q=48 Muir+Rd,+Rogers,+KY+41365"

# Health check
curl "http://localhost:8787/health"
```

## Deployment

There are two deployed Workers: production (`ww-proxy`) and Beta
(`ww-proxy-beta`, `--env beta`), each with its own data and secrets.

### Worker secrets

Set secrets by hand, once per Worker (the deploy never sets them):

```bash
pnpm exec wrangler secret put HERE_API_KEY              # production
pnpm exec wrangler secret put HERE_API_KEY --env beta   # Beta
# Paste your HERE API key when prompted

pnpm exec wrangler secret put SENTRY_DSN
pnpm exec wrangler secret put SENTRY_DSN --env beta
# Paste your Sentry DSN when prompted
```

Verify secrets are set:

```bash
pnpm exec wrangler secret list
pnpm exec wrangler secret list --env beta
```

The full list of secrets is at the bottom of `wrangler.toml`.

### Automatic deployment via GitHub Actions

The **API deploy** workflow (`.github/workflows/api-deploy.yml`, at the repo
root) deploys the API:

- **Beta**: automatically, on every push to `main` that touches `services/api`.
- **Production**: only when asked. The app's release process asks for it, or
  you do:

```bash
gh workflow run api-deploy.yml -f environment=production
```

It runs the checks, prepares the R2 buckets, applies the accounts database's
migrations, deploys the Worker with `wrangler deploy --tag <commit sha>`, and
confirms `/health` reports that commit as `versionTag`. There are no version
tags or release commits for the API: a deploy is identified by its commit.
Monitor deployment in the Actions tab.

#### 1. Add GitHub secrets

Go to your repo → Settings → Secrets and variables → Actions

Add these secrets:

- `CLOUDFLARE_API_TOKEN` - [Get from Cloudflare Dashboard](https://dash.cloudflare.com/profile/api-tokens)
- `CLOUDFLARE_ACCOUNT_ID` - Your Cloudflare account id
- `SENTRY_AUTH_TOKEN` - For the source map upload (see [AGENTS.md](AGENTS.md#sentry-source-maps))

#### 2. Get Cloudflare API Token

1. Go to [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens)
2. Click "Create Token"
3. Use "Edit Cloudflare Workers" template, and add **D1: Edit** and **Workers R2 Storage: Edit**
4. Copy the token and add it to GitHub secrets as `CLOUDFLARE_API_TOKEN`

### Manual deployment

Only when the workflow can't run. Apply the accounts migrations first
(`AGENTS.md`, "Accounts"), then:

```bash
pnpm run deploy        # production
pnpm run deploy:beta   # Beta
```

## API Endpoints

Full API reference: [`/docs`](https://api.witnesswork.app/docs) (Scalar), generated from the routes; the raw OpenAPI 3.1 document is at [`/openapi.json`](https://api.witnesswork.app/openapi.json). Locally: `http://localhost:8787/docs`.

### Signed requests (Buddies and accounts)

Signed ops send a JSON envelope:

```json
{ "payload": "<base64url of the UTF-8 JSON request fields>", "signature": "<base64url Ed25519 signature>" }
```

`signature` covers the op's context line (`ww-buddies/v1\n<op>\n` or
`ww-account/v1\n<op>\n`) followed by the exact decoded `payload` bytes. Routes
whose body is raw bytes, or that have no body (`blob/put`, `backup/put`, the
live WebSocket), send the same two values in `x-buddies-payload` /
`x-buddies-signature` or `x-ww-payload` / `x-ww-signature`. Each op in `/docs`
lists its decoded `payload` fields. The wire contract is
[`docs/buddies-protocol.md`](docs/buddies-protocol.md).

App versions with account sessions sign far less: they sign only to open a
session (and to delete backups), and call every other accounts route with
`Authorization: Bearer <accessToken>` (below).

### Accounts and sessions (`/accounts/v1/*`)

Anonymous accounts (a random id and a public key). An app proves it's
WitnessWork once per session and then calls with short-lived bearer tokens:

- **`POST /accounts/v1/sessions`** opens a session: an envelope self-signed
  by the account key (op `session/open`) carrying an attestation from
  `POST /attestation/v1/challenge` (purpose `account-session`, both hashes
  `hex(SHA-256("ww-account/v1/session\n" + accountPub))`). Answers 201 with
  an access token (a 15-minute JWT), a refresh token, and `Location:
  /accounts/v1/sessions/current`. Sessions last 90 days.
- **`POST /accounts/v1/sessions/refresh`** trades `{ refreshToken }` for a
  new pair; each refresh token works once (plus a 60-second grace for a lost
  response, which gets the same new refresh token again), and presenting an
  older one ends the session. Refresh tokens are opaque strings
  (`<sessionId>.<secret>.<mac>`); one the worker didn't issue is 401 and
  never ends a session.
- **`DELETE /accounts/v1/sessions/current`** ends the token's session.
- **`GET /accounts/v1/account`** reads the token's account.
- Handoff (`/accounts/v1/handoff/*`) and backup (`/accounts/v1/backup/*`)
  take the bearer token too, as `POST /{op}` with ids in bodies.
- **Cloud Sync** (`GET /accounts/v1/sync`, `POST /accounts/v1/sync/put|list|get|delete|request`,
  `POST /accounts/v1/sync/photos/put|list|get|delete`, `GET /accounts/v1/sync/photos/usage`,
  and the `GET /accounts/v1/sync/live` WebSocket): each device's end-to-end
  encrypted snapshot in a slot, the account's encrypted photos (2 GB),
  changes streamed to the account's other devices, and the web's request
  that the account's phones turn it on. Free
  for everyone (witness-work ADR 0040); behind KV `sync:enabled` and
  `sync:entitlement`; see `AGENTS.md`.
- **Browsers** (the web app) call from an exact allow-list of origins
  (`WEB_APP_ORIGINS`) with CORS, and open the live sockets (`sync/live`,
  Buddies' `inbox/live`) with a 30-second ticket from
  `POST /accounts/v1/live/ticket` (`{ socket, id }`, live session only),
  offered as `Sec-WebSocket-Protocol: ww.v1, ticket.<ticket>` instead of
  headers (never the access token: Cloudflare's logs record that header; the
  ticket's claims are encrypted, and it opens one socket at a time); the 101 answers
  `ww.v1`, and the socket closes with `4004 "expired"` when the access token
  the ticket was minted with expires. See `AGENTS.md`, "Web app
  origins (CORS)" and "Browser live sockets".

Older app versions authenticate the pre-session way (signed envelopes,
`account/register`, `account/info`) while the legacy switch (KV
`auth:legacy`) is on; once it's off they get 426 `upgrade_required`.
`GET /app/v1/config` (no auth) tells the app its minimum version, so it can
show Update Required first. The runbook is in `AGENTS.md`, "Turning off
backward compatibility".

### Shared Spaces (`/spaces/v1/*`)

The server half of Shared Cars (witness-work ADR 0037): one Durable Object
per shared space holding sealed records, members by token hash and X25519
public key (each `memberId` commits to its key), wrapped keys, and invites,
for up to 10 members. Every op is `POST /spaces/v1/{op}` (`create`, `sync`,
`put`, `invite/create`, `invite/delete`, `join`, `leave`, `member/remove`,
`rekey`, `delete`) with `Authorization: Bearer <accessToken>`; ids and
member tokens travel in the body, never the URL. `GET /spaces/v1/live` is a
WebSocket (ids in `x-ww-space-auth`, the member token in `x-ww-space-token`) that
says `hello`, then `changed`. Behind KV `spaces:enabled`; free. The wire
contract is [`../../docs/shared-cars-protocol.md`](../../docs/shared-cars-protocol.md); the runbook is in
`AGENTS.md`, "Shared Spaces".

### `/autocomplete`

Proxies to HERE Autocomplete API.

**Example request:**

```bash
curl "https://api.witnesswork.app/autocomplete?q=Seattle&limit=5"
```

**Query parameters:**

- `q`: Search query (required)
- `limit`: Max number of suggestions
- `in`: Geographic filter (e.g., `circle:47.6,-122.3;r=50000`)
- All other [HERE Autocomplete API parameters and docs](https://www.here.com/docs/bundle/geocoding-and-search-api-developer-guide/page/topics/endpoint-autocomplete-brief.html)

**Note:** The `apiKey` parameter is automatically injected by the proxy. Any `apiKey` sent by the client will be removed.

### `/geocode`

Proxies to HERE Geocode API.

**Example request:**

```bash
curl "https://api.witnesswork.app/geocode?q=1600+Amphitheatre+Parkway"
```

**Query parameters:**

- `q`: Address to geocode (required)
- All other [HERE Geocode API parameters and docs](https://www.here.com/docs/bundle/geocoding-and-search-api-developer-guide/page/topics-api/code-geocode-address.html)

**Note:** The `apiKey` parameter is automatically injected by the proxy. Any `apiKey` sent by the client will be removed.

### `/places/v1/search`

Points of interest and addresses near a coordinate, from HERE Discover, for
the web app's place field. Unlike the two proxies above it reads only `q`,
`at`, `limit` (1–20, default 5), and `lang`, and answers a trimmed shape
(`{ ok, items: [{ id, name?, category?, address, latitude, longitude,
distanceMeters? }] }`). Public, in the `places` per-IP bucket.

```bash
curl "https://api.witnesswork.app/places/v1/search?q=coffee&at=39.1031,-84.5120&limit=3"
```

### `/maps/v1/mapkit-tokens`

`POST` with `Authorization: Bearer <accessToken>`: a 30-minute MapKit JS token
for the web app's map frame. 503 `maps_unconfigured` until the MapKit JS key
is set. Both routes are documented in [`docs/maps.md`](docs/maps.md).

### `/.well-known/apple-app-site-association`

Serves the AASA JSON used by iOS to validate universal links. Lists the prod
(`com.leviwilkerson.jwtime`), Beta (`com.leviwilkerson.jwtimebeta`), and dev
(`com.leviwilkerson.jwtimedev`) bundle IDs, prefixed with `APPLE_TEAM_ID`.

Matches `/contacts#<payload>`, `/buddies/invite#1…`, and
`/accounts/handoff#1…`, plus the short paths older app versions put in links
(`/c#<payload>`, any URL under `/c/*`, `/b#1…`, `/h#1…`). Those links are
already in people's messages, so the short paths stay listed and served for
good; dropping one would open its links in Safari instead of the app. On the
website apex (`witnesswork.app`, Beta `beta.witnesswork.app`), which never had short links, it lists only
the full-word paths ([`docs/link-pages.md`](docs/link-pages.md)).

### `/contacts` (and the short `/c`)

Universal-link landing page for shared WitnessWork contacts
(`/contacts#<payload>`). iOS hands the link off to the WitnessWork app when
installed; otherwise this endpoint serves a fallback HTML page with an App
Store CTA and "Continue on the web" (the web app's `/contacts` with the same
fragment). `/c` serves the same page for links older app versions shared.

The page, accessibility labels, and Open Graph/Twitter preview strings support
the same 18 locales as the app's `../../src/lib/locales.ts`. Pass `?lang=pt-pt`
before the fragment (`/contacts?lang=pt-pt#<payload>`) to choose a language explicitly;
otherwise the worker uses `Accept-Language` preferences, including quality
weights, and defaults to English (`en-us`). Unsupported or malformed `lang`
values fall back to browser preferences. Regional variants fall back to the
same language; Portuguese defaults to `pt-br`, and Chinese uses Simplified
unless Traditional script or a Taiwan/Hong Kong/Macau region is requested.
Responses include `Content-Language` and `Vary: Accept-Language`. Preview
crawlers without a language preference receive English unless `lang` is set.
The `og:url` is the bare page path (`/contacts` or `/c`) on the host it was
served on, without language or contact data.
The same localization rules apply to legacy `/c/:payload` links.

The payload is an opaque gzip + base64url–encoded contact export produced by
the app. It rides in the URL fragment, which clients never send, so the worker
never sees it; the page's inline script builds the
`witnesswork://import-contact/<payload>` "Open app" link in the browser.

### `/c/:payload`

Legacy links from older app versions, with the payload in the path. Serves the
same page with a server-rendered "Open app" link; the payload stays out of
`og:url` and the other meta tags, and Sentry events redact it to
`/c/[redacted]`. The worker never decodes it.

### Attestation (`/attestation/v1/*`)

Device attestation for the whole API: App Attest on iOS, Play Integrity on
Android. Code in `src/attestation/`.

- **`POST /attestation/v1/challenge`** issues a one-time challenge: App Attest
  v1 (empty body), App Attest v2 (`bind`, `enroll`, or `assert`), or Play
  Integrity. v2 and Play Integrity challenges are bound to one protected
  request: its `purpose`, ids, and hashes.
- **`POST /attestation/v1/register`** binds an App Attest key to the install
  id, or enrolls a v2 recovery token. Play Integrity has no registration step.
- **`POST /attestation/v1/verify`** is an attested no-op for the app's
  developer tools (purpose `attestation-verify`; the older
  `notes-import-verify` is accepted too).
- **`GET /attestation/v1/status`** lists the accepted providers as
  `capabilities` (App Attest always; Play Integrity once configured), the
  same object `GET /notes-import/status` carries. `providers` repeats it for
  builds that read the old name.

Each protected route verifies an assertion signed for its own `purpose`
(registry: `src/attestation/purposes.ts`). New routes call
`requireAttestation` (`src/attestation/http.ts`), which takes App Attest v2 or
Play Integrity. Purposes are signed by installed apps, so a shipped one is
never renamed.

The old paths `POST /notes-import/challenge`, `/notes-import/attest`, and
`/notes-import/verify` run the same handlers for deployed apps while the
Notes Import legacy switch is on (426 otherwise; see
[Notes Import](#notes-import-legacy-notes-import)), adding
`Deprecation: @1792022400` (2026-10-15) and
`Link: </attestation/v1/…>; rel="successor-version"`. Each hit logs
`deprecated path: <old> -> <new>` (route names only). Remove them once the
minimum app version uses the new paths and those logs go quiet.

### Scribe AI (`/scribe/v1/*`)

The model side of Scribe AI, the in-app assistant that logs time, plans time,
records visits and updates contacts by proposing changes the User reviews.
The app owns the tools and runs every one of them on the device; ww-api runs
one model step per request and stores no conversation content. **The wire
contract is the app's
[`docs/scribe-ai-protocol.md`](../../docs/scribe-ai-protocol.md)**
(witness-work ADR 0032); `/docs` has each route's OpenAPI entry. Code in
`src/scribe/`.

| Route | Auth | Answer |
| --- | --- | --- |
| `GET /scribe/v1/status` | none | `{ enabled, reason, protocol: { min, max }, minAppVersion, disabledTools, limits }`, the same for everyone, reused per isolate for 30 s |
| `GET /scribe/v1/usage` | bearer | the account's usage snapshot (windows, `limited`, `resetsAt`); read-only |
| `POST /scribe/v1/step` | bearer | one model step as SSE: `start`, then `text` / `tool_call`, then exactly one `done` or `error` |
| `POST /scribe/v1/transcribe` | bearer | Import from Paper: one page image to text, metered like a step |
| `POST /admin/scribe/reset` | `x-ww-admin-token` | sets an account's windows back to unused (404 without the token) |

- **One step per request.** The app sends the whole conversation, its tool
  definitions, and an app context each step; the server validates their
  shape and size, adds its static system prompt, and streams the model's text
  and tool calls back. Tools have no server-side `execute`. Write tools only
  propose: nothing changes until the User taps Add in the app.
- **Metering** is in units, `ceil(uncached input + 0.1 × cached input + 5 ×
  output)`, charged per step to a per-account `ScribeMeter` Durable Object.
  Free accounts have a weekly window, with a larger limit in an account's
  first week; Supporters a 5-hour session window and a weekly window. A turn
  admitted at step 0 may finish over the limit within
  the turn grace. Admission also checks the step's idempotency key and the
  active-step cap.
- **Model**: `openai/gpt-6-luna` on Azure through OpenRouter, ZDR-only
  (`zdr: true`, `data_collection: 'deny'`, the provider allowlist, fail closed;
  ADR 0008). Status needs an allowlisted host whose metadata lists `tools`;
  KV `scribe:model` can name a fallback.
- **Privacy**: logs, Sentry, and the `api_scribe_step` / `api_scribe_transcribe`
  analytics events carry structure only (tool names, counts, tokens, units,
  timings, finish), never messages, arguments, results, context, tool
  descriptions, or provider error bodies.
- **Configuration**: every limit and switch resolves KV → `SCRIBE_*`
  environment variable → default. The KV keys and the Notes Import cutover
  runbook are in [AGENTS.md](AGENTS.md#scribe-ai).

**One-time setup** (beyond HERE/Sentry):

```bash
pnpm exec wrangler kv namespace create NOTES_KV
# → paste the printed id into wrangler.toml [[kv_namespaces]] id

pnpm exec wrangler secret put OPENROUTER_API_KEY
pnpm exec wrangler secret put REVENUECAT_API_KEY
pnpm exec wrangler secret put ADMIN_API_TOKEN
pnpm exec wrangler secret put ADMIN_API_TOKEN --env beta  # use a DIFFERENT value
```

#### Admin usage reset

Generate distinct prod/Beta tokens with `openssl rand -base64 32`, configure the
Wrangler secrets above, copy `.env.example` to the gitignored `.env`, and set the
matching tokens (`ADMIN_API_TOKEN`, `ADMIN_API_TOKEN_BETA`). Then run:

```bash
pnpm run admin:reset-usage <accountId>          # production
pnpm run admin:reset-usage --beta <accountId>   # Beta
```

It sets every Scribe AI window of the account back to unused, and its paper
pages for the day. Find an account id from a Buddies inbox with
`POST /admin/accounts/lookup`. `--notes-import` resets the old Notes Import
meter instead (`POST /admin/notes-import/reset`), which answers only while the
legacy switch below is on. Missing configuration or bad auth returns 404.
Never reuse `NOTES_IMPORT_DEV_BYPASS_TOKEN` as the admin secret.

### Notes Import (legacy, `/notes-import*`)

Scribe AI replaced Notes Import. Every `/notes-import/*` route except
`GET /notes-import/status` answers 426 `upgrade_required` (no `Retry-After`)
unless KV `scribe:legacy-notes-import` is `on`, before its rate limit, auth,
or kill switch (`src/scribe/legacy.ts`); `GET /notes-import/usage` is 404, as
before the route, so opening an older composer doesn't put the whole app
behind Update Required. `GET /notes-import/status` stays,
because older app versions read attestation capabilities from it to open
account sessions; newer ones read `GET /attestation/v1/status`. The code stays,
unreachable while the switch is off, until a follow-up deletes it. Its
contract is in `/docs` and this file's git history.

### Supporter status on the account

The server answers whether an account is a Supporter from its own record
(witness-work ADR 0029, `src/accounts/supporter.ts`), kept current by
RevenueCat's webhook. Who counts is ADR 0014's rule (`src/revenuecat.ts`).

- `POST /accounts/v1/revenuecat-customers` (Bearer) `{ appUserId }` →
  `{ ok, supporter, expiresAt }`. `appUserId` is the RevenueCat app user id the
  app is logged in as. The server reads that customer from RevenueCat, stores
  what RevenueCat says, links it to the token's account, and answers the
  account's status. Repeating it reads RevenueCat again. A customer RevenueCat
  has never seen isn't linked. At most 5 customers an account and 5 accounts a
  customer; a new link past either replaces the least recently linked.
  RevenueCat unreachable is 503 `unavailable`. Besides the read tier per IP,
  links count against the register tier (60 a minute) per account.
- `GET /accounts/v1/supporter` (Bearer) → `{ ok, supporter, expiresAt,
  customers }`.
- `POST /revenuecat/v1/webhook`: RevenueCat's servers only, with the
  integration's Authorization header (`Bearer <REVENUECAT_WEBHOOK_AUTHORIZATION>`).
  Each customer an event names that some account links is read again from
  RevenueCat's REST API; unlinked customers are ignored. Idempotent by event
  id; RevenueCat trouble is 503 so RevenueCat retries.
- A record read within the last day is the answer until its expiry; an older
  one is read again first, as is a Supporter whose expiry passed since it was
  read (one read tells a renewal from a lapse). Each RevenueCat read gives up
  after 5 seconds. RevenueCat unreachable then: route planning answers
  503 `supporter_check_failed`; Scribe AI (and Notes Import) count the User
  as free, with `supporterCheckFailed: true`.

### `POST /route-planning/optimize`

Supporter-only shortest driving order for the app's "Plan today's route". Sends
the stops to HERE Waypoints Sequence v8 (`findsequence2`), which returns the
fastest visiting order (live traffic, open path ending at the last stop) for one
transaction per request.

**Request** (JSON; any other field is rejected), with `Authorization: Bearer
<access token>`:

```json
{
  "start": { "lat": 39.1031, "lng": -84.512 },
  "stops": [{ "lat": 39.11, "lng": -84.5 }, { "lat": 39.12, "lng": -84.49 }]
}
```

The token's account must be a Supporter ([above](#supporter-status-on-the-account)),
and a suspended account is refused (403 `suspended`). Limits are per account.

**Legacy** (no `Authorization` header; app versions before sessions): the body
also carries `"accountId"`, the RevenueCat app user id, which RevenueCat must
say is a Supporter; it's also the limits' key. Served while the legacy switch
(KV `auth:legacy`) is on, and 426 `upgrade_required` once it's off.

1–10 stops. HERE receives only the coordinates, under opaque ids (`start`,
`s0`…), in a form POST body. Neither the coordinates nor any id are logged or
stored.

**Response:**

```json
{ "order": [1, 0], "distanceMeters": 4321, "durationSeconds": 601, "remainingToday": 9 }
```

`order` lists indices into `stops` in visiting order.

**Errors** carry `{ "ok": false, "error", "code" }` (`error` is a message;
branch on `code`): `bad_request` (400), `unauthorized` (401, bearer),
`payload_too_large` (413), `supporter_required` / `suspended` (403),
`upgrade_required` (426, legacy), `supporter_check_failed` (503 — RevenueCat
unreachable; fails closed), `unavailable` (503 — kill switch), `daily_limit` /
`rate_limited` (429), `no_route` (422), `upstream_error` (502). Every 429 and
503 sends `Retry-After` and repeats it as `retryAfter` (and, for older builds,
`retryAfterSeconds`).

### `POST /route-planning/directions`

The driving route through the points in the order given, so the Android app
can draw roads on the route map and time each leg (iOS asks MapKit on the
device). One HERE Routing v8 transaction per request: every point between the
first and last is a stopover `via`, so the route comes back as one section per
leg.

**Request** (JSON; any other field is rejected), with `Authorization: Bearer
<access token>`: 2–12 points (the start, the stops, and a finish elsewhere).

```json
{ "points": [{ "lat": 39.1031, "lng": -84.512 }, { "lat": 39.11, "lng": -84.5 }] }
```

Any account with a session, Supporter or not; a suspended account is refused
(403 `suspended`). No legacy form. Limits are per account and separate from
optimizations (100 a day, 10 a minute). Routing v8 takes waypoints only in the
query string, so the coordinates are in HERE's URL; the call uses an
uninstrumented `fetch`, so the URL never reaches a trace, and nothing logs or
stores the coordinates.

**Response:** one leg per consecutive pair of points. `coordinates` is the
road shape as flat `[lat, lng, lat, lng, …]`, rounded to 5 decimals.

```json
{
  "legs": [{ "distanceMeters": 4321, "durationSeconds": 601, "coordinates": [39.1031, -84.512, 39.11, -84.5] }],
  "remainingToday": 99
}
```

**Errors** as for optimize: `bad_request` (400), `unauthorized` (401),
`suspended` (403), `payload_too_large` (413), `no_route` (422),
`daily_limit` / `rate_limited` (429), `upstream_error` (502), `unavailable` /
`disabled` (503).

### `/health`

Health check endpoint, and the clock clients calibrate against: it sends
`Cache-Control: no-store` and a `Date` header, and does no I/O.

**Response:**

```json
{
  "status": "ok",
  "timestamp": "2024-11-27T12:34:56.789Z",
  "serverTime": 1732710896789,
  "versionId": "…",
  "deployedAt": "…"
}
```

## Error Responses

Every JSON route answers errors with one envelope (`src/errors.ts`):

```json
{ "ok": false, "error": "rate_limited", "code": "rate_limited", "retryAfter": 60 }
```

- `code` is always the stable, machine-readable code; read it first.
- `error` is the same code everywhere except attestation, Notes Import,
  Scribe AI, and route planning, where it's a human-readable message.
- Every 429 and 503 sends `Retry-After` (seconds) and repeats it as
  `retryAfter`, except quotas no wait can free (Notes Import's
  `limit_reached` and `refinement_limit`, Buddies' `limit`). Scribe AI's 402
  `limit_reached` sends it too, until the full window resets.
- Routes add their own fields beside these (`reason`, `action`, `credits`,
  `serverTime`, HERE's own error fields on the place-search proxy).
- A bearer route's missing, expired, or invalid token is 401 `unauthorized`
  with `WWW-Authenticate: Bearer error="invalid_token"`: refresh once and
  retry. A request authenticated the pre-session way after the legacy switch
  is off is 426 `upgrade_required`, without `Retry-After`.
- `/geocode` and `/autocomplete` pass HERE's status through; a HERE error body
  keeps its fields and gains the envelope (`bad_request`, `not_found`,
  `rate_limited`, `upstream_error`). HERE unreachable or answering non-JSON is
  502 `upstream_error`.
- The HTML pages (`/contacts`, `/buddies/invite`, `/accounts/handoff`, and
  the short `/c`, `/c/:payload`, `/b`, `/h`) are for browsers and always
  answer 200.
- `POST /buddies/v1/blob/get` answers a Buddies photo blob's raw bytes
  (`application/octet-stream`) on success; its errors use the envelope.

Per-IP limits (`RATE_LIMITER`, 60/min) count each route family in its own
bucket: `places` (`/geocode`, `/autocomplete`, `/places/v1/*`),
`notes-import`, `scribe` (`/scribe/v1/step`, `/scribe/v1/transcribe`),
`attestation`, `route-planning`, `maps` (`/maps/v1/*`), `admin`, and `app`
(`/app/v1/*`)
(`src/rateLimit.ts`). The old `/notes-import/*` attestation paths still
count in `notes-import`. Refusals are 429 `rate_limited` with
`Retry-After: 60`. Buddies and accounts have their own per-caller tiers.

Unexpected errors are 500 `server_error` and are reported to Sentry.

## Architecture

```
Client Request
    ↓
Cloudflare Workers (Global Edge)
    ↓
Hono Router
    ↓
API Key Injection & Sanitization
    ↓
HERE API
    ↓
Response to Client

(Sentry monitors all errors)
```

## Stack

- **Runtime**: Cloudflare Workers with `nodejs_compat` and `enable_request_signal`
- **Framework**: [Hono](https://hono.dev/)
- **Language**: TypeScript
- **Package Manager**: pnpm
- **Monitoring**: Sentry
- **Wrangler**: v4.42.2

## App OTA updates

Hot Updater runs in separate dev, beta and prod Workers, each with its own D1
catalog and private R2 bucket (the dev update channel stays, for
development-channel builds, though the API itself has no deployed dev tier). See [the OTA runbook](docs/ota-updates.md) for
resource identities, migration/deployment commands and credential setup.
