# Server account protocol

The wire contract for the server account between the WitnessWork app (`src/lib/serverAccount`) and ww-api (`ww-api/src/accounts`). Why it exists is in [ADR 0024](./adr/0024-anonymous-server-accounts.md); moving it, recovering it, and backing up to it are in [ADR 0026](./adr/0026-move-and-recover-the-server-account.md); attested sessions and bearer tokens are in [ADR 0027](./adr/0027-account-sessions-attest-once-then-bearer-tokens.md); the activity log and device list are in [ADR 0028](./adr/0028-account-activity-log.md); Supporter status on the account is in [ADR 0029](./adr/0029-supporter-status-on-the-server-account.md); Cloud Sync is in [ADR 0030](./adr/0030-cloud-sync-through-ww-api.md). Passkeys, web sessions, web sign-up, and approving a browser from a phone ([ADR 0038](./adr/0038-passkeys-and-web-accounts.md)) are in [`passkeys-protocol.md`](./passkeys-protocol.md).

The server account is not ADR 0011's account id. That one is the RevenueCat identity, shared through a file in iCloud Drive. This one is a row ww-api owns, so it can suspend someone for abuse. The account links the RevenueCat customers its devices use (see [Supporter status](#supporter-status)).

## Keys

| Key                 | What it is                                                            | Where it lives                                                           |
| ------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Account key         | 32 random bytes; today the Buddies root seed                          | The User's devices only (iCloud Keychain on iOS, Block Store on Android) |
| Account signing key | Ed25519, seed `HKDF-SHA256(accountKey, "", "ww-account/v1/sign", 32)` | Derived on each device; never stored                                     |
| `accountPub`        | The signing key's public key, `b64u` (43 chars)                       | The server's `accounts.account_pub`                                      |
| `accountId`         | 16 random bytes, `b64u` (22 chars), minted by the server              | The server, and each device's MMKV                                       |
| Backup key          | `HKDF-SHA256(accountKey, "", "ww-account/v1/backup", 32)`             | Derived on each device; never stored                                     |
| Backup file key     | `HKDF-SHA256(accountKey, "", "ww-account/v1/backup-file", 32)`        | Derived on each device; never stored ([backup files](./backup-files.md)) |
| Recovery key        | The account key for people (see [Recovery key](#recovery-key))        | Wherever the User keeps it                                               |
| Backup slot id      | 16 random bytes, `b64u`, one per install                              | The device's MMKV, and the server's R2 object key                        |
| Access token        | JWT, 15 minutes (see [Sessions](#sessions))                           | The app's memory only                                                    |
| Refresh token       | Opaque `<sessionId>.<secret>.<mac>` (`b64u`), one per session         | The platform keystore, not synced; the server keeps its SHA-256          |

Every feature derives its own keys from the account key with its own HKDF label (Buddies uses `ww-buddies/v1/*`), so the server can't tell that `accountPub` and a feature's public keys belong together. Only signatures the User's devices make link them.

## Requests

`POST {BASE}/accounts/v1/{op}`, except the [session](#sessions) routes and `GET /accounts/v1/account`, which have REST paths. A self-signed op sends the Buddies envelope `{ "payload": b64u(UTF-8 JSON), "signature": b64u(Ed25519) }`, or, where the body is something else, the same two in the `x-ww-payload` and `x-ww-signature` headers. The signature covers `UTF-8("ww-account/v1\n" + op + "\n")` followed by the decoded bytes of `payload`, where `op` is the op's name below (`session/open` for `POST /accounts/v1/sessions`), never its path. The context differs from Buddies' `ww-buddies/v1`, so no signature counts for both. Errors use the Buddies error envelope and codes, including `stale` with `serverTime`.

App versions before ww-api #46 send the short legacy names `p` and `s` (and `x-ww-p`/`x-ww-s`). The server still accepts them; every new or changed call sends the long names.

Ops marked **Bearer** below take `Authorization: Bearer <access token>` from an attested [session](#sessions) instead of an envelope, and send their fields as plain JSON. While ww-api's legacy switch is on, they also accept the envelope, so older app versions keep working; once it's off, an envelope alone is 426 `upgrade_required` (see [Updates and the legacy switch](#updates-and-the-legacy-switch)). A request with an `Authorization` header is always taken as a bearer request, never as an envelope.

## Sessions

An account proves it's the app once, when it opens a session, and then calls with short access tokens.

### The attestation challenge

`POST {BASE}/attestation/v1/challenge`, ww-api's challenge for the whole API (it replaces `/notes-import/challenge`, with the same request and answer): an App Attest v2 `assert` challenge on iOS, or a Play Integrity v1 challenge on Android (`attestationProvider: "play-integrity"`), with:

- `purpose`: `account-session`.
- `contentHash` and `requestHash`: both `hex(SHA-256(UTF-8("ww-account/v1/session\n" + accountPub)))`, so the attestation covers the account key.

The answer is `challenge` and `expiresAt`. An install whose App Attest key isn't set up yet registers it first at `POST {BASE}/attestation/v1/register`; the key is the install's, not the account's.

### Opening a session: `POST /accounts/v1/sessions`

| Payload                                               | Response (201)                                                                                       |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `accountPub`, `ts`, `nonce`, `attestation`, `device`? | `{ ok, accountId, status, sessionId, accessToken, accessExpiresAt, refreshToken, sessionExpiresAt }` |

- Self-signed by the account signing key under op `session/open`, like `account/register`. `attestation` holds the attestation for the challenge above: the App Attest assertion fields, or `attestationProvider`, `challenge`, and `integrityToken` for Play Integrity. The signature covers them, and the attestation covers `accountPub`, so neither can be moved to another request.
- Creates the account when `accountPub` has none, so it replaces `account/register`. `status` is `active` or `suspended`; a suspended account still gets a session (it can still hand off and back up).
- A failed attestation is 403 `attestation_failed` with a stable `reason`: `device_integrity_failed`, `app_not_recognized`, `integrity_token_invalid`, `integrity_unavailable`, or a challenge reason (the same reasons `/notes-import/challenge` gave). There's no fallback: no attestation, no account.
- On the development worker, `x-ww-dev-bypass` with the bypass token stands in for `attestation`. Production ignores it.
- `device` (optional) is the device's label sealed with the Buddies `seal` format under `HKDF-SHA256(accountKey, "", "ww-account/v1/device", 32)`, AAD `"ww-account/v1/device\n" + accountPub`; at most 512 characters (`too_large`). Its plaintext is `{ "name": string ≤ 64, "platform": "ios" | "android", "model": string ≤ 64 }`. The server stores it on the session and can't read it; only the account's devices can, to show which devices hold sessions.
- Opening an eleventh session for an account ends its oldest.
- Counts against the Buddies register edge limit and 20 per account a rolling day.

### Refreshing: `POST /accounts/v1/sessions/refresh`

Plain JSON, no envelope: `{ refreshToken }` → `{ ok, accessToken, accessExpiresAt, refreshToken, sessionExpiresAt }`.

- Every refresh replaces the refresh token. Sending the one just replaced within 60 seconds (a lost response) gets a new pair; sending any older one ends the session.
- An ended or expired session is 401 `unauthorized`, and the app opens a new one, attesting again, without asking the User.
- A session lasts 90 days from opening. Refreshing doesn't extend it.
- Counts against the Buddies read edge limit.

### Closing: `DELETE /accounts/v1/sessions/current`

**Bearer**, no body → `{ ok }`. Ends the token's session; repeating it is `ok`. The app calls it on sign out, before replacing the account key, and before Delete Buddies.

### The access token

A JWT (`HS256`, with `kid`) the app treats as opaque. Claims: `sub` (`accountId`), `sid` (the session), `platform` (`ios`, `android`, or `dev`), `iss` (one per environment, so a development token never passes on production), `aud` (`ww-account`), `iat`, `exp` (15 minutes). A missing, expired, or invalid token is 401 `unauthorized` with `WWW-Authenticate: Bearer error="invalid_token"`; the app refreshes once and retries.

### The app

- `src/lib/serverAccount/session.ts` holds one session per device, for the account key it's using. The access token lives in memory only. The refresh token, with the session's id, account and expiry, lives in the platform keystore and is never synced or backed up (`modules/device-secrets`): a Keychain item with `kSecAttrSynchronizable` off and `AfterFirstUnlockThisDeviceOnly` on iOS, and a file sealed with an Android Keystore AES-GCM key in `noBackupFilesDir` on Android. A binary without the module keeps it in memory for the launch.
- It refreshes a minute before the access token expires, one refresh at a time for every caller. A 401 `unauthorized` on a request refreshes once and sends it once more. A refused refresh, or a session within 10 minutes of its 90 days, opens a new session without asking the User. A dropped connection keeps the refresh token.
- A refreshed token is written to the keystore before anything uses it, since presenting the replaced one after the server's grace minute would end the session. When the keystore refuses the write twice, the app uses the new token for the rest of the launch and marks the one still stored as stale: its hash goes to device-local MMKV (never the token). The next launch deletes a stale token and opens a new session instead of presenting it. A delete the keystore refuses (closing, forgetting) is marked the same way and retried at the next launch. Both failures are reported to error tracking.
- After a failed attestation it waits before attesting again for the same account key: 30 minutes when the device or app can't be verified, 1 minute when verifying failed for now (`integrity_unavailable`, Apple or Google unreachable), 2 minutes otherwise. Try Again in Settings → Account skips the wait.
- A rate-limited open (429) waits out its `Retry-After` (or body `retryAfter`) for that account key, 1 minute when there's none and at most a day: until then every call fails at once with `rateLimited`, attesting nothing. Try Again doesn't skip that wait, since the server would only refuse again.
- Before the account key is replaced (a handoff or a recovery key) and before Delete Buddies deletes it, the app closes the session and forgets it, then stores (or deletes) the key. It waits at most 5 seconds for the server to hear of the close; the session is forgotten on the device either way. Until the new key is stored (and a handoff's session adopted), every call waits, so no session opens or refreshes for the old key in between, and none opens for it again in that launch. Its stored session for another account key is closed the first time it's found.
- Sign In with QR Code and Use a Recovery Key first ask whether this device can attest at all, and say so instead of starting when it never can.
- A 426 `upgrade_required` from any of these, or from a route that uses the session, shows Update Required (below).

### `account/register`

| Payload                     | Response                    |
| --------------------------- | --------------------------- |
| `accountPub`, `ts`, `nonce` | `{ ok, accountId, status }` |

- Replaced by opening a session, and kept for app versions before sessions. Once the legacy switch is off, it's 426 `upgrade_required`.
- Self-signed by the account signing key. `status` is `active` or `suspended`.
- Idempotent: the same `accountPub` always gets the same `accountId`, so a replay learns nothing new and there's no nonce cache.
- Counts against the Buddies register edge limit and a per-caller daily quota.
- `disabled` (503) when the worker has no accounts database. The app then asks again about once a day.

### Reading the account: `GET /accounts/v1/account`

| Request         | Response                                                                    |
| --------------- | --------------------------------------------------------------------------- |
| None (`Bearer`) | `{ ok, accountId, accountPub, status, createdAt, inboxIds, statusChanges }` |

- **Bearer**, no body: the token's account. Read-only.
- Before sessions it was `POST /accounts/v1/account/info`, self-signed like `account/register` (payload `accountPub`, `ts`, `nonce`) under op `account/info`. That route stays only for older app versions while the legacy switch is on; there an unregistered key is `unknown_account` (404).
- `createdAt` and each `statusChanges[].createdAt` are epoch milliseconds. Status changes carry `status` only; their reason codes stay with moderation.
- Settings → Account reads the account's status with it each time the screen opens, and the developer Tools show the whole record. Counts against the Buddies read edge limit.

## Activity and devices

The account's security history and its signed-in devices ([ADR 0028](./adr/0028-account-activity-log.md)). All three routes are **Bearer** only (no envelope form), count against the Buddies read edge limit, and work for a suspended account.

### Listing devices: `GET /accounts/v1/sessions`

→ `{ ok, sessions: [Session] }`, the account's live sessions, newest first:

| Field          | What                                                                      |
| -------------- | ------------------------------------------------------------------------- |
| `sessionId`    | The session's id (the access token's `sid`)                               |
| `platform`     | `ios`, `android`, or `dev`                                                |
| `device`?      | The sealed device label from `POST /accounts/v1/sessions`, as sent        |
| `current`      | `true` for the session the token belongs to                               |
| `createdAt`    | When it opened, epoch ms                                                  |
| `lastActiveAt` | Its last refresh (or `createdAt`), epoch ms; accurate to about 15 minutes |
| `expiresAt`    | 90 days after it opened, epoch ms                                         |

### Signing a device out: `POST /accounts/v1/sessions/revoke`

`{ sessionId }` → `{ ok }`. Ends one of the account's sessions and logs `session.revoked` naming the calling session. Ending an ended session is `ok`; the token's own session is ended like `DELETE /sessions/current` (`session.signed_out`). A session of another account, or none, is 404 `not_found`. It's a `POST` so the session id stays out of the URL.

Revoking ends the session, not the device's account key: a device that still has the key opens a new session when it next needs one, logged as a new `session.opened`.

### Reading activity: `GET /accounts/v1/activity`

Query: `limit` (1–100, default 50) and `before` (the previous page's `nextCursor`). → `{ ok, activity: [Entry], nextCursor }`, newest first; `nextCursor` is `null` on the last page. A malformed `limit` or `before` is 400 `bad_request`.

| Field       | What                                                                                 |
| ----------- | ------------------------------------------------------------------------------------ |
| `id`        | Opaque, unique within the account; also a cursor                                     |
| `kind`      | Below                                                                                |
| `createdAt` | Epoch ms                                                                             |
| `session`?  | The session the entry is about, or that did it: `{ sessionId, platform, device? }`   |
| `actor`?    | For `session.revoked` and `session.replaced`, the session that ended it (same shape) |
| `slotId`?   | `backup.deleted` (absent when every slot was deleted) and `backup.downloaded`        |

| `kind`                   | `session`                                                                                     | `actor`             |
| ------------------------ | --------------------------------------------------------------------------------------------- | ------------------- |
| `account.created`        | —                                                                                             | —                   |
| `session.opened`         | The new session                                                                               | —                   |
| `session.signed_out`     | The session that ended itself                                                                 | —                   |
| `session.revoked`        | The session signed out                                                                        | The one that did it |
| `session.replaced`       | The oldest session, ended by the cap                                                          | The new session     |
| `session.refresh_reused` | The session ended: a refresh token was reused after its grace minute                          | —                   |
| `handoff.sent`           | The old phone's session (absent before sessions)                                              | —                   |
| `backup.deleted`         | The session that deleted (absent before sessions)                                             | —                   |
| `backup.downloaded`      | The session that downloaded (absent before sessions); at most once per slot, session, and day | —                   |
| `account.suspended`      | —                                                                                             | —                   |
| `account.reinstated`     | —                                                                                             | —                   |
| `buddies.inbox_linked`   | The session that linked the account's inbox (absent before sessions)                          | —                   |
| `buddies.deleted`        | The session that deleted the account's Buddies inbox (absent before sessions)                 | —                   |

- `device` is the label as the session sent it, copied onto the entry, so it outlives the session. Open it with the device label key (see [Opening a session](#opening-a-session-post-accountsv1sessions)). A label that's absent or won't open shows the platform instead.
- Buddies entries name only the account's own inbox being linked or deleted; writer ops are never logged.
- The server adds kinds over time. Clients skip a `kind` they don't know.
- Entries are kept 400 days.

### The app

Settings → Account → **Devices** lists the sessions, marks the one whose `sessionId` is this device's as "This device", shows when each signed in (with the time when two of the same name signed in the same day, as a wiped phone and its new install do), and offers Sign Out on the others. A list with no `current` session means this device was signed out while its access token still worked: the app refreshes its token, which opens a new session, and lists again. Settings → Account → **Activity** pages through the log 50 at a time and flags `session.refresh_reused`. A restore logs one `backup.downloaded` per slot, and nothing in them tells the slots apart for the User, so one session's downloads within 5 minutes of each other show as one row ("2 backups downloaded on this device"). It names as "this device" every session this install has had: their ids (at most 20, not secret) are kept in device-local MMKV, so entries from before a sign-out still read as this device. Both decrypt labels on the device.

## Linking a Buddies inbox

`inbox/register` ([Buddies protocol](./buddies-protocol.md)) takes `account: { accountId, signature }`, where `signature` is the account signing key's Ed25519 signature over:

```
UTF-8("ww-account/v1\ninbox/link\n" + accountId + "\n" + inboxId + "\n" + ownerPub)
```

The whole payload is also signed by the inbox's owner key, so a link takes both keys. The relay checks the account and the signature, registers the inbox, and only then writes the link. An inbox already linked to another account is `conflict`. The answer's `accountId` names the account the inbox belongs to, with or without a proof.

Every Buddies request carries the account's session ([Authentication](./buddies-protocol.md#authentication-sessions)), so the app registers only with a proof, for the token's account, and an inbox is always linked. An inbox registered before accounts answers owner ops with `not_linked`; the app then links it with `inbox/register` and sends the op once more. Without a session (offline, or this device can't be verified) Buddies sends nothing.

## Handoff (Set Up Another Device)

The phone with the account (the **old** phone) shows a QR code; the **new** phone scans it. The server relays four small messages through one Durable Object per channel and never sees a key it could use.

### The QR code

```
https://ww-proxy.leviwilkerson.com/h#1<b64u(channelId[16] ‖ offerPub[32] ‖ secret[16])>
```

- `channelId`: 16 random bytes; the only part the server learns.
- `offerPub`: the old phone's temporary X25519 public key, made for this handoff and forgotten after it.
- `secret`: 16 random bytes.
- The fragment never reaches a server. `GET /h` serves a page telling someone without the app to install it, and the app claims `/h` as a universal link and Android app link.

### Keys

With `claimPub` the new phone's temporary X25519 public key, `shared = X25519(own private, other public)`, and `transcript = channelId + "\n" + offerPub + "\n" + claimPub` (all b64u):

| Value        | Derivation                                                                                                                           |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `claimToken` | `HKDF-SHA256(secret, "", "ww-account/v1/handoff/claim\n" + channelId, 16)`, b64u                                                     |
| `verifier`   | `b64u(SHA-256(claimToken bytes))`; the server's copy                                                                                 |
| `prk`        | `HKDF-Extract(salt = secret, ikm = shared)`                                                                                          |
| `helloKey`   | `HKDF-Expand(prk, "ww-account/v1/handoff/hello\n" + transcript, 32)`                                                                 |
| `keyKey`     | `HKDF-Expand(prk, "ww-account/v1/handoff/key\n" + transcript, 32)`                                                                   |
| Code         | `HKDF-Expand(prk, "ww-account/v1/handoff/code\n" + transcript, 4)` as big-endian `uint32 mod 1,000,000`, six digits, shown `123 456` |

Blobs use the Buddies `seal` format (`0x01 ‖ nonce[12] ‖ ChaCha20-Poly1305`) with AAD `"ww-account/v1/handoff/hello\n" + channelId` or `"ww-account/v1/handoff/key\n" + channelId`.

- **Hello** (new → old), sealed with `helloKey`: `{ "deviceName": string ≤ 64, "platform": "ios" | "android", "model": string ≤ 64, "appVersion": string }`.
- **Key** (old → new), sealed with `keyKey`: `{ "v": 1, "accountKey": b64u(32 bytes), "accountId": string }`.

### Ops

`POST {BASE}/accounts/v1/{op}`. Ops the old phone makes are **Bearer** with the fields below as plain JSON (before sessions, self-signed envelopes like `account/register` whose payload also carries `accountPub`, `ts`, `nonce`; the account must exist). Ops the new phone makes are plain JSON authorized by `claimToken`: the new phone has no session until it has the key.

| Op                | Caller | Request                                                 | Response                                                          |
| ----------------- | ------ | ------------------------------------------------------- | ----------------------------------------------------------------- |
| `handoff/open`    | Old    | `channelId`, `verifier`                                 | `{ ok, expiresAt }`; `conflict` while the channel is live         |
| `handoff/claim`   | New    | `channelId`, `claimToken`, `claimPub`, `hello` (sealed) | `{ ok, expiresAt }`; `conflict` once claimed by another, or ended |
| `handoff/status`  | Old    | `channelId`                                             | `{ ok, status, expiresAt, claimPub?, hello? }`                    |
| `handoff/send`    | Old    | `channelId`, `key` (sealed)                             | `{ ok }`; `conflict` unless `claimed`                             |
| `handoff/receive` | New    | `channelId`, `claimToken`                               | `{ ok, status, key? }`; `key` only while `sent`                   |
| `handoff/done`    | New    | `channelId`, `claimToken`                               | `{ ok }`; deletes the key blob; `conflict` before `sent`          |
| `handoff/cancel`  | Either | `channelId` (old, Bearer) or `channelId`, `claimToken`  | `{ ok }`; deletes every blob; after `done`, `ok` and stays `done` |

- `status` is `open`, `claimed`, `sent`, `done`, or `cancelled`. An expired or unknown channel is 404 `not_found`. An expired `channelId` can be opened again.
- A channel lives **10 minutes** from `open`, then its Durable Object deletes everything. `done` and `cancel` delete the blobs at once and keep only the status until then. Repeating `done` is `ok`.
- The first valid claim wins. Repeating it with the same body gets `ok` again (a lost response); any other claim, or any claim on a cancelled channel, is `conflict`.
- A wrong `claimToken` is 401 `bad_signature`. Wrong tokens count on `claim`, `receive`, `done`, and the new phone's `cancel`, in any state: the fifth burns the channel (`cancelled`), even once it's claimed.
- Only the account that opened the channel can read its status, send, or cancel it as the old phone: 403 `forbidden` for any other account. `forbidden` is new with handoff; Buddies doesn't use it.
- A sealed `hello` over 2,048 characters or `key` over 1,024 is 413 `too_large`.
- A suspended account can still hand off: `handoff/*` checks only that the account exists (`unknown_account` otherwise).
- Clients poll every 1.5 seconds while a screen is showing the handoff.
- Limits: `handoff/open` counts against the register edge tier and 20 per account a day; the rest against the read tier.

### The app

- Settings → Account → **Set Up Another Device** opens the account's session first when there's none (creating the account key and the account the first time), then opens a channel. When this phone can't be verified, or needs an update, it says so instead, with Done in place of Make a New Code, whether that's found before the code or after. Leaving the screen, or Make a New Code, cancels it.
- An Allow whose `send` fails without an answer, or answers `conflict`, reads `status` before it says anything: `sent` or `done` means the key got there (a repeated `send` is `conflict` once it's `sent`). Still `claimed` after a lost connection, Allow stays up with a line asking the User to tap it again.
- **Sign In with QR Code** is in Settings → Account, and in onboarding under "I already use WitnessWork" → From your other phone. A `/h` link opened from the system camera opens it with the link. A Use a Recovery Key alternative sits under the scanner. A failure because this phone can't be verified, or needs an update, offers Done in place of Scan Again and Use a Recovery Key.
- Once the key arrives, the new phone opens a session for it (`POST /accounts/v1/sessions`, attesting this phone) and checks the `accountId` matches the sealed one before it replaces anything. It replaces the key with the same warning as a recovery key (Buddies data on this phone is deleted, and on iOS the other Apple devices change too) and keeps that session; declining closes the session and cancels the channel. When opening that session fails for now (offline, a 5xx, a rate limit, or a temporary attestation failure), the key stays in memory and the channel open: Try Again, or the connection coming back, opens it again, and leaving the screen or Scan Again cancels the channel. Then `done`, and Buddies starts here when the account already has this key's inbox linked (`GET /accounts/v1/account`), without waiting for iCloud Sync.

## Backup

Each device keeps its own encrypted slot in R2, at `v1/<accountId>/<slotId>`. A restore downloads every slot and folds them with the sync merge.

### The blob

`0x01 ‖ nonce[24] ‖ XChaCha20-Poly1305(backupKey, nonce, gzip(plaintext), aad)`, with `aad = UTF-8("ww-account/v1/backup\n" + accountId + "\n" + slotId)`. The plaintext is UTF-8 JSON:

```json
{
  "v": 1,
  "deviceName": "…",
  "platform": "ios",
  "createdAt": 0,
  "payload": {
    /* SyncPayload */
  }
}
```

### Ops

`backup/put`, `backup/list`, and `backup/get` are **Bearer**. `backup/delete` is Bearer **and** a self-signed envelope (op `backup/delete`; payload `accountPub`, `ts`, `nonce`, and the fields below) whose account must be the token's: a leaked token alone can't delete backups. Before sessions, all four were self-signed envelopes. A suspended account can still back up.

| Op              | Request                         | Response                                                      |
| --------------- | ------------------------------- | ------------------------------------------------------------- |
| `backup/put`    | `slotId`, `size`, `sha256`      | `{ ok, uploadedAt }`                                          |
| `backup/list`   |                                 | `{ ok, slots: [{ slotId, size, uploadedAt }] }`               |
| `backup/get`    | `slotId`                        | The blob, `application/octet-stream`; `not_found` without one |
| `backup/delete` | `slotId`, or none for all slots | `{ ok }`                                                      |

- `backup/put` sends the blob as the raw body (`application/octet-stream`) with `slotId` in `x-ww-slot-id` and `sha256` (b64u of the body's SHA-256) in `x-ww-sha256`; `size` is `Content-Length`. Before sessions it sent a self-signed envelope with all three in headers (`x-ww-payload`/`x-ww-signature`, or the legacy `x-ww-p`/`x-ww-s` that shipped builds send). A body that doesn't match them is `bad_request`. Every other op sends its fields as the JSON body.
- `backup/get` answers with the bytes exactly as put, `Cache-Control: no-store`.
- `backup/delete` is idempotent: a missing slot is `ok`.
- Limits: 20 MiB a blob (`too_large`, 413, refused from `Content-Length` before the body is read), 8 slots an account (`limit`, 429, for a new slot only), and one `backup/put` a slot a minute (`rate_limited`, 429, with `Retry-After` for the rest of the minute). `backup/put` counts against the Buddies photo-upload edge tier, the rest against the read tier.
- In the envelope form, an unregistered `accountPub` is `unknown_account` (404). A suspended account can still back up.
- R2's lifecycle rule deletes a slot 400 days after its last upload.
- `disabled` (503) when the worker has no backup bucket or accounts database.

### The app

- **Opt-in.** Settings → Account → Backup → Back Up to WitnessWork, off by default. Turning it on creates the account key when there's none and opens the account's session first; it stays off when that can't happen (offline, accounts off, or this device can't be verified).
- **Slot.** One random slot id per install, in the `server-account` MMKV, bound to the install id (on Android the `ANDROID_ID`-derived one), so a phone restored from another's Auto Backup gets its own slot.
- **What's in it.** `buildPayload`, the sync payload, without `resetEpoch`: a reset generation belongs to one cloud's sync history. Photos aren't included. The plaintext's `deviceName` is the device model.
- **When it uploads** (`src/lib/serverAccount/backupScheduler.ts`): 30 seconds after the data stops changing (the sync engine's own change trigger, `subscribeToLocalDataChanges`), or 5 minutes after the first of a steady stream of changes; at once when the app leaves the foreground with changes pending; and at least daily. A plaintext whose hash (without its timestamps) matches the last upload isn't uploaded again within the day. Never twice within the server's minute. Failures back off by reason: `rate_limited` by `Retry-After`, `disabled` and `limit` a day, `too_large` 6 hours, offline 15 minutes or when the connection returns, anything else 1, 5, 15 and then 60 minutes. Coming back to the app retries offline, server and rate-limit failures sooner. Back Up Now skips the debounce and the backoff. The phone opening Set Up Another Device uploads first when backup is on. Another device's Delete Backup takes this device's slot without changing its data, so the hash skip alone would wait a day: the phone lists the slots (`backup/list`) when it comes back to the foreground and every 15 minutes while it stays there, on a timer of its own that uploads don't reset, never more often (the Account screen's own list counts too, and so does an upload), and a missing slot uploads again about 5 seconds later. The timer pauses in the background (not for `inactive`).
- **Restore** (`src/app/account/backupRestore.ts`) is offered after a handoff, after a recovery key, from Settings → Account → Restore from Backup, and once per account on a launch after onboarding when the account key is already on the device, backup is off here, and the device has no records (`hasMeaningfulLocalData`). After a handoff, a recovery key, or on that fresh install, a device Cloud Sync covers (ADR 0030 §3) isn't asked when another device's newest sync slot (`updatedAt`) is no more than 10 minutes older than the newest backup (`uploadedAt`): both are the server's clock, and the grace covers a device on both, which writes its slot 5 seconds after an edit and its backup 30 seconds to 5 minutes later. A clearly newer backup, from a device that stayed on iCloud or Google Drive, is offered as usual. It lists the slots, asks (Restore or Not Now without records here; Replace, Combine or Not Now with them), downloads every slot, decrypts it, and validates its payload with `parsePayload`. A slot from a newer app version, or one that doesn't open or validate, is left out and the User is told; if none is left, nothing changes. Replace folds the slots with `foldRemotePayloads` and applies them with `replaceLocalWithRemote`; Combine merges them into the device's records with the sync merge. Either keeps the device's own sync bookkeeping (`iCloudResetEpoch`, last pull, last remote device), so iCloud or Google Drive sync on the device merges the restored records with its cloud like any edit, rather than adopting or ignoring a reset. Then it offers to turn backup on here.
- **Delete.** Settings → Account lists the account's slots as "This phone" or "Another device" with their date and size (names are inside the ciphertext). Deleting one, or Delete Backup for all, deletes from R2 at once; either also turns backup off on this device. Turning backup off asks whether to delete this device's slot.
- **Delete Buddies** deletes the account key, so it first deletes every slot of the account, with the key's session and signature, then closes the session. If deleting the slots fails, nothing else happens and the User is told. With backup on, the next upload creates the new key's account, and the app says the recovery key changed. Replacing the key with another (a handoff or a recovery key) leaves the old account's slots to expire.

## Sync

Cloud Sync ([ADR 0030](./adr/0030-cloud-sync-through-ww-api.md)): each device on it keeps one end-to-end encrypted snapshot of its data in a slot of the account, and every device merges the others' with the sync engine ([icloud-sync.md](./icloud-sync.md)). One `AccountSync` Durable Object per account holds the slots' metadata and the live sockets; R2 holds the ciphertext at `v1/<accountId>/<slotId>`.

Photos over Cloud Sync, and the account's request to turn Cloud Sync on, are in [cloud-sync-photos.md](./cloud-sync-photos.md) ([ADR 0040](./adr/0040-sync-is-free-and-cloud-sync-carries-photos.md)).

### The blob

The backup's format under its own key and AAD:

- Sync key: `HKDF-SHA256(accountKey, "", "ww-account/v1/sync", 32)`.
- `0x01 ‖ nonce[24] ‖ XChaCha20-Poly1305(syncKey, nonce, gzip(plaintext), aad)`, with `aad = UTF-8("ww-account/v1/sync\n" + accountId + "\n" + slotId)`.
- The plaintext is the backup's JSON (`v`, `deviceName`, `platform`, `createdAt`, `payload`), where `payload` is the whole sync payload, `resetEpoch` included.
- The slot id is the device's sync id (`iCloudDeviceId`, the `<deviceId>` in `witness-work-<deviceId>.json`): 8 to 64 characters of `A-Z a-z 0-9 _ -`.

### Ops

Every op is **Bearer**. Ids travel in bodies and headers, never URLs.

| Op                              | Request                                   | Response                                                      |
| ------------------------------- | ----------------------------------------- | ------------------------------------------------------------- |
| `GET /accounts/v1/sync`         | None                                      | `{ ok, enabled, entitled, entitlement, supporter }`           |
| `POST /accounts/v1/sync/put`    | The blob; `slotId`, `sha256`, `If-Match`? | `{ ok, etag, size, updatedAt, seq }`                          |
| `POST /accounts/v1/sync/list`   | `{}`                                      | `{ ok, seq, slots: [{ slotId, etag, size, updatedAt }] }`     |
| `POST /accounts/v1/sync/get`    | `{ slotId }`                              | The blob, `application/octet-stream`; `not_found` without one |
| `POST /accounts/v1/sync/delete` | `{ slotId }`, or `{}` for every slot      | `{ ok, seq }`                                                 |
| `GET /accounts/v1/sync/live`    | WebSocket upgrade; `x-ww-slot-id`         | `hello`, then `changed` messages                              |

- `GET /accounts/v1/sync` is the account's answer: `enabled` (the kill switch), `entitlement` (`supporter` or `everyone`), `supporter` (the account's own status, ADR 0029), and `entitled` (enabled, and `everyone` or a Supporter). A RevenueCat failure answers `supporter: false` with `supporterCheckFailed: true`, never a 5xx. Works while disabled.
- `sync/put` sends the blob as the raw body with the slot id in `x-ww-slot-id`, `sha256` (b64u of the body's SHA-256) in `x-ww-sha256`, and its size as `Content-Length`. The slot's ETag is that `sha256`. `If-Match: "<etag>"` puts only if the slot still holds that ETag (412 `precondition_failed` otherwise); `If-Match: *` only if the slot exists. Without it the put replaces whatever is there. A slot deleted while its put was uploading is 409 `conflict`; nothing is stored.
- `updatedAt` is the server's time of the slot's last put (epoch ms), the transport's `modifiedAt`. `seq` counts the account's puts and deletes; it only grows.
- `sync/get` answers with the bytes exactly as put, `ETag: "<etag>"`, `x-ww-updated-at`, and `Cache-Control: no-store`.
- `sync/delete` is idempotent: a missing slot is `ok`. Without `slotId` it deletes every slot of the account. Deleting every slot needs a live session (`requireLiveSession`), so a signed-out device's last access token can't. A device deletes its own slot when it leaves Cloud Sync or the account; another device's only from its Devices list, Rebuild, or "Keep this device's data".
- **Live socket**: the upgrade carries the bearer token and the device's own slot id (`x-ww-slot-id`). The server sends `{"type":"hello","seq":n}` once (as Buddies' inbox socket does), then `{"type":"changed","seq":n}` after every put or delete by another slot. Sending `ping` gets `pong` without waking the Durable Object. At most 20 sockets an account: one more closes the oldest with `4000 "replaced"`. It carries no data.
- **Switches**: `put`, `list`, `get`, and `live` are 503 `disabled` (with `Retry-After`) while the kill switch is off, and 403 `supporter_required` when the account isn't entitled. With `entitlement: supporter`, a RevenueCat failure is 503 `unavailable` (with `Retry-After`), never `supporter_required`. `delete` and the status always work.
- **Limits**: 20 MiB a blob (`too_large`, 413, refused from `Content-Length` before the body is read), 20 slots an account (`limit`, 429, for a new slot only), one put a slot every 2 seconds and one at a time, and 1,000 puts and 2 GiB an account a rolling day (`rate_limited`, 429, with `Retry-After`). `sync/put` counts against the Buddies write edge tier, the rest against the read tier.
- **Retention**: a slot not written for 30 days whose last writer's session has ended is deleted; so is any slot not written for 400 days (R2's lifecycle rule is the backstop).
- A suspended account keeps syncing.
- `disabled` (503) also when the worker has no sync bucket or accounts database.

`GET /app/v1/config` carries the switches for devices without a session: `sync: { enabled, entitlement }`.

### The app

- **One option.** A device syncs through Cloud Sync, iCloud (iOS) or Google Drive (Android), or not at all (`syncProvider` in device-local preferences). The engine runs on that one transport (`activeSyncTransport()`); devices on different options don't see each other.
- **Default.** A device that never chose (no `syncProvider`, sync not turned off by the User) gets Cloud Sync once `sync.enabled` and it's entitled (`everyone`, or a Supporter): it opens the account's session (creating the account key when there's none), then decides like the Supporter auto-enable: seed an empty account, pull into a device without records, or ask Merge or Replace. A device already on iCloud or Google Drive keeps it and sees a one-time offer to switch in Settings → Sync.
- **Entitlement.** The device records the status's `entitled` and syncs only while it's true. A status with `supporterCheckFailed` (ww-api couldn't reach RevenueCat) keeps what was recorded on a device that's a Supporter by its own RevenueCat answer, and the default tries such a device again at the next foreground instead of giving up.
- **Switching** flushes the old transport, joins the new one's newest reset generation and merges with its devices, then pushes. Leaving Cloud Sync deletes this device's slot (devices on Cloud Sync keep what they've already pulled from it; one that was offline since its last edits doesn't get them); leaving iCloud or Drive leaves this device's file there, where it can't bring back a record deleted later.
- **Reads.** A pull lists the slots and downloads only those whose ETag changed since this launch's last read; this device's own slot is never downloaded. Photos aren't transferred.
- **Live.** One socket per device, in the foreground only, reconnecting with backoff (1, 2, 5, 15, 30 s, then every minute) and with a fresh token after a refresh. `hello` with a `seq` newer than the last pull, and every `changed`, pull at once.
- **Leaving the account** (a QR code or a recovery key to another account) flushes, deletes this device's slot, and stops sync before the key is replaced. Delete Buddies on the account's last device deletes every slot.

## Supporter status

ww-api answers whether an account is a Supporter from its own record, which RevenueCat's webhook keeps current ([ADR 0029](./adr/0029-supporter-status-on-the-server-account.md)). Who counts is still [ADR 0014](./adr/0014-supporter-status-rule.md)'s rule. The app keeps logging in to RevenueCat with ADR 0011's shared id and links that customer to its account. How the web sells, and which customer it uses, is in [`web-purchases.md`](./web-purchases.md).

### Linking a customer: `POST /accounts/v1/revenuecat-customers`

**Bearer** only. `{ appUserId }` → `{ ok, supporter, expiresAt }`.

- `appUserId` is the id the app is logged in to RevenueCat as (`Purchases.getAppUserID()`): 8 to 64 of `A-Z a-z 0-9 _ -`. RevenueCat's anonymous ids (`$RCAnonymousID:…`) never match, and the app doesn't send them. Anything else is 400 `bad_request`.
- The server reads the customer from RevenueCat's REST API, stores what it says, and links it to the token's account. `supporter` and `expiresAt` (epoch ms, or `null` for no end) are the **account's** status afterwards, over every customer it links. A customer RevenueCat has never seen isn't linked, and the answer is the account's status without it.
- Idempotent. Repeating a link refreshes it and reads RevenueCat again, so it doubles as "check my status now".
- An account keeps at most 5 customers, and a customer at most 5 accounts. A new link past either replaces the least recently linked.
- RevenueCat unreachable is 503 `unavailable` with `Retry-After`; nothing changes. A suspended account can still link.
- Counts against the Buddies read edge limit.

### Reading the status: `GET /accounts/v1/supporter`

**Bearer**, no body → `{ ok, supporter, expiresAt, customers }`. The account's status from the stored record (read again from RevenueCat first when it's more than a day old), and how many customers it links. Settings shows nothing new; the developer Tools show it. RevenueCat unreachable while the record is stale is 503 `unavailable`. Counts against the Buddies read edge limit.

### When the app links

`src/lib/serverAccount/revenueCatLink.ts`, after the account's session is open, with the id RevenueCat is logged in as:

- when a session opens, the account key changes, or the RevenueCat id changes (ADR 0011 adopting another device's id);
- after a purchase or a restore, and whenever RevenueCat reports a change in entitlements;
- before Scribe AI's first step or page read and before route planning, when this launch hasn't linked yet;
- when route planning is refused as not a Supporter (`supporter_required`), even if it linked today: the server can have dropped the link (the 5-account cap) or never got it. If the link answers Supporter, the app retries the call once; the refusal didn't count toward the route limits;
- otherwise at most once a day, when the app comes to the foreground.

It remembers the last link (a hash of the account id and RevenueCat id, and the time) in device-local MMKV. Offline or a refused session waits for the next trigger; 503 waits out its `Retry-After`. A link failure never blocks Scribe AI or route planning: the server answers from what it already has.

### What the server does with it

- The webhook (`POST /revenuecat/v1/webhook`, RevenueCat's servers only, authenticated by the integration's Authorization header) reads every linked customer an event names again from RevenueCat; customers nobody linked are ignored.
- A record read within the last day is the answer until its expiry; an older one is read again first. RevenueCat unreachable: route planning answers 503 `supporter_check_failed`, Scribe AI meters the User as free (`supporterCheckFailed`).
- Supporter start and end aren't in the activity log.

### Route planning: `POST /route-planning/optimize`

**Bearer**, `{ start, stops }` → `{ order, distanceMeters, durationSeconds, remainingToday }`. Supporter only, from the account's status (403 `supporter_required`); refuses a suspended account (403 `suspended`). Limits are per account. Before sessions the body carried `accountId`, the RevenueCat app user id; while the legacy switch is on that still works, and once it's off it's 426 `upgrade_required`. ww-api's README has the full contract.

### Route directions: `POST /route-planning/directions`

**Bearer**, `{ points }` (the start, the stops, and a finish elsewhere; 2–12, coordinates only) → `{ legs: [{ distanceMeters, durationSeconds, coordinates }], remainingToday }`, one leg per consecutive pair, from HERE Routing v8. `coordinates` is the road shape as flat `[lat, lng, …]`. Any account, not only Supporters; refuses a suspended account (403 `suspended`). Its per-account quota is separate from optimizations. There's no legacy form. Android asks it to draw the route and time each leg; iOS asks MapKit on the device instead.

## Scribe AI

Scribe AI calls ww-api only through the session (ADR 0027 §4, ADR 0032). The wire contract is [`scribe-ai-protocol.md`](./scribe-ai-protocol.md); this is how it uses the account.

| Route                        | Auth   | What                                                     |
| ---------------------------- | ------ | -------------------------------------------------------- |
| `GET /scribe/v1/status`      | none   | Kill switch, protocol range, `minAppVersion`, limits     |
| `GET /scribe/v1/usage`       | Bearer | The account's usage windows, as percent used and resets  |
| `POST /scribe/v1/step`       | Bearer | One model step over the conversation; answers with SSE   |
| `POST /scribe/v1/transcribe` | Bearer | Reads one paper page image into text; metered            |
| `GET /attestation/v1/status` | none   | App Attest and Play Integrity capabilities, for sessions |

- **The meter is the account.** Bodies carry no install id, RevenueCat id, hash or attestation field. Usage windows, the page ceiling and the concurrency cap belong to the token's account, so they're the same on every device. Notes Import's credits and windows didn't carry over.
- **Supporter.** The plan comes from the account's [Supporter status](#supporter-status). The app links its RevenueCat customer before the first step or page read of a launch; when RevenueCat can't be reached and the record is stale, ww-api meters the User as free and says `supporterCheckFailed`.
- **Refusals.** A session that can't be opened stops Scribe AI before any Bearer route: `device_ineligible` when this device or app can never be verified, `attestation_unavailable` when verifying has to wait, `attestation_failed` otherwise. Availability notes both without opening a session (`checkSupport`, `lastOpenFailure`), so the conversation shows its blocked message before the User says anything. 403 `suspended` on a step or page read notes the account as suspended, which blocks Scribe AI with the suspended message until `GET /account` reads it as reinstated. 426 shows Update Required, as does a status `minAppVersion` above this version.
- **Legacy.** Every `/notes-import/*` route except `GET /notes-import/status` answers 426 `upgrade_required`, so older app versions show Update Required; KV `scribe:legacy-notes-import` can re-allow them for a while. The status probe keeps answering because older versions read attestation capabilities from it. Those versions' contract is in ww-api's OpenAPI docs (`/docs`, the `/notes-import/*` routes) and this file's history.

## Recovery key

The account key and the first 2 bytes of its SHA-256, 34 bytes, in Crockford base32 (`0-9 A-Z` without `I L O U`), 55 characters, shown as `WW1-` and eleven groups of five. Reading one ignores case, spaces, and dashes, reads `I`/`L` as `1` and `O` as `0`, and refuses a bad checksum. Entering it works like receiving the key in a handoff.

## Updates and the legacy switch

`GET {BASE}/app/v1/config` (no authentication) → `{ ok, minAppVersion? }`. `minAppVersion` is `major.minor.patch`, from KV `app:min-version` (`{"minVersion":"…"}`), then the `APP_MIN_VERSION` var, else absent. The app reads it at launch and when it returns to the foreground; below it, the app shows a blocking Update Required screen with a store link. Edge-cached for 60 seconds.

KV `auth:legacy` (`on` when absent, then the `AUTH_LEGACY` var): while on, every converted route (accounts, backup, handoff, Buddies, and the old Notes Import routes while `scribe:legacy-notes-import` re-allows them) also accepts the way it authenticated before sessions. Set to `off`, those requests are refused with **426 `upgrade_required`** (`Retry-After` absent; updating is the fix), and the app shows Update Required. Edge-cached for 60 seconds. Raising `app:min-version` first means current app versions show the update screen before any request is refused.

## Suspension

A suspended account's inboxes refuse every owner op except `inbox/delete` and `slot/remove` with `403 suspended`, close their live sockets with `4003 "suspended"`, and refuse `inbox/register`, with or without a proof. Buddies writing into the suspended User's inbox still works: a buddy who wants them gone removes them. The User's own bearer requests that reach other people (`card/put`, `event/put`, `invite/claim`) are refused with `403 suspended`, checked from the token's account (cached up to 30 s), so no inbox learns which account wrote; leaving a buddy's inbox (`slot/leave`) still works. Legacy writer ops name no account and can't be refused, so suspension fully applies only once the legacy switch is off. The app shows the `buddies_errorSuspended` message and stops the live socket, checking back minutes apart (see "Back-off" in the Buddies protocol) until a sync or owner op goes through again. Scribe AI refuses steps and page reads with `403 suspended` and shows its suspended message in place of the composer, with no Retry; conversations stay on the device and can still be read.

Moderation is maintainer-only: `POST /admin/accounts/lookup` and `/admin/accounts/status` with `x-ww-admin-token` (ww-api `AGENTS.md`, Accounts). A report names the buddy's `inboxId`, which finds the account.

## Privacy

The accounts database holds the account id, `accountPub`, the status and its history (reason codes only), and which inboxes each account owns. No name, email, phone number, or private key, and nothing the User shares in Buddies. The inbox links mean the server knows which inbox belongs to which account, but not who that is or who their buddies are.

Sessions hold the account id, the platform, the SHA-256 of the current and previous refresh tokens, and their times; not the install, its App Attest key, or `accountPub`. Access tokens carry the account id and session id and are never logged.

The RevenueCat app user ids an account's devices link, each with its Supporter status, expiry, and when RevenueCat was last read, and which accounts link which ids. Ids nobody linked aren't stored, and webhook bodies aren't kept: only event ids, for 30 days.

The activity log holds, for 400 days, each entry's kind and time, the session ids and platforms it names, their sealed device labels, and backup slot ids. No IP address, location, user agent, or content, and nothing about buddies.

Handoff channels hold two temporary public keys and two sealed blobs for at most ten minutes. Backups are ciphertext under a key only the User's devices can derive; the server keeps each slot's size, upload time, and random slot id, and can't read a device name or any data. Losing every device and the recovery key loses the backup.

Cloud Sync holds the same kind of ciphertext, one slot per device, with each slot's id (the device's sync id), size, ETag, last write time, and the session that wrote it, until 30 days after that session ends (400 days at most without a write). Its live sockets carry only change notices.
