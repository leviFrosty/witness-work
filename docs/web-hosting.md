# Web hosting

The web app (ADR 0037) is the static export of this app, served by a Cloudflare
Worker with Workers Static Assets. There's no server rendering.

- **Worker:** `web/host/` (`src/worker.ts`, `wrangler.jsonc`). It has its own
  `tsconfig.json` with Workers types and stays out of the app's Metro and
  TypeScript graph. Its tests run in `pnpm testFinal`.
- **Profiles:** `config/web-environments.json` is the one list of web
  profiles: each one's native env files, host, Worker, ww-api, PostHog and maps
  origins, Help Center manifest and CSP mode. `web:build`
  (`scripts/web.mjs`), the deploys and the Worker all read it.
- **Deploys:** `scripts/web-host.mjs`, through the `web:*` scripts below.
  Never run `wrangler deploy` by hand.

## Environments

| Profile      | Worker        | Host                       | ww-api                        | Maps frame                 | Help Center           |
| ------------ | ------------- | -------------------------- | ----------------------------- | -------------------------- | --------------------- |
| `local`      | —             | `localhost` (`web:serve`)  | `.env` (`localhost:8787` CSP) | `maps-dev.witnesswork.app` | `dev.witnesswork.app` |
| `dev`        | `ww-web-dev`  | `app-dev.witnesswork.app`  | `api-dev.witnesswork.app`     | `maps-dev.witnesswork.app` | `dev.witnesswork.app` |
| `beta`       | `ww-web-beta` | `beta.app.witnesswork.app` | `api.witnesswork.app`         | `maps.witnesswork.app`     | `witnesswork.app`     |
| `production` | `ww-web`      | `app.witnesswork.app`      | `api.witnesswork.app`         | `maps.witnesswork.app`     | `witnesswork.app`     |

- Each host is a Workers Custom Domain, which creates its own DNS record and
  certificate. `workers_dev` is off everywhere.
- Only `dev` has preview URLs (`web:deploy:dev --preview`), on `workers.dev`.
  They're cross-site from the app's hosts, so ww-api's CORS list must include
  them before they can sign in.

## Routing and caching

- **App routes** (`/`, `/contacts`, …) get `index.html` from Cloudflare's
  single-page-application fallback.
- **Files the app loads by URL** run the Worker first (`run_worker_first`):
  `/_expo/*`, `/assets/*`, and scripts, styles, wasm, JSON, images, fonts,
  icons, the web manifest and text files anywhere (see `wrangler.jsonc`).
  - A missing one gets a real `404` (`text/plain`, `no-store`), never
    `index.html`. A tab still running an older deploy then fails to load its
    chunk and can reload once.
  - Hashed names (Expo's 32-hex content hash) are cached for a year,
    `immutable`.
  - Everything else revalidates (`max-age=0, must-revalidate`, with ETags),
    including `index.html` and `canvaskit.wasm`. Cloudflare serves `.wasm` as
    `application/wasm`.
  - Only `GET` and `HEAD`.
- **Not uploaded:** source maps and the build stamp (`.assetsignore`).
- **Limits:** 25 MiB per file and 20,000 files. The deploy checks both before
  uploading.

## Headers

`web/host/src/headers.ts` builds one set of headers per profile. The Worker
sets them on the responses its code produces, and the deploy writes the same
set into `dist/_headers` for everything Cloudflare serves directly.

- **CSP**, in report-only mode until an environment's `csp` is switched to
  `enforce` in `config/web-environments.json`:
  - `script-src 'self' 'wasm-unsafe-eval'`, for CanvasKit;
  - `style-src 'self' 'unsafe-inline'`, because react-native-web writes styles
    into `<style>` tags at runtime;
  - `connect-src`: the profile's ww-api (`https` and `wss`), PostHog, the
    website and Help Center search hosts, old and new;
  - `frame-src`: the maps frame only;
  - `frame-ancestors 'none'`, `base-uri 'none'`, `object-src 'none'`,
    `form-action 'self'`, `worker-src 'self'`;
  - Trusted Types: `require-trusted-types-for 'script'`.
- **Also:** HSTS with subdomains, `nosniff`, `Referrer-Policy: no-referrer`,
  COOP `same-origin`, `X-Frame-Options: DENY`, and a `Permissions-Policy` that
  gives camera, microphone and geolocation to the app itself only. No COEP:
  nothing needs cross-origin isolation (ADR 0037 §5).
- **Before enforcing** an environment, run the web smoke tests
  (`e2e/web/README.md`) through the Worker with violations recorded, in
  Chromium, WebKit and Firefox at desktop and phone sizes, and sum them up:

  ```bash
  pnpm web:build --env dev
  E2E_WORKER=dev WW_WEB_CSP=.verify/web-csp pnpm web:test
  node e2e/web/csp-summary.mjs .verify/web-csp
  ```

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
     profile's ww-api and PostHog origins, which its CSP expects;
  4. runs `wrangler deploy --env <profile>`.
- **`--prebuilt`** deploys an existing `dist/` instead. It must carry a stamp
  for the same profile and commit, and no file may have changed since. Only
  the deploy writes the stamp, after its own build.
- **`--dry-run`** prints the plan and anything that would refuse it, without
  building, reading a credential or deploying.
- **Every deploy refuses uncommitted or untracked files**, as OTA updates do.
  The Help Center snapshot a build fetches goes into the export only;
  `web:build` puts `src/assets/help-center/` back as it was afterwards.
- **dev:** `app-dev` serves only the integration branch's latest commit, so it
  deploys only from a clean checkout whose `HEAD` is
  `origin/feat/web-device-sign-in` (`main` once the web launch lands).
  `--preview` uploads a version to a
  `workers.dev` preview URL without touching `app-dev`, from any clean
  branch.
- **beta:** goes out with every Beta build (`scripts/build-beta.sh`, see the
  `beta-build` skill), against production ww-api. It's skipped, with `WEB_RESULT status=skipped`, when the beta profile's Help Center site doesn't answer, since the build would fail. It uses wrangler's own login
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
