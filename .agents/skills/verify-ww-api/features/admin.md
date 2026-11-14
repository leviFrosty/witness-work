# Admin reset

Maintainers reset one account's Scribe AI windows with `pnpm run admin:reset-usage` (`POST /admin/scribe/reset`), or, with `--notes-import`, one Notes Import meter's rolling usage (`POST /admin/notes-import/reset`, reachable only while KV `scribe:legacy-notes-import` is `on`). Each route is secret-protected and fails closed: a missing token, a wrong token, and missing server configuration all return the same 404 as an unknown route.

## Sub-features

- `no-token` returns 404 `{"ok":false,"error":"not_found","code":"not_found"}`, the same as an unknown route.
- `wrong-token` returns the same 404, with nothing that tells it apart from `no-token`.
- `bad-meter` returns 400 `{"ok":false,"error":"Invalid meterId","code":"bad_request"}` when the token is valid.
- `reset` returns 200 `{"ok":true}` for a valid token and a valid `meterId` (8-64 chars of `[A-Za-z0-9_-]`).
- `scribe-reset` (`POST /admin/scribe/reset`) returns 200 `{"ok":true,"previous":{…}}` for a valid token and `{accountId}`, and the same 404 without it.
- `legacy-hidden`: with `scribe:legacy-notes-import` absent, `/admin/notes-import/reset` is 404 even with the token.

## How to get to it (user POV)

- A maintainer runs `pnpm run admin:reset-usage [--beta] [--notes-import] <accountId>` with `ADMIN_API_TOKEN` (production) or `ADMIN_API_TOKEN_BETA` (Beta) in `.env`.
- No app screen calls this route.

## Driving it with verify-ww-api

Preconditions:

- `doctor` passes, and `URL` and `ADMIN` are exported (see README).
- The Notes Import recipes need `node scripts/verify/dev.mjs kv put scribe:legacy-notes-import on` first (delete it after).

- **No token.** Run `curl -si -X POST $URL/admin/notes-import/reset -H "cf-connecting-ip: 198.18.4.1" -d '{"meterId":"verifyMeter01"}'`. You get 404 `{"ok":false,"error":"not_found","code":"not_found"}`.
- **Wrong token.** Add `-H "x-ww-admin-token: wrong"` to the same command. The status and body are identical.
- **Bad meter.** Run `curl -s -X POST $URL/admin/notes-import/reset -H "x-ww-admin-token: $ADMIN" -H "cf-connecting-ip: 198.18.4.2" -d '{"meterId":"bad id!"}'`. The body is `{"ok":false,"error":"Invalid meterId","code":"bad_request"}`.
- **Reset.** Run the same command with `-d '{"meterId":"verifyMeter01"}'`. The body is `{"ok":true}`.
- **Scribe AI reset.** Run `curl -s -X POST $URL/admin/scribe/reset -H "x-ww-admin-token: $ADMIN" -H "cf-connecting-ip: 198.18.4.3" -d '{"accountId":"verifyMeter01"}'`. The body is `{"ok":true,"previous":{"session":0,"weekly":0,"monthly":0}}` for an account with no usage.
- **Through the maintainer script.** The script has no flag for a local worker, so point its Beta slot at this one: run `ADMIN_API_TOKEN_BETA=$ADMIN WW_API_BETA_URL=$URL node scripts/reset-notes-import-usage.mjs --beta verifyMeter01` (Scribe AI) and the same with `--notes-import` (legacy on). Each exits 0.
- **Proof.** Run `pnpm test:e2e src/e2e/admin.e2e.test.ts`. Five tests pass, with the transcript in `.verify/artifacts/e2e-admin-*.json`. Header values are not recorded.

## Gotchas

- The route is rate limited at 60/min per `cf-connecting-ip`, in its own `admin` bucket.
- A 404 here doesn't tell you whether the token was wrong or never configured. Check `doctor` first.
- Never point these commands at the Beta or production URLs. The local `ADMIN` token is synthetic and only valid for the launcher's worker.
