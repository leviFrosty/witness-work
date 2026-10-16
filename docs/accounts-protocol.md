# Server account protocol

The wire contract for the server account between the WitnessWork app (`src/lib/serverAccount`) and ww-api (`ww-api/src/accounts`). Why it exists is in [ADR 0024](./adr/0024-anonymous-server-accounts.md); moving it, recovering it, and backing up to it are in [ADR 0026](./adr/0026-move-and-recover-the-server-account.md); attested sessions and bearer tokens are in [ADR 0027](./adr/0027-account-sessions-attest-once-then-bearer-tokens.md).

The server account is not ADR 0011's account id. That one is the RevenueCat identity, shared through a file in iCloud Drive. This one is a row ww-api owns, so it can suspend someone for abuse.

## Keys

| Key                 | What it is                                                            | Where it lives                                                           |
| ------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Account key         | 32 random bytes; today the Buddies root seed                          | The User's devices only (iCloud Keychain on iOS, Block Store on Android) |
| Account signing key | Ed25519, seed `HKDF-SHA256(accountKey, "", "ww-account/v1/sign", 32)` | Derived on each device; never stored                                     |
| `accountPub`        | The signing key's public key, `b64u` (43 chars)                       | The server's `accounts.account_pub`                                      |
| `accountId`         | 16 random bytes, `b64u` (22 chars), minted by the server              | The server, and each device's MMKV                                       |
| Backup key          | `HKDF-SHA256(accountKey, "", "ww-account/v1/backup", 32)`             | Derived on each device; never stored                                     |
| Recovery key        | The account key for people (see [Recovery key](#recovery-key))        | Wherever the User keeps it                                               |
| Backup slot id      | 16 random bytes, `b64u`, one per install                              | The device's MMKV, and the server's R2 object key                        |
| Access token        | JWT, 15 minutes (see [Sessions](#sessions))                           | The app's memory only                                                    |
| Refresh token       | Opaque `<sessionId>.<secret>` (`b64u`), one per session               | The platform keystore, not synced; the server keeps its SHA-256          |

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

- Self-signed by the account signing key under op `session/open`, like `account/register`. `attestation` holds the fields Notes Import's kickoff sends for the challenge above: the App Attest assertion fields, or `attestationProvider`, `challenge`, and `integrityToken` for Play Integrity. The signature covers them, and the attestation covers `accountPub`, so neither can be moved to another request.
- Creates the account when `accountPub` has none, so it replaces `account/register`. `status` is `active` or `suspended`; a suspended account still gets a session (it can still hand off and back up).
- A failed attestation is 403 `attestation_failed` with a stable `reason`: `device_integrity_failed`, `app_not_recognized`, `integrity_token_invalid`, `integrity_unavailable`, or a challenge reason (Notes Import's reasons). There's no fallback: no attestation, no account.
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

- Settings → Account → **Set Up Another Device** opens the account's session first when there's none (creating the account key and the account the first time), then opens a channel. When this phone can't be verified, or needs an update, it says so instead. Leaving the screen, or Make a New Code, cancels it.
- **Sign In with QR Code** is in Settings → Account, and in onboarding under "I already use WitnessWork" → From your other phone. A `/h` link opened from the system camera opens it with the link. A Use a Recovery Key alternative sits under the scanner.
- Once the key arrives, the new phone opens a session for it (`POST /accounts/v1/sessions`, attesting this phone) and checks the `accountId` matches the sealed one before it replaces anything. It replaces the key with the same warning as a recovery key (Buddies data on this phone is deleted, and on iOS the other Apple devices change too) and keeps that session; declining closes the session and cancels the channel. Then `done`, and Buddies starts here when the account already has this key's inbox linked (`GET /accounts/v1/account`), without waiting for iCloud Sync.

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
- **When it uploads** (`src/lib/serverAccount/backupScheduler.ts`): 30 seconds after the data stops changing (the sync engine's own change trigger, `subscribeToLocalDataChanges`), or 5 minutes after the first of a steady stream of changes; at once when the app leaves the foreground with changes pending; and at least daily. A plaintext whose hash (without its timestamps) matches the last upload isn't uploaded again within the day. Never twice within the server's minute. Failures back off by reason: `rate_limited` by `Retry-After`, `disabled` and `limit` a day, `too_large` 6 hours, offline 15 minutes or when the connection returns, anything else 1, 5, 15 and then 60 minutes. Coming back to the app retries offline, server and rate-limit failures sooner. Back Up Now skips the debounce and the backoff. The phone opening Set Up Another Device uploads first when backup is on.
- **Restore** (`src/app/account/backupRestore.ts`) is offered after a handoff, after a recovery key, from Settings → Account → Restore from Backup, and once per account on a launch after onboarding when the account key is already on the device, backup is off here, and the device has no records (`hasMeaningfulLocalData`). It lists the slots, asks (Restore or Not Now without records here; Replace, Combine or Not Now with them), downloads every slot, decrypts it, and validates its payload with `parsePayload`. A slot from a newer app version, or one that doesn't open or validate, is left out and the User is told; if none is left, nothing changes. Replace folds the slots with `foldRemotePayloads` and applies them with `replaceLocalWithRemote`; Combine merges them into the device's records with the sync merge. Either keeps the device's own sync bookkeeping (`iCloudResetEpoch`, last pull, last remote device), so iCloud or Google Drive sync on the device merges the restored records with its cloud like any edit, rather than adopting or ignoring a reset. Then it offers to turn backup on here.
- **Delete.** Settings → Account lists the account's slots as "This phone" or "Another device" with their date and size (names are inside the ciphertext). Deleting one, or Delete Backup for all, deletes from R2 at once; either also turns backup off on this device. Turning backup off asks whether to delete this device's slot.
- **Delete Buddies** deletes the account key, so it first deletes every slot of the account, with the key's session and signature, then closes the session. If deleting the slots fails, nothing else happens and the User is told. With backup on, the next upload creates the new key's account, and the app says the recovery key changed. Replacing the key with another (a handoff or a recovery key) leaves the old account's slots to expire.

## Notes Import

Notes Import calls ww-api only through the session (ADR 0027 §4; `src/features/notes-import/lib/notesImportClient.ts`). Every route but the public `GET /notes-import/status` is **Bearer**, and the session's attestation stands in for attesting each import: the bodies carry no install id, hashes or attestation fields, and the token's account is the meter (allowances, the concurrency cap, Import from Paper's page limit). Usage under an install or shared account id doesn't carry over; each account starts a fresh window. ww-api's README has the full contract.

| Route                                       | Body                                                        | 200                                                          |
| ------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------ |
| `POST /notes-import/kickoff`                | `{ notesText, context, refinement?, revenueCatAppUserId? }` | `{ importId, refinement, credits }`                          |
| `POST /notes-import` (synchronous fallback) | the same                                                    | `{ result, contentHash, refinement, emptyCharged, credits }` |
| `POST /notes-import/transcribe`             | `{ image, mimeType, revenueCatAppUserId? }`                 | `{ ok, text, truncated, pagesRemaining }`                    |
| `GET /notes-import/{importId}/events`       | none; `Last-Event-ID` to resume                             | the SSE stream                                               |
| `GET /notes-import/{importId}/result`       | none                                                        | `{ status, payload?, error? }`                               |
| `POST /notes-import/{importId}/destroy`     | none                                                        | `{ ok: true }`                                               |

- **Supporter.** `revenueCatAppUserId` is the id `CustomerProvider` logs in to RevenueCat with (ADR 0011's shared account id, else the install id), sent only when it's 8 to 64 of `A-Z a-z 0-9 _ -`, never a RevenueCat anonymous id. Absent means not a Supporter. `notesImportRevenueCatAppUserId` produces it, and goes away once RevenueCat is linked to the account.
- **Runs.** The run handle the ledger keeps is the import id alone. A handle from an app version before sessions (it has a `subscribeToken`) is dropped when read, so that import kicks off again from its saved notes. Run routes serve only the account's own imports, and anything else is 404 `not_found`: resuming then kicks off again too, and a destroy treats it as already deleted. Each SSE connection takes the session's current token in `Authorization` (a fresh one once the old is within a minute of expiry), so a run outlives its token; a 401 refreshes once and reconnects with `Last-Event-ID`.
- **Refusals.** A session that can't be opened stops the import before any Notes Import route: `device_ineligible` when this device or app can never be verified (the copy is `account_unverifiedBody`, which names Notes Import), `attestation_unavailable` when verifying has to wait, `attestation_failed` otherwise. 403 `suspended` on kickoff, the synchronous fallback or transcribe shows `notesImport_suspended`; reading and deleting runs still work. 426 shows Update Required.
- **Availability.** Notes Import counts as unavailable on a device that can never attest (`checkSupport`, once per launch) or whose last session open was refused for the device and is still waiting (`lastOpenFailure`), so the composer says so before the User writes anything. Neither opens a session.

## Recovery key

The account key and the first 2 bytes of its SHA-256, 34 bytes, in Crockford base32 (`0-9 A-Z` without `I L O U`), 55 characters, shown as `WW1-` and eleven groups of five. Reading one ignores case, spaces, and dashes, reads `I`/`L` as `1` and `O` as `0`, and refuses a bad checksum. Entering it works like receiving the key in a handoff.

## Updates and the legacy switch

`GET {BASE}/app/v1/config` (no authentication) → `{ ok, minAppVersion? }`. `minAppVersion` is `major.minor.patch`, from KV `app:min-version` (`{"minVersion":"…"}`), then the `APP_MIN_VERSION` var, else absent. The app reads it at launch and when it returns to the foreground; below it, the app shows a blocking Update Required screen with a store link. Edge-cached for 60 seconds.

KV `auth:legacy` (`on` when absent, then the `AUTH_LEGACY` var): while on, every converted route (accounts, backup, handoff, Buddies, Notes Import) also accepts the way it authenticated before sessions. Set to `off`, those requests are refused with **426 `upgrade_required`** (`Retry-After` absent; updating is the fix), and the app shows Update Required. Edge-cached for 60 seconds. Raising `app:min-version` first means current app versions show the update screen before any request is refused.

## Suspension

A suspended account's inboxes refuse every owner op except `inbox/delete` and `slot/remove` with `403 suspended`, close their live sockets with `4003 "suspended"`, and refuse `inbox/register`, with or without a proof. Buddies writing into the suspended User's inbox, and the User's own writes into buddies' inboxes (writer ops), still work: a buddy who wants them gone removes them. The app shows the `buddies_errorSuspended` message and backs off like the kill switch. Notes Import refuses new imports and page reads with `403 suspended` and shows `notesImport_suspended`, with no Retry; the account's runs can still be read and deleted.

Moderation is maintainer-only: `POST /admin/accounts/lookup` and `/admin/accounts/status` with `x-ww-admin-token` (ww-api `AGENTS.md`, Accounts). A report names the buddy's `inboxId`, which finds the account.

## Privacy

The accounts database holds the account id, `accountPub`, the status and its history (reason codes only), and which inboxes each account owns. No name, email, phone number, or private key, and nothing the User shares in Buddies. The inbox links mean the server knows which inbox belongs to which account, but not who that is or who their buddies are.

Sessions hold the account id, the platform, the SHA-256 of the current and previous refresh tokens, and their times; not the install, its App Attest key, or `accountPub`. Access tokens carry the account id and session id and are never logged.

Handoff channels hold two temporary public keys and two sealed blobs for at most ten minutes. Backups are ciphertext under a key only the User's devices can derive; the server keeps each slot's size, upload time, and random slot id, and can't read a device name or any data. Losing every device and the recovery key loses the backup.
