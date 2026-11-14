---
name: verify-ww-api
description: Start an isolated local ww-api (Hono on Cloudflare Workers via wrangler dev), prove routes work end to end over real HTTP, fuzz the Buddies relay protocol, and tear down with evidence kept. Use before claiming any backend change is done (routes, Notes Import, Buddies relay, universal-link pages, admin, KV switches), when asked to verify, smoke test, reproduce, or fuzz ww-api, or when the WitnessWork app's verify loop needs a local backend URL.
---

# Verify ww-api

`scripts/verify/dev.mjs` runs this checkout's worker with `wrangler dev --env dev --local` on a free port in 8790-8799, its own inspector port (9240-9259), its own persistence dir, and a generated vars file of synthetic tokens. The tokens that key persisted state are kept in `<persist dir>/verify-secrets.json`, so `down` then `up --persist-to` the same dir finds its sessions and rate counts again. It never uses port 8787 or 9229 (the user's own `pnpm dev`), `.wrangler/state`, or `.dev.vars`.

The API lives in this repo at `services/api`, with its own pnpm workspace. **All commands below run from `services/api`** (`cd services/api` from the repo root; `pnpm install --frozen-lockfile` there first in a fresh checkout), and every path (`scripts/…`, `src/…`, `.verify/…`) is relative to it. This is the development environment, which exists only locally: nothing is deployed from `[env.dev]`, and the deployed Workers are Beta (`ww-proxy-beta`, `https://api-beta.witnesswork.app`, the tip of `main`) and production.

## Launch

```bash
node scripts/verify/dev.mjs up                       # prints the base URL as its last line
node scripts/verify/dev.mjs up --persist-to /tmp/ww-verify-$RUN_ID   # separate state per run
node scripts/verify/dev.mjs up --secrets-from .dev.vars              # opt in to real optional keys (your own services/api/.dev.vars)
node scripts/verify/dev.mjs up --photo-limit-bytes 2000              # Cloud Sync photo storage fills after 2,000 bytes
```

- Ready when `up` prints `verify: worker ready (pid N, …)` and then the URL. It polls `GET /health` for up to 90 s and exits nonzero with the last log lines if wrangler dies.
- `up` is idempotent. If `.verify/state.json` names a live, healthy worker, `up` reuses it. If the recorded worker is alive but unhealthy, `up` restarts it.
- `--photo-limit-bytes <n>` sets the worker's `SYNC_PHOTO_LIMIT_BYTES` (Cloud Sync photo storage per account, 2,000,000,000 by default), so a few small photos reach `storage_full`. `up` with a different value restarts the worker; `up` without the flag reuses whatever runs, and a fresh start uses the default. `doctor` prints the limit in effect.
- Env `dev` gives `APP_ATTEST_ENVIRONMENT=development`, `BUDDIES_ENABLED=true`, `BUDDIES_PHOTOS=on`, `SPACES_ENABLED=true` (Shared Spaces), `AUTH_LEGACY=off` (requests signed the pre-session way get 426; `pnpm test:e2e` and `pnpm fuzz:buddies` put KV `auth:legacy` = `on` for their run), and the passkey RP IDs `beta.app.witnesswork.app` (Beta's, which native development builds borrow) and `localhost` (origins `http://localhost:8081`, `:8082`, `:19006`, `:4173`, `:5173`). It has no routes (`routes = []`), so the worker answers as the host it was reached on (`http://127.0.0.1:<port>`), and as another host when you send its `Host` header. The fresh KV has no `buddies:enabled` or `buddies:photos` key, so the relay and its photo blobs are on with no switch to flip. The `BUDDY_BLOBS` R2 bucket is simulated locally in the persistence dir.
- `.verify/dev.vars.env` (mode 600) holds a random `NOTES_IMPORT_DEV_BYPASS_TOKEN`, `ADMIN_API_TOKEN`, `ACCOUNT_TOKEN_SECRET` (account sessions), `PASSKEY_CHALLENGE_SECRET` and `ACCOUNT_TICKET_SECRET` (passkeys), `LIVE_TICKET_SECRET` (browser live socket tickets), plus `APPLE_TEAM_ID=VERIFY0000` unless a real one is passed. The tokens are reused across restarts and recorded in `state.json` so tests can read them.
- The WitnessWork app's verify loop (`verify-witnesswork`, `wwv up`) consumes this as `node services/api/scripts/verify/dev.mjs up` followed by `… url`, from the same checkout. So a worker `wwv up` started is the one `up` here reuses, and `down` here stops it for the app's loop too.

## Doctor

```bash
node scripts/verify/dev.mjs doctor
```

Read-only. Each check prints an `ok` or `FAIL` line, and the command exits 1 on any failure. The checks:

- the state file exists and belongs to this checkout;
- the recorded pid is alive;
- the port's listener is in our process tree (`lsof`);
- `/health` answers `ok`;
- the git HEAD matches the one recorded at `up` (a mismatch only warns, because wrangler hot-reloads `src/`);
- Buddies is enabled (an unknown `invite/fetch` returns `not_found`, not `disabled`);
- Buddies photos are enabled (an unknown `blob/get` returns `not_found`, not `photos_disabled`);
- the dev bypass works (the value is never printed);
- account sessions are on (an unknown refresh token returns `unauthorized`, not `disabled`);
- Shared Spaces is on (a `sync` without a token returns `unauthorized`, not `disabled`);
- which optional credentials are set.

Run it first whenever anything looks off.

## Drive

Plain HTTP against `URL=$(node scripts/verify/dev.mjs url)`. Per feature recipes live in [`features/`](features/README.md); read the index first.

```bash
pnpm test:e2e                                  # every src/e2e/*.e2e.test.ts against the running worker
pnpm test:e2e src/e2e/buddies.e2e.test.ts      # one surface
WW_API_URL=https://… pnpm test:e2e             # a deployed worker (token-gated tests skip)
node scripts/verify/dev.mjs kv put buddies:enabled false   # edit the isolated local NOTES_KV
node scripts/verify/dev.mjs kv get app-store-ratings:summary
node scripts/verify/dev.mjs kv delete buddies:enabled
```

- For the isolated local worker, send a unique `cf-connecting-ip` per request (`198.18.x.y` or similar). Never send synthetic caller IPs to a deployed Worker: Cloudflare rejects them before the request reaches the API. Without one, every request shares the same per-IP key, and you hit the local rate limiters: 60/min per family (`/geocode` + `/autocomplete`, `/notes-import*`, `/attestation/*`, `/route-planning/*`, `/maps/*`, and `/admin/*` each count separately; `/places/*` counts with `/geocode`), and the Buddies per-caller tiers (IPv6 grouped by /64): 120/min for `invite/fetch` + `invite/claim`, 60/min for `inbox/register`, 600/min for `inbox/sync`, `inbox/live`, and `inbox/successor`, 60/min for `blob/put`, 600/min for `blob/get`, 600/min for other signed ops. The e2e helpers and the fuzzer already do this.
- Signed Buddies ops need Ed25519 envelopes. Use `RelayOwner` and `RelayWriter` in `src/test/e2e.ts` (built on `src/test/buddiesClient.ts`) rather than hand-rolling curl. Photo blobs: `photoBlob()` makes sealed-looking bytes with their id and token, `RelayOwner.putBlob` and `getBlob` send them (raw bytes, envelope in headers).
- KV edits take effect on the next request (no 60 s edge cache locally).

## Fuzz

```bash
pnpm fuzz:buddies                       # 300 seeded cases, random seed printed
pnpm fuzz:buddies --runs 300 --seed 42  # reproducible run
pnpm fuzz:buddies --seed 42 --case 17   # replay one failing case
```

The seed decides each case's mutation and its parameters. Ids, keys, and nonces are fresh every run, so you can replay a seed against the same persisted state.

There are 29 generators, 9 of them for bearer requests (skipped, and counted as skipped, without a dev bypass token):

- **Bad signatures:** tampered signature, tampered payload, wrong key or wrong role, a signature reused on another op, malformed `signature`.
- **Replay and time:** sequential and parallel replay, stale `ts`.
- **Bad payloads:** a wrong-typed field, a missing field, malformed envelopes (bad JSON, base64, UTF-8), unicode and huge strings.
- **Size and caps:** blob sizes at and one byte over every limit, envelopes over 256 KiB (declared and chunked), slot, invite, template, kind, and expiry caps.
- **Photo blobs:** `blob/put` → `blob/get` round trip with an idempotent retry, 1 MiB accepted and one byte more `too_large`, a flipped bit (`bad_request`), a stranger's signature, and the same 404 for a wrong token, an unknown blob or inbox, and a deleted blob.
- **Other:** unknown routes and methods, invite claim burn after 5 wrong secrets, parallel `event/put` dedupe, `slot/seal` racing the slot's own `event/put`s (each lands and syncs, or is 403 `sealed` and doesn't; then every write is `sealed`, and `slot/leave` still works but keeps the events that landed), per-caller edge limits (one IPv4, or rotating addresses in one IPv6 /64, until 429 `rate_limited` with `Retry-After: 60`).
- **Bearer requests** (sessions opened through the dev bypass): bad tokens on every route class (forged, truncated, `alg: none`, a refresh token, other schemes; always 401 `unauthorized` with the challenge, never the envelope), another account's token (403 `forbidden`), an inbox registered before accounts (409 `not_linked`), malformed plain-JSON bodies and envelopes sent with a token (400), `inbox/register` proofs (missing, another account's, forged, for another inbox), bearer `blob/put` headers, writer ops with any session's token, a bearer round trip, and per-account edge limits from rotating addresses.

The oracle checks every request:

- no 5xx;
- no response slower than 5 s (`--timeout-ms`);
- Buddies errors are `{error}` JSON (the full body is `{ok: false, error, code}`); only a 200 `blob/get` is raw bytes;
- each mutation gets its documented status (for example, a bad signature is 401 `bad_signature`).

After the run, a canary inbox's full `inbox/sync` must equal its pre-fuzz snapshot (and so must the bearer canary's, registered and synced by bearer request), and `/health` must still be ok. The report records secret headers (`authorization`, `x-ww-dev-bypass`) as `<redacted>`. When a case fails, the fuzzer prints the seed, a `--case` repro command, and the exact failing request, then exits 1.

## Evidence

- Everything goes in `.verify/artifacts/` (gitignored). That folder and `.verify/wrangler.log` survive `down`.
  - `e2e-<surface>-<timestamp>.json`: every request and response of an e2e file. Bodies are clipped to 600 chars, and secret-bearing headers are recorded by name only.
  - `fuzz-<timestamp>.json`: seed, runs, status histogram, p50, p95, and max latency, per-generator counts, canary result, and every failure with its full case transcript.
  - `.verify/wrangler.log`: the worker's request log (`[wrangler:info] POST /buddies/v1/… 200`) and any stack traces.
- **Proof standards:**
  - Drive the real HTTP routes, not Durable Object methods or internal setters.
  - For every mutation, read the result back through a second route: `inbox/sync` after `card/put`/`event/put`/`roster/put`, `invite/fetch` after `invite/create`/`claim`/`delete`, `GET /app-store/ratings` after the KV seed.
  - Assert status and body, not just status.
- **The dev bypass is a test mode.** It skips App Attest only; rate limits, the kill switch, and the Notes Import gate still run. Real assertions need a device: a TestFlight Beta build against the Beta worker (production App Attest), or a development build reaching this local worker over a tunnel (development App Attest). There is no deployed dev worker; see `services/api/AGENTS.md`.
- **Report skipped paths as skipped.** HERE, Overpass, and the paid kickoff are skipped unless explicitly enabled (see Credentials). Never claim them as verified from a different path.

## Cleanup

```bash
node scripts/verify/dev.mjs down          # kill our recorded process group + children, remove state.json and the vars file
node scripts/verify/dev.mjs down --wipe   # also delete the persisted DO/KV state dir (and its synthetic secrets)
```

`down` kills only the pid recorded in `.verify/state.json`, its detached process group, and its descendants. It never kills by name. Logs and `.verify/artifacts/` stay. Delete old artifacts yourself when they're no longer needed, because disk space is limited. Run `down` after every failed attempt too, so no ports are stranded.

## Credentials

Only names are listed here; never print values.

| Name                                                             | Needed for                                                                                                                                        | Default                                                                 |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `NOTES_IMPORT_DEV_BYPASS_TOKEN`                                  | Notes Import bypass tests                                                                                                                         | generated per state dir                                                 |
| `ADMIN_API_TOKEN`                                                | admin reset positive tests                                                                                                                        | generated per state dir                                                 |
| `ACCOUNT_TOKEN_SECRET`                                           | account sessions (`/accounts/v1/sessions*`, bearer tokens)                                                                                        | generated per state dir                                                 |
| `PASSKEY_CHALLENGE_SECRET`, `ACCOUNT_TICKET_SECRET`              | passkeys and web sessions (`/accounts/v1/passkeys*`, ticket opens)                                                                                | generated per state dir                                                 |
| `TURNSTILE_SECRET_KEY`                                           | web sign-up and recovery's Siteverify (`/accounts/v1/web/*`); `2x0000000000000000000000000000000AA` fails every token, `3x…` says "already spent" | unset, so the local worker uses Cloudflare's always-passing test secret |
| `LIVE_TICKET_SECRET`                                             | browser live socket tickets (`POST /accounts/v1/live/ticket`)                                                                                     | generated per state dir                                                 |
| `APPLE_TEAM_ID`                                                  | AASA app ids                                                                                                                                      | `VERIFY0000` (synthetic)                                                |
| `HERE_API_KEY`                                                   | `/geocode` + `/autocomplete` + `/places/v1/search` smoke (one call each)                                                                          | unset, so skipped; set `WW_API_E2E_SKIP_HERE=1` to skip even when set   |
| `MAPKIT_JS_PRIVATE_KEY`, `MAPKIT_JS_KEY_ID`, `MAPKIT_JS_ORIGINS` | `POST /maps/v1/mapkit-tokens` minting (a throwaway P-256 key; PEM on one line with `\n` escapes)                                                  | unset, so the route answers `maps_unconfigured`                         |
| `WW_API_E2E_OVERPASS=1`                                          | the real `POST /maps/v1/addresses` search (one public Overpass query, keyless)                                                                    | off                                                                     |
| `OPENROUTER_API_KEY`                                             | real provider health and the paid kickoff                                                                                                         | unset; the status probe fails open                                      |
| `REVENUECAT_API_KEY`                                             | Supporter lookups during a paid kickoff                                                                                                           | unset                                                                   |
| `WW_API_E2E_ALLOW_PAID=1`                                        | opt-in to an import plus correction (two real model calls; OpenRouter spend)                                                                      | off                                                                     |
| `WW_API_URL`, `WW_API_DEV_BYPASS_TOKEN`, `WW_API_ADMIN_TOKEN`    | point e2e at another worker                                                                                                                       | from `.verify/state.json`                                               |

- Optional keys come from the process env or `up --secrets-from <env file>`. Only the allowlisted names (`OPTIONAL_SECRETS` in `scripts/verify/dev.mjs`) are read: HERE, OpenRouter, RevenueCat, the Apple team id, `FCM_SERVICE_ACCOUNT_JSON`, PostHog, the fake RevenueCat URL, and the three `MAPKIT_JS_*` names.
- Unlike APNs (HTTP/2 only, so not from `wrangler dev`), FCM works locally: with `FCM_SERVICE_ACCOUNT_JSON` set, the local relay really sends Buddies alerts to Android emulators with Google Play services. Write the key on one line (`printf 'FCM_SERVICE_ACCOUNT_JSON=%s\n' "$(op document get <id> --vault Agents | jq -c .)" > fcm.env`, mode 600, outside the repo) and pass `--secrets-from fcm.env`; JSON values are written single-quoted to the vars file so dotenv keeps them intact.
- `SENTRY_DSN` and the APNs keys are never passed, so local fuzzing can't reach Sentry or Apple.
- CI needs no secrets: `wrangler dev --local` runs without Cloudflare credentials.

## Helpers

- `scripts/verify/dev.mjs`: `up`, `doctor`, `url`, `kv <get|put|delete> <key> [value]`, `down [--wipe]`. Also available as `pnpm verify <cmd>`.
- `pnpm test:e2e` uses `vitest.e2e.config.ts`. It runs files serially because the kill-switch test flips shared KV. Helpers are in `src/test/e2e.ts`: `http`, `RelayOwner`, `RelayWriter`, `openSession`, `BearerRelayOwner`, `sendWriter`, `localKv`, `writeTranscript`.
- `pnpm fuzz:buddies` runs `scripts/verify/fuzz-buddies.mjs`. It uses the plain-Node wire client `scripts/verify/buddies-wire.mjs`, which `scripts/verify/buddies-wire.test.ts` (part of `pnpm test`) keeps in sync with `src/buddies/contracts.ts` and `envelope.ts`.
- CI is the `api` job of `.github/workflows/tests.yml` (at the repo root), which runs only when `services/api` changed: typecheck, unit tests, `up`, `doctor`, e2e, `fuzz --runs 100`, then `down`. Evidence is uploaded as the `api-verify-evidence` artifact.
- To keep the feature map honest as routes change, use `/maintain-verification-skill`.
