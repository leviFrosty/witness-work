# Accounts and sessions

The app proves it's WitnessWork once per session (`POST /accounts/v1/sessions`, attested through `/attestation/v1/challenge`; the dev bypass locally) and then calls account routes with a 15-minute bearer token it renews with `POST /accounts/v1/sessions/refresh`. Settings → Account reads the account, Set Up Another Device hands the key to a new phone, and backups go to R2. Older app versions keep using signed envelopes until the legacy switch is turned off, and `/app/v1/config` tells every new version its minimum.

## Sub-features

- `session-open` (`POST /accounts/v1/sessions`) answers 201 with `Location: /accounts/v1/sessions/current` and `{ok, accountId, status, sessionId, accessToken, accessExpiresAt, refreshToken, sessionExpiresAt}` for a self-signed envelope plus the dev bypass.
- `bearer-info` returns the token's account from `GET /accounts/v1/account` (and, for older builds, `POST /accounts/v1/account/info` with no body).
- `refresh` (`POST /accounts/v1/sessions/refresh`) replaces both tokens; `sessionExpiresAt` never moves.
- `close` (`DELETE /accounts/v1/sessions/current`) ends the session; its refresh token then gets 401 `unauthorized` with `WWW-Authenticate: Bearer error="invalid_token"`.
- `bearer-backup` puts with `x-ww-slot-id`/`x-ww-sha256`, gets the bytes back, and deletes only with the account key's envelope too.
- `bearer-handoff` opens and reads a channel with the token.
- `legacy-off` answers envelope-authenticated requests with 426 `upgrade_required` once KV `auth:legacy` is `off`, while bearer requests and opening sessions keep working.
- `app-config` returns `{ok}` or `{ok, minAppVersion}` from KV `app:min-version`, uncached.

## How to get to it (user POV)

- Opening the app (with an account) opens or refreshes a session.
- Settings → Account reads the account; Set Up Another Device and Back Up to WitnessWork use handoff and backup.
- Every launch and return to the foreground reads `/app/v1/config`.

## Driving it with verify-ww-api

Preconditions:

- `node scripts/verify/dev.mjs doctor` passes, including `account sessions enabled`.

- **Whole flow.** Run `pnpm test:e2e src/e2e/accounts.e2e.test.ts`. Vitest reports `/accounts/v1/sessions (dev bypass)`, `the legacy switch (local KV)`, and `GET /app/v1/config` as passed, and `.verify/artifacts/e2e-accounts-*.json` holds the exchanges.
- **Sessions on.** Run `curl -s -X POST $URL/accounts/v1/sessions/refresh -H 'content-type: application/json' -H "cf-connecting-ip: 198.18.4.1" -d '{"refreshToken":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"}'`. The body is `{"ok":false,"error":"unauthorized","code":"unauthorized","reason":"unknown"}`; `disabled` means no `ACCOUNT_TOKEN_SECRET`.
- **App config.** Run `node scripts/verify/dev.mjs kv put app:min-version '{"minVersion":"9.8.7"}'`, then `curl -si $URL/app/v1/config`. You get 200, `cache-control: no-store`, and `{"ok":true,"minAppVersion":"9.8.7","sync":{…},"webSignup":{…},"country":…,"regionCode":…}`. Locally `wrangler dev` fills `request.cf` from your own connection, so `country` and `regionCode` show where this Mac is (or null). Restore it with `node scripts/verify/dev.mjs kv delete app:min-version`.
- **Cloud Sync.** Run `pnpm test:e2e src/e2e/sync.e2e.test.ts`. It sets KV `sync:entitlement supporter` and refuses a non-Supporter (`supporter_required`), then with `sync:entitlement everyone` does put → live `changed` → list → get → `If-Match` → the kill switch → delete, and the Cloud Sync request's set → repeat → status → clear, and deletes the keys again. `.verify/artifacts/e2e-sync-*.json` holds the exchanges.

## Gotchas

- Session envelopes (op `session/open`) are Ed25519-signed; use the e2e helpers, not hand-built curl.
- **Cloud Sync record changes** (witness-work ADR 0060). The same e2e file's "record changes" cases open two sessions of one account, put a base for each, open the tablet's socket, send `{"type":"sync","afterSequence":2}` and read the `sync` answer, then `sync/changes/put` from the phone → the tablet's socket gets the sealed `change` → `sync/changes/list` gives the same → a retry is the same sequence → a base with `x-ww-covers-sequence` folds it (`floorSequence`, socket `changed`) → a `sync/list` without `x-ww-sync-changes` sets `snapshotReaders` → `DELETE sessions/current` closes the tablet's socket with `4006` and its still-valid token is 401 on both change routes. A change body is `{ slotId, changeId, blob }` with `blob` the base64url of a whole number of 256-byte blocks (`b64u(randomBytes(512))` in tests); anything else is 400. `node scripts/verify/dev.mjs kv put sync:changes false` makes the change routes 503 `changes_disabled` while put, list and get carry on. Local timings say nothing about the routes' wall time: D1 and R2 are simulated in-process. Measure that on a deployed worker.
- **Cloud Sync photos.** The e2e file's photo case does slot put → live socket → photo put (`x-ww-slot-id`, the other device gets `changed`) → `existed` → list → get (bytes identical) → delete (`changed`) → usage. For the full state, start the worker with `node scripts/verify/dev.mjs up --photo-limit-bytes 2000`, put a slot (`sync/put`), then put photos past 2,000 bytes: 429 `storage_full` with `usage` and no `Retry-After`. A put on an account with no slot is 409 `no_slot`. `node scripts/verify/dev.mjs kv put sync:photos off` makes puts 503 `photos_disabled`. The local `wrangler dev` proxy waits for a request's whole declared body before the worker sees it, so prove `too_large` with a real 26,214,401-byte body; a deployed worker refuses from `Content-Length`.
- Restore `sync:entitlement` and `sync:enabled` (`kv delete`) after flipping them; the dev vars are on and free for everyone.
- Restore `auth:legacy` (`kv delete auth:legacy`) after flipping it, or every legacy accounts and handoff test after it gets 426.
- Real attestations need a device and a deployed worker (a TestFlight Beta build against Beta; there is no deployed dev worker). Locally only the dev bypass opens sessions, and it reports platform `dev`.
