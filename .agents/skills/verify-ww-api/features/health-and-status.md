# Health and status

The app and operators probe the worker for liveness, Notes Import availability, and paywall social proof. A healthy worker answers `/health` with its build, tells the app whether Notes Import is usable and what the allowances are, and serves cached App Store ratings once the cron has published a summary.

## Sub-features

- `health` returns `{status:"ok", timestamp, serverTime, versionId, deployedAt}` with `Cache-Control: no-store` and a `Date` header (clients calibrate their clock on it).
- `notes-status` returns `available`, optional `limits`, `capabilities.appAttest.protocolVersions`, and `Cache-Control: no-store`.
- `notes-status-killswitch` reports `available:false` when KV `notes-import:enabled` is `{"available":false}`.
- `ratings-empty` returns 503 `{"ok":false,"error":"unavailable","code":"unavailable","retryAfter":3600}` with `no-store` and `Retry-After: 3600` before any sweep.
- `ratings-served` returns the published summary with `s-maxage=21600`.
- `not-found` returns a JSON 404 `not_found` for unknown routes.
- `rate-limit` answers 429 `rate_limited` with `Retry-After: 60` past 60/min from one IP, per route family.

## How to get to it (user POV)

- The app's Notes Import entry points call `GET /notes-import/status` before showing the composer.
- The paywall calls `GET /app-store/ratings` for its rating badge.
- Uptime checks and the app's dev tools call `GET /health`.

## Driving it with verify-ww-api

Preconditions:

- `node scripts/verify/dev.mjs doctor` passes and `URL` is exported.

- **Liveness.** Probe health. Run `curl -si $URL/health`. The body has `"status":"ok"`, a `versionId`, and `serverTime`; the headers have `cache-control: no-store` and `date`.
- **Availability.** Ask whether imports work. Run `curl -si $URL/notes-import/status -H "cf-connecting-ip: 198.18.1.1"`. You get 200 with `cache-control: no-store` and `"capabilities":{"appAttest":{"protocolVersions":[1,2]}}`. `available` is a boolean.
- **Kill switch.** Turn Notes Import off. Run `node scripts/verify/dev.mjs kv put notes-import:enabled '{"available":false,"reason":"verify"}'`, then re-run the availability curl. Poll for up to 30 s if status was read recently. The body reads `"available":false,"reason":"verify"`. Restore it with `node scripts/verify/dev.mjs kv delete notes-import:enabled`. Status can stay off for another 30 s after that.
- **Ratings before sweep.** Run `curl -si $URL/app-store/ratings` on fresh state. You get 503 with `cache-control: no-store`.
- **Ratings served.** Publish a summary the way the cron would. Run `node scripts/verify/dev.mjs kv put app-store-ratings:summary '{"averageRating":4.87,"ratingCount":1234,"countryCount":42,"updatedAt":"2026-10-01T00:00:00.000Z"}'`, then repeat the curl. You get 200 with the same JSON and `s-maxage=21600`.
- **Unknown route.** Run `curl -s $URL/nope`. The body is `{"ok":false,"error":"not_found","code":"not_found"}` with status 404.
- **Rate limit.** Run `for i in $(seq 61); do curl -s -o /dev/null -w '%{http_code}\n' -X POST $URL/admin/notes-import/reset -H "cf-connecting-ip: 198.18.9.9"; done | sort | uniq -c`. You get 60 × 404 and 1 × 429; the 429 has `retry-after: 60`. `curl -s $URL/notes-import/status -H "cf-connecting-ip: 198.18.9.9"` still answers 200 (its own bucket).
- **Proof.** Run `pnpm test:e2e src/e2e/public.e2e.test.ts`. Vitest reports the health, status, rate-limit, ratings, and 404 tests as passed, and `.verify/artifacts/e2e-public-*.json` holds the exchanges.

## Gotchas

- `/notes-import/status` caches completed responses per isolate for 30 s. A KV flip shows up only after that window, or after `down` and `up`.
- With no `OPENROUTER_API_KEY`, the provider probe fails open (`available:true`). Don't treat that as proof that providers are healthy.
- Once ratings are served, the local Cache API keeps the 200 for 6 h. To see the 503 again, run `down --wipe` and then `up`.
- Crons don't run under `wrangler dev`. Seed `app-store-ratings:summary` instead of waiting for the sweep, and never curl `/cdn-cgi/handler/scheduled`, which reads Apple's App Store pages.
