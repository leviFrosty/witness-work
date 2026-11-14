# Web maps

The web app's map frame gets a MapKit JS token from `POST /maps/v1/mapkit-tokens` (Bearer, any active account), and its place field searches points of interest with `GET /places/v1/search` (public, HERE Discover). Without the MapKit JS key the token route answers 503 `maps_unconfigured`; with one it answers a 30-minute ES256 JWT whose `origin` is the frame's. Contract: `docs/maps.md`.

## Sub-features

- `token-no-bearer`: no or a forged token is 401 `unauthorized` with `WWW-Authenticate: Bearer error="invalid_token"`.
- `token-unconfigured`: a valid token on a worker without `MAPKIT_JS_*` is 503 `maps_unconfigured`, `Retry-After: 60`.
- `token-mint`: with a throwaway key, 200 `{ok, token, origin, expiresAt}`, `Cache-Control: no-store`; header `{alg: ES256, kid, typ: JWT}`, claims `{iss, iat, exp = iat + 1800, origin, scope: mapkit_js}`.
- `token-origin`: `{"origin":"…"}` picks another allowed origin; anything else is 400 `origin_not_allowed`.
- `token-limit`: the 11th token in a minute for one account is 429 `rate_limited` with `Retry-After`.
- `poi-validate`: a missing or bad `q`, `at`, `limit`, or `lang` is 400 `bad_request` with `field`, without asking HERE.
- `poi-search`: with `HERE_API_KEY`, 200 `{ok: true, items: […]}`; points of interest carry `name` and `category`, addresses don't.
- `addresses-validate`: no bearer is 401; a bad outline is 400 `bad_request` with `field` (`outline` or `body`); an outline over 3 km a side is 413 `area_too_large`. Overpass isn't asked.
- `addresses-search`: with `WW_API_E2E_OVERPASS=1`, a small Alamo Square outline answers 200 `{ok, source: "openstreetmap", attribution, addresses: [{street, number, latitude, longitude}]}` (about 80 addresses), and the same outline again comes from the edge cache in milliseconds.

## How to get to it (user POV)

- The web app opens a map (the Map tab, Route Planning, a contact's pin picker): it asks for a token and hands it to the frame on `maps(-dev).witnesswork.app`.
- The web app's place field (a Plan location, "search places") types a query.
- No native app build calls either route today.

## Driving it with verify-ww-api

Preconditions:

- For `token-mint`, write a secrets file outside the repo (mode 600) with a throwaway P-256 key and start with it: `MAPKIT_JS_PRIVATE_KEY="<PKCS#8 PEM on one line, \n escapes>"`, `MAPKIT_JS_KEY_ID=THROWAWAY1`, `MAPKIT_JS_ORIGINS=https://maps-beta.witnesswork.app,http://localhost:8081`, plus `HERE_API_KEY=…` for `poi-search`; then `node scripts/verify/dev.mjs up --secrets-from <file>`. Keep the public half to check signatures.
- For `token-unconfigured`, start without the `MAPKIT_JS_*` names.
- `doctor` passes and `URL` is exported. `doctor` lists which `MAPKIT_JS_*` names are set.
- A session token: open one with the dev bypass (`openSession` in `src/test/e2e.ts`, or `accountEnvelope('session/open', key)` from `scripts/verify/buddies-wire.mjs` posted to `/accounts/v1/sessions` with `x-ww-dev-bypass`).

- **No bearer.** Run `curl -si -X POST $URL/maps/v1/mapkit-tokens -H "cf-connecting-ip: 198.18.6.1"`. You get 401 `{"ok":false,"error":"unauthorized","code":"unauthorized"}` and the `WWW-Authenticate` challenge.
- **Unconfigured.** Add `-H "authorization: Bearer $TOKEN"` on a worker without the key. You get 503 `{"ok":false,"error":"maps_unconfigured","code":"maps_unconfigured","retryAfter":60}`.
- **Mint.** The same request on a worker with the throwaway key answers 200. Split `token` on `.`, base64url-decode the first two parts, and verify the third (64 raw bytes, P1363) with the public key (`crypto.verify('sha256', …, { key, dsaEncoding: 'ieee-p1363' }, …)` in Node).
- **Origin.** Send `-H "content-type: application/json" -d '{"origin":"http://localhost:8081"}'`: the claims' `origin` is that. `-d '{"origin":"https://evil.example"}'` is 400 `origin_not_allowed`.
- **POI search.** Run `curl -s "$URL/places/v1/search?q=coffee&at=39.1031,-84.5120&limit=3" -H "cf-connecting-ip: 198.18.6.2"`. With a HERE key, three items with `name`, `category`, `address.label`, `latitude`, `longitude`. `q=zzqqxxjjvvkk` answers `items: []`.
- **House numbers.** With a bearer token, `curl -s -X POST $URL/maps/v1/addresses -H "authorization: Bearer $TOKEN" -H "content-type: application/json" -H "cf-connecting-ip: 198.18.6.3" -m 70 -d '{"outline":[{"latitude":37.7758,"longitude":-122.4338},{"latitude":37.7758,"longitude":-122.4312},{"latitude":37.7772,"longitude":-122.4312},{"latitude":37.7772,"longitude":-122.4338}]}'`. One real Overpass query: expect 200 with Fillmore, Grove, Hayes, and Steiner Street numbers, or 503 `upstream_busy` when the public instance is at capacity. The same body again answers from the cache in milliseconds.
- **Proof.** Run `WW_API_E2E_OVERPASS=1 pnpm test:e2e src/e2e/maps.e2e.test.ts`. Six tests pass and two skip (the unconfigured or the mint test, whichever the worker's config rules out; the HERE test skips without a key; the Overpass test skips without `WW_API_E2E_OVERPASS`), with the transcript in `.verify/artifacts/e2e-maps-*.json`.

## Gotchas

- The token route counts in the per-IP `maps` bucket and the search in `places` (shared with `/geocode` and `/autocomplete`): use a fresh `cf-connecting-ip` per request.
- The per-account limit lives in the local `RoutePlanningQuota` DO state: a reused session hits it after 10 tokens a minute. Open a new session, or wait a minute.
- An `http://localhost` origin counts only on a development worker served from a local host (the launcher's is); a deployed worker skips it.
- Never use a real MapKit JS key locally, and never print the PEM. Apple never sees local tokens, so a throwaway key proves the format, not Apple's acceptance.
- Each `poi-search` request is one real HERE Discover transaction.
- Each uncached `addresses-search` is one real query on the public Overpass instance, free but shared: run it once, not in a loop. Under load it takes 30–50 s; the e2e allows 70 s. The account quota is 6 a minute.
