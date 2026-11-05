# Passkeys and web accounts protocol

The wire contract for passkeys, web sessions, web sign-up, and approving a browser from a phone, between the WitnessWork app (`src/lib/serverAccount`, `src/lib/passkeys`, `modules/passkeys`) and ww-api (`ww-api/src/accounts`). Why it exists is in [ADR 0038](./adr/0038-passkeys-and-web-accounts.md); the web app is [ADR 0037](./adr/0037-witnesswork-on-the-web.md). Everything here sits on the server account in [`accounts-protocol.md`](./accounts-protocol.md): its keys, its envelopes, its sessions, its error envelope and codes, and its activity log.

A passkey is a credential of an existing server account, never an identity of its own. It signs in, and when it supports the WebAuthn PRF extension it also delivers the account key (it _unlocks_). The account key stays the User's one secret; the server never sees it or a PRF output.

## Relying party

| Worker env | RP ID                     | Web origins for that RP ID                                                                                                   |
| ---------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| production | `app.witnesswork.app`     | `https://app.witnesswork.app`, `https://beta.app.witnesswork.app`                                                            |
| dev        | `app-dev.witnesswork.app` | `https://app-dev.witnesswork.app`                                                                                            |
| dev        | `localhost`               | `http://localhost:8081`, `http://localhost:8082`, `http://localhost:19006`, `http://localhost:4173`, `http://localhost:5173` |

- **Pairs.** ww-api checks a response's origin and RP ID as a pair from this table, never as two separate lists, and checks the authenticator data's `rpIdHash` against the RP ID its challenge was issued for.
- **Android origins** (`android:apk-key-hash:<b64u(SHA-256(signing certificate))>`) pair with the env's first RP ID: production the two release keys of `com.leviwilkerson.jwtime` (Play app signing and upload); dev those two and the debug key of `com.leviwilkerson.jwtimedev`. The pairs are vars (`PASSKEY_RP_IDS`, `PASSKEY_ORIGINS`), so a key can be added without code.
- iOS sends `https://<RP ID>` as its origin, like the web.
- **The key boundary.** Any page on the RP ID or under it can ask for PRF output, so whatever runs there can unwrap account keys. For production that's the web app and its beta (`beta.app.witnesswork.app`), and the Beta iOS app. Nothing else is ever hosted under `app.witnesswork.app`: no other subdomain, no wildcard DNS record, no preview URL. Beta deploys are held to the same bar as beta OTA updates (ADR 0037 §4).
- **The RP ID never changes** once the first passkey exists.

### Association files

Served by the web app's host with no redirects, `application/json`:

- `/.well-known/apple-app-site-association`: `{ "webcredentials": { "apps": [...] } }` only (the host is never an app-link domain, ADR 0042), listing `Y3KE7B7AHJ.com.leviwilkerson.jwtime` and `….jwtimebeta`, plus `….jwtimedev` on `app-dev`.
- `/.well-known/assetlinks.json`: `delegate_permission/common.get_login_creds` for `com.leviwilkerson.jwtime` with its two release keys, plus `com.leviwilkerson.jwtimedev` with the debug key on `app-dev`.

Each web profile generates its own at build time from `config/web-associations.json` (`docs/web-hosting.md#association-files`): `app.witnesswork.app` and `beta.app.witnesswork.app` never list the development app or its debug key. The apps claim `webcredentials:app.witnesswork.app` (production and Beta) and `webcredentials:app-dev.witnesswork.app?mode=developer` (development).

### The user handle and the name

- **User handle** (`user.id`): 32 random bytes per account, `b64u`, never changed. ww-api mints it the first time the account needs one with a conditional write (`… SET passkey_user_handle = ? WHERE id = ? AND passkey_user_handle IS NULL`), then reads back and uses whichever handle is stored, so two devices asking at once get the same one. Every passkey of an account carries it, and an assertion is accepted only when its `userHandle` is the credential's account's handle.
- **Tag:** the first 20 bits of `SHA-256(UTF-8("ww-account/v1/passkey-tag\n") ‖ handle)`, as 4 Crockford base32 characters (`0123456789ABCDEFGHJKMNPQRSTVWXYZ`). The handle `00 01 … 1f` is `KVW7`.
- **Name:** `WitnessWork <tag>`, for both `user.name` and `user.displayName`. ASCII, never localized. ww-api puts it in the creation options and the device uses them as given; nothing renames a passkey later. Settings → Account → Passkeys shows the same tag, so two people sharing a password manager can tell their passkeys apart.
- `rp.name` is `WitnessWork`.

## Ceremonies

| Option               | Create                               | Get                                                    |
| -------------------- | ------------------------------------ | ------------------------------------------------------ |
| `userVerification`   | `required`                           | `required`                                             |
| `residentKey`        | `required`                           | —                                                      |
| `attestation`        | `none`                               | —                                                      |
| `pubKeyCredParams`   | EdDSA (-8), ES256 (-7), RS256 (-257) | —                                                      |
| `excludeCredentials` | The account's passkeys               | —                                                      |
| `allowCredentials`   | —                                    | Empty to sign in; the account's for a step-up or check |
| `timeout`            | 300,000 ms                           | 300,000 ms                                             |

- **PRF is added by the client.** ww-api's options never carry `extensions.prf`. The client adds `prf: { eval: { first: salt } }` to every create and get, with the salt `UTF-8("ww-account/v1/passkey-prf")`, always through `eval` (never `evalByCredential`), so discoverable sign-in works before the account is known. Encoded as an `ArrayBuffer` in browsers (`@simplewebauthn/browser` passes extensions through as they are), `b64u` in Android Credential Manager's request JSON, and `Data` in iOS's `ASAuthorizationPublicKeyCredentialPRF…Input`. The client platform hashes it with `"WebAuthn PRF" ‖ 0x00` as WebAuthn says, on all three.
- **The server never sees PRF output.** Clients drop `clientExtensionResults.prf` before posting a response.
- **Counters:** ww-api stores the latest sign counter. Synced passkeys report 0, which always passes; a non-zero counter that doesn't increase is refused (`passkey_failed`, `counter`).
- It stores the latest backup flags (`deviceType` from BE, `backedUp` from BS) and the AAGUID, which is for display only.
- **Responses** are WebAuthn's JSON forms (`RegistrationResponseJSON`, `AuthenticationResponseJSON`), `b64u` throughout, at most 16 KiB (`too_large`).

### Challenges and tickets

Both are stateless: a payload MAC'd under their own Worker secret (never the access token's), with a `typ` (`ww-challenge` or `ww-ticket`), the environment's issuer, an id, and an expiry, so neither can pass for the other or for an access token. Issuing one writes nothing. Using one records its id (D1, with a uniqueness constraint, in the same batch as what it authorizes), so each works once; recorded ids are pruned when they expire.

- **Challenge:** 32 random bytes in `options.challenge`, plus an opaque `challengeToken` the client sends back with the response. It's for one purpose (`sign-in`, `step-up`, `register`, `signup`), one RP ID, and, for `step-up` and `register`, one session; for `signup`, the minted account. It lasts **5 minutes** (`signup`: **10 minutes**). A wrong, used, or expired one is 403 `passkey_failed`, `reason: "challenge"`.
- **Ticket:** what a browser opens a web session with, in place of attestation. Opaque, at most 512 characters, valid **2 minutes** from minting. Three kinds:
  - `passkey`, from [`passkeys/assert`](#signing-in-with-a-passkey): the account and the credential;
  - `approval`, from [`approval/receive`](#approving-a-browser-from-a-phone): the account and the channel;
  - `recovery`, from [`web/recovery`](#signing-in-with-a-recovery-key-on-the-web): the account.

## Keys

| Value      | Derivation                                                                                                                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| PRF output | `clientExtensionResults.prf.results.first`, 32 bytes                                                                                                                                             |
| Wrap key   | `HKDF-SHA256(ikm = PRF output, salt = "", info = "ww-account/v1/passkey-wrap\n" + credentialId, 32)`                                                                                             |
| Wrap       | `b64u(0x01 ‖ nonce[24] ‖ XChaCha20-Poly1305(wrapKey, nonce, accountKey, aad))`, `aad = UTF-8("ww-account/v1/passkey-wrap\n" + accountId + "\n" + credentialId + "\n" + keyEpoch)`; 98 characters |

- **Check before trusting.** After opening a wrap, the device derives the account signing key and compares its public key with the `accountPub` the server sent. A wrap that doesn't open, or opens to another key, is "can't unlock", never the account.
- **Several wraps per credential.** The same synced passkey has been seen to return different PRF output on different devices, so a credential keeps up to **4** wraps. A device tries them all and saves its own only when none opens.
- **Key epoch.** `accounts.key_epoch` starts at `0`. [ADR 0039](./adr/0039-change-the-account-key.md) raises it when the account key changes and deletes the account's wraps; every wrap and session records the epoch it was made under, and a wrap for another epoch is refused.

## Routes

`{BASE}` is the ww-api base URL: `https://api.witnesswork.app` (`https://api-dev.witnesswork.app` in development builds). Shipped builds also use `https://ww-proxy.leviwilkerson.com`, the same Worker, which stays up forever (ADR 0042).

`{BASE}/accounts/v1/…`, with the error envelope and codes of [`accounts-protocol.md`](./accounts-protocol.md#requests). **Bearer** means an access token from a session; **signed** means the account key's self-signed envelope (`{ payload, signature }`, op as named), whose `accountPub` must be the token's account when both are required. **Signed envelopes work once:** every signed op here, and `backup/delete`, records its `nonce` for the envelope's 5 minutes, so the same envelope again is 409 `replay`; a retry signs a new one. **Step-up** means a web session must have passed a [step-up](#step-up-on-the-web) in the last 5 minutes (`step_up_required` otherwise); phone sessions are exempt, since they attested and check Face ID on the device.

New error codes:

| Status | Code               | When                                                                                                                                                                                                                                                                          |
| ------ | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 403    | `passkey_failed`   | A ceremony didn't verify. `reason`: `challenge`, `unknown_credential`, `user_handle`, `origin`, `rp_id`, `user_presence`, `user_verification`, `signature`, `counter`, `registration`. A response from the other ceremony is `signature` (sign-in) or `registration` (adding) |
| 403    | `ticket_invalid`   | A ticket that's malformed, expired, used, or for another account                                                                                                                                                                                                              |
| 403    | `turnstile_failed` | Turnstile's Siteverify refused the token. `reason`: Turnstile's first error code                                                                                                                                                                                              |
| 403    | `step_up_required` | A web session hasn't passed a step-up in the last 5 minutes                                                                                                                                                                                                                   |
| 403    | `key_retired`      | A session open with a retired account key ([account-key-change.md](./account-key-change.md#retired-keys))                                                                                                                                                                     |
| 403    | `session_too_new`  | A web session less than 24 hours old asks to change the account key ([account-key-change.md](./account-key-change.md#codes))                                                                                                                                                  |

### Signing in with a passkey

**`POST /passkeys/challenge`**, no auth: `{ purpose: "sign-in", rpId? }` → `{ ok, challengeToken, options }`, `options` being `PublicKeyCredentialRequestOptionsJSON` with an empty `allowCredentials`. `rpId` defaults to the RP ID the request's `Origin` pairs with, else the env's first; one the env doesn't list is `bad_request`. The same default applies to every route that takes `rpId`. Counts against the read edge tier.

**`POST /passkeys/assert`**, no auth: `{ challengeToken, response }` → `{ ok, accountId, accountPub, status, keyEpoch, credentialId, userHandle, wraps: [{ wrapId, wrap, keyEpoch }], ticket?, ticketExpiresAt? }`.

- Verifies the challenge, the credential, the user handle, the origin and RP ID pair, user verification, and the signature, then stores the counter, the backup flags, and `lastUsedAt`.
- `ticket` is a `passkey` ticket for the account and the credential, which a browser opens its session with. It's absent for an `android:apk-key-hash:` origin; phones ignore it and attest as usual (ADR 0038 §5).
- `wraps` is every wrap of the credential for the current `keyEpoch`, newest first; empty for a sign-in-only passkey.
- A suspended account still signs in (it can still move and back up its data).
- Failures count against a per-IP budget of 30 an hour (`rate_limited`, with `Retry-After`).

### Signing in with a recovery key on the web

**`POST /web/recovery`**, signed (op `web/recovery`): `{ accountPub, ts, nonce, turnstileToken }` → `{ ok, accountId, ticket, ticketExpiresAt }`.

- The browser asks for it right after the User enters the recovery key (the Turnstile widget solves while they type), and opens its session at once.
- Turnstile as for [sign-up](#web-sign-up) (action `web-recovery`), and `WEB_RECOVERY_PER_IP_DAY` (default 10) per IP a rolling day, taken only once Siteverify passes. The sign-up kill switch doesn't apply.
- An `accountPub` without an account is 404 `unknown_account`: the web doesn't create accounts from a recovery key, and a phone that holds the key creates it.

### Web sessions: `POST /sessions`

The route of [Opening a session](./accounts-protocol.md#opening-a-session-post-accountsv1sessions), signed as op `session/open`, with `ticket` in place of `attestation`:

| Payload                                                                          | Response (201)                     |
| -------------------------------------------------------------------------------- | ---------------------------------- |
| `accountPub`, `ts`, `nonce`, `ticket`, `device`?, `appVersion`?, `capabilities`? | As for phones; `platform` is `web` |

- The ticket's account must be `accountPub`'s, and it must exist: a ticket never creates an account (`ticket_invalid`). Both `ticket` and `attestation` is `bad_request`.
- **A lost response:** the same signed request (same `nonce` and ticket) again, within the ticket's 2 minutes, gets the same session and the same refresh token with a new access token. The first answer's refresh token keeps working; it never counts as reused.
- **Lifetime:** sliding. Every refresh moves `sessionExpiresAt` to **180 days** after it, with no absolute limit. A web session ends after 180 days without use, on sign-out, or when revoked.
- **Cap:** at most **3** web sessions per account, apart from the phones' 10. Opening a fourth ends the least recently active one (`session.replaced`). That browser shows the sign-in screen and keeps its local data; edits it hadn't synced sync once it signs in again as the same account (see [Signed out by the server](#signed-out-by-the-server)).
- The access token's `platform` claim is `web`.
- **`capabilities`:** as for phones, on opening and on every refresh. The web app sends `["sync-everyone"]` on every path that opens a session (a passkey's or an approval's ticket, a recovery key's ticket, and `web/signup`), or a User without Supporter gets no Cloud Sync.
- Counts against the same 20 opens per account key a rolling day as phones.

### Session fields

- `POST /sessions` (every platform) and `POST /sessions/refresh` take an optional `appVersion` (`major.minor.patch`, at most 32 characters; anything else is `bad_request`); the session keeps the latest.
- Each session row also records how it opened (`method`, as in [Activity](#activity)), the account's `keyEpoch` then, and `stepUpAt`. ADR 0039 reads the session's age and method.
- `GET /sessions` adds `appVersion` (absent when unknown), `method`, and `platform: "web"`; a web session's `expiresAt` is its sliding expiry.
- A refused refresh (401 `unauthorized`) now carries `reason`: `revoked` (another device signed it out), `replaced` (the cap), `expired`, `reused` (a replaced refresh token came back), or `unknown`.

### Step-up on the web

A server-checked passkey tap for sensitive actions.

- **`POST /passkeys/challenge`**, Bearer: `{ purpose: "step-up", rpId? }` → `{ ok, challengeToken, options }`, `allowCredentials` listing the account's passkeys.
- **`POST /passkeys/assert`**, Bearer, with that `challengeToken` → `{ ok, credentialId, stepUpAt }`, and the session records `stepUpAt` and the credential. No ticket.
- Opening a web session counts as a step-up at its creation, so a browser that just signed in (with a passkey, a phone, or a recovery key) can add its first passkey. The app offers Add a Passkey after "Approved by" only until a minute before those 5 minutes end, timed from just before it opened the session, and never starts the authenticator's create past them: `POST /passkeys` would refuse a credential the authenticator had already saved.
- Required (Step-up) for web sessions on: adding or removing a passkey, `backup/delete`, and ADR 0039's key change. The app also asks for one on the web before showing the recovery key and before setting up or approving a device.
- **`GET /sessions`** also answers the server's `now` and the caller's `stepUpUntil` (its `stepUpAt` + 5 minutes; null when none counts, as on phones). The browser times the window from these: at the response, its deadline is `performance.now()` + (`stepUpUntil` − `now`) − 30 seconds, measured from when it sent the request, so a slow answer never makes it longer. It never reads the device's wall clock for this, so a clock set back or forward changes nothing. A missing or unreadable `stepUpUntil` means outside the window.

### Adding a passkey

**`POST /passkeys/register/options`**, Bearer: `{ rpId? }` → `{ ok, challengeToken, options, userHandle }`. `options` is `PublicKeyCredentialCreationOptionsJSON` with the account's user handle, the name, and the account's passkeys in `excludeCredentials`. Mints the user handle the first time.

The web sends no `rpId` here or anywhere else, so the RP ID is the one its origin pairs with (`beta.app.witnesswork.app`'s is `app.witnesswork.app`, not its own host); the get that confirms PRF after adding uses the `rp.id` these options name. Phones send their build's RP ID.

**`POST /passkeys`**, Bearer **and** signed (op `passkey/add`), live session, Step-up:

| Payload                                                                      | Response               |
| ---------------------------------------------------------------------------- | ---------------------- |
| `accountPub`, `ts`, `nonce`, `challengeToken`, `response`, `wrap`?, `label`? | `{ ok, credentialId }` |

- `response` is the registration. `label` is the creating device's label, sealed like a session's `device` (at most 512 characters). `wrap` is optional, and comes with its `wrapId` and `keyEpoch` as in [`passkeys/wrap`](#wraps-post-passkeyswrap).
- The challenge's user handle must still be the account's (`passkey_failed`, `registration`).
- At most **10** passkeys per account (`limit`, 429). A credential already stored for this account is `ok` with its `credentialId` (a lost response); for another account, `conflict`.
- Logs `passkey.added`.

**How a device adds one:**

1. `register/options`, then create.
2. `POST /passkeys` at once, without a wrap, so the server knows every passkey the password manager keeps.
3. Unless create said `prf.enabled: false`, a get with `allowCredentials` of the new credential and a challenge of its own (the server doesn't see it). Some platforms answer PRF only at sign-in, and this is what later sign-ins will return.
4. With PRF output, `passkeys/wrap`. Without it (or a cancelled get), the passkey stays **Sign-in only**.

### Wraps: `POST /passkeys/wrap`

Bearer **and** signed (op `passkey/wrap`): `{ accountPub, ts, nonce, credentialId, wrapId, keyEpoch, wrap }` → `{ ok }`.

- `wrapId` is 16 random bytes, `b64u`, made once per wrap and unique per credential; repeating a `wrapId` is `ok` and stores nothing new.
- A `keyEpoch` that isn't the account's is `conflict`, so a device still holding a replaced key can't save a wrap for it.
- A fifth wrap replaces the oldest. A credential of another account, or none, is `not_found`. Not logged.

### Listing passkeys: `GET /passkeys`

Bearer → `{ ok, userHandle?, passkeys: [Passkey] }`, newest first. `userHandle` is absent until the account has one.

| Field             | What                                                       |
| ----------------- | ---------------------------------------------------------- |
| `credentialId`    | `b64u`                                                     |
| `canUnlock`       | Whether it has at least one wrap for the current key epoch |
| `createdAt`       | Epoch ms                                                   |
| `lastUsedAt`?     | Its last verified assertion, epoch ms                      |
| `createdPlatform` | `ios`, `android`, `web`, or `dev`                          |
| `label`?          | The sealed label the creating device sent                  |
| `aaguid`?         | For a provider name ("iCloud Keychain"); display only      |
| `backedUp`        | The latest BS flag                                         |

### Removing a passkey: `POST /passkeys/remove`

Bearer **and** signed (op `passkey/remove`), Step-up: `{ accountPub, ts, nonce, credentialId }` → `{ ok }`. Deletes the credential and its wraps; idempotent. Logs `passkey.removed`.

### Web sign-up

**`POST /web/signup/options`**, no auth: `{ turnstileToken, rpId? }` → `{ ok, accountId, challengeToken, options, userHandle }`.

- In order: 503 `disabled` while the kill switch is off; the caps (below), checked only; then `turnstileToken` through Siteverify (one over 2,048 characters is `bad_request`). Nothing else happens before Siteverify answers.
- Mints the new account's id and user handle and binds both to the challenge. Nothing is stored yet.

**`POST /web/signup`**, signed (op `web/signup`):

| Payload                                                                                                                            | Response (201)                                               |
| ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `accountPub`, `ts`, `nonce`, `challengeToken`, `response`, `wrapId`?, `wrap`?, `label`?, `device`?, `appVersion`?, `capabilities`? | The session's answer (`platform: "web"`), and `credentialId` |

- The browser makes the account key and stores it sealed (below) first, derives `accountPub`, creates the passkey with the options, confirms PRF with a get as when [adding a passkey](#adding-a-passkey), and wraps the key for `accountId` at epoch `0`.
- The caps are taken atomically in their Durable Object before the D1 batch, and given back if the batch fails.
- One batch: the account (with its user handle, made on the web), the passkey, its wrap, a web session, and `account.created`, `passkey.added` and `session.opened` (`method: "signup"`).
- An `accountPub` that already has an account is `conflict`. **A lost response:** after `conflict` for its own `accountPub`, `replay`, or a challenge already used, the browser signs in with the passkey it just made (it holds the key, so a sign-in-only passkey is enough).

**Controls** (no device integrity on the web, ADR 0038 §5):

- **Turnstile:** managed mode, actions `web-signup` and `web-recovery`, the env's web hosts (Cloudflare's test keys skip the host check). Siteverify gets `remoteip` and an `idempotency_key`. The site key comes from `GET /app/v1/config` (`webSignup.turnstileSiteKey`). The dev and local workers use Cloudflare's test keys unless a dev widget's are set.
- **Caps** (a Durable Object): `WEB_SIGNUP_PER_IP_DAY` (default 3) per IP a rolling day, IPv6 by /64, and `WEB_SIGNUP_PER_ASN_HOUR` (default 30) per network (ASN) a rolling hour. Over either is 429 `rate_limited` with `Retry-After`. If the counter can't be reached, `web/signup` is 503 `unavailable` with `Retry-After`. Counts are keyed by an HMAC of the IP or ASN under a secret that rotates daily, never the IP.
- **Kill switch:** KV `accounts:web-signup`, `on` when absent (then the `WEB_SIGNUP` var). `off` refuses both sign-up routes with 503 `disabled`; a failed KV read counts as `on`, since Turnstile and the caps still apply. `GET /app/v1/config` says `webSignup.enabled`, and the web says sign-up is paused.

`GET /app/v1/config` adds `webSignup: { enabled, turnstileSiteKey }`.

### Approving a browser from a phone

The handoff ([accounts-protocol.md](./accounts-protocol.md#handoff-set-up-another-device)) with the roles turned around: the **browser**, which has no account yet, shows the QR code, and a signed-in **phone** scans it and sends the account key. One Durable Object per channel relays it.

#### The QR code

```
https://app.witnesswork.app/approve#1<b64u(channelId[16] ‖ browserPub[32] ‖ secret[16])>
```

- The host is the web app's (`app-dev.witnesswork.app` on dev; a localhost origin from the dev list on a local web build), never an app link. Opened in a browser, `/approve` explains how to scan it from the app.
- `browserPub` is the browser's temporary X25519 public key. `secret` is 16 random bytes. The fragment never reaches a server.
- The phone accepts a code only from its own scanner (Settings → Account → Sign In on a Computer), and only for its env's hosts. Sign In with QR Code's scanner doesn't claim one; it says to scan it from Sign In on a Computer.

#### Keys

With `phonePub` the phone's temporary X25519 public key, `shared = X25519(own private, other public)`, and `transcript = channelId + "\n" + browserPub + "\n" + phonePub` (all `b64u`):

| Value          | Derivation                                                                                                                                   |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `claimToken`   | `HKDF-SHA256(secret, "", "ww-account/v1/approval/claim\n" + channelId, 16)`, `b64u`; the server keeps `verifier = b64u(SHA-256(claimToken))` |
| `browserToken` | 16 random bytes the browser keeps, `b64u`; the server keeps `browserVerifier = b64u(SHA-256(browserToken))`                                  |
| `helloKey`     | `HKDF-SHA256(secret, "", "ww-account/v1/approval/hello\n" + channelId, 32)`                                                                  |
| `prk`          | `HKDF-Extract(salt = secret, ikm = shared)`                                                                                                  |
| `keyKey`       | `HKDF-Expand(prk, "ww-account/v1/approval/key\n" + transcript, 32)`                                                                          |
| Code           | `HKDF-Expand(prk, "ww-account/v1/approval/code\n" + transcript, 4)` as big-endian `uint32 mod 1,000,000`, six digits, shown `123 456`        |

Blobs use the Buddies `seal` format (`0x01 ‖ nonce[12] ‖ ChaCha20-Poly1305`):

- **Hello** (browser → phone), sealed with `helloKey`, AAD `"ww-account/v1/approval/hello\n" + channelId`: `{ "browser": string ≤ 64, "system": string ≤ 64, "appVersion": string }` ("Chrome", "macOS").
- **Key** (phone → browser), sealed with `keyKey`, AAD `"ww-account/v1/approval/key\n" + channelId`: `{ "v": 1, "accountKey": b64u(32 bytes), "accountId": string, "deviceName": string ≤ 64 }`, `deviceName` being the approving phone's.

#### Ops

`POST {BASE}/accounts/v1/approval/{op}`, plain JSON.

| Op                 | Caller  | Auth                                             | Request                                             | Response                                                                       |
| ------------------ | ------- | ------------------------------------------------ | --------------------------------------------------- | ------------------------------------------------------------------------------ |
| `approval/open`    | Browser | None                                             | `channelId`, `verifier`, `browserVerifier`, `hello` | `{ ok, expiresAt }`; `conflict` while the channel is live                      |
| `approval/claim`   | Phone   | Bearer (a phone session) + `claimToken`          | `channelId`, `claimToken`, `phonePub`               | `{ ok, expiresAt, hello, location?, far }`                                     |
| `approval/status`  | Either  | `browserToken`, or Bearer (the claiming session) | `channelId` (+ `browserToken`)                      | `{ ok, status, expiresAt, phonePub? }`                                         |
| `approval/send`    | Phone   | Bearer (the claiming session)                    | `channelId`, `key`                                  | `{ ok }`; repeating the same `key` is `ok`; `conflict` unless `claimed`        |
| `approval/receive` | Browser | `browserToken`                                   | `channelId`, `browserToken`                         | `{ ok, status, key?, ticket?, ticketExpiresAt? }`; the last three while `sent` |
| `approval/done`    | Browser | `browserToken`                                   | `channelId`, `browserToken`                         | `{ ok }`; deletes the key blob; `conflict` before `sent`                       |
| `approval/cancel`  | Either  | Bearer (the claiming session), or `browserToken` | `channelId` (+ `browserToken`)                      | `{ ok }`; deletes every blob                                                   |

- `status` is `open`, `claimed`, `sent`, `done`, or `cancelled`. An expired or unknown channel is 404 `not_found`.
- **Lifetimes:** an unclaimed channel lives **75 seconds**. While its page shows the code, the browser opens a new channel every 60 seconds, at most 10 in a row, then offers Show a New Code. It keeps polling the previous channel until that one expires, and once any channel is claimed it stops rotating and cancels the others. A claimed channel lives **5 minutes** from the claim. `done` and `cancel` delete every blob, the location, the ticket and the account; the channel keeps only its status, the token verifiers, and a hash of the claiming session (so the phone can still read `status`) until it expires, when everything goes. A wrong token after `done` doesn't count against the channel.
- **Polling:** the browser reads `status` every 1.5 seconds while the code shows, and `receive` every 1.5 seconds once it's claimed.
- **Works once:** the first valid claim wins; repeating it with the same body gets `ok` again; any other claim is `conflict`, and the phone says another device already scanned this code.
- **Phones only:** a `web` session's claim is 403 `forbidden`. Only the session that claimed can read its status, send, or cancel as the phone (`forbidden` otherwise). The account must exist; a suspended account can still approve.
- **Wrong tokens** (`claimToken` on `claim`, `browserToken` on the browser's ops) are 401 `bad_signature`; the fifth burns the channel (`cancelled`).
- **Where the browser is:** on `open`, the Durable Object keeps the coarse location Cloudflare gives the request (`city`, `region`, `country`, and its latitude and longitude) for the channel's lifetime, never the IP. `claim` answers `location: { city?, region?, country? }` and `far: true` when the phone's request is in another country or more than 200 km away by the same measure (`false` when either is unknown). **`far` is a hint, not a control:** a phishing relay can open the channel from near the User, and can pass the six-digit code along. What protects the User is scanning only inside the app, approving only a computer in front of them that shows `app.witnesswork.app`, and the notices below.
- **The ticket:** the first `receive` while `sent` mints an `approval` ticket for the claiming session's account and the channel; a repeat returns the same ticket until it expires. `send` logs `device.approved` (the phone's session).
- Sizes: `hello` ≤ 1,024 characters, `key` ≤ 1,024 (`too_large`).
- Limits: `approval/open` 60 per IP an hour; the rest against the read edge tier.

#### On each side

- **The phone:** scan → claim → the screen shows the browser and system from the hello, where it is, the six-digit code, and a warning (not a block) when `far` → **Yes** or **No** → the [shared check](#the-shared-check-before-sensitive-actions) → `send`. No cancels the channel. A `send` that fails without an answer reads `status` before saying anything, like handoff's Allow.
- **The browser:** shows the same code once `status` is `claimed`. A channel it still polls that reads `cancelled` ends the attempt instead of making a new code: ending a channel drops `phonePub`, so a phone that claimed and said No between two polls looks like any other cancel. Once the key arrives it opens its web session with the ticket, checks the answer's `accountId` is the sealed one (or closes the session and starts over), stores the key, and calls `done`. It then shows "Approved by _deviceName_", with **That Wasn't Me**, which signs out and wipes; and offers to add a passkey on this computer.

## Activity

New [activity](./accounts-protocol.md#reading-activity-get-accountsv1activity) kinds. Clients skip kinds they don't know.

| `kind`                | `session`                                                                                   | Also           |
| --------------------- | ------------------------------------------------------------------------------------------- | -------------- |
| `passkey.added`       | The session that added it (the new one, at sign-up)                                         | `credentialId` |
| `passkey.removed`     | The session that removed it                                                                 | `credentialId` |
| `device.approved`     | The phone's session that approved a browser                                                 | —              |
| `account.key_changed` | The session that changed the account key ([account-key-change.md](./account-key-change.md)) | —              |

- `session.opened` adds `method`: `attestation`, `dev`, `passkey`, `approval`, `recovery`, or `signup`. An `approval` one has `actor`: the phone's session.
- `session.replaced` also covers the web cap: a fourth web session ended the least recently active one.
- Session platforms (`session.platform`, `actor.platform`, the access token's `platform` claim, and the device label's plaintext `platform`) add `web`. A web label is `{ "name": "Chrome on macOS", "platform": "web", "model": "" }`.

## Live sockets on the web

A browser can't set headers on a WebSocket, and Cloudflare's request logs record `Sec-WebSocket-Protocol` in full, so a browser never sends its access token on a socket. It mints a short ticket and offers that as a **subprotocol**.

**`POST /accounts/v1/live/ticket`**, Bearer: `{ socket: "sync" | "buddies", id }` (`id` is this device's slot id, or its inbox id) → `{ ok, ticket, expiresAt }`. The ticket is opaque (`[A-Za-z0-9_.-]`, about 350 to 420 characters): its claims (the env, account, session, platform, socket kind, id, and the access token's expiry) are encrypted and MAC'd under keys from its own Worker secret (`LIVE_TICKET_SECRET`), so neither the token nor any id can be read from it. It lasts **30 seconds**, or until the access token expires if that's sooner. The session must still be live (401 after sign-out or revoke, and when the token has under a second left). Only the id's shape is checked here (`bad_request`); everything else when the socket opens. Other errors: 429 `rate_limited`, 503 `disabled`.

| Socket                       | `Sec-WebSocket-Protocol` entries |
| ---------------------------- | -------------------------------- |
| `GET /accounts/v1/sync/live` | `ww.v1`, `ticket.<ticket>`       |
| `GET /buddies/v1/inbox/live` | `ww.v1`, `ticket.<ticket>`       |

- The Worker checks, in order and before the Durable Object sees the socket: the `Origin` against the env's web origins (403 `forbidden`); the offer (`ww.v1`, at most one `ticket.`, nothing else, no `Authorization` header; 400 `bad_request`); the feature's switch and the edge tier; the ticket and its socket kind (401 `unauthorized`); then the same checks the native socket runs. It answers `Sec-WebSocket-Protocol: ww.v1`.
- **One socket per ticket at a time:** a second socket with a ticket whose socket is still open is 409 `conflict`. Once that socket closes, the ticket (within its 30 seconds) can open it again.
- **Reconnecting:** a browser never sees a refused handshake's status, only a close, so it mints a fresh ticket for every connect (refreshing its access token if the mint answers 401) and reconnects with backoff.
- A socket opened this way closes with **`4004 "expired"`** when the access token the ticket was minted with expires; the app mints a ticket with a fresh token and reconnects at once. Sockets opened with headers (the native apps) are unchanged.
- Ids never go in the URL.

## CORS

- **Origins:** each env's exact list of web origins (`WEB_APP_ORIGINS`): production `https://app.witnesswork.app` and `https://beta.app.witnesswork.app`; dev `https://app-dev.witnesswork.app` and the localhost ports above. No wildcards. `Vary: Origin`.
- **Allowed request headers:** `authorization`, `content-type`, `if-match`, `if-none-match`, `x-ww-*` and `x-buddies-*` except `x-ww-admin-token` (and `x-ww-dev-bypass` on a worker without the dev bypass token, so outside dev), `sentry-trace`, `baggage`.
- **Exposed response headers:** `ETag`, `Retry-After`, `Date`, `WWW-Authenticate`, `x-ww-updated-at`.
- Every response to an allowed origin carries them, errors included. No cookies (`Access-Control-Allow-Credentials` is never sent). Preflights (`Access-Control-Max-Age: 7200`) are answered before any rate limit and never count against one.

## The legacy switch

ADR 0038 §11 turns off the way requests were signed before sessions ([Updates and the legacy switch](./accounts-protocol.md#updates-and-the-legacy-switch)):

- A failed read of KV `auth:legacy` counts as `off`. It used to count as `on`.
- The dev worker's `AUTH_LEGACY` is `off`. Production turns it off by writing KV `auth:legacy` = `off` at the launch (the launch runbook).

## The app

### Signing in

Every sign-in screen, on the web and in a new phone's "Already use WitnessWork?", offers, in this order:

1. **Sign in with a passkey:** `passkeys/challenge` → get → `passkeys/assert` → open the wraps and check them against `accountPub`.
   - **It unlocks:** the account key is here. A browser opens its web session with the ticket. A phone shows the replace-key warning a handoff shows, then opens its own attested session and adopts the key like a handoff (restore offer, Buddies).
   - **It signs in but can't unlock** (no wraps, or none opens): the screen says so and offers the next two, keeping the PRF output (if any) and the credential id in memory. Once the key arrives another way and a session is open, the device saves a wrap for this passkey (`passkeys/wrap`), so it unlocks next time.
2. **Use my phone** (a browser): the approval QR. **From your other phone** (a phone): Set Up Another Device's QR.
3. **Use a recovery key.** A browser asks for a `recovery` ticket right after the key is entered, with Turnstile's token.
   - **After a passkey that signed in but couldn't unlock,** while that passkey's ticket has more than 5 seconds left, the browser opens its session with the passkey's ticket instead, and shows no security check. That's safe: the ticket came from a verified passkey assertion for that account, and the key entered must derive the account's `accountPub` or the browser refuses it before sending anything. The session's `method` is then `passkey`, since the ticket is the passkey's. As the ticket runs out, the screen shows Turnstile and the next try asks for a `recovery` ticket.
   - A page that loaded Turnstile's script reloads once signed in, so Cloudflare's code doesn't stay in the signed-in app; the sign-in finishes after the reload.

### Signing up on the web

Turnstile → `web/signup/options` → make the account key and store it sealed → create the passkey and confirm PRF → `web/signup` (wrap and session) → the recovery key, with Download, Print and Copy, behind "I've saved my recovery key".

- The gate survives reloads: until the User confirms it, the web reopens on the recovery key screen.
- A browser whose passkey has no PRF still signs up. Its passkey is Sign-in only, and the recovery key screen says the passkey can't unlock the account on its own.
- The browser builds the creation options itself. From the server's it takes only the `challenge`, the `user` and the `pubKeyCredParams`, after checking them: the `userHandle` is 32 bytes of b64u, `user.id` is it, `user.name` and `user.displayName` are `WitnessWork <tag>` for it, `rp.id` is the page's RP, and only EdDSA, ES256 and RS256 are kept. The rest is fixed: `rp` is that RP with the name WitnessWork, a discoverable passkey with user verification required, no attestation, no excluded credentials, and only the PRF extension.
- **One tab signs up at a time.** The whole sign-up, and Finish, hold the `ww-signup` Web Lock. Another tab that tries says one is under way, and a launch cleans up what a sign-up left only when it gets the lock without waiting. Inside the lock the key is read from storage, never from a tab's memory of launch: another tab may have stored one since. Making a key refuses while storage holds any.
- **The key is deleted only when it's provably this sign-up's and the server provably doesn't have the account:** the stored key's public key is the stage's (below), and `web/signup` wasn't sent, or refused it with a 4xx or a coded 503 (those come before the batch), or the server doesn't know the passkey (`unknown_credential`). A sign-up that stops there records no data owner: `keep` puts back the owner it wrote whenever it can't keep the session. Any other key, an unreadable stage beside a key, or data the browser keeps for an account (the data owner record, read fresh) stops sign-up before it starts. An unreadable stage with no key in storage is cleared, since no key can be lost. A session the browser couldn't keep doesn't leave its account as the data owner.
- **Once `web/signup` was sent, the account may exist,** and nothing deletes the key or offers to start over until the outcome is known. With no answer at all (offline, a timeout, a 5xx), Finish sends `web/signup` again while the page still has it; its answer is the account or a [lost response](#web-sign-up). After a reload, Finish signs in with the passkey: only the server's `challenge` is used, with the stage's `rpId`, `userVerification: 'required'` and that credential alone. Once an answer went missing, a later refusal never deletes the key. Every way it finishes ends on the recovery key screen.
- **Nothing replaces a key a sign-up may have made.** The protection is `keep()`'s guard, in every tab: it refuses to store any key but the stage's while a `sent` or `created` stage is stored, or a `key` stage while another tab holds `ww-signup` (`signUpPending`), and any key but the stored one beside an unreadable stage (`keyHeld`). When storage can't be read it keeps nothing (`storage`). In the tab that finds the stage, the sign-in screen also offers only Finish. Signing in as the stage's account is fine and ends on the recovery key screen.
- **Finish's passkey is gone.** `unknown_credential` deletes the key only at `sent`: there it means the server never stored the passkey. At `created` the account exists and its passkey was removed since, so the key stays. A closed or timed-out prompt says which passkey finishes (`WitnessWork <tag>`, stored with the stage), and offers "I deleted that passkey" at either stage. `user_handle` means the server found the passkey, so it never deletes anything. With no key in storage, or another, Finish clears the stage and says it failed (`keyMissing`), never that the account wasn't made.
- **The held key settles it.** When the passkey is gone, and when an unreadable stage sits beside a stored key, the browser checks the stored key against the stage, shows it as the recovery key, and the User signs in with it (Use a Recovery Key). Signing in means the account exists, and ends on the recovery key screen (an unreadable stage is then cleared). `unknown_account` means no account has the key, so the key and the stage go, the passkey is reported unknown, and sign-up starts over. Never beside a `created` stage, which proves the account. Clearing the site's data is the last resort, and removes the key from the browser for good.
- A passkey whose account was never made is reported to the password manager on Chromium (`PublicKeyCredential.signalUnknownCredential`), as Remove does; and for the same reason Apple platforms aren't asked (see [Passkeys on phones](#passkeys-on-phones)).
- An answer for another account or passkey is never kept: the browser closes the session it opened and finishes with the passkey. A 201 that never arrives leaves its session open on the server until it expires; nothing in the contract lets the browser close a session whose token it never got.
- The browser keeps the stage in its secure key/value store (wiped with everything else on sign-out): `key` (stored, not sent), `sent`, or `created` (the gate), with the new key's public key and passkey. A launch that finds `key` deletes that key; one that finds `sent` or `created` while signed out offers Finish.

### Passkeys on phones

- `modules/passkeys`: iOS `ASAuthorizationPlatformPublicKeyCredentialProvider` (passkeys from iOS 16, PRF from iOS 18; below that, sign-in only), Android Credential Manager (the request JSON passed through, `prf` included).
- **Onboarding** offers Save a Passkey, with Not Now, after the Buddies step. It shows only on a phone that makes passkeys, once the account exists on this device, and when the account has none (a check that can't be read shows nothing). A new install has no account yet (its key waits for onboarding to end), so the step reaches people whose account came first and whose onboarding goes on: a QR or recovery-key sign-in that brought back no records, or an invite made in the Buddies step. A restore (iCloud, a backup file, or the account's backup or Cloud Sync after a QR or recovery-key sign-in) ends onboarding before the step, and earns no gentle prompt either; the next Cloud Sync, backup or device setup can. A relaunch (Android may recreate the app behind the system's passkey sheet) keeps the decision made when the step's place was reached, and a relaunch on the step moves on if the account now has a passkey. Going through onboarding's steps to the end (on a new install, or after Restart Onboarding) earns the gentle prompt below, so the tray lists it once the account exists. Add a Passkey runs the Settings flow (`source: onboarding`) and moves on once one is added; Not Now moves on and backs the gentle prompt off for 30 days.
- **Settings → Account → Passkeys:** the list, the account's `WitnessWork <tag>`, each passkey's "Can unlock your account" or "Sign-in only", its provider and date, Add a Passkey, and Remove. Removing says the passkey also has to be deleted from the password manager, and warns before removing the last passkey that can unlock (a computer then needs the recovery key or a phone to sign in). The web asks Chromium browsers to forget it (`PublicKeyCredential.signalUnknownCredential`); Apple platforms aren't asked until WebKit's bug that drops other accounts' passkeys is fixed.
- **One gentle prompt** to save a passkey, when the account has none, after turning on Cloud Sync or backup, after setting up another device, or after going through onboarding's steps. Not Now backs it off for 30 days. It's never forced, and without a passkey everything works as before. It's a row in the notifications tray (Add a Passkey, Not Now), never a banner or a toast, and these rules fill in what the sentence leaves open:
  - **What earns it:** the User choosing Cloud Sync (Settings, the tray's offer, or the account's request), turning on Backup in Settings, finishing a phone-to-phone handoff on the phone that offers it, or going through onboarding's steps to the end. A restore (in onboarding or later), the Cloud Sync default for a new install, and the new phone being set up don't.
  - **When it lists:** onboarding is done, the account exists and has no passkey (read when the row is due; a check that can't be read lists nothing, and is tried again when the connection returns, the account opens or the tray opens), and no back-off is running. A moment that passes during a back-off earns nothing, so the prompt waits for the next one after the 30 days. A clock set back before the Not Now counts as outside the back-off.
  - **Not Now, dismissing the row, or Clear All** back it off for 30 days. Only the tray's Not Now counts toward stopping; dismissing and Clear All don't, and neither does onboarding's Not Now.
  - **A different account** starts over: its stopping and back-off reset, and the Not Now count stays (it's the phone's). Every answer goes to the account registered on the phone when it's given.
  - **It stops for good** when the account has a passkey (added anywhere, including Settings, which also drops the row at once), and after the second Not Now to the tray's row. The contract doesn't say when it stops; this is the least pushy reading.
  - **Add a Passkey** runs the Settings flow in place (`source: prompt`); a failed or cancelled try leaves the row.

### On the web

- **At rest:** the account key and the session's refresh token live in IndexedDB, each sealed (AES-GCM) under a non-extractable WebCrypto key kept in the same database. The access token stays in memory. The web opens straight to the User's data until they sign out.
- **Tabs:** one tab refreshes at a time, under `navigator.locks.request("ww-session")`, reading the stored refresh token again inside the lock; the new access token reaches the other tabs over a `BroadcastChannel`. One tab, the lock's holder, keeps the live sockets.
- **Signing out** closes the session, then wipes the account key, the session, and every local store. It doesn't delete this browser's Cloud Sync slot: the server keeps a signed-out device's slot for 30 days (ADR 0038 §8).
- **App Lock** is available when the account has a passkey, off by default, and unlocks with it (a get against the account's credentials, checked on the device, so it works offline).
  - **Turning it on** is always a passkey [step-up](#step-up-on-the-web), even inside the server's window, so the server verifies the passkey's signature. The browser keeps the step-up's `allowCredentials` ids and its `rpId` (the account's passkeys for the RP ID the origin pairs with), and turns the lock on only once that assertion also passes the device's check below. A later step-up refreshes the kept ids, and listing the account's passkeys while unlocked (Settings → Account → Passkeys, Security, and right after each unlock) drops removed ones; once none is left, the lock turns off and says so. Nothing changes the kept ids, or turns the lock off, while it's locked.
  - **Unlocking, and turning it off,** is a get with `allowCredentials` of the kept ids (never empty, so never discoverable), the kept `rpId`, `userVerification: "required"`, and a random challenge made in the browser, with no request to the server. The device checks that the answer is for one of the kept ids, that `clientDataJSON` is a `webauthn.get` for that challenge and the page's origin, that the authenticator data's `rpIdHash` is the kept RP ID's, and that its UP and UV flags are set.
  - **What that proves:** the browser holds no public keys (`GET /passkeys` doesn't list them), so it can't verify the signature. A get that passes is the browser's word that one of the account's passkeys was used with the User verified, not cryptographic proof. App Lock is a privacy screen for this browser, not an account control: it doesn't add encryption to the data under it, and it doesn't stop someone with the browser's developer tools, who can edit its storage or answer the get with a forged assertion.
  - **While locked,** the app isn't mounted at all: the lock screen renders in its place, so none of the app's screens, data, navigation or links reach the page, its accessibility tree, or a click. A link opened meanwhile opens once unlocked, from the page's address.
  - The lock screen asks only from the User's tap (browsers want one before a passkey prompt), shows why an unlock or a Sign Out failed on itself, and offers Sign Out as the way out. With no kept passkey to unlock with, Sign Out is all it offers.
  - **Require after** is 1, 5 or 15 minutes away, 1 by default. The web has no Immediately: the lock unmounts the app, so every tab switch would lose what was being typed. Immediately, set before, counts as 1 minute.
- **Cloud Sync** runs once the account key is here. When the account's devices aren't on Cloud Sync, signing in leads to "Turn on Cloud Sync" (ADR 0040 §5).

#### Signed out by the server

A refresh refused with `revoked` or `reused` wipes the browser at once, as signing out does. `expired` and `replaced` keep the sealed account key and the local stores and show the sign-in screen. Signing in again as the same account picks up where it was and syncs. Another account wipes first.

- **A refresh whose answer was lost.** Before presenting a refresh token, the browser stores a hash of it as in flight, and clears it once the replacing token is stored. If the server rotated the token but its answer never arrived or wasn't stored (a tab closed, a timeout, a lost connection), the next refresh presents the old one and gets `reused`. A browser that says it's offline sends no refresh at all. When the token presented is still marked in flight, the browser knows it caused that: it keeps its data and shows the sign-in screen, as for `expired` (the server has ended the session anyway).
- **Whose data it is.** The browser records the account id its local data belongs to when it keeps a session. Signing in keeps the data only for that account. Anything else, including data with no recorded owner, is wiped first, whether or not the old account key can still be read. Another account then closes the old session, wipes, stores the new key and session, and reloads every tab before anything uses the new key.

### The shared check before sensitive actions

One utility asks for a fresh check before showing the recovery key, setting up or approving a device, adding or removing a passkey, changing the account key, and deleting data:

- **Phones:** Face ID, Touch ID, or the passcode (`confirmDeviceOwner`).
- **Web:** a [step-up](#step-up-on-the-web), checked by the server. Offline, it can't run, and the action waits.
  - A sheet asks for the step-up's challenge as it opens, so the get runs straight from the User's tap. Offline, it says so and carries on once the browser is back online; closing it cancels the action.
  - Requests the server gates (adding or removing a passkey, `backup/delete`) step up first where the action calls for one, and a 403 `step_up_required` anyway runs the step-up and sends the request once more. A passkey add retried this way sends the same registration, since the server checks the step-up before the challenge.
  - **Inside the server's window** (`GET /sessions`' `stepUpUntil`, timed as above), the action goes ahead without a tap, for any account, with passkeys or without: the server already counts the sign-in, or the last step-up. Turning on App Lock is the exception; it always asks for the passkey. A window that can't be read (offline, or the request failed) is offline or failed, with Try Again, never "no passkey".
  - **Past the window,** the sheet asks for one of the account's passkeys. An account with no passkey can't step up: its challenge's `allowCredentials` is empty, and the app never turns that into a discoverable get. The sheet then says so and offers **Sign In Again**, as it does when none of the account's passkeys answers or the server refuses the one that did.
  - **Sign In Again** shows the sign-in screen over the signed-in app, with Back. Signing in with a recovery key, a phone or a passkey opens a new session for the same account, which keeps the data and opens a new 5-minute window, so the browser can then add its first passkey. The new session is stored first, then the one it replaces is closed; when it can't be stored, the old one stays and the new one is closed.
    - **Only the same account.** A passkey, recovery key or phone approval for another account is refused before any session opens ("That's a different account. Sign in as account … to continue."), and the browser never wipes its data for Sign In Again: a session that opens for another account anyway is closed.
    - If the account already has three web sessions, opening the new one ends the least recently active one first, as any sign-in does, which may be another browser's. Counting the session being replaced against the cap would need the open to name it (a Bearer on `POST /sessions`) and ending it there races the browser's own refresh, so it isn't done.
  - A challenge the sheet holds is asked for again before it's 4½ minutes old, so a passkey prompt is never spent on one the server would refuse.
  - **Adding a passkey** never starts the browser's create past the step-up's deadline, and caps the create's `timeout` to the time left. A passkey step-up uses the User's tap for its get, and Safari makes a passkey only from a recent tap, so the sheet then asks for a second one (Continue) once the registration options are in, and the create runs straight from it. A create that stops (a cancel, or a browser that refused it) is shown as an error, never closed without a word.
  - **Deleting data:** Delete My Buddies Data replaces the account key, which a browser can't do (it signs out instead), so it's phone-only; the web points to the phone app. Its confirm on phones names the backup and Cloud Sync it deletes.
- **Phones** keep their checks: the server never asks a phone session for a step-up, and phones don't ask Face ID before deleting backups.

### Signed-in devices and new sign-ins

- **Devices** lists browsers ("Chrome on macOS") with their app version.
- **Notices** (`src/app/account/signInNotices.ts`), on phones and the web: when the app comes back from the background or a browser tab gets focus (at most every 15 minutes per account, and at most every 90 seconds after a read for that account failed), when this device's session opens or changes accounts, and whenever Settings → Account opens (a forced read, which also runs after a foreground read already in flight), it reads the activity log and puts each `session.opened`, `passkey.added` and `device.approved` that isn't this device's, newer than the last one it saw, in the notifications tray.
  - **This device:** an entry is this device's when its `session` (or, for an `approval` sign-in, its `actor`) is one of the session ids this install has had (Account Activity's "this device"). That leaves out its own sign-ins, Sign In Again, passkeys it added, and browsers it approved.
  - **The marker:** the newest `createdAt` seen, and the ids seen within 5 seconds of it (at most 200), kept per account in device-local storage (never synced; a browser's goes with its data at sign-out). A read counts entries from 5 seconds below the marker that it hasn't seen, so one the server committed late isn't skipped. The first read for an account only sets the marker: after this device switches accounts, and after its session opens where it had none (`reason: new`, signing in again). Renewing a session keeps it. A read that fails changes nothing; it never opens a session for a device without one.
  - **Paging:** a read follows `nextCursor` until a page reaches 5 seconds below the marker, for at most 5 pages (250 entries). One that stops there lists a single row, "250+ changes to your account" (as many as it read, every one newer than the marker; a later overflow replaces it), that opens Account Activity, and moves the marker only to what it read.
  - **A copied install:** the ids and the marker live in MMKV, which a device backup (iOS backup, Android Auto Backup) can carry to a new phone, while the session stays in the keystore. So the install keeps a random token in both MMKV and the keystore (`device-secrets`, this-device-only on both platforms). When the two disagree, the copy came from another phone: the app keeps only the session ids it remembered this launch and drops the notices' marker and rows, once (`onInstallMoved`; `checkInstall()` keeps answering `moved` for the rest of the launch, so every caller knows) (`installToken.ts`). A backup made before this version has no token, so its list carries over; its notices still reset, since that phone's first session opens as `new`.
  - **Rows:** one per kind, `session` (`session.opened`), `approval` (an `approval` `session.opened`; a `device.approved` only when the browser's sign-in, naming that phone as `actor`, isn't in the page within 10 minutes of it) and `passkey` (`passkey.added`). New entries join their kind's row while it's still in the tray, so a burst reads "3 new sign-ins" with the newest named, in Account Activity's words, and "Not you? Sign it out and change your account key" (or "Remove it", for a passkey; the web says to change the key on a phone, since the web can't): signing a device out isn't enough when it holds the account key. The row links to Signed-In Devices, or to Passkeys for `passkey`; it doesn't offer That Wasn't Me (the browser's own screen does). Tapping, dismissing, or Clear All takes it out; a later entry brings it back.
  - **Known noise:** every phone's 90-day session renewal logs a `session.opened` with nothing tying it to the session it replaced, so it shows as a new sign-in. A ww-api renewal path will fix that.

## Privacy

- **Passkeys:** the credential id, its public key, counter, transports, backup flags, AAGUID, RP ID, the platform that created it, the sealed label, and times. The user handle is random and names no one. PRF output and the account key never reach the server; wraps are ciphertext under keys only the passkey can make.
- **Turnstile** sees the request's IP for sign-up and recovery sign-ins. The caps keep counts per HMAC'd IP and network for at most a day.
- **Approvals:** the channel's Durable Object keeps the browser's coarse location (city, region, country, and Cloudflare's latitude and longitude) for the channel's lifetime (at most 75 seconds unclaimed plus 5 minutes once claimed), drops it at `done` or `cancel`, and never keeps an IP.
- **Tickets and challenges** are kept only as used ids, until they expire.
