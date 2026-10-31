# Cloud Sync photos and the Cloud Sync request

The wire contract for photos over Cloud Sync and for the account's "turn on Cloud Sync" request, between the app (`src/lib/syncTransport/server`, `src/app/sync`) and ww-api (`ww-api/src/accounts/sync*`). The decisions are [ADR 0040](./adr/0040-sync-is-free-and-cloud-sync-carries-photos.md) §5 and §6; Cloud Sync itself is [ADR 0030](./adr/0030-cloud-sync-through-ww-api.md) and "Sync" in [accounts-protocol.md](./accounts-protocol.md#sync). Buddies' shared photos ([buddies-protocol.md](./buddies-protocol.md#shared-photos)) are the model.

Every op here is **Bearer**, with the account session's token. Ids and names travel in bodies and headers, never URLs. Errors use the Buddies error envelope and codes.

## Photos

A photo travels as an end-to-end encrypted blob stored once under the account, with an immutable name per revision. The sync payload already carries each photo's reference (an avatar's `icloud://` marker and revision, a note photo's id); the blob is the bytes behind it.

### Keys and names

| Value     | What it is                                                                                                                 |
| --------- | -------------------------------------------------------------------------------------------------------------------------- |
| Photo key | `HKDF-SHA256(accountKey, "", "ww-account/v1/sync-photo", 32)`                                                              |
| Name key  | `HKDF-SHA256(accountKey, "", "ww-account/v1/sync-photo-name", 32)`                                                         |
| Filename  | The sync engine's photo filename ([icloud-sync.md](./icloud-sync.md#photos)), the same on every transport                  |
| Name      | `b64u(HMAC-SHA256(nameKey, UTF-8(filename)))`, 43 characters: what the server knows the photo by                           |
| Digest    | `b64u(SHA-256(blob))`, 43 characters: the photo's `sha256` and `ETag`                                                      |
| Meta      | The filename sealed under the photo key (below), so a device can list the account's photos without downloading any of them |

Filenames are `witness-work-img-contact-<id>--<revision>.jpg`, `witness-work-img-profile--<revision>.jpg`, and `witness-work-note-<id>.jpg`. A new photo is a new revision, so a new filename and a new name: a name's bytes never change. Only those names travel on Cloud Sync. A legacy avatar whose filename has no revision gets a revision (a record edit) before its photo is put, because legacy names were last-writer-wins on iCloud.

The name is keyed, so the server can't read which record a photo belongs to or link a contact's revisions. Sizes and times may still hint at a photo's kind.

### The blob

`0x01 ‖ nonce[24] ‖ XChaCha20-Poly1305(photoKey, nonce, bytes, aad)`, with `aad = UTF-8("ww-account/v1/sync-photo\n" + accountId + "\n" + name)`. `bytes` is the photo file exactly as the device saved it: the original, never re-encoded or resized, and not gzipped (JPEG doesn't compress). A blob moved to another name or account doesn't open.

The meta is `b64u(0x01 ‖ nonce[24] ‖ XChaCha20-Poly1305(photoKey, nonce, UTF-8(JSON), metaAad))`, with `metaAad = UTF-8("ww-account/v1/sync-photo-meta\n" + accountId + "\n" + name)` and the JSON `{ "v": 1, "filename": "…" }` padded with trailing spaces to 256 bytes, so every meta is the same length. At most 512 characters. The server stores it as given and returns it in listings; it can't read it. After opening one, a device checks that `HMAC(nameKey, filename)` is the listed name and that the filename is a valid photo filename, and skips the photo otherwise.

### Ops

| Op                                     | Request                                                                        | Response                                                                   |
| -------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| `POST /accounts/v1/sync/photos/put`    | The blob; `x-ww-photo-name`, `x-ww-sha256`, `x-ww-photo-meta`, `x-ww-slot-id`? | `{ ok, name, size, sha256, createdAt, existed, usage }`                    |
| `POST /accounts/v1/sync/photos/list`   | `{ cursor? }`                                                                  | `{ ok, photos: [{ name, size, sha256, createdAt, meta }], cursor, usage }` |
| `POST /accounts/v1/sync/photos/get`    | `{ name }`                                                                     | The blob, `application/octet-stream`; `not_found` without it               |
| `POST /accounts/v1/sync/photos/delete` | `{ names }` (1–100), or `{ all: true }`; `x-ww-slot-id`?                       | `{ ok, usage }`                                                            |
| `GET /accounts/v1/sync/photos/usage`   | None                                                                           | `{ ok, usage }`                                                            |

`usage` is `{ bytes, count, limit }`: the account's live photos' total blob size and number, and its storage limit in bytes.

- **`photos/put`** sends the blob as the raw body (`application/octet-stream`) with its size as `Content-Length`. A body whose SHA-256 isn't `x-ww-sha256`, or a malformed name or meta, is `bad_request`. The server always reads the body to the end before it answers.
  - **Names never change.** If the account already has a live photo with that name, nothing is written and the answer is `existed: true` with the stored photo's `size`, `sha256` and `createdAt`, whatever the body.
  - **A deleted name comes back.** A put for a name deleted within the last 30 days stores the new blob under a new object and makes the name live again; it counts toward storage again. The purge deletes only the deleted put's object, so it can't take the photo that came back.
  - **Storage full.** A put that would take the account's live photos over `usage.limit` is **429 `storage_full`**, without `Retry-After` (only the User freeing space fixes it), with `usage` in the body, and stores nothing. The limit is checked when the put starts, against live photos plus the space other uploads have reserved, and again when it commits. A reservation lapses if its commit doesn't come within 2 minutes.
  - **Races.** A put whose name is deleted while it uploads is 409 `conflict`, and so is a put whose upload outlives its 2-minute reservation; nothing is stored. A put of a name deleted while another put of it uploads is 429 `rate_limited` until that put ends. A put on an account that has no slot is 409 `no_slot`, also when the account's last slot goes while it uploads: photos exist only for Cloud Sync's devices, and the engine publishes its snapshot before its photos.
  - `createdAt` is the server's time (epoch ms) the photo became live: the transport's `modifiedAt` for it.
- **`photos/list`** gives live photos only, ordered by name, at most 1,000 a page. `cursor` is opaque; pass it back for the next page, and it's `null` on the last. Every page carries the current `usage`.
- **`photos/get`** answers with the blob exactly as put, `ETag: "<sha256>"`, `x-ww-created-at`, and `Cache-Control: no-store`. A deleted, purged or unknown name is `not_found`.
- **`photos/delete`** is idempotent: unknown and already deleted names are `ok`. A deleted photo stops counting at once, is no longer listed or served, and its R2 object is purged 30 days later. `{ all: true }` deletes every live photo of the account and needs a live session (`requireLiveSession`), as deleting every slot does.
- **Change notices.** A `photos/put` that stores a photo, and a `photos/delete` that deletes one, advance the account's `seq` and send `changed` on the live socket like `sync/put` does. The socket of the slot in `x-ww-slot-id` (the writing device's own) isn't told; a malformed `x-ww-slot-id` is `bad_request`. Every pull runs the engine's photo pass, so another device fetches a photo as soon as it's there.
- **Every slot.** `sync/delete` without `slotId` (Delete Buddies on the account's last device) deletes every photo too. An account with no slot for a day (every device left Cloud Sync, or retention deleted their slots) has its photos deleted the same way by the daily alarm, which checks again just before deleting. A slot put restarts that day. Photos are there for Cloud Sync's devices; a device that comes back uploads its photos again.

### Switches and limits

- `photos/put`, `photos/list` and `photos/get` are 503 `disabled` while Cloud Sync's kill switch is off, and 403 `supporter_required` when the account isn't entitled, exactly as `sync/put` is. `photos/delete` and `photos/usage` always work.
- **Photos' own switch:** KV `sync:photos` (`on` or `off`; absent or unreadable, the `SYNC_PHOTOS` var, else on), edge-cached for 60 seconds. While it's off, `photos/put` is 503 `photos_disabled` with `Retry-After`, and the other photo ops keep working, so devices can still read and delete what's stored. Without the photo bucket, `photos/put` and `photos/get` are `photos_disabled`, and list, delete and usage keep working. `photos_disabled` never pauses the rest of Cloud Sync.
- **Storage:** 2,000,000,000 bytes (2 GB) of live photo blobs an account. The `SYNC_PHOTO_LIMIT_BYTES` var overrides it, for tests and for trying the full state on a local or dev worker.
- **One photo:** 25 MiB a blob (`too_large`, 413, refused from `Content-Length` before the body is read). 20,000 live photos an account (`limit`, 429 without `Retry-After`, for a new name only).
- **Rates:** one put a name at a time; 20,000 puts and 4 GiB of stored puts an account a rolling day (stored and `existed` puts count toward the 20,000, refused ones don't, and only stored puts add bytes); 50,000 gets an account a rolling day (`rate_limited`, 429, with `Retry-After`). `photos/put` counts against the Buddies photo-upload edge tier, the rest against the read tier.
- **Retention:** a live photo stays while its account uses Cloud Sync; R2 has no age rule for photos, because they're written once. Deleted photos are purged by the `AccountSync` Durable Object's alarm 30 days after deletion.
- A suspended account keeps syncing its photos.
- `disabled` (503) without the accounts database, as for the rest of Cloud Sync.

### Server storage

- The `AccountSync` Durable Object of the account (ADR 0030 §5) holds each photo's row: name, size, digest, meta, the current put's id, `createdAt`, and `deletedAt` once deleted; the account's live usage and reservations; the photo rate counters; and the purge alarm.
- R2 bucket `ACCOUNT_PHOTOS` (`ww-account-photos`, `ww-account-photos-dev`), key `v1/<accountId>/<name>/<putId>`, with `putId` random for each put. It's apart from the snapshots' bucket because that bucket's 400-day age rule would delete photos that are never rewritten.
- The server sees blobs, sizes, digests, sealed metas, keyed names and times. It never logs or reports any of them, nor bodies or tokens.

### The app

- **Transport.** `serverTransport`'s binary methods are these ops: `writeBinary` seals the file and puts it, `readBinary` gets and opens it, `listBinaryFiles` lists every page and opens each meta, and `deleteBinaryFile` and `deleteAllBinaries` delete. For a photo the listing returned, the transport uses the listed name rather than computing it again. The engine's photo passes (upload after the JSON that refers to a photo, download of referenced photos this device doesn't have, cleanup) run on Cloud Sync as they do on iCloud and Google Drive.
- **Consent.** On Cloud Sync, photos travel without the "Include photos" setting: they're end-to-end encrypted like the rest of the data (ADR 0040 §6). That setting stays what it is for iCloud and Google Drive.
- **On demand.** A device downloads only the photos its records refer to and it doesn't have yet, after a pull, and keeps them as local files. It never mirrors the account's photo store.
- **Deleting frees space right away.** When the User replaces or removes a photo (a contact's or the profile's photo, a photo taken out of a note), the device deletes the old photo once the JSON without it is published. A deleted contact's photo stays while the contact can be restored, and cleanup of other photos nobody refers to keeps its one-day grace.
- **A deletion stays deleted.** A put brings a deleted name back, so a device doesn't put back a photo it saw on the server that's gone from the listing: another device deleted it, and this device's records (or the snapshot it last published) may not have caught up. It pulls first, and puts the photo again only if its records still refer to it after a pull that started since: a newer edit here kept it (records merge last-writer-wins, ADR 0030), or every photo of the account was deleted. The deleting device published its JSON before deleting, so that pull has it. A photo the device never saw there (a new one, or one from iCloud or Google Drive) is put at once.
- **Storage full.** `storage_full` and the photo `limit` mark the photo `storage-full` in the photo bookkeeping. The photo stays on the device that added it, with a "Not synced: storage full" badge where it's shown; Settings → Account shows "Storage full". Photos already synced are untouched. A full account is retried when the app returns to the foreground and when the account's usage drops (a photo deleted here, or a change notice), never on every edit. `too_large` marks only that photo as not synced, and doesn't show "Storage full".
- **Usage.** Settings → Account shows the account's photo storage (`usage.bytes` of `usage.limit`) while the device is on Cloud Sync.
- **Changing the account key** (ADR 0039) re-seals every photo under the new key's photo and name keys, as it re-encrypts the slots.
- **Older app versions** ignore photo references they can't transfer, and show initials as they do today.

## The Cloud Sync request

The web works only with Cloud Sync (ADR 0037). When a browser signs in to an account whose phones aren't on Cloud Sync, it asks them to switch (ADR 0040 §5).

### Ops

| Op                               | Request                                                              | Response              |
| -------------------------------- | -------------------------------------------------------------------- | --------------------- |
| `POST /accounts/v1/sync/request` | `{ requested: true, payload, signature }`, or `{ requested: false }` | `{ ok, requestedAt }` |

- `requested: true` records the request and answers its time (epoch ms). It's Bearer **and** a self-signed envelope (op `sync/request`; payload `accountPub`, `ts`, `nonce`) whose account must be the token's, as `backup/delete` is: a leaked access token alone can't move the User's phones. It needs Cloud Sync's kill switch on (503 `disabled`) and an entitled account (403 `supporter_required`). Asking again while a request stands keeps its `requestedAt` and restarts its 30 days.
- Each envelope is good once: a reused nonce is 409 `replay`, so a captured one can't raise a withdrawn request again.
- `requested: false` withdraws it (`requestedAt: null`). Bearer only; always works, and is idempotent.
- **It clears itself** once every live phone session of the account (platform `ios`, `android` or `dev`) has written a slot since `requestedAt`, or 30 days after it was last asked for. An account with no live phone session has nothing to wait for, so the request clears at once. Phones never clear it, so one phone switching doesn't strand another on iCloud or Google Drive.
- Stored in the account's `AccountSync` Durable Object. Not in the activity log: it changes no one's access.

`GET /accounts/v1/sync` adds two fields to the account's status:

- `requestedAt`: the standing request's time, or `null`;
- `photos`: whether photos' switch is on.

Each slot in a `sync/list` answer adds:

- `platform`: the platform of the session that last wrote it (`ios`, `android`, `dev`, or `web`);
- `live`: whether that session is still live.

`platform` is `null` for a slot written before platforms were kept whose session is gone; `live` is `true` when the server couldn't read the sessions.

### The app

- **Phones.** A phone reads the status when it opens and when it returns to the foreground. With a request standing, once onboarding is done, a phone not on Cloud Sync switches to it (`switchSyncOption`, ADR 0030 §4: it merges, so nothing is lost), and shows a toast. That includes a phone whose sync the User turned off: the request is the User's own choice, made from a browser that holds the account key. A phone acts once per `requestedAt`, so a User who moves it back afterwards isn't overruled. A switch that can't happen yet (offline, no session) tries again at the next foreground.
- **The web.** After signing in, the web lists the account's slots. A slot written in the last 30 days by a live `ios`, `android` or `dev` session means a phone is on Cloud Sync, and the web goes on. Without one, on an account with phone sessions, it shows "Turn on Cloud Sync to use WitnessWork here" (Turn On and Sign Out). Turn On sets the request; the web then says "Open WitnessWork on your phone to finish" and waits for such a slot. When every phone session of the account runs an app version older than the first one that reads `requestedAt`, it says "Update WitnessWork on your phone" instead. It reads each session's app version from the devices list (`appVersion`); a session whose version isn't known counts as new enough. Only `ios`, `android` and `dev` sessions count as phones, as when ww-api clears the request. An account with no phone sessions is a web-only account: the web goes on and starts Cloud Sync itself.
