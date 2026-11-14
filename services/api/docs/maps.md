# Maps on the web

The web app's map (witness-work ADR 0037 §8) is Apple MapKit JS running in a
sandboxed frame on its own origin: `https://maps.witnesswork.app` in
production, `https://maps-beta.witnesswork.app` for Beta, which local
development borrows (ADR 0042 §1). The
frame gets only coordinates and pin styles by `postMessage`, never names or
notes. ww-api serves three things for it:

| Route | Auth | What |
| --- | --- | --- |
| `POST /maps/v1/mapkit-tokens` | Bearer | A 30-minute MapKit JS token for the frame |
| `GET /places/v1/search` | None (per-IP) | Points of interest and addresses near a coordinate (HERE Discover) |
| `POST /route-planning/directions` | Bearer | Driving legs with road shapes (HERE Routing); unchanged, already shipped for Android |

Code: `src/maps/` (`route.ts` handlers, `mapkitToken.ts` signing and config,
`placeSearch.ts` HERE Discover, `config.ts` limits, `openapi.ts` docs). The
reference for every field is `/docs` (tags **Maps** and **Places**). CORS for
the web app's origins is a separate change (witness-work ADR 0038 §10).

## MapKit JS tokens

`POST /maps/v1/mapkit-tokens`

The web app calls it with its session and posts the token to the frame, which
returns it from `mapkit.init({ authorizationCallback })`. MapKit JS calls the
callback again when the token expires, so the frame asks the app, and the app
asks here. The frame never holds the access token.

**Request.** `Authorization: Bearer <accessToken>` (from
`POST /accounts/v1/sessions`). The body is optional: none, `{}`, or
`{ "origin": "<frame origin>" }` to pick one of the worker's allowed origins
(the first is the default). At most 1,024 bytes; unknown fields are refused.

**Response 200** (`Cache-Control: no-store`):

```json
{
  "ok": true,
  "token": "eyJhbGciOiJFUzI1NiIsImtpZCI6Ik…",
  "origin": "https://maps.witnesswork.app",
  "expiresAt": 1793348856000
}
```

`expiresAt` is the token's `exp` in epoch ms. The token is an ES256 JWT:

```json
// header
{ "alg": "ES256", "kid": "<MapKit JS key id>", "typ": "JWT" }
// claims
{ "iss": "<Apple team id>", "iat": 1793347056, "exp": 1793348856,
  "origin": "https://maps.witnesswork.app", "scope": "mapkit_js" }
```

Apple checks `origin` against the page that loaded MapKit JS, so a token works
only inside the frame. `scope: "mapkit_js"` limits it to MapKit JS, never
Apple's Maps Server API under the same key.

**Errors** (shared envelope, `error` = `code`):

| Status | `code` | When |
| --- | --- | --- |
| 400 | `bad_request` | Invalid JSON, a non-string `origin`, or another field |
| 400 | `origin_not_allowed` | `origin` isn't one of this worker's frame origins (exact string match) |
| 401 | `unauthorized` | No, expired, or invalid access token (`WWW-Authenticate: Bearer error="invalid_token"`) |
| 403 | `suspended` | The account is suspended |
| 413 | `too_large` | Body over 1,024 bytes |
| 429 | `rate_limited` | 10 tokens per account in a rolling minute, or the per-IP `maps` bucket (60/min) |
| 429 | `daily_limit` | 500 tokens per account in a rolling 24 hours |
| 503 | `maps_unconfigured` | The key, its id, the team id, or a frame origin is missing or invalid (`Retry-After: 60`) |
| 503 | `disabled` | Accounts are off on this worker |

Every 429 carries `Retry-After`. Authentication is checked first, so a
request without a token is 401 whether or not maps are configured.

**Limits.** An open map renews every 30 minutes (48 a day), so 500 a day is
about ten all-day tabs plus reloads. The counts live in the
`RoutePlanningQuota` Durable Object under `mapkit-token:account:<accountId>`
(timestamps only, gone a day after the newest), apart from route planning's
own counts.

### Configuration

| Name | Kind | Value |
| --- | --- | --- |
| `MAPKIT_JS_PRIVATE_KEY` | secret | The MapKit JS key's `.p8` (PKCS#8 PEM, P-256). Literal `\n` escapes are fine |
| `MAPKIT_JS_KEY_ID` | secret | Its 10-character key id (the `kid`) |
| `APPLE_TEAM_ID` | secret (already set) | The team id (the `iss`), shared with the AASA and App Attest |
| `MAPKIT_JS_ORIGINS` | var | Comma-separated frame origins: prod `https://maps.witnesswork.app`, Beta and local dev `https://maps-beta.witnesswork.app` |

Each origin must be a bare origin, `https://<DNS name>[:port]` written as
the browser would (lowercase, no default port, no path, no wildcard, no
trailing dot). `http://localhost`, `127.0.0.1`, and `[::1]` origins count only
under `wrangler dev`: a development worker served from a local host. A
deployed worker skips them even if listed, so they belong in a local
`.dev.vars` (or the verify launcher's secrets file), never in `wrangler.toml`.
Invalid entries are dropped with one warning per isolate, as are a malformed
key id or team id; a key that doesn't import answers `maps_unconfigured` and
reports one Sentry message per isolate (never the key). A SEC1 (`BEGIN EC
PRIVATE KEY`) P-256 key may import too, but Apple issues PKCS#8.

### Setting it up (owner)

1. Apple Developer → Certificates, Identifiers & Profiles → Identifiers →
   **Maps IDs**: register one (for example `maps.app.witnesswork`).
2. Keys → new key with **MapKit JS** enabled for that Maps ID. Download the
   `.p8` (once only) and note the key id. Restrict it to the frame hosts if
   the portal offers it (`maps.witnesswork.app`, `maps-beta.witnesswork.app`).
   One key can serve both workers; a key per environment lets you revoke one
   alone.
3. Store the `.p8`, key id, and team id in 1Password's Agents vault
   (`MapKit JS key (beta)` / `MapKit JS key (prod)`).
4. Set the secrets, then delete the downloaded file:

   ```bash
   wrangler secret put MAPKIT_JS_KEY_ID --env beta
   wrangler secret put MAPKIT_JS_PRIVATE_KEY --env beta < AuthKey_XXXXXXXXXX.p8
   wrangler secret put MAPKIT_JS_KEY_ID
   wrangler secret put MAPKIT_JS_PRIVATE_KEY < AuthKey_XXXXXXXXXX.p8
   ```

Until then the route answers 503 `maps_unconfigured`, which the web app can
show as "Maps aren't available yet". Rotating: create a new key, set both
secrets, then revoke the old key in the portal; tokens signed by it stop
working when revoked, at most 30 minutes early.

## Point-of-interest search

`GET /places/v1/search?q=<text>&at=<lat>,<lng>[&limit=<n>][&lang=<bcp47>]`

HERE Discover, one transaction per request: points of interest and addresses
matching `q`, ranked near `at`. The web app's place field uses it where
MapKit's native search (iOS `modules/place-search`, scope `all`) isn't
available.

| Parameter | Required | Rule |
| --- | --- | --- |
| `q` | yes | 1–200 characters (code points) after trimming, no C0, DEL, or C1 control characters |
| `at` | yes | `<latitude>,<longitude>` in decimal degrees, within range |
| `limit` | no | 1–20, default 5 |
| `lang` | no | A BCP 47 tag (`en`, `pt-BR`) |

Every other parameter (`apiKey`, `in`, …) is ignored, not forwarded. `at` is
sent to HERE rounded to 4 decimals (about 11 m).

**Response 200** (`Cache-Control: no-store`; nothing found is `items: []`):

```json
{
  "ok": true,
  "items": [
    {
      "id": "here:pds:place:840dngyk-999f3b18c81b4a389910dd76c3bd88eb",
      "name": "STARBUCKS",
      "category": { "id": "100-1100-0010", "name": "Coffee Shop" },
      "address": {
        "label": "580 Walnut St, Cincinnati, OH 45202-3108, United States",
        "houseNumber": "580", "street": "Walnut St",
        "district": "Central Business District", "city": "Cincinnati",
        "state": "Ohio", "stateCode": "OH", "postalCode": "45202-3108",
        "countryCode": "USA", "countryName": "United States"
      },
      "latitude": 39.10272,
      "longitude": -84.51096,
      "distanceMeters": 99
    }
  ]
}
```

- `name` is present only for points of interest (HERE `resultType: place`),
  like the native path's `name`; an address result has none.
- `address.label` is the postal address on one line. HERE starts a POI's
  label with its name; that prefix is cut, so `name` and `address` stay apart
  as on the native path.
- `category` is the primary HERE category. Address fields appear only when
  HERE has them. Results without an id, label, or valid position are dropped.
- HERE's contacts, opening hours, access points, and other fields are never
  passed on.

Mapping to the app's `PlaceSuggestion` (`src/lib/placeSearch.ts`): for a
POI, `title` = `name` and `subtitle` = `address.label`; for an address, the
same title and subtitle the HERE autocomplete path builds from the label. And
`place` = `{ name, address: address.label, postalAddress:
{ line1, city, state, zip: postalCode, country: countryName }, latitude,
longitude }`, so a pick needs no second request.

**Errors:**

| Status | `code` | When |
| --- | --- | --- |
| 400 | `bad_request` + `field` (`q`, `at`, `limit`, `lang`) | A missing or invalid parameter; HERE isn't asked |
| 400 | `bad_request` | HERE refused the query (its body isn't passed on) |
| 429 | `rate_limited` | The per-IP `places` bucket (60/min, shared with `/geocode` and `/autocomplete`), or HERE limiting the worker (HERE's `Retry-After`, else 60) |
| 502 | `upstream_error` | HERE unreachable, timed out (8 s), refused the worker's key, or unreadable (one grouped Sentry warning) |

Sentry already redacts `q` and `at` from every URL it records, and HERE is
called with the `fetch` captured before Sentry wraps it.

## Directions

`POST /route-planning/directions` (see `src/routePlanning/`) already covers
the web: Bearer for any account, up to 12 points, one leg per pair with
`distanceMeters`, `durationSeconds`, and the road shape as flat
`[lat, lng, …]`; 100 requests per account a day and 10 a minute. Nothing
changes for the web. The frame draws the shapes as overlays from the
coordinates it's sent.

## Decisions

- **Token route is Bearer, per-account limited.** A MapKit JS token is a
  bearer credential for our Apple quota (250k map views and 25k service calls
  a day), so only signed-in accounts get one, and each account is capped. The
  short lifetime plus `origin` and `scope` bound what a leaked token can do.
- **The origin comes from config, never the request alone.** A caller may
  only pick among the worker's own allowed origins (exact match), so no one
  can mint a token for another site.
- **POI search is public and per-IP limited, like `/autocomplete`.** It isn't
  user-scoped (no account data goes in or out), it spends HERE transactions
  like the other place routes, and it shares their `places` bucket so the
  ceiling per IP for HERE search stays where it was. Unlike them, it takes
  only its own parameters and shapes the answer, so the route can't be used
  as a general HERE proxy and the client never depends on HERE's raw format.
- **Discover over Browse or Autosuggest.** Discover takes free text ("coffee",
  "kingdom hall", or an address) and answers complete places with positions,
  so a pick needs no lookup. Browse needs category ids, and Autosuggest
  returns query suggestions that need a second call.
- **No caching** of HERE results, matching `/geocode` and `/autocomplete`.

## Verifying locally

```bash
# A file outside the repo (mode 600) with a throwaway key; Apple never sees it.
#   HERE_API_KEY=…                        (optional, for a real search)
#   MAPKIT_JS_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n…\n-----END PRIVATE KEY-----"
#   MAPKIT_JS_KEY_ID=THROWAWAY1
#   MAPKIT_JS_ORIGINS=https://maps-beta.witnesswork.app,http://localhost:8081
node scripts/verify/dev.mjs up --secrets-from /path/to/maps.env
pnpm test:e2e src/e2e/maps.e2e.test.ts
node scripts/verify/dev.mjs down
```

Without the `MAPKIT_JS_*` names the e2e expects `maps_unconfigured`; with
them it mints and checks the token. The HERE search runs only with
`HERE_API_KEY` set.
