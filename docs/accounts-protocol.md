# Server account protocol

The wire contract for the server account between the WitnessWork app (`src/lib/serverAccount`) and ww-api (`ww-api/src/accounts`). Why it exists is in [ADR 0024](./adr/0024-anonymous-server-accounts.md); moving it, recovering it, and backing up to it are in [ADR 0026](./adr/0026-move-and-recover-the-server-account.md).

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

Every feature derives its own keys from the account key with its own HKDF label (Buddies uses `ww-buddies/v1/*`), so the server can't tell that `accountPub` and a feature's public keys belong together. Only signatures the User's devices make link them.

## Requests

`POST {BASE}/accounts/v1/{op}` with the Buddies envelope `{ "p": b64u(UTF-8 JSON), "s": b64u(Ed25519) }`. The signature covers `UTF-8("ww-account/v1\n" + op + "\n")` followed by the decoded bytes of `p`. The context differs from Buddies' `ww-buddies/v1`, so no signature counts for both. Errors use the Buddies error envelope and codes, including `stale` with `serverTime`.

### `account/register`

| Payload                     | Response                    |
| --------------------------- | --------------------------- |
| `accountPub`, `ts`, `nonce` | `{ ok, accountId, status }` |

- Self-signed by the account signing key. `status` is `active` or `suspended`.
- Idempotent: the same `accountPub` always gets the same `accountId`, so a replay learns nothing new and there's no nonce cache.
- Counts against the Buddies register edge limit and a per-caller daily quota.
- `disabled` (503) when the worker has no accounts database. The app then asks again about once a day.

### `account/info`

| Payload                     | Response                                                                    |
| --------------------------- | --------------------------------------------------------------------------- |
| `accountPub`, `ts`, `nonce` | `{ ok, accountId, accountPub, status, createdAt, inboxIds, statusChanges }` |

- Self-signed like `account/register`, under op `account/info`, so only the account key's holder reads the account. Read-only: it never creates one, and an unregistered key is `unknown_account` (404).
- `createdAt` and each `statusChanges[].createdAt` are epoch milliseconds. Status changes carry `status` only; their reason codes stay with moderation.
- Settings → Account reads the account's status with it each time the screen opens, and the developer Tools show the whole record. Counts against the Buddies read edge limit.

## Linking a Buddies inbox

`inbox/register` ([Buddies protocol](./buddies-protocol.md)) takes `account: { accountId, signature }`, where `signature` is the account signing key's Ed25519 signature over:

```
UTF-8("ww-account/v1\ninbox/link\n" + accountId + "\n" + inboxId + "\n" + ownerPub)
```

The whole payload is also signed by the inbox's owner key, so a link takes both keys. The relay checks the account and the signature, registers the inbox, and only then writes the link. An inbox already linked to another account is `conflict`. The answer's `accountId` names the account the inbox belongs to, with or without a proof.

The app sends a proof on every registration once it has an account, and links an inbox registered before accounts on the first sync after it gets one (once per launch). Without an account (offline, or accounts off) it registers unlinked, as before.

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

`POST {BASE}/accounts/v1/{op}`. Ops the old phone makes are self-signed envelopes like `account/register`: the payload carries `accountPub`, `ts`, `nonce`, plus the fields below, and the account must exist. Ops the new phone makes are plain JSON authorized by `claimToken`.

| Op                | Caller | Request                                                 | Response                                                          |
| ----------------- | ------ | ------------------------------------------------------- | ----------------------------------------------------------------- |
| `handoff/open`    | Old    | `channelId`, `verifier`                                 | `{ ok, expiresAt }`; `conflict` while the channel is live         |
| `handoff/claim`   | New    | `channelId`, `claimToken`, `claimPub`, `hello` (sealed) | `{ ok, expiresAt }`; `conflict` once claimed by another, or ended |
| `handoff/status`  | Old    | `channelId`                                             | `{ ok, status, expiresAt, claimPub?, hello? }`                    |
| `handoff/send`    | Old    | `channelId`, `key` (sealed)                             | `{ ok }`; `conflict` unless `claimed`                             |
| `handoff/receive` | New    | `channelId`, `claimToken`                               | `{ ok, status, key? }`; `key` only while `sent`                   |
| `handoff/done`    | New    | `channelId`, `claimToken`                               | `{ ok }`; deletes the key blob; `conflict` before `sent`          |
| `handoff/cancel`  | Either | `channelId` (old, signed) or `channelId`, `claimToken`  | `{ ok }`; deletes every blob; after `done`, `ok` and stays `done` |

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

- Settings → Account → **Set Up Another Device** registers the account first when it needs to (the account key is created if there's none), then opens a channel. Leaving the screen, or Make a New Code, cancels it.
- **Sign In with QR Code** is in Settings → Account, and in onboarding under "I already use WitnessWork" → From your other phone. A `/h` link opened from the system camera opens it with the link. A Use a Recovery Key alternative sits under the scanner.
- Once the key arrives, the new phone registers its `accountPub` and checks the `accountId` matches the sealed one before it replaces anything. It replaces the key with the same warning as a recovery key (Buddies data on this phone is deleted, and on iOS the other Apple devices change too); declining cancels the channel. Then `done`, and Buddies starts here when the account already has this key's inbox linked (`account/info`), without waiting for iCloud Sync.

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

All self-signed envelopes like `account/register`, payloads with `accountPub`, `ts`, `nonce` and the fields below. The account must exist; a suspended account can still back up.

| Op              | Request                         | Response                                                      |
| --------------- | ------------------------------- | ------------------------------------------------------------- |
| `backup/put`    | `slotId`, `size`, `sha256`      | `{ ok, uploadedAt }`                                          |
| `backup/list`   |                                 | `{ ok, slots: [{ slotId, size, uploadedAt }] }`               |
| `backup/get`    | `slotId`                        | The blob, `application/octet-stream`; `not_found` without one |
| `backup/delete` | `slotId`, or none for all slots | `{ ok }`                                                      |

- `backup/put` sends the envelope in headers (`x-ww-p`, `x-ww-s`) and the blob as the raw body (`application/octet-stream`); `sha256` is b64u of the body's SHA-256 and `size` its length. A body that doesn't match them is `bad_request`. Every other op sends the envelope as the JSON body.
- `backup/get` answers with the bytes exactly as put, `Cache-Control: no-store`.
- `backup/delete` is idempotent: a missing slot is `ok`.
- Limits: 20 MiB a blob (`too_large`, 413, refused from `Content-Length` before the body is read), 8 slots an account (`limit`, 429, for a new slot only), and one `backup/put` a slot a minute (`rate_limited`, 429, with `Retry-After` for the rest of the minute). `backup/put` counts against the Buddies photo-upload edge tier, the rest against the read tier.
- An unregistered `accountPub` is `unknown_account` (404). A suspended account can still back up.
- R2's lifecycle rule deletes a slot 400 days after its last upload.
- `disabled` (503) when the worker has no backup bucket or accounts database.

### The app

- **Opt-in.** Settings → Account → Backup → Back Up to WitnessWork, off by default. Turning it on creates the account key when there's none and registers the account first; it stays off when that can't happen (offline, or accounts off).
- **Slot.** One random slot id per install, in the `server-account` MMKV, bound to the install id (on Android the `ANDROID_ID`-derived one), so a phone restored from another's Auto Backup gets its own slot.
- **What's in it.** `buildPayload`, the sync payload, without `resetEpoch`: a reset generation belongs to one cloud's sync history. Photos aren't included. The plaintext's `deviceName` is the device model.
- **When it uploads** (`src/lib/serverAccount/backupScheduler.ts`): 30 seconds after the data stops changing (the sync engine's own change trigger, `subscribeToLocalDataChanges`), or 5 minutes after the first of a steady stream of changes; at once when the app leaves the foreground with changes pending; and at least daily. A plaintext whose hash (without its timestamps) matches the last upload isn't uploaded again within the day. Never twice within the server's minute. Failures back off by reason: `rate_limited` by `Retry-After`, `disabled` and `limit` a day, `too_large` 6 hours, offline 15 minutes or when the connection returns, anything else 1, 5, 15 and then 60 minutes. Coming back to the app retries offline, server and rate-limit failures sooner. Back Up Now skips the debounce and the backoff. The phone opening Set Up Another Device uploads first when backup is on.
- **Restore** (`src/app/account/backupRestore.ts`) is offered after a handoff, after a recovery key, from Settings → Account → Restore from Backup, and once per account on a launch after onboarding when the account key is already on the device, backup is off here, and the device has no records (`hasMeaningfulLocalData`). It lists the slots, asks (Restore or Not Now without records here; Replace, Combine or Not Now with them), downloads every slot, decrypts it, and validates its payload with `parsePayload`. A slot from a newer app version, or one that doesn't open or validate, is left out and the User is told; if none is left, nothing changes. Replace folds the slots with `foldRemotePayloads` and applies them with `replaceLocalWithRemote`; Combine merges them into the device's records with the sync merge. Either keeps the device's own sync bookkeeping (`iCloudResetEpoch`, last pull, last remote device), so iCloud or Google Drive sync on the device merges the restored records with its cloud like any edit, rather than adopting or ignoring a reset. Then it offers to turn backup on here.
- **Delete.** Settings → Account lists the account's slots as "This phone" or "Another device" with their date and size (names are inside the ciphertext). Deleting one, or Delete Backup for all, deletes from R2 at once; either also turns backup off on this device. Turning backup off asks whether to delete this device's slot.
- **Delete Buddies** deletes the account key, so it first deletes every slot of the account, signed with that key. If that fails, nothing else happens and the User is told. With backup on, the next upload creates the new key's account, and the app says the recovery key changed. Replacing the key with another (a handoff or a recovery key) leaves the old account's slots to expire.

## Recovery key

The account key and the first 2 bytes of its SHA-256, 34 bytes, in Crockford base32 (`0-9 A-Z` without `I L O U`), 55 characters, shown as `WW1-` and eleven groups of five. Reading one ignores case, spaces, and dashes, reads `I`/`L` as `1` and `O` as `0`, and refuses a bad checksum. Entering it works like receiving the key in a handoff.

## Suspension

A suspended account's inboxes refuse every owner op except `inbox/delete` and `slot/remove` with `403 suspended`, close their live sockets with `4003 "suspended"`, and refuse `inbox/register`, with or without a proof. Buddies writing into the suspended User's inbox, and the User's own writes into buddies' inboxes (writer ops), still work: a buddy who wants them gone removes them. The app shows the `buddies_errorSuspended` message and backs off like the kill switch.

Moderation is maintainer-only: `POST /admin/accounts/lookup` and `/admin/accounts/status` with `x-ww-admin-token` (ww-api `AGENTS.md`, Accounts). A report names the buddy's `inboxId`, which finds the account.

## Privacy

The accounts database holds the account id, `accountPub`, the status and its history (reason codes only), and which inboxes each account owns. No name, email, phone number, or private key, and nothing the User shares in Buddies. The inbox links mean the server knows which inbox belongs to which account, but not who that is or who their buddies are.

Handoff channels hold two temporary public keys and two sealed blobs for at most ten minutes. Backups are ciphertext under a key only the User's devices can derive; the server keeps each slot's size, upload time, and random slot id, and can't read a device name or any data. Losing every device and the recovery key loses the backup.
