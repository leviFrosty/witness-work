# Passkeys and web sessions

A passkey signs a User in on the web or a new phone and, with the WebAuthn PRF extension, delivers their account key through a wrap the server can't open. A browser opens a web session with the ticket a passkey sign-in answers; Settings → Account lists and removes passkeys; sensitive actions on the web ask for a fresh passkey tap the server checks (step-up).

## Sub-features

- `register` (`POST /accounts/v1/passkeys/register/options`, then `POST /accounts/v1/passkeys`) stores a passkey for the token's account, with an optional wrap, and logs `passkey.added`.
- `sign-in` (`POST /accounts/v1/passkeys/challenge` `{purpose:"sign-in"}`, then `POST /accounts/v1/passkeys/assert`) answers the account, the credential's wraps, and a `passkey` ticket (none for an Android origin).
- `web-session` (`POST /accounts/v1/sessions` with `ticket`) opens a `web` session; the same signed request again gets the same session; a fourth web session replaces the least recently active.
- `step-up` (`challenge` `{purpose:"step-up"}` with a Bearer token, then `assert` with it) records `stepUpAt`; web sessions need one within 5 minutes to add or remove a passkey or delete backups (`step_up_required`).
- `wrap`, `list`, `remove` (`POST /passkeys/wrap`, `GET /passkeys`, `POST /passkeys/remove`).
- `web-signup` (`POST /accounts/v1/web/signup/options` with a Turnstile token, then `POST /accounts/v1/web/signup` signed by the new account key) creates the account (`createdVia: web`), its passkey and wrap, and a stepped-up `web` session (`method: signup`); capped at 3 per IP a day and 30 per ASN an hour; KV `accounts:web-signup` `off` pauses it.
- `web-recovery` (`POST /accounts/v1/web/recovery`, signed by the key a recovery key holds, with a Turnstile token) answers a `recovery` ticket for an existing account (404 `unknown_account` otherwise); 10 per IP a day.
- `approval` (`POST /accounts/v1/approval/{op}`): the browser opens a channel and shows the QR code; a phone session claims it (web sessions `forbidden`), sends the sealed account key; the browser receives it with an `approval` ticket, opens its web session, and calls `done`. `claim` answers the browser's coarse location and `far`.
- Refusals: `passkey_failed` with `reason` (`challenge`, `unknown_credential`, `user_handle`, `origin`, `rp_id`, `user_verification`, `signature`, `counter`, `registration`), `ticket_invalid`, and 429 after 30 failed assertions per IP an hour.

## How to get to it (user POV)

- Web sign-in screen → Sign in with a passkey; web Settings → Account → Passkeys.
- A phone's Settings → Account → Passkeys → Add a Passkey; onboarding's Save a Passkey.

## Driving it with verify-ww-api

Preconditions:

- `node scripts/verify/dev.mjs doctor` passes, including `passkeys enabled (RP IDs beta.app.witnesswork.app, localhost)` and `web sign-up enabled (Turnstile site key 1x00000000000000000000AA)`.

- **Whole flow with a software authenticator.** Run `pnpm test:e2e src/e2e/passkeys.e2e.test.ts`. Three tests pass and `.verify/artifacts/e2e-passkeys-*.json` holds the exchanges: register (EdDSA, `localhost`, origin `http://localhost:8081`), sign in, web session (and its lost-response repeat), refresh with `appVersion`, device list, step-up, wrap, remove, and the origin/RP ID pair refusals.
- **A real browser with PRF.** Drive Chromium with the CDP virtual authenticator (`WebAuthn.addVirtualAuthenticator` with `hasPrf`, `hasUserVerification`, `isUserVerified`, `hasResidentKey: true`) on a page served from `http://localhost:8081` (RP ID `localhost`). The page runs `navigator.credentials.create/get` with `extensions.prf.eval.first = UTF-8("ww-account/v1/passkey-prf")` and drops `clientExtensionResults.prf` before the response is posted; the driver posts it. Proof: the wrap saved after the confirming get opens with the PRF output of a later discoverable sign-in, and the key it holds derives `accountPub`.
- **Web sign-up and recovery.** Run `pnpm test:e2e src/e2e/webSignup.e2e.test.ts` (writes `.verify/artifacts/e2e-web-signup-*.json`): config, sign-up with a wrap against the real Siteverify (test secret), refresh, passkey sign-in, a recovery ticket and its session, the per-IP cap, and the kill switch. In a browser, the Turnstile widget renders with the test site key on `http://localhost:8081` (`render=explicit`, the `action` set) and answers `XXXX.DUMMY.TOKEN.XXXX`; sign up with the virtual authenticator as above, then encode the account key as a recovery key (`WW1-` and Crockford base32 of the key and 2 checksum bytes), read it back, and sign `web/recovery` with the key it derives.
- **Approving a browser, both sides.** Run `pnpm test:e2e src/e2e/approval.e2e.test.ts` (`.verify/artifacts/e2e-approval-*.json`; opaque blobs). With the contract's real crypto, drive both sides from Node: the browser makes `channelId ‖ browserPub ‖ secret` and the QR URL (`http://localhost:8081/approve#1…` on a local web build), derives `claimToken` and `helloKey` (HKDF of `secret`), opens with `b64u(SHA-256(claimToken))`, `b64u(SHA-256(browserToken))`, and the hello sealed in the Buddies format; the phone (a dev-bypass session) parses the QR code, claims with its X25519 key, opens the hello; both derive `prk = HKDF-Extract(secret, X25519)` and the six-digit code over `channelId\nbrowserPub\nphonePub` and must agree; the phone seals `{v:1, accountKey, accountId, deviceName}` under `keyKey` and sends; the browser receives, opens it, opens a web session with the ticket, checks `accountId`, and calls `done`. Proof: activity has `device.approved` (the phone's session) and `session.opened` `method: approval` with the phone as `actor`.
- **Turnstile refusals.** `node scripts/verify/dev.mjs down`, then `TURNSTILE_SECRET_KEY=2x0000000000000000000000000000000AA node scripts/verify/dev.mjs up`: `web/signup/options` answers 403 `turnstile_failed` `reason: invalid-input-response` (`3x…`: `timeout-or-duplicate`). Restart without it after.
- **Sign-in challenge.** `curl -s -X POST $URL/accounts/v1/passkeys/challenge -H 'content-type: application/json' -H "cf-connecting-ip: 198.18.5.1" -d '{"purpose":"sign-in","rpId":"localhost"}'` answers `{ok, challengeToken, options}` with `options.rpId` `localhost` and `allowCredentials: []`.

## Gotchas

- Origins pair with one RP ID: `http://localhost:8081` with `localhost` only, `https://beta.app.witnesswork.app` with `beta.app.witnesswork.app` only (Beta's RP ID, which the local worker lists for native development builds). A localhost origin on a `beta.app` challenge is `origin`.
- The failure budget is per caller IP: send a fresh `cf-connecting-ip` per request (the helpers do), or 30 failures lock you out for up to an hour.
- `wrangler dev` gives requests your machine's real coarse location (`request.cf`), so an approval's `claim` answers your city and `far: false`. Don't paste it into public PRs; vitest covers `far` with set locations.
- An approval channel lives 75 seconds unclaimed: claim within that, or open a new one.
- `wrangler dev` gives requests your real network's ASN (`request.cf.asn`), so every local sign-up shares one 30-an-hour ASN cap. Keep runs small, or wait an hour; the per-IP cap follows `cf-connecting-ip`.
- Tickets last 2 minutes and challenges 5 (signup 10); a step-up counts 5 minutes.
- Each signed passkey or `backup/delete` envelope works once (409 `replay`); sign a fresh one per request, retries included.
