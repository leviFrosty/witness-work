# ww-api verification map

This directory is the maintained source for verifying ww-api's user-facing behavior. ww-api is this repo's `services/api`; every command and path in these files is relative to it (`cd services/api` first). The worker's users are the WitnessWork app, and people who open shared links in a browser. Read this index before driving the worker, then use the matching feature file as the recipe.

## Baseline preconditions

- Start the worker with `node scripts/verify/dev.mjs up`. It serves `wrangler dev --env dev --local` on a port in 8790-8799, with state in `.verify/wrangler-state`.
- Run `node scripts/verify/dev.mjs doctor` and require `verify: doctor ok`.
- Export `URL=$(node scripts/verify/dev.mjs url)` for curl recipes.
- Export `BYPASS=$(node -p "require('./.verify/state.json').tokens.devBypass")` and `ADMIN=$(node -p "require('./.verify/state.json').tokens.admin")` when a recipe needs them. Both are synthetic, local-only values.
- Never drive port 8787. That is the user's own `pnpm dev`.

## Driving conventions

- Send a unique `-H "cf-connecting-ip: 198.18.<n>.<m>"` per curl so per-IP rate limits don't couple steps.
- Treat every command as literal. Keep paths, headers, and JSON unchanged.
- Signed Buddies ops go through `pnpm test:e2e` (helpers in `src/test/e2e.ts`), not hand-built curl.
- Restore any KV switch you flip (`node scripts/verify/dev.mjs kv delete <key>`) before the next recipe.
- Never call `POST /notes-import/kickoff` with the bypass, or let `POST /scribe/v1/step` pass validation on a worker with an OpenRouter key, unless `WW_API_E2E_ALLOW_PAID=1` is part of the task. Both spend OpenRouter credits.

## Proof and skip reporting

- Capture the request and the resulting state: status and body, plus a read-back through a second route for every mutation.
- E2E proof is the `.verify/artifacts/e2e-<surface>-*.json` transcript plus the vitest pass line.
- Fuzz proof is `.verify/artifacts/fuzz-*.json` with `failures: []` and `canary.intact: true`.
- Report an unreachable path with the attempted command and the unmet precondition (for example, `HERE_API_KEY unset`).
- Do not report a skipped entry point as verified through a different path.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then uses exactly four H2 sections in this order.

1. `Sub-features` lists short IDs with one line for each behavior.
2. `How to get to it (user POV)` lists every user entry point.
3. `Driving it with verify-ww-api` starts with `Preconditions:` and uses labeled bullets that pair each user action with an exact command and observable result.
4. `Gotchas` lists traps that can waste or invalidate a verification run.

Keep implementation details out of the map. Name only user paths, stable handles, required state, commands, and observable proof.

## Features

- [Health and status](./health-and-status.md) covers `/health`, `/notes-import/status`, App Store ratings, and the JSON 404.
- [Scribe AI](./scribe.md) covers `/scribe/v1/status`, `/scribe/v1/usage`, every step refusal before the model, the KV switches, the meter at a zero allowance, the Notes Import cutover, `/attestation/v1/status`, the admin reset, and the opt-in real-model suite.
- [Notes Import](./notes-import.md) (legacy, behind KV `scribe:legacy-notes-import`) covers the attestation verify probe and challenge (`/attestation/v1/*` and their old `/notes-import/*` paths), kickoff's auth gate, and the opt-in paid kickoff.
- [Buddies relay](./buddies-relay.md) covers pairing end to end, sync read-backs, auth failures, caps, the kill switch, bearer requests on account sessions and the legacy switch, and fuzzing both.
- [Universal link pages](./universal-link-pages.md) covers the AASA, the `/contacts` (`/c`, `/c/:payload`) contact pages, and the `/buddies/invite` (`/b`) invite page.
- [Admin reset](./admin.md) covers the maintainer usage reset and its 404 fail-closed auth.
- [Web maps](./maps.md) covers MapKit JS tokens (`/maps/v1/mapkit-tokens`: 401, `maps_unconfigured`, minting with a throwaway key) point-of-interest search (`/places/v1/search`), and territory house numbers (`/maps/v1/addresses`, OpenStreetMap through Overpass).
- [Passkeys and web sessions](./passkeys.md) covers registering, signing in, ticket web sessions, step-up, wraps, removal, and the refusals, with a software authenticator and a real Chromium virtual authenticator with PRF.
- [Accounts and sessions](./accounts.md) covers sessions through the dev bypass, `GET /accounts/v1/account`, bearer handoff and backup, the legacy switch, and `/app/v1/config`.
- [Shared Spaces](./shared-spaces.md) covers Shared Cars' spaces: create, invites and joins, put and sync, roles, rekeying, the live socket, and the kill switch; and Territories' scoped spaces: streets, hand-offs, and guest links.

Not mapped yet: supporter route planning (`/route-planning`, needs `HERE_API_KEY`). Map it with `maintain-verification-skill` before relying on it.
