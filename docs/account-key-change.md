# Changing the account key

The wire contract and device flow for Change Account Key, between the app (`src/lib/serverAccount`, `src/app/account/keyChange`) and ww-api (`ww-api/src/accounts`). The decisions are [ADR 0039](./adr/0039-change-the-account-key.md). Sessions, envelopes and error codes are in [accounts-protocol.md](./accounts-protocol.md); passkey wraps and the web step-up are in [passkeys-protocol.md](./passkeys-protocol.md); Cloud Sync photos are in [cloud-sync-photos.md](./cloud-sync-photos.md).

A key change keeps the `accountId`. It replaces `account_pub` and raises the account's `keyEpoch`. Supporter links, the activity log, Cloud Sync and backup slots, inbox links and session records stay on the same account.

## Keys

`K1` is the account key before the change, `K2` after. Every key below comes from them as in [accounts-protocol.md](./accounts-protocol.md#keys): `HKDF-SHA256(accountKey, "", label, 32)`.

| Value           | What it is                                                                     |
| --------------- | ------------------------------------------------------------------------------ |
| `accountPub`    | K1's signing public key                                                        |
| `newAccountPub` | K2's signing public key                                                        |
| `keyEpoch`      | `accounts.key_epoch`: `0` for a new account, raised by one on each change      |
| History key     | `HKDF-SHA256(K, "", "ww-account/v1/key-history", 32)`, for the current key `K` |

## Server

### `POST /accounts/v1/account/rekey`

**Bearer** with a live session, **Step-up** on the web, **and** signed by K1 (op `account/rekey`), **and** signed by K2:

```json
{
  "payload": "<b64u JSON>",
  "signature": "<b64u, K1>",
  "newSignature": "<b64u, K2>"
}
```

- `signature` covers `UTF-8("ww-account/v1\naccount/rekey\n")` followed by the payload bytes, as every self-signed op.
- `newSignature` covers `UTF-8("ww-account/v1\naccount/rekey/new\n")` followed by the same payload bytes, under the key for `newAccountPub`. Nobody can move an account to a key they don't hold.

| Payload field   | What it is                                                                                                                                                                                                 |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `accountPub`    | K1's; must be the token's account's current key. A key this account already retired is 409 `conflict` with `keyEpoch`; another account's is `forbidden`                                                    |
| `newAccountPub` | K2's; the same as `accountPub` is `bad_request`; any account's key or a retired key is `conflict`                                                                                                          |
| `keyEpoch`      | The epoch the device read; the swap happens only while it's still the account's                                                                                                                            |
| `ts`, `nonce`   | As every envelope; each envelope works once (409 `replay`)                                                                                                                                                 |
| `device`?       | The caller's label re-sealed under K2 (AAD `"ww-account/v1/device\n" + newAccountPub`)                                                                                                                     |
| `history`       | The new [key history](#the-key-history-blob) blob, sealed under K2's history key; at most 65,536 characters                                                                                                |
| `passkeyWrap`?  | `{ credentialId, wrapId, wrap }`: a wrap of K2 for the new epoch, from the passkey of the session's step-up; another credential, or none (a phone session normally has no step-up passkey), is `not_found` |

Response 200: `{ ok, keyEpoch, accessToken, accessExpiresAt }`, where `keyEpoch` is the new epoch and the access token carries it. The refresh token is unchanged; its next refresh carries the new epoch too.

**Who may** (ADR 0039 §2):

- An attested phone session (`ios`, `android`, or the `dev` bypass) may, at any age. The phone checks Face ID (or the device passcode where Face ID isn't set up) first; the server can't see that.
- A web session may when it opened at least **24 hours** ago **and** passed a [step-up](./passkeys-protocol.md#step-up-on-the-web) in the last 5 minutes. Younger is 403 `session_too_new`; no step-up is 403 `step_up_required`. Both are checked before the envelope is read.
- A suspended account may: the key protects only the User's own data, and suspension stays on the `accountId`.

**One D1 batch**, all or nothing:

1. `account_pub = newAccountPub`, `key_epoch = key_epoch + 1`, `key_changed_at = now`, only where the account's `account_pub` and `key_epoch` still match the payload. No match is 409 `conflict` with the account's current `keyEpoch`.
2. K1's public key goes on the retired list, with the account and the old epoch.
3. Every other session of the account ends (reason `revoked`).
4. The caller's session takes the new epoch, and `device` when sent.
5. Every passkey wrap of the account is deleted. `passkeyWrap`, when sent, is stored for the new epoch.
6. The key history blob is stored for the new epoch.
7. Activity: `account.key_changed` for the caller's session, and `session.revoked` for each session it ended, with the caller as actor.

After the batch, every Cloud Sync socket of the account closes with `4005 "key_changed"`. The caller reconnects with its new token.

**A lost answer.** The device doesn't resend the envelope. It refreshes its session and reads `GET /account`: `newAccountPub` means the change committed; `accountPub` means it didn't, and the device sends a new envelope (fresh `ts` and `nonce`, and on the web a fresh step-up). A device that sees 401 `key_changed` from the rekey itself does the same: another request of its own session committed first. A session the change ended can't refresh, so a device that lost the race never sees the account under its own K2.

**Limits:** 3 changes per account a rolling day, 10 a rolling 30 days; Buddies register edge tier.

### Retired keys

- Opening a session (`POST /sessions`, every method: attested, passkey ticket, approval ticket, recovery ticket, web recovery), legacy `account/register`, and web sign-up with a retired key are 403 `key_retired`, with `changedAt` (epoch ms). A retired key never creates an account.
- A retired key is retired for good.
- Any other self-signed op with a retired key is `unknown_account`, as today.
- **Opening into a known account.** `POST /sessions` takes an optional `accountId` in its signed payload: the session opens only if `accountPub` is that account's current key, else 404 `unknown_account`, and it never creates an account. A device that knows its account always sends it: when it rejoins, and when it resolves a change record.

### The key epoch on tokens

- Access tokens carry `kep`, the session's key epoch when issued. A token without one counts as `0`.
- Routes that change re-sealed data, passkeys or the key need a live session: `sync/put`, `sync/delete`, `sync/photos/put`, `sync/photos/delete`, `backup/put`, `backup/delete`, adding, wrapping and removing a passkey, and `account/rekey`. Every route that reads the live session also compares `kep` with the session's `key_epoch`: lower is 401 `unauthorized` with `reason: "key_changed"`, and the app refreshes.
- Other routes rely on the access token's 15-minute life, as after any sign-out ([ADR 0027](./adr/0027-account-sessions-attest-once-then-bearer-tokens.md)).

### Re-sealing another device's slot

A `sync/put` with `x-ww-reseal: 1` keeps the slot's recorded session and platform, so a signed-out device's slot is still swept on its own schedule and the put doesn't count as the caller's write. It keeps the slot's `updatedAt` too. It's allowed only within 7 days of the account's last key change (`forbidden` otherwise); it needs a strong, quoted-ETag `If-Match` (`bad_request` without one), so it never writes over a newer put; a slot that doesn't exist is 412, and any other header value is `bad_request`.

### Reading the key history: `GET /accounts/v1/account/key-history`

Bearer with a live session → `{ ok, keyEpoch, history }`: the blob stored with the last change, or `null` for an account whose key never changed. Not logged.

`GET /accounts/v1/account` adds `keyEpoch`.

### Supporter links (ADR 0039 §9)

In the same batch, every RevenueCat customer linked to the account is unlinked from every **other** account that first linked it later than this account did. Unless another account still links it from earlier, it's also locked for 90 days: an account not already linked to it can't link it (409 `conflict`, `reason: "customer_locked"`); the lock follows RevenueCat's original app user id, so an alias can't get around it. The account's own links, and older links of other accounts, stay. A link made at the same moment as the changing account's counts as older. Any account still linked to the customer may relink it. Customers are matched by their original app user id, anonymous ones included, as well as the id sent.

### Older app versions (ADR 0039 §10)

`GET /sessions` already lists each session's `appVersion`. Before committing, the app warns when another of the account's sessions runs a version before 1.47.0, which shows an error after a change instead of asking to sign back in; `minAppVersion` rises one release after this ships.

### Codes

| Status | Code / value                        | When                                                                                                             |
| ------ | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 403    | `session_too_new`                   | A web session less than 24 hours old asks to change the key                                                      |
| 403    | `key_retired`                       | A session open (or sign-up, or `account/register`) with a retired key                                            |
| 401    | `reason: "key_changed"`             | A token from before the change, on a route that needs a live session                                             |
| 401    | `reason: "replaced"` or `"revoked"` | The caller's own session ended during `account/rekey`; nothing changed, so the device checks before trying again |
| 409    | `reason: "customer_locked"`         | Linking a RevenueCat customer locked to another account by a key change                                          |
| Close  | `4005 "key_changed"`                | Every Cloud Sync socket of the account, after a change                                                           |

Activity adds `account.key_changed` (`session`: the session that changed it). Clients skip kinds they don't know.

## The key history blob

A JSON document the devices seal and the server stores without reading. It lets a device open what K1 sealed after K1 is gone: old "My Account" backup files, and any slot or photo the change didn't reach.

```json
{
  "v": 1,
  "entries": [
    {
      "keyEpoch": 0,
      "retiredAt": 1767225600000,
      "accountPub": "<K1's>",
      "backup": "<b64u HKDF(K1, 'ww-account/v1/backup')>",
      "backupFile": "<b64u HKDF(K1, 'ww-account/v1/backup-file')>",
      "sync": "<b64u HKDF(K1, 'ww-account/v1/sync')>",
      "syncPhoto": "<b64u HKDF(K1, 'ww-account/v1/sync-photo')>",
      "syncPhotoName": "<b64u HKDF(K1, 'ww-account/v1/sync-photo-name')>",
      "device": "<b64u HKDF(K1, 'ww-account/v1/device')>"
    }
  ]
}
```

- Sealed as `b64u(0x01 ‖ nonce[24] ‖ XChaCha20-Poly1305(historyKey(K2), nonce, UTF-8(JSON), aad))`, with `aad = UTF-8("ww-account/v1/key-history\n" + accountId + "\n" + newKeyEpoch)`.
- **Derived keys only**, never an older account key. Each change opens the stored history with K1's history key, appends K1's entry, and seals the whole under K2's. Newest entry last.
- Entries are never dropped. When the blob would pass 65,536 characters, the oldest entries keep only `keyEpoch`, `retiredAt` and `backupFile`, so old "My Account" files always open.
- A device caches the opened history in device-local storage and refreshes it after a change or a rejoin.
- **Opening a locked backup file:** try the current key's file key, then each entry's `backupFile`, newest first. **Opening a slot:** the same with `backup` or `sync`. **Finding a photo:** a reference whose name under the current name key isn't on the server is looked up under each entry's `syncPhotoName`, and opened with its `syncPhoto`. **Labels:** `device`, with the entry's `accountPub` in the AAD.

## The device flow

Ordered, and resumable after a crash at any step (ADR 0039 §4). The device keeps a **change record** in this-device-only secret storage (`modules/device-secrets` on iOS and Android, the sealed IndexedDB store on the web), never synced or backed up:

```ts
type KeyChangeRecord = {
  v: 1
  accountId: string
  oldKey: string // K1, b64u
  newKey: string // K2, b64u
  oldKeyEpoch: number
  stage:
    | 'pending'
    | 'confirmed'
    | 'committed'
    | 'stored'
    | 'resealed'
    | 'buddies-reset'
  startedAt: number
  reseal?: { syncSlots: string[]; photos: string[]; backupSlots: string[] } // done ids; photos: only those left as they are
}
```

| #   | Step                                                                                                                                                                                                                                                                                             | After a crash here                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| 0   | Online; `GET /account` (with `keyEpoch`); `GET /account/key-history`, opened with K1's history key; Cloud Sync pulls and merges, and pushes what's pending; a backup is made when backup is on                                                                                                   | Nothing changed                                                            |
| 1   | Create K2; store the record as `pending`                                                                                                                                                                                                                                                         | Nothing changed on the server: offer to continue (back to 2) or discard K2 |
| 2   | Show K2's recovery key; "I've saved it" moves to `confirmed`. Leaving discards the record                                                                                                                                                                                                        | As 1                                                                       |
| 3   | On the web, a step-up right after "I've saved it"; its PRF output makes `passkeyWrap`. Then `account/rekey`; the answer moves to `committed`                                                                                                                                                     | Resolved at launch (below)                                                 |
| 4   | Store K2 as **the** account key (iCloud Keychain, Block Store, or the browser), point the cached account at `newAccountPub` with the same `accountId`, and keep the session; `stored`                                                                                                            | Store K2 again                                                             |
| 5   | Re-seal every Cloud Sync slot, every Cloud Sync photo and every backup slot under K2, other devices' too; record each one done; `resealed`                                                                                                                                                       | Go on from the record's lists                                              |
| 6   | Reset Buddies with reconnect invites ([ADR 0039 §5](./adr/0039-change-the-account-key.md#5-buddies-reset-with-reconnect-invites); the wire format is added to [buddies-protocol.md](./buddies-protocol.md) with it), using the old inbox's keys from K1 and a new inbox from K2; `buddies-reset` | Go on; each part is idempotent                                             |
| 7   | Delete the record, and with it K1                                                                                                                                                                                                                                                                | —                                                                          |

- **The record wins at launch.** A record at `confirmed` or later is resolved before the session layer uses the stored key, and before any `key_retired` handling. With a live session, `GET /account` decides: `newAccountPub` means committed, `accountPub` means not committed (back to step 3), anything else means another device won. Without one, opening a session with K2 and the record's `accountId` decides: it opens when the change committed; `unknown_account` means it didn't, and then K1's `key_retired` means another device changed the key, while K1 opening means back to step 3. From `committed` on, K2 is the device's key whatever the platform store still holds.
- **Two devices at once.** The epoch check lets one win. The other gets 409 `conflict`, 401 `key_changed`, or 401 and then `revoked`, at step 3. It discards its pending K2, which it never stored as current, and is told the key just changed on another device.
- **Re-sealing slots:** `sync/get` → open with K1 (or a history entry) → seal with K2 → `sync/put` with `If-Match` (and `x-ww-reseal: 1` for another device's slot); a 412 re-reads. **Backup slots:** `backup/get` (with its `ETag`) → re-seal → `backup/put` with `If-Match`, at most one put per slot a minute; a 412 re-reads, and a slot gone since skips. A slot that doesn't open with K1 or the history is left as it is.
  - The sealed bytes move to K2 unread, so what a newer app wrote is kept. A slot already under K2 isn't put again.
  - A put refused as too soon after the slot's last (`rate_limited`: 2 s for Cloud Sync, a minute for backup) waits, then reads the slot again. A longer wait (an account's daily caps) stops the step, to resume later.
  - Cloud Sync slots stay under K1, where the history opens them, when the account can't use Cloud Sync (`supporter_required`, `disabled`) or the re-seal window has passed (`forbidden`, after which other devices' slots aren't downloaded); the step goes on. A Cloud Sync slot deleted since it was listed is skipped (its `If-Match` put answers 412, then the read 404).
  - A backup slot's put names the etag its bytes were read with, so a backup uploaded since is read again rather than rolled back, and a slot deleted since isn't made again (412, then the read 404s). A slot read without an etag isn't put: the step stops, to try again later. Backup turned off (`disabled`) leaves the rest under K1.
  - A put refused while another put of the slot is in flight (`rate_limited`, up to about 2 minutes) waits a few seconds at a time and reads the slot again.
  - When the key history can't be read, a slot K1 doesn't open isn't recorded: the step stops, to try again later.
- **Re-sealing photos:** K2's name key gives each photo a new name, so `photos/put` the new blob, then `photos/delete` the old name. The payloads' references are filenames, which don't change. A photo refused with `storage_full`, the photo-count `limit`, or `rate_limited` stays under K1, where the history still opens it, and is retried on later launches; it doesn't hold up steps 6 and 7.
  - A listed photo whose meta opens with K1 or a history entry, and whose filename hashes to its name under that entry's name key, is downloaded, opened, and sealed again under K2's photo key for K2's name. The old name is deleted only once the new one is live (`existed: true` counts). A photo whose meta opens with K2 is already done.
  - The listing is the photos' progress: a photo already under K2 is skipped without a download, and one whose new name is already listed (a try that stopped before the delete) only has its old name deleted. So the record lists only photos left as they are for good (damaged), not every photo moved, which keeps the secret-storage record small.
  - One that doesn't fit by the listing's usage isn't downloaded, nor, for the rest of the launch, one the server refused with `storage_full`. `storage_full` or `conflict` leaves that photo and goes on with the rest; `limit`, `rate_limited`, `no_slot`, `photos_disabled`, or any other failure leaves the rest. A meta no key opens is left as it is; when the history can't be read, it waits for a later try.
  - Photos left under an older key are noted on the device (the account's id, in device-local storage, no key). Once a launch, with a session open and no change under way, the device moves them again with the history's photo keys (K1 is gone by then), and clears the note when none is left. An account that isn't a Supporter (`supporter_required`) can't put photos: the change notes nothing, and an earlier note waits for the account to be one.
  - Until then, Cloud Sync reads them under the old names: a photo the listing shows under a history entry's name opens with that entry's photo key, a reference not under its current name is looked up under each entry's name (and under the current name when listed under an old one since moved), and deleting a photo deletes every name the keys give it. Uploads always use K2's name. When both names are listed mid-move, the K2 copy is the one.

## Other devices

- **Signed out.** Every other session ends. Their next refresh is 401 `revoked`, and reopening with K1 is `key_retired`.
- **On `key_retired`** a device stops Cloud Sync, backup and Buddies, keeps its local data, and reads the stored key again. If its public key is the account's current one (an Apple device that received K2 through iCloud Keychain), it opens a session with it and rejoins. Otherwise it forgets the key on this device only: on Android and the web it deletes the stored key only when its public key is the retired one, and on iOS it never deletes the synchronizable item. It then shows that the key changed and how to sign back in: a passkey (one that was used for the change, or since used on a device holding K2), a QR code from a signed-in device, or the new recovery key. It never opens a new account.
- **Rejoining the same account.** A device that signs back in and finds the same `accountId` keeps its Cloud Sync bookkeeping and backup slot id (no Merge or Replace prompt, no Cloud Sync leave), resets only Buddies' local data, and pushes its offline edits through the normal merge. Cloud Sync's slots and photos are read again then: what this device opened, or couldn't open, under the retired key isn't reused. It remembers the last `accountId` in device-local storage for this.
- **Apple devices on the same Apple Account** receive K2 through iCloud Keychain, notice the key changed, and rejoin the same account without asking (ADR 0039 §8).
- **Passkeys** keep signing in. Each one saves a new wrap the next time it's used on a device holding K2 (ADR 0039 §7).

## Analytics

`account_key_change_started`, `account_key_change_completed`, `account_key_change_resumed` and `account_key_change_failed`, documented in [analytics.md](./analytics.md) with the flow. No keys, ids or device names.
