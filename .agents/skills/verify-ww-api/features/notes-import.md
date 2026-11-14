# Notes Import

Legacy: Scribe AI replaced it. Every `/notes-import/*` route but `GET /notes-import/status` answers 426 unless KV `scribe:legacy-notes-import` is `on`; the e2e files turn it on for their run, and curl recipes here need `node scripts/verify/dev.mjs kv put scribe:legacy-notes-import on` first (delete it after).

Notes Import turns a publisher's free-form notes into contacts, visits, and time entries through an LLM. App versions with account sessions call every route with `Authorization: Bearer <accessToken>` and are metered by the account; older ones attest each metered call (App Attest on iOS, Play Integrity on Android) while the legacy switch is on. Simulators, emulators and agents open a session with the dev bypass, or send the development-only bypass header on legacy requests. The safe verification surface is the attested no-op `verify` probe and the auth gate in front of `kickoff`. A real kickoff spends OpenRouter credits and is opt-in only.

## Sub-features

- `verify-v1` (`POST /attestation/v1/verify`) accepts `{}` with a valid `x-ww-dev-bypass` and returns `{"ok":true}`.
- `verify-v2` echoes `operationId` for a v2 probe whose `requestHash` equals `contentHash`.
- `verify-v2-mismatch` returns 400 when the two hashes differ.
- `verify-wrong-bypass` treats a wrong token as unattested and returns 400 `Missing uuid, …`.
- `challenge` (`POST /attestation/v1/challenge`) issues an App Attest challenge.
- `legacy-paths`: `/notes-import/challenge`, `/attest`, and `/verify` answer like their `/attestation/v1/` successors, adding `Deprecation` and a `successor-version` `Link`.
- `kickoff-gate` returns 401 `attestation_required` for kickoff without credentials (503 when no provider is healthy). No inference runs.
- `bearer-bad-token` returns 401 `unauthorized` with `WWW-Authenticate` for a bad token, even with the bypass header and a legacy body.
- `bearer-lifecycle`: a dev session's token runs kickoff (no `subscribeToken`, unlimited `credits`) → `result` → `events` → `destroy` → 404, then re-kicks the same notes. Without `OPENROUTER_API_KEY` the run ends `model_error` at no cost; with a key it needs `WW_API_E2E_ALLOW_PAID=1`.
- `bearer-cross-account`: another account's token gets 404 `not_found` on `events`, `result`, `cancel`, and `destroy`, the same as an unknown import id.
- `usage`: `GET /notes-import/usage` answers a dev session's token with its account's allowance (unlimited for a dev session), the same for a second session on that account, `Cache-Control: no-store`; no token or a bad one is 401 with `WWW-Authenticate`; 61 calls from one IP leave the `notes-import` bucket untouched. Finite counts (an import on one device showing on another) need a dev session without the bypass token configured; the unit tests cover them.
- `legacy-off`: with KV `auth:legacy` off, legacy kickoff, transcribe, and `?token=` run routes return 426 `upgrade_required` (message in `error`, no `Retry-After`) while bearer requests work.
- `kickoff-paid` checks dates, duration conversion, existing contact/category reuse, and publisher role, then applies a correction and checks the complete result. It makes two real model calls, spends money, and is opt-in.

## How to get to it (user POV)

- In the app: Tools → Notes Import, paste notes, and import. The app calls the attestation `challenge` and `register` (`attest` on the old paths), then `kickoff`, `events`, and `result`.
- The app's dev-tools diagnostics screen calls `POST /attestation/v1/verify` (older builds: `/notes-import/verify`) to prove the attestation path.
- Simulators and emulators can't attest, so dev builds on both platforms send the `x-ww-dev-bypass` header to a local worker (`pnpm dev` on 8787, or this loop's).

## Driving it with verify-ww-api

Preconditions:

- `doctor` passes, including `ok    dev bypass configured (value hidden)`.
- `URL` and `BYPASS` are exported (see README).

- **v1 probe.** Run `curl -s -X POST $URL/attestation/v1/verify -H "x-ww-dev-bypass: $BYPASS" -H "cf-connecting-ip: 198.18.2.1" -d '{}'`. The body is `{"ok":true}`.
- **v2 probe.** Run `H=$(printf verify | shasum -a 256 | cut -d' ' -f1); curl -s -X POST $URL/attestation/v1/verify -H "x-ww-dev-bypass: $BYPASS" -H "cf-connecting-ip: 198.18.2.2" -d "{\"protocolVersion\":2,\"operation\":\"assert\",\"operationId\":\"op_verify01\",\"purpose\":\"attestation-verify\",\"contentHash\":\"$H\",\"requestHash\":\"$H\"}"`. The body is `{"ok":true,"protocolVersion":2,"operationId":"op_verify01"}`.
- **Wrong token.** Repeat the v1 probe with `-H "x-ww-dev-bypass: nope"`. You get 400 with `Missing uuid, keyId, challenge, assertion, or contentHash`.
- **Challenge.** Run `curl -s -X POST $URL/attestation/v1/challenge -H "cf-connecting-ip: 198.18.2.3" -d '{}'`. The body includes a `challenge` string.
- **Old path.** Run `curl -si -X POST $URL/notes-import/challenge -H "cf-connecting-ip: 198.18.2.5" -d '{}'`. You get 200 with a `challenge`, `deprecation: @1792022400`, and `link: </attestation/v1/challenge>; rel="successor-version"`.
- **Kickoff gate.** Run `curl -s -X POST $URL/notes-import/kickoff -H "cf-connecting-ip: 198.18.2.4" -d '{"uuid":"u1","notesText":"x","context":{"now":"2026-10-01T00:00:00Z","timeZone":"UTC","existingContacts":[],"existingCategories":[]}}'`. You get 401 `attestation_required`, and `.verify/wrangler.log` shows no OpenRouter call.
- **Paid kickoff (opt-in only).** Run `WW_API_E2E_ALLOW_PAID=1 pnpm test:e2e src/e2e/notesImport.e2e.test.ts` after `up --secrets-from <file with OPENROUTER_API_KEY>`. The `PAID:` test checks both complete results and their records. For a deployed dev worker, set `WW_API_URL` and `WW_API_DEV_BYPASS_TOKEN`; its existing provider secret is used and no local OpenRouter key is required. `WW_API_VERSION_OVERRIDES` optionally supplies Cloudflare's dictionary header for a 0%-traffic dev version, e.g. `ww-proxy-dev="<version-id>"`.
- **Bearer.** Open a session as in `accounts.md` (dev bypass), then `curl -s -X POST $URL/notes-import/kickoff -H "authorization: Bearer $ACCESS" -H "cf-connecting-ip: 198.18.2.6" -d '{"notesText":"x","context":{"now":"2026-10-01T00:00:00Z","timeZone":"UTC","existingContacts":[],"existingCategories":[]}}'`. You get `{"importId":…,"refinement":false,"credits":{…"limit":null…}}`; poll `GET $URL/notes-import/<importId>/result` with the same header. `pnpm test:e2e src/e2e/notesImportAccounts.e2e.test.ts` runs the whole bearer surface, including the legacy switch.
- **Usage.** With the same session, `curl -s $URL/notes-import/usage -H "authorization: Bearer $ACCESS" -H "cf-connecting-ip: 198.18.2.7"`. You get `{"ok":true,"accountStatus":"active","supporter":false,"supporterCheckFailed":false,"imports":{"limit":null,"used":0,"remaining":null,"resetsAt":null},…}`.
- **Proof.** Run `pnpm test:e2e src/e2e/notesImport.e2e.test.ts`. The free tests pass, the `PAID:` test shows as skipped unless opted in, and the transcript is in `.verify/artifacts/e2e-notes-import-*.json`.

## Gotchas

- The bypass works only with `APP_ATTEST_ENVIRONMENT=development` (`--env dev`, which `pnpm dev` and this launcher both run). A bare `wrangler dev` without `--env dev` uses prod vars, and Notes Import routes then return 500 when a bypass token is present.
- `/notes-import*` is rate limited at 60/min per `cf-connecting-ip` (its own bucket, apart from place search; `/attestation/*` has another). `GET /notes-import/usage` is the exception: it counts in the 600/min read tier instead. Reusing one IP across a long run produces 429s (`rate_limited`, `Retry-After: 60`) that look like bugs.
- While a run is live, the SSE stream sends a `:` comment line every 15 s; finished, cancelled, and unknown runs close right after the replay.
- `/notes-import/:id/events` is SSE. Use `/result` for assertions.
- Bearer run routes ignore `?token=`, and legacy ones never read the bearer import's owner: a bearer import has no subscribe token, and a legacy import is 404 to every bearer token.
- `auth:legacy` is shared local KV: the accounts and Notes Import e2e files each flip it and delete it in `finally`. Files run serially, so they don't collide.
- The bypass skips attestation only. Real App Attest and Play Integrity flows need a physical device: a TestFlight Beta build against the Beta worker, or a Play-installed production build against production (see AGENTS.md; there is no deployed dev worker). Don't claim them from this loop.
