# Web hosting

The web app (ADR 0037) is the static export of this app, served by a Cloudflare
Worker with Workers Static Assets. There's no server rendering.

- **Worker:** `web/host/` (`src/worker.ts`, `wrangler.jsonc`). It has its own
  `tsconfig.json` with Workers types and stays out of the app's Metro and
  TypeScript graph. Its tests run in `pnpm testFinal`.
- **Profiles:** `config/web-environments.json` is the one list of web
  profiles: each one's native env files, host, the apps its association files
  list, Worker, ww-api, PostHog, maps and Turnstile frame origins, Help Center
  manifest and search origin, and CSP mode. `web:build` (`scripts/web.mjs`), the deploys and
  the Worker all read it.
- **Deploys:** `scripts/web-host.mjs`, through the `web:*` scripts below.
  Never run `wrangler deploy` by hand.
- **Maps frame:** a Worker of its own on each profile's maps origin
  (`web/maps-frame/`, `scripts/web-maps.mjs`), with the same deploy gates;
  beta shares production's. See `docs/web-maps.md`, which has the production
  maps host's runbook.
- **Turnstile frame:** a Worker of its own on each profile's verify origin
  (`web/verify-frame/`, `scripts/web-verify.mjs`); beta shares production's.
  See `docs/web-turnstile.md`, which has the production host's runbook.

## Environments

| Profile      | Worker        | Host                       | ww-api                        | Maps frame                 | Turnstile frame              | Help Center and search                                   | CSP         |
| ------------ | ------------- | -------------------------- | ----------------------------- | -------------------------- | ---------------------------- | -------------------------------------------------------- | ----------- |
| `local`      | —             | `localhost` (`web:serve`)  | `.env` (`localhost:8787` CSP) | `maps-dev.witnesswork.app` | `verify-dev.witnesswork.app` | `dev.witnesswork.app`, `help-search-dev.witnesswork.app` | report-only |
| `dev`        | `ww-web-dev`  | `app-dev.witnesswork.app`  | `api-dev.witnesswork.app`     | `maps-dev.witnesswork.app` | `verify-dev.witnesswork.app` | `dev.witnesswork.app`, `help-search-dev.witnesswork.app` | enforce     |
| `beta`       | `ww-web-beta` | `beta.app.witnesswork.app` | `api.witnesswork.app`         | `maps.witnesswork.app`     | `verify.witnesswork.app`     | `witnesswork.app`, `help-search.witnesswork.app`         | enforce     |
| `production` | `ww-web`      | `app.witnesswork.app`      | `api.witnesswork.app`         | `maps.witnesswork.app`     | `verify.witnesswork.app`     | `witnesswork.app`, `help-search.witnesswork.app`         | enforce     |

Every profile sends PostHog events to `ww-api-r.leviwilkerson.com`, PostHog's
managed proxy, and uses RevenueCat's browser API.

- Each host is a Workers Custom Domain, which creates its own DNS record and
  certificate. `workers_dev` is off everywhere.
- Only `dev` has preview URLs (`web:deploy:dev --preview`), on `workers.dev`.
  They're cross-site from the app's hosts, so ww-api's CORS list must include
  them before they can sign in.

## Routing and caching

- **App routes** (`/`, `/contacts`, …) get `index.html` from Cloudflare's
  single-page-application fallback.
- **Files the app loads by URL** run the Worker first (`run_worker_first`):
  `/_expo/*`, `/assets/*`, `/.well-known/*`, and scripts, styles, wasm, JSON,
  images, fonts, icons, the web manifest and text files anywhere (see
  `wrangler.jsonc`).
  - A missing one gets a real `404` (`text/plain`, `no-store`), never
    `index.html`. A tab still running an older deploy then fails to load its
    chunk and can reload once.
  - The Worker asks the assets for each path in its encoded form. Expo's URLs
    for package assets keep a bare `@` (`/assets/node_modules/@expo-google-fonts/…`),
    which Cloudflare's asset server answers only with a redirect to `%40`.
  - `/.well-known/apple-app-site-association` and `/.well-known/webauthn`
    have no extension, so the Worker serves them as `application/json`.
    Nothing under `/.well-known/` falls back to the app, and nothing there
    redirects: a redirect from the assets is a 404. The export's
    `.well-known/` holds only the association files below, so a new file
    there (such as `webauthn`) goes into `associationFiles` first.
  - Hashed names (Expo's 32-hex content hash) are cached for a year,
    `immutable`.
  - Everything else revalidates (`max-age=0, must-revalidate`, with ETags),
    including `index.html` and `canvaskit.wasm`. Cloudflare serves `.wasm` as
    `application/wasm`.
  - `/sw.js`, the service worker, is served `no-cache` so every update check is
    fresh, and `/manifest.webmanifest` as `application/manifest+json`. How the
    worker caches, and the update flow: [`web-offline.md`](web-offline.md).
  - A `Range` request gets a `206` with just those bytes (`range.ts`), and
    whole files say `Accept-Ranges: bytes`. Workers Static Assets answers a
    range with the whole file and a `200`, which Safari refuses to play: it
    asks for the first two bytes of every sound before it loads it, so
    without this the app is silent in Safari. A range the Worker doesn't
    answer (several ranges, a stale `If-Range`) gets the whole file; one past
    the end gets a `416`.
  - Only `GET` and `HEAD`.
- **Not uploaded:** source maps and the build stamp (`.assetsignore`).
- **Limits:** 25 MiB per file and 20,000 files. The deploy checks both before
  uploading, and that every `/assets/…` and `/_expo/static/…` file the
  export's scripts and HTML load is in the upload.

## Association files

The passkey association files (`docs/passkeys-protocol.md`) are generated per
profile at build time; nothing under `public/` holds them.

- **Source:** `config/web-associations.json` lists each native app by build
  variant: its Apple app id and, for Android, its package and signing-key
  fingerprints. Each profile's `associatedApps` in
  `config/web-environments.json` picks the apps its host lists.
- **Per profile:**

  | Profile              | `apple-app-site-association` (`webcredentials`) | `assetlinks.json` (`get_login_creds`)                                                |
  | -------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------ |
  | `production`, `beta` | `jwtime`, `jwtimebeta`                          | `com.leviwilkerson.jwtime`: Play app signing and upload keys                         |
  | `dev`, `local`       | `jwtime`, `jwtimebeta`, `jwtimedev`             | the same, plus `com.leviwilkerson.jwtimedev`: the debug key and the two release keys |

  Beta's files match production's: Beta phone builds use the production RP
  ID (ADR 0038 §3). No profile has `applinks`: these hosts are never app-link
  domains (ADR 0042).

- **Build:** `web:build` replaces the export's `.well-known/` with the
  profile's files (`associationFiles` in `scripts/web.mjs`). It refuses a
  release profile whose files would list the development app or its debug
  key, and each deploy refuses an export whose `.well-known/` isn't exactly its
  profile's files.

## Headers

`web/host/src/headers.ts` builds one set of headers per profile. The Worker
sets them on the responses its code produces, and the deploy writes the same
set into `dist/_headers` for everything Cloudflare serves directly.

- **CSP**, enforced (`Content-Security-Policy`) in `dev`, `beta` and
  `production`, report-only in `local`. Every host in it comes from the
  profile, no profile allows another's hosts (`worker.test.ts`), and the
  deploy refuses a build that never calls them, so the app and its CSP can't
  drift apart unnoticed:
  - `script-src 'self' 'wasm-unsafe-eval'`, for CanvasKit and SQLite's wasm;
    no script from any other host, no inline script and no `eval`;
  - `style-src 'self' 'unsafe-inline'`, because react-native-web writes styles
    into `<style>` tags at runtime;
  - `connect-src`: the profile's ww-api (`https` and `wss`), PostHog's
    ingestion host (events and, later, masked replay from the bundled
    `posthog-js`, ADR 0043; nothing loads from PostHog), the Help Center's
    website and search, and RevenueCat's API and SDK events
    (`api.revenuecat.com`, `e.revenue.cat`) for web purchases;
  - `media-src 'self' blob:`, for the app's sounds and Scribe AI playing back
    a voice recording;
  - `frame-src`: the profile's maps frame and Turnstile frame (`mapsOrigin`,
    `verifyOrigin`). MapKit JS and Cloudflare Turnstile load inside those
    frames' own origins, never in the app (`docs/web-maps.md`,
    `docs/web-turnstile.md`);
  - `frame-ancestors 'none'`, `base-uri 'none'`, `object-src 'none'`,
    `form-action 'self'`, `worker-src 'self'`;
  - Trusted Types: `require-trusted-types-for 'script'` and
    `trusted-types ww-chunks ProseMirrorClipboard`, each created once. There's
    no `default` policy, so every other sink refuses a string.
    - `ww-chunks`: the web entry creates it first
      (`src/app/launch/hardenWeb.web.ts`). It takes only this origin's
      `/_expo/static/js/web/*.js` chunks, which Expo's chunk loader
      (`src/vendor/web/fetchThenEval.ts`) passes through it.
    - `ProseMirrorClipboard`: the note editor creates it on the first paste
      of HTML, to parse it in a detached document that never renders or runs
      it.
    - The entry also turns on zod's `jitless` mode, so zod never builds
      functions from strings, and the note editor gives Tiptap JSON only and
      writes its styles itself (`RichTextEditorDom.tsx`).
- **What the web doesn't reach:** link previews and the handwriting fonts for
  Service Reports are native only. Anything else a web build calls needs its
  host in the profile first, and a test that it's there.
- **Also:** HSTS with subdomains, `nosniff`, `Referrer-Policy: no-referrer`,
  COOP `same-origin`, `X-Frame-Options: DENY`, and a `Permissions-Policy` that
  gives camera, microphone and geolocation to the app itself only. No COEP:
  nothing needs cross-origin isolation (ADR 0037 §5).
- **Before a change ships**, run the web smoke tests (`e2e/web/README.md`)
  through the Worker, in Chromium, WebKit and Firefox at desktop and phone
  sizes. Every test fails on a violation; to sum them up by browser:

  ```bash
  pnpm web:build --env dev
  E2E_WORKER=dev WW_WEB_CSP=.verify/web-csp pnpm web:test
  node e2e/web/csp-summary.mjs .verify/web-csp
  ```

## CSP enforcement

Each profile's `csp` in `config/web-environments.json` is the switch:
`enforce` sends `Content-Security-Policy`, `report-only` sends
`Content-Security-Policy-Report-Only` with the same policy. Both keep
`report-uri /_csp-report`, so violations are logged either way.

- **Switching to `report-only` is for emergencies only:** a violation blocking
  something Users need in that environment, until the fix ships. It's a PR
  that changes the profile and the test that expects it to enforce
  (`worker.test.ts`), then that environment's deploy.
- **Who:** for `dev`, whoever is fixing the violation, noting it in the PR.
  For `beta` and `production`, only the project owner decides; `production`
  then deploys as a release like any other (`SHIP-PROD-X.Y.Z`).
- **Switch back** in the PR that fixes the violation.
- **Never loosen the policy instead**, such as with `'unsafe-eval'`, a
  wildcard or a `default` Trusted Types policy. A new host goes into its
  profile, with a test.

## CSP reports

Browsers post violations to `POST /_csp-report` through the CSP's
`report-uri`, which every engine supports (Firefox supports nothing else).
There's no `report-to` yet: Chromium ignores `report-uri` once it's present, and its
Reporting API uploads never arrived in our checks. The endpoint already reads
Reporting API bodies, so adding `report-to` later is a header change.

- **What's logged:** the Worker logs one JSON line per violation
  (`csp-violation`) to Workers observability, with the directive, the
  disposition, the blocked and document URLs and the source location. Web URLs keep
  only their origin and path; other URLs, such as `mailto:` or an extension's,
  only their scheme. For Trusted Types it keeps the sink name, never
  the sample.
- **What's refused:** bodies over 16 KiB and other content types. Reports
  about other sites' pages are dropped, and only the first 10 reports of a
  request are read.
- **Reading them:** Cloudflare dashboard → Workers → the Worker →
  Observability, filtered on `csp-violation`, or `wrangler tail` while
  reproducing.

## Deploying

```bash
pnpm web:serve [local|dev|beta|production]   # wrangler dev of ./dist
pnpm web:deploy:dev [--dry-run] [--prebuilt] [--preview]
pnpm web:deploy:beta [--dry-run] [--prebuilt]
WW_RELEASE_CONFIRM=SHIP-PROD-X.Y.Z pnpm web:deploy:production [--dry-run] [--prebuilt]
pnpm web:deploy:<dev|beta|production> --well-known-only [--dry-run] [--replace-app]
```

- **Each deploy:**
  1. builds the matching profile with `pnpm web:build --env <profile>`
     (`docs/build.md`), which refreshes the Help Center snapshot from the
     profile's website first (`pnpm sync:help`) and fails without it, then
     stamps `dist/` with the profile, the commit and every file's hash;
  2. writes `_headers` and `.assetsignore`;
  3. runs `web:build`'s own export checks again (`checkExport` in
     `scripts/web.mjs`): the host's limits, and no value a web build mustn't
     carry, such as this checkout's `EXPO_PUBLIC_API_DEV_BYPASS`, since web
     builds are public. It also refuses a build that never mentions the
     profile's ww-api, PostHog and Help Center origins, which its CSP allows;
  4. runs `wrangler deploy --env <profile>`.
- **`--prebuilt`** deploys an existing `dist/` instead. It must carry a stamp
  for the same profile and commit, and no file may have changed since. Only
  the deploy writes the stamp, after its own build.
- **`--dry-run`** prints the plan and anything that would refuse it, without
  building or deploying. For `dev` it also resolves the RevenueCat sandbox
  values (below), which are public bundle values, not credentials, and says
  what is missing; it never prints them.
- **Every deploy refuses uncommitted or untracked files**, as OTA updates do.
  The Help Center snapshot a build fetches goes into the export only;
  `web:build` puts `src/assets/help-center/` back as it was afterwards.
- **dev:** `app-dev` serves only the integration branch's latest commit, so it
  deploys only from a clean checkout whose `HEAD` is
  `origin/feat/web-device-sign-in` (`main` once the web launch lands).
  `--preview` uploads a version to a
  `workers.dev` preview URL without touching `app-dev`, from any clean
  branch.
- **dev's RevenueCat sandbox values.** The paywall needs
  `EXPO_PUBLIC_REVENUECAT_WEB_API_KEY` and
  `EXPO_PUBLIC_REVENUECAT_WEB_PURCHASE_LINKS` (`docs/web-purchases.md`). A dev
  build or deploy takes them from the env files (`.env`, `.env.local`) and,
  for whichever is empty, from the 1Password Agents vault item named by
  `revenueCatWebItem` in `config/web-environments.json`
  (`RevenueCat web billing sandbox (Dev project)`, one field per variable, labelled with
  its name). So a clean checkout deploys the same paywall as one with the
  files, given `op` signed in as the agents' service account or the 1Password
  app. A dev deploy (`--preview` too) **refuses** when the key or links are
  still missing, when the key isn't a sandbox key (`rcb_sb_…`), or when the
  links aren't a JSON object with at least one `sandbox/…` value, and after
  building it checks the bundle holds the key. A local `pnpm web:build` or
  `pnpm web:serve` without them still runs, with a warning, and an app that
  can't sell. Beta and production never read the sandbox item.
- **beta:** goes out with every Beta ship (`scripts/build-beta.sh`, run for each
  push to `main` by the Beta ship workflow), against production ww-api. It's skipped, with `WEB_RESULT status=skipped`, when the beta profile's Help Center site doesn't answer, since the build would fail. It uses wrangler's own login
  on this Mac (`wrangler login`), like the other WitnessWork Workers.
- **production** is a release (ADR 0037 §4): at the cut, with the production
  OTA update, never from CI.
  - It refuses without the user's typed `SHIP-PROD-<package.json version>` in
    `WW_RELEASE_CONFIRM` (`scripts/release-confirm.mjs`), dry runs included.
  - It deploys only the release commit: on `origin/main`, tagged
    `v<version>`.
  - Its Cloudflare API token comes from the 1Password item
    `WitnessWork web deploy (production)`, an API Credential whose
    `credential` field holds the token. It's read through the 1Password app, never the agents' service
    account, so a person approves the read on this Mac, as with the production
    OTA signing key (`docs/ota-updates.md`). The token should be limited to
    Workers Scripts edit on this account and Workers routes on
    `witnesswork.app`.
  - It's read only after the build, right before wrangler runs, and wrangler
    gets that token and no other credential.
- **Compatibility:** a web release goes live while the native build may still
  be in review, so it must work alongside the previous native version on the
  same account.

## Association files before the first release

iPhones read a host's `apple-app-site-association` through Apple's CDN, which
refreshes it on its own schedule, and Android verifies on its own too. So the
association files must be live on `app.witnesswork.app` **at least 7 days
before release N**, the first release whose apps use passkeys, while the web
app itself ships only at that release's cut (ADR 0042 §3).

`--well-known-only` deploys a holding bundle to a web host's Worker:

- the profile's two association files, byte for byte what its full build
  ships (`web-host.node.mjs` checks);
- a holding `index.html` at `/` with store links and no script, style or
  image, under a CSP of `default-src 'none'` (`HOLDING_CSP`);
- a 404 for every other path (`web/host/wrangler.well-known.jsonc` has no
  app fallback).

It **replaces whatever the host serves**, so it's only for a host that doesn't
serve the web app yet. Before uploading, it fetches the host's `/` and refuses
if it answers there with anything but the holding page or an error.
`--replace-app` overrides that, and is for dev only.

- **Gates:** a clean tree on a commit that's on `origin/main` or
  `origin/feat/web-device-sign-in`. No release tag is needed. Production still
  needs the `SHIP-PROD-<package.json version>` keyword and its 1Password
  token approval, as above; `dev` still deploys only the integration
  branch's head. It can't be combined with `--prebuilt` or `--preview`.
- **Output:** it prints every file it uploads with its size and SHA-256, then
  both association files in full, before it reads a credential or uploads
  (`--dry-run` prints the same plan and stops).

### Runbook: early association files (owner)

At least 7 days before release N, the project owner runs:

```bash
git fetch origin
# origin/main once the web launch has landed there; until then, the
# integration branch, which is where this script lives.
git switch --detach origin/feat/web-device-sign-in
pnpm install --frozen-lockfile
WW_RELEASE_CONFIRM=SHIP-PROD-<version> pnpm web:deploy:production --well-known-only --dry-run
WW_RELEASE_CONFIRM=SHIP-PROD-<version> pnpm web:deploy:production --well-known-only
```

`<version>` is the `package.json` version of the commit you switched to,
usually a release that has already shipped. The owner types the keyword
fresh for this deploy, and approves the token read in 1Password, as for any
production deploy. Beta's host gets its
full app with the next Beta build, so it needs this only if no Beta web
deploy has run yet: `pnpm web:deploy:beta --well-known-only`.

Then check it worked:

```bash
# 200, content-type: application/json, no location header, on both files
curl -sI https://app.witnesswork.app/.well-known/apple-app-site-association
curl -sI https://app.witnesswork.app/.well-known/assetlinks.json
# The holding page answers 200; any other path 404s
curl -sI https://app.witnesswork.app/
curl -sI https://app.witnesswork.app/contacts
# Apple's CDN copy: lists jwtime and jwtimebeta, never jwtimedev. It can lag
# the host by a day or more; check again until it matches.
curl -s https://app-site-association.cdn-apple.com/a/v1/app.witnesswork.app
# Google's view: get_login_creds for com.leviwilkerson.jwtime only
curl -s 'https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://app.witnesswork.app&relation=delegate_permission/common.get_login_creds'
```

At the release cut, `web:deploy:production` replaces the holding bundle with
the web app; its association files are the same bytes.
