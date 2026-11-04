# Maps on the web

The web app's map (ADR 0037 §5, §8) is Apple MapKit JS, which can only load
from Apple's CDN. It runs in a sandboxed frame on an origin of its own, so
Apple's script never runs on the app's origin, which holds the User's
decrypted data and account key.

- **Frame:** `web/maps-frame/`, a static page and one script, served by its own
  Workers Static Assets Worker. It has its own `tsconfig.json` and stays out of
  the app's Metro and TypeScript graph.
- **Protocol:** `src/lib/mapsFrame/protocol.ts`, imported by both sides. Its
  Web Mercator math, `src/lib/mapsFrame/projection.ts`, lets the app place its
  own pins and cards without asking the frame.
- **App side:** `src/vendor/web/mapView.tsx` stands in for react-native-maps on
  the web (`metro/bundleRedirects.js`), with the frame client, token client and
  overlay in `src/vendor/web/maps/`.

## What crosses to the frame

Only these, by `postMessage`:

- coordinates (pins, lines, the camera, the User's location, points to project);
- opaque pin ids (`p1`, `p2`, …), never a Contact's id;
- `#rrggbb` colors and line widths;
- the layer (standard, satellite, hybrid), the color scheme, map padding, and
  whether the map pans and shows points of interest;
- the app's language, for the map's labels;
- the MapKit JS token.

Never a name, an address, a note, a topic, or any other text a User wrote.
Contacts' pins and cards are views the app draws itself over the frame, as the
native maps draw custom marker views. The frame draws only the basemap, plain
pins (a dropped pin, a picker's pins) and lines. `e2e/web/maps.spec.ts` checks
every message the frame receives against the seeded names, addresses, notes and
ids, and every field name against the protocol's.

Apple sees what MapKit JS sends it from the browser: the User's IP address and
the parts of the map they look at, as for the Apple Maps app. The frame's
Worker sets no cookies.

## Origins

| Frame        | Worker        | Host                       | App origins that may frame it                                                 |
| ------------ | ------------- | -------------------------- | ----------------------------------------------------------------------------- |
| `dev`        | `ww-maps-dev` | `maps-dev.witnesswork.app` | `https://app-dev.witnesswork.app`, `http://localhost:*`, `http://127.0.0.1:*` |
| `production` | `ww-maps`     | `maps.witnesswork.app`     | `https://beta.app.witnesswork.app`, `https://app.witnesswork.app`             |

Each app profile in `config/web-environments.json` names its `mapsOrigin`; a
frame's app origins are every profile that names it (`appOriginsFor` in
`web/maps-frame/src/headers.ts`). `local` (`localhost`) runs on any port.

**Beta shares production's frame.** The app's four profiles (local, dev, beta,
production) use two frames: `local` and `dev` frame `maps-dev`, and `beta` and
`production` both frame `maps.witnesswork.app`, one Worker (`ww-maps`) whose
`frame-ancestors` lists both app hosts. MapKit JS tokens are signed per frame
origin, so one production frame needs one origin on the key.

- **The app** frames only its profile's `mapsOrigin` (its CSP's `frame-src`),
  as `<iframe sandbox="allow-scripts allow-same-origin" referrerpolicy="no-referrer" allow="">`.
  The frame needs its own origin for MapKit's token, and that origin isn't the
  app's, so it reaches nothing of the app's. It gets no powerful features: the
  app passes the User's location itself.
- **The frame** is framed only by its app origins (`frame-ancestors`), takes
  messages only from its parent window at one of those origins, and once the
  first `init` arrives, only from that exact origin. It posts only to that
  origin, never `*`. Opened on its own, it does nothing.
- **The app** takes messages only from the frame's own window at the frame's
  exact origin.
- Dev preview URLs on `workers.dev` aren't app origins, so their map shows
  unavailable.

### The frame's headers

`scripts/web-maps.mjs` writes them into `dist/_headers`:

- CSP: `default-src 'none'`; scripts from itself and
  `https://cdn.apple-mapkit.com` only; styles from itself, inline (MapKit styles
  its controls) and the CDN; images, fonts and fetches from
  `https://*.apple-mapkit.com` and `https://*.ls.apple.com`, which MapKit's
  bootstrap names at run time; `worker-src blob:`; `frame-src 'none'`;
  `frame-ancestors` its app origins; `base-uri`, `form-action` and
  `object-src 'none'`.
- `Referrer-Policy: no-referrer`, `nosniff`, HSTS, `Cross-Origin-Resource-Policy:
same-origin`, and a `Permissions-Policy` that turns off every powerful feature.
- No cookies: the Worker serves files only.
- Not set, on purpose: Trusted Types, since MapKit JS writes its own markup,
  and `Cross-Origin-Opener-Policy`, since the frame never opens or is opened by
  a window; the app's own headers keep both (§5).

When the CSP stops something, the frame tells the app (`error` `csp`), without
the URL, since a tile URL carries coordinates. The app logs it.

## Protocol

Every message is `{ protocol: 'ww-maps', v: 1, type, … }`. Each side rebuilds
what it receives from the fields it knows, and drops anything else. Limits: 2,000
pins, 8 lines of 20,000 points, 500 coordinates per projection.

**App → frame:**

| `type`                 | Carries                                                                      |
| ---------------------- | ---------------------------------------------------------------------------- |
| `init`                 | token, language, options (scheme, layer, padding, interactive, POIs), region |
| `token`                | a fresh token for `tokenRequest`, or `null`                                  |
| `options`              | the options again, when they change                                          |
| `camera`, `center`     | a region or a center, and a duration                                         |
| `fit`                  | coordinates, padding, animated                                               |
| `pins`                 | `{ id, latitude, longitude, color, draggable? }[]`                           |
| `polylines`            | `{ id, coordinates: [lat, lng, …], color, width }[]`                         |
| `userLocation`         | a coordinate, or `null`                                                      |
| `project`, `unproject` | a request id and coordinates or points                                       |

**Frame → app:** `ready`; `tokenRequest`; `region` (`start`, `change` every
frame of a move, `end`; the region, the visible rect in the unit square, the
map's size, and whether the User moved it); `press` (`press` or `longPress`,
with its coordinate); `pinPress` and `pinDragEnd` by pin id; `projected` and
`unprojected` with the request's id; `error` with a code (`unauthorized`,
`rate_limited`, `load_failed`, `unsupported`, `version`, `bad_message`, `csp`).

- **Projection.** `pointForCoordinate` and `coordinateForPoint` ask the frame
  (`project`, correlated by id, 5 s timeout), so `useMapProjection` and
  `mapPinLayout` work from MapKit's own answer. The overlay places pins and
  cards every frame from the `region` event's rect, without a round trip.
- **Versions.** The frame deploys apart from the app. A message for another
  version gets `error` `version`, and the app shows the map as unavailable. A
  change one side can't ignore bumps `v`; the frame then answers both versions
  until no live app sends the old one.

## Token flow

1. The map asks ww-api for a token (`POST /maps/v1/mapkit-tokens` with
   `{ origin: <frame origin> }`) through the account session
   (`src/lib/serverAccount`). ww-api signs a 30-minute token for that origin
   only (ww-api `docs/maps.md`). One token serves every map until it has under
   5 minutes left.
2. Once the frame has loaded, the app posts `init` with it.
3. The frame gives it to `mapkit.init`'s `authorizationCallback`. When MapKit
   asks again, the frame sends `tokenRequest`, and the app answers `token` with
   a fresh one (or `null` after 15 s without one).

The frame never holds the access token; the app never runs MapKit.

## When there's no map

The map's place shows "Map unavailable" with the reason, and the screen around
it keeps working (lists, cards, route stops):

| Reason         | When                                                                               | Try Again |
| -------------- | ---------------------------------------------------------------------------------- | --------- |
| `unconfigured` | ww-api answers 503 `maps_unconfigured` (no MapKit JS key yet)                      | no        |
| `signedOut`    | no account session (only a dev build's Create an Account opens the app signed out) | no        |
| `offline`      | no connection                                                                      | yes       |
| `busy`         | 429, or MapKit's own rate limit                                                    | yes       |
| `failed`       | the frame didn't come up in 20 s, MapKit refused the token, a version mismatch     | yes       |

Each reason is counted once a session (`map_unavailable`, `docs/analytics.md`).

## Search and directions

- **Points of interest:** `GET /places/v1/search` (HERE Discover through
  ww-api), ranked near the User; without their location, addresses only
  (`/autocomplete`). A pick needs no second request (`src/lib/placeSearch.ts`).
- **Directions:** `POST /route-planning/directions` through the account
  session, as on Android (`roadLegs.ts`).
- **Open in Maps:** Apple Maps' web links on Apple OSes, Google Maps elsewhere
  (`src/lib/navigationMapProvider.ts`).

## Building, serving and deploying

```bash
pnpm web:build:maps <dev|production>              # web/maps-frame/dist
pnpm web:serve:maps [dev|production] [--port 8789] # wrangler dev of it
pnpm web:deploy:maps:dev [--dry-run] [--preview]
WW_RELEASE_CONFIRM=SHIP-PROD-X.Y.Z pnpm web:deploy:maps:production [--dry-run]
```

Same gates as the app (`docs/web-hosting.md`): every deploy refuses
uncommitted files; `dev` deploys only a clean checkout at
`origin/feat/web-device-sign-in` (`main` once the web launch lands), and
`--preview` uploads a `workers.dev` version from any clean branch; `production`
needs the typed `SHIP-PROD-<version>` (dry runs too), the tagged release commit
on `origin/main`, and the `WitnessWork web deploy (production)` token read
through the 1Password app. Never `wrangler deploy` by hand.

`ww-maps` (production) is configured but not deployed yet, and
`maps.witnesswork.app` has no DNS record yet; see the runbook below.

### First dev deploy

From a clean checkout whose `HEAD` is `origin/feat/web-device-sign-in`:

```bash
pnpm web:deploy:maps:dev --dry-run   # the plan, with anything that refuses it
pnpm web:deploy:maps:dev
```

wrangler creates `ww-maps-dev` and its Workers Custom Domain
`maps-dev.witnesswork.app`; Cloudflare adds the DNS record for it.

### Production runbook (maps.witnesswork.app)

The owner runs it at the cut of the first release whose web build frames
`maps.witnesswork.app`, before or with that release's web deploy, since a
build that frames a missing host shows "Map unavailable". Agents never run it.

1. **ww-api.** Production ww-api has a MapKit JS key and signs tokens for
   `https://maps.witnesswork.app` (ww-api `docs/maps.md`); until then the map
   answers `maps_unconfigured` and shows unavailable, which is safe.
2. **DNS.** Check that `maps.witnesswork.app` has no record of its own in the
   `witnesswork.app` zone: a Workers Custom Domain refuses a host that already
   has one. Don't add one by hand; the deploy creates it.
3. **Token.** The `WitnessWork web deploy (production)` token
   (`docs/web-hosting.md`) needs Workers Scripts edit on the account and
   Workers Routes edit on `witnesswork.app`; if the first deploy refuses the
   custom domain, add DNS edit on the zone too.
4. **Dry run**, from the tagged release commit on `origin/main`:
   `WW_RELEASE_CONFIRM=SHIP-PROD-X.Y.Z pnpm web:deploy:maps:production --dry-run`.
5. **Deploy:** the same without `--dry-run`. Approve the 1Password read on
   this Mac. wrangler creates `ww-maps` and the custom domain, and Cloudflare
   adds its DNS record and certificate.
6. **Check:** `curl -sI https://maps.witnesswork.app/` shows the frame's CSP
   with `frame-ancestors https://beta.app.witnesswork.app
https://app.witnesswork.app`, `Referrer-Policy: no-referrer`, and no
   `Set-Cookie`. Then open the map in the beta and production apps.
7. **Roll back** by deploying the previous release's tag the same way. A frame
   that's down only takes the map away; the rest of the app works.

### Updating MapKit JS

The frame loads a pinned version with its hash (`MAPKIT_URL` and
`MAPKIT_INTEGRITY` in `web/maps-frame/src/mapkitEngine.ts`, now 6.1.197). Only that
bootstrap carries a hash: the libraries it loads (`full-map`) come from the same
pinned version on Apple's CDN, which is why `script-src` names the CDN. To
move: fetch `https://cdn.apple-mapkit.com/mk/<version>/mapkit.core.js`, set
both, check the map with a real token, and deploy the frame.

## Testing

- Unit tests: the protocol (`src/lib/mapsFrame/*.test.ts`), the frame
  controller and headers (`web/maps-frame/src/*.test.ts`), the app's frame and
  token clients and overlay (`src/vendor/web/maps/*.test.ts`), and the deploy
  gates (`scripts/tests/web-maps.node.mjs`).
- `e2e/web/maps.spec.ts` serves a **test double** at the profile's real frame
  origin (`e2e/web/mapsFrameDouble.ts`): the real frame controller over a plain
  map with the same projection, pins as dots and lines as SVG. It's built by
  the spec and never deployed. The unavailable state runs against the real
  frame. Neither reaches Apple.
- MapKit itself needs the owner's key: until ww-api has it, only the double
  shows a map.

## Reusing the pattern

Another third-party script that mustn't run on the app's origin (W3's Turnstile
frame on `verify.witnesswork.app`, for one) can follow the same pattern. The
pieces, and where the maps frame keeps each:

1. **An origin and a Worker per environment.** A static Workers Static Assets
   Worker with one `env` per frame host and a Workers Custom Domain
   (`web/maps-frame/wrangler.jsonc`). Each app profile names its frame origin in
   `config/web-environments.json` (`mapsOrigin`), and the app's CSP `frame-src`
   allows only that (`web/host/src/headers.ts`).
2. **Headers from the profiles** (`web/maps-frame/src/headers.ts`):
   `default-src 'none'`, scripts from itself and the third party's pinned
   origin, `frame-ancestors` computed from every profile that names the frame
   (`appOriginsFor`), `Referrer-Policy: no-referrer`, CORP `same-origin`, every
   powerful feature off, and no cookies (static files only).
3. **A shared, typed protocol with no imports** (`src/lib/mapsFrame/protocol.ts`):
   an envelope `{ protocol, v, type }`, a parser per direction that rebuilds
   only known fields and drops the rest, size limits, and `isAllowedOrigin`
   (exact origins; `localhost` on any port for local runs).
4. **The frame's controller** (`web/maps-frame/src/controller.ts`): accepts
   only `event.source === window.parent` at an allowed origin, locks onto the
   origin of the first valid `init`, posts only to that origin, and does
   nothing when opened on its own (`frame.ts`).
5. **The app's client** (`src/vendor/web/maps/frameClient.ts`): accepts only
   the iframe's own window at the frame's exact origin, posts only to that
   origin, and passes in anything the frame needs from ww-api (here the
   MapKit token, fetched with the account session), so the frame never holds
   the User's credentials. The iframe gets
   `sandbox="allow-scripts allow-same-origin"`, `referrerpolicy="no-referrer"`
   and `allow=""`.
6. **A deploy script** with the app's gates (`scripts/web-maps.mjs`, reusing
   `scripts/web-host.mjs`'s), and a test double served at the frame's real
   origin by Playwright routing (`e2e/web/mapsFrame.ts`), so the app's CSP holds
   in tests.
