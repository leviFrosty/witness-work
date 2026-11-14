# Scribe AI

Scribe AI is the in-app assistant: the User says what they did or plan, and the app sends one model step at a time to the worker, which streams back text and tool calls the device runs and turns into a Proposal for review. Every route takes the account session's bearer token, and each step is charged in usage units to the account's windows. The free verification surface is everything that happens before the model runs (status, usage, every refusal, the kill switches, the meter at a zero allowance, the Notes Import cutover). A real step spends OpenRouter credits and is opt-in only.

## Sub-features

- `status`: `GET /scribe/v1/status` answers `enabled`, `reason`, `protocol: {min, max}`, `minAppVersion`, `disabledTools`, and `limits` without auth, `Cache-Control: no-store`.
- `usage`: `GET /scribe/v1/usage` answers the account's usage snapshot: a dev session gets `plan: "free"` with a `monthly` window whose `limit` is `-1`; an iOS token for the same account gets the real limit.
- `auth`: no token or a bad one is 401 `unauthorized` with `WWW-Authenticate: Bearer…` on usage, step, and transcribe.
- `validation`: step refusals before any model call: `protocol: 2` → 400 `bad_request`, a bad `conversationId` → 400, `step: 6` → 400 `step_limit`, a tool with an optional property → 400 `invalid_tools`, a context over 16 KiB → 413 `too_large`, broken JSON → 400.
- `kv-switches`: KV `scribe:limits` `{"maxInputTokens":1000}` → 413 `context_full`; `scribe:enabled off` → 503 `disabled` with `Retry-After: 60`; `scribe:protocol-min 2` → 426 `upgrade_required`.
- `limit-reached`: KV `scribe:limits` `{"free":{"monthly":0}}` and an iOS token → 402 `limit_reached` with the `usage` snapshot (`limited: true`).
- `legacy-cutover`: with KV `scribe:legacy-notes-import` absent, every `/notes-import/*` route answers 426 `upgrade_required` except `GET /notes-import/status` (200); with it `on`, they answer as before.
- `attestation-status`: `GET /attestation/v1/status` answers `capabilities` (and the same object as `providers`).
- `admin-reset`: `POST /admin/scribe/reset` with the admin token and `{accountId}` answers `{ok: true, previous}`; without the token it's 404.
- `step-paid`: one real step streams `start`, a `tool_call`, and `done` with usage whose units the meter shows. Opt-in.
- `model-suite-paid`: the full real-model suite (tool calls, read → write, parallel calls, caching, units, limit with turn grace, `strictTools`, a 7-turn conversation) with a JSON report. Opt-in.

## How to get to it (user POV)

- In the app: the Scribe AI composer (type or dictate) sends steps; its usage meter reads `/scribe/v1/usage`; Import from Paper reads pages through `/scribe/v1/transcribe`.
- The app checks `/scribe/v1/status` before showing Scribe AI, and opens account sessions with the providers from `/attestation/v1/status`.
- Older app versions call `/notes-import/*`, which the cutover answers.
- Maintainers reset an account with `pnpm run admin:reset-usage <accountId>`.

## Driving it with verify-ww-api

Preconditions:

- `doctor` passes, and `URL`, `BYPASS`, and `ADMIN` are exported (see README).
- For the opt-in paid recipes: `up --secrets-from <file>` where the file holds only `OPENROUTER_API_KEY=…` (mode 600, outside the repo).

- **Status.** Run `curl -s $URL/scribe/v1/status -H "cf-connecting-ip: 198.18.7.1"`. The body has `"ok":true`, `"protocol":{"min":1,"max":1}`, and `limits.maxTools` 24.
- **Usage without a token.** Run `curl -si $URL/scribe/v1/usage -H "cf-connecting-ip: 198.18.7.2"`. You get 401, `www-authenticate: Bearer…`, and `"code":"unauthorized"`.
- **Usage on a session.** Open a session as in `accounts.md`, then `curl -s $URL/scribe/v1/usage -H "authorization: Bearer $ACCESS" -H "cf-connecting-ip: 198.18.7.3"`. The body has `"plan":"free"` and `"units":{"used":0,"limit":-1}`.
- **Kill switch.** Run `node scripts/verify/dev.mjs kv put scribe:enabled off`, POST any step body to `$URL/scribe/v1/step` with the bearer header, and get 503 `disabled` with `retry-after: 60`. Then `node scripts/verify/dev.mjs kv delete scribe:enabled`.
- **Cutover.** With `scribe:legacy-notes-import` absent, `curl -s -X POST $URL/notes-import/kickoff -H "cf-connecting-ip: 198.18.7.4" -d '{}'` answers 426 `{"ok":false,"error":"Update required","code":"upgrade_required"}`, and `curl -s $URL/notes-import/status -H "cf-connecting-ip: 198.18.7.5"` answers 200.
- **Admin reset.** Run `curl -s -X POST $URL/admin/scribe/reset -H "x-ww-admin-token: $ADMIN" -H "cf-connecting-ip: 198.18.7.6" -d "{\"accountId\":\"$ACCOUNT\"}"`. The body is `{"ok":true,"previous":{…}}`.
- **Proof (free).** Run `pnpm test:e2e src/e2e/scribe.e2e.test.ts`. Every free test passes, the `PAID:` test is skipped, and the transcript is `.verify/artifacts/e2e-scribe-*.json`.
- **One real step (opt-in).** Run `WW_API_E2E_ALLOW_PAID=1 pnpm test:e2e src/e2e/scribe.e2e.test.ts -t PAID`. It passes with a `tool_call` and a `done` whose units the meter shows.
- **Model suite (opt-in).** Run `WW_API_E2E_ALLOW_PAID=1 pnpm exec vitest run --config vitest.e2e.config.ts src/e2e/scribeModel.e2e.test.ts`. It takes 2–4 minutes and writes `.verify/artifacts/scribe-model-<timestamp>.json` with tokens, units, cache hit rate, latency, and host per step (structure only, no reply text).

## Gotchas

- Steps are SSE. Read the whole stream: the worker writes `start` only once the client reads, and a step ends with exactly one `done` or `error`.
- Hand-built step bodies are long (16 tool definitions, an app context). Use `stepBody()` from `src/test/scribeFixture.ts` through the e2e files rather than curl.
- A dev session's windows are unlimited, so limits and `limit_reached` need an iOS token for the same account; the e2e files mint one with the launcher's `ACCOUNT_TOKEN_SECRET`.
- Scribe AI's KV keys are shared local KV. The e2e files snapshot and restore them; restore any key you flip by hand before the next recipe. Locally a KV change applies at once; deployed, it takes up to 60 seconds.
- `scribe:provider-health` caches the OpenRouter host check for 300 seconds. Delete it after changing `scribe:model` by hand if status looks stale; the public status is also reused per isolate for 30 seconds.
- The Notes Import e2e files turn `scribe:legacy-notes-import` on for their run (`enableLegacyNotesImport` in `src/test/e2e.ts`); without it their routes answer 426.
- Never call `/scribe/v1/step` past validation on a worker with an OpenRouter key unless `WW_API_E2E_ALLOW_PAID=1` is part of the task. It spends credits.
