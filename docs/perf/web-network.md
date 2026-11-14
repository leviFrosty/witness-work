# Web launch network profile

`scripts/perf/web-network.mjs` records every request the web app makes while it launches: the page, the service worker, CORS preflights, and WebSocket frames. It drives Chrome over the DevTools protocol, so it sees what the Network panel sees.

## Capture

```bash
# A signed-out launch of a deployed site
node scripts/perf/web-network.mjs capture --url https://beta.app.witnesswork.app/ --name beta-signed-out

# A signed-in launch of a local production export (see "Signed in" below)
node scripts/perf/web-network.mjs capture --url http://localhost:4173/ --name after --profile <dir>

# Before/after table from two captures
node scripts/perf/web-network.mjs compare <before.json> <after.json> --out comparison.md

# Rebuild the Markdown summary from a capture's JSON
node scripts/perf/web-network.mjs report <capture.json>
```

A capture writes `<name>.json` (every request and frame) and `<name>.md` (the summary) to `.verify/artifacts/web-network/`, or to `--out <dir>`.

| Flag              | Default         | Meaning                                                                                   |
| ----------------- | --------------- | ----------------------------------------------------------------------------------------- |
| `--profile <dir>` | a temporary one | Chrome profile to launch with. A signed-in profile gives a signed-in launch.              |
| `--phases <list>` | `cold,warm`     | `cold` clears the HTTP cache, the service worker and Cache Storage first. `warm` reloads. |
| `--settle <s>`    | `10`            | A phase ends after this long with no new request.                                         |
| `--max <s>`       | `90`            | A phase ends after this long whatever happens.                                            |
| `--maps <dist>`   | none            | Resolve each request's initiating stack frame through the export's source maps.           |
| `--bodies`        | off             | Keep JSON and text response bodies up to 200 KB.                                          |
| `--shots 1`       | off             | Save a screenshot at the end of each phase.                                               |
| `--headed`        | off             | Show the browser.                                                                         |

Each request records its method, URL, status, where the answer came from (network, service worker, HTTP cache), what started it, when it started and how long it took, request header and body bytes, response bytes on the wire and decoded, `Content-Encoding`, and the cache headers. The summary groups requests by service (the app's own files, ww-api, PostHog, RevenueCat, Sentry, fonts) and lists every request sent more than once.

Tokens never reach the files: `Authorization`, cookies and WebSocket keys are dropped, and token fields in JSON bodies and query strings are blanked.

## Signed in

The sign-in screen makes no ww-api calls, so the launch worth measuring is a signed-in one. `scripts/perf/web-network-sign-up.mjs` signs a Chrome profile up for a web-only account with a virtual passkey, and gets it past onboarding:

```bash
node scripts/perf/web-network-sign-up.mjs --url http://localhost:4173 --profile <dir> --recovery-out <file>

# A second browser on the same account, to see a launch that downloads another device's snapshot
node scripts/perf/web-network-sign-up.mjs --url http://localhost:4173 --profile <other dir> --recover <file>
```

It works only against a local or development ww-api. Production has no web sign-up without a real Turnstile check, and a real account needs its owner's passkey or phone, so a signed-in capture of Beta or production is one the account's owner runs with `--profile` pointing at a profile they signed in to (`--headed` once, to sign in).

## On this Mac

A capture needs a production export, a static server for it, and a local ww-api. Build once with `wwv web build --env local` (the export calls `http://127.0.0.1:8790`), keep that `dist/` for every capture, and run the captures as one queued job: `node scripts/verify/run.mjs --class web-test -- <script>`. Stop the static server and the ww-api worker when the script ends.

## Limits

- The local static server doesn't compress, so the sizes of the app's own files in a local capture are uncompressed. Read their transfer sizes from a capture of a deployed site.
- A local export has no RevenueCat web key, so it makes no RevenueCat requests.
- PostHog batches events for several seconds; a short capture can end before the first batch.
- A request's trigger is a minified function name unless `--maps` points at an export built with source maps.
