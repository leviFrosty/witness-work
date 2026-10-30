---
status: proposed
---

# Cloud Sync: end-to-end encrypted, realtime sync through ww-api

> Amended by [ADR 0040](./0040-sync-is-free-and-cloud-sync-carries-photos.md): sync is free for everyone (replacing §6's entitlement) and Cloud Sync carries photos (replacing §9's photo phase).

## Context

Sync today runs on the User's own cloud: the iCloud container on iOS and the
Google Drive app data folder on Android (docs/icloud-sync.md, ADR 0019). One
engine, `src/app/sync/iCloudSync.ts`, makes every decision and talks to
storage only through a `SyncTransport`. Each device writes its whole dataset
as `witness-work-<deviceId>.json`, and every device merges its peers' files
(records by id and `updatedAt`, tombstones, reset generations).

That leaves three gaps:

- An iPhone and an Android phone can't sync with each other: they're on
  different clouds.
- Changes arrive late. iCloud delivers another device's file when Apple gets
  to it, and Drive is polled once a minute while the app is open.
- Neither cloud encrypts the files end to end for us. iCloud Drive data is
  end-to-end encrypted only when the User has turned on Apple's Advanced
  Data Protection; Drive's app data folder never is.

Meanwhile the server account exists (ADR 0024, 0026, 0027): every device of
a User shares an account key, opens an attested session, and already uploads
the same payload to ww-api as an end-to-end encrypted backup (ADR 0026 §4).
The account's Supporter status is answered by the server (ADR 0029). Buddies
already streams changes to devices over a hibernating WebSocket.

The User wants sync to be the default, work across iPhone and Android, be
stored encrypted on our server, and stream changes down to a device as
another device writes them. Backups stay what they are: sealed point-in-time
snapshots.

## Decision

### 1. Cloud Sync is a third transport, and the engine is unchanged

`serverTransport` (`src/lib/syncTransport/server/`) implements
`SyncTransport` against ww-api. The engine keeps every decision: payloads,
merges, tombstones, reset generations, the Devices list, retries. Every
device of an account on Cloud Sync syncs with every other, iOS and Android
alike.

The transport's namespace is the account's slots. A device's slot is named by
its sync device id (`iCloudDeviceId`), so the engine's
`witness-work-<deviceId>.json` maps one to one onto a slot. Listing gives
each slot's ETag, size and server time; a pull downloads only slots whose
ETag changed since the last read, decrypts them, and hands the engine the
same JSON a file would hold. Photos aren't transferred in this phase (§9).

### 2. One sync option at a time

The User's decision: Cloud Sync is an alternative to iCloud and Google Drive
sync, not a layer on top of them. A device syncs through exactly one option:

- **Cloud Sync**: ours, cross-platform, always end-to-end encrypted.
- **iCloud** (iOS) or **Google Drive** (Android).
- **Off.**

So the engine runs on one transport at a time, chosen by the device-local
preference `syncProvider` (`'cloud' | 'platform'`, null until anything
chose), and never merges across transports. A device on iCloud doesn't see a
device on Cloud Sync; Settings says so where it matters (§6).

The account file (ADR 0011's shared RevenueCat id) stays in the platform
cloud whatever the sync option is: it isn't sync data, and Supporter status
now comes from the server account anyway (ADR 0029).

Rejected: **Cloud Sync on top of iCloud/Drive** (read peers from both
transports and dedupe by device id). It was the first proposal; the User
chose a single option, and it doubles every device's uploads, ties every
device's merge to the slowest transport, and keeps householder data in a
cloud we can't encrypt for the User who chose ours.

### 3. Defaults

- **A device that never chose** gets Cloud Sync. That's a new install, and
  an existing install whose sync is off without the User having turned it off
  (`iCloudSyncSetByUser` false). It turns on once Cloud Sync is available
  (the server's switch is on), the device is entitled, and it has a session,
  with no extra opt-in. It decides like today's Supporter auto-enable
  (`resolveInitialEnable`): an empty account seeds, a device without records
  pulls everything, and a device with records and an account with records
  waits for the User's Merge or Replace choice in Settings. So a new phone
  that signs in with a QR code or a recovery key gets everything streamed down
  without a restore step. The restore is still offered when the account's
  newest backup is clearly newer than every other device's slot: a phone that
  stayed on iCloud or Drive with backup on, beside a rarely used or retired
  device's stale slot. The newest data wins, not "any slot exists".
- **The account key.** Cloud Sync needs the account key and its session. A
  device that has the key (iCloud Keychain, Block Store, a QR code, a recovery
  key) opens its session for it. An entitled device without one creates it,
  as a Notes Import or route planning call already does, and then any other
  device of the User gets the same key by iCloud Keychain, Block Store, Set Up
  Another Device, or the recovery key. Creating it isn't silent about data:
  Cloud Sync with an empty account seeds it with this device's own data only.
- **A device already on iCloud or Google Drive keeps it** on upgrade, whether
  the User turned it on or Supporter auto-enable did. Their data doesn't move
  to our server without them choosing it, and their other devices, which may
  still run older versions, keep syncing with it. The brief named only the
  User's explicit choice; we keep the auto-enabled ones too, because moving
  them silently would split a working fleet in two (an older iPad would stop
  seeing the iPhone) with nothing on screen to explain why. Such a device is
  **offered the switch once**, in place in Settings → Sync, with the security
  reason (§6). Dismissing the offer keeps iCloud/Drive.
- **An explicit off stays off.** Turning sync back on in Settings offers both
  options, Cloud Sync first.
- **Before Cloud Sync is available.** While the server's switch is off, or
  without accounts (an old binary with no keystore), a never-chosen device
  behaves as before this ADR: Supporters get iCloud on iOS. Such a device then
  counts as "on iCloud" and gets the offer once Cloud Sync is available. This
  keeps a release that ships before the server switch harmless.

### 4. Switching never loses local data, and never touches other devices' data

Switching either way (`switchSyncProvider`):

1. Stops sync on the old transport: waits for the running push and pull, and
   flushes a pending push there first (best effort, bounded), so the devices
   still on it get this device's last edits.
2. Points the engine at the new transport and resets the bookkeeping that
   belongs to the old one's namespace: reset generation, Devices list,
   last-remote fields, upload status. The stored identity of the new
   transport (Apple Account, Google Account, or server account) is recorded
   now, so the switch isn't mistaken for an account change.
3. Reads the new transport's peers. If any exist it **joins** their newest
   reset generation and merges, exactly like the first-enable sheet's "Merge
   both": this device's records and theirs are kept, tombstones on either side
   win over older records, nothing is replaced. If none exist it seeds.
4. Pushes this device's merged state there.

The device's snapshot on the **old** transport:

- **Leaving iCloud/Drive: left in place.** It's a frozen snapshot that can't
  resurrect anything on the devices still using that cloud. Every record in it
  is at most as new as the moment of the switch, and a record deleted later on
  another device has a tombstone stamped after that, so the merge rule
  (tombstones win unless the active record is strictly newer) keeps it
  deleted. Tombstones never expire (only a deleted contact's details are
  redacted after 90 days, and the tombstone stays), so this holds forever. A
  reset on another device ignores and deletes it like any pre-reset file.
  Deleting it instead would lose this device's last edits for any peer that
  hadn't read them yet, including peers on older versions that will never move
  to Cloud Sync. The other devices' Devices list shows it as last synced then,
  and can remove it.
- **Leaving Cloud Sync: this device's own slot is deleted** after the flush
  in step 1. The User who leaves our server expects their data off it. The
  flush's put tells the account's open sockets at once (§5), so a Cloud Sync
  device in the foreground pulls those last edits within seconds. One that
  was offline or in the background since this device's last edits never gets
  them from Cloud Sync: they're still on this device, and reach it again only
  if both devices meet on one option. We accept that gap for the privacy
  promise, and Settings says so ("devices on Cloud Sync keep what they've
  already synced from it"), rather than keeping a slot the User asked us to
  remove.
- **Never another device's file or slot.** Only the explicit tools that
  already do so (Rebuild, "Keep this device's data", removing a device from
  the Devices list) touch other devices' snapshots, on whichever transport the
  device is on.

Switching back later is the same flow; the device's own frozen file (or a
new slot) is simply overwritten by its next push.

### 5. Server: one Durable Object per account, ciphertext in R2, a live socket

ww-api (`src/accounts/sync*.ts`):

- **`AccountSync`**, a SQLite Durable Object per account id, holds each
  slot's metadata (slot id, ETag, size, server time, the session that last
  wrote it), the account's change sequence, rate-limit counters, and the live
  sockets. The ciphertext is in R2 (`ACCOUNT_SYNC`: `ww-account-sync`,
  `ww-account-sync-dev`) at `v1/<accountId>/<slotId>`, since a snapshot can
  be up to 20 MiB and a Durable Object row can't.
- **Bearer routes** in the accounts style, ids in bodies and headers, never
  URLs: `GET /accounts/v1/sync` (the account's status), `POST
/accounts/v1/sync/put|list|get|delete`. A put is the raw blob with its slot
  id and SHA-256; the ETag is that SHA-256, and a put may carry `If-Match`.
- **`GET /accounts/v1/sync/live`** upgrades to a hibernating WebSocket. After
  every put or delete the DO sends `{"type":"changed","seq":…}` to the
  account's other sockets (not the writer's own slot), and the device pulls
  at once. `ping` gets `pong` without waking the DO. 20 sockets an account;
  the oldest closes when one more opens. The socket carries only change
  notices, never data: everything it prompts is fetched with the session's
  bearer token, so a revoked session's open socket learns only that
  something changed.
- **Limits**: 20 MiB a snapshot, 20 slots an account, one put a slot every 2
  seconds, 1,000 puts and 2 GiB an account a rolling day; puts count against
  the Buddies write edge tier and the rest against the read tier. The engine
  already debounces pushes by 5 seconds, so a device typing continuously puts
  at most 12 times a minute; the caps only stop scripted abuse.
- **Retention**: a slot that hasn't been written for 30 days, whose writing
  session has ended (signed out, revoked, replaced, expired), is deleted by
  the DO's daily alarm. Any slot not written for 400 days is deleted too, and
  R2's lifecycle rule (400 days) is the backstop. A device that leaves the
  account deletes its own slot (§7).
- **Deleting the account's data**: Delete Buddies on the account's last
  device (which deletes the account key) deletes every slot, as it already
  does with backups.
- The server sees ciphertext, sizes, times, slot ids and which session wrote
  each slot. It never logs or reports any of them, nor bodies or tokens.

Rejected: **puts inline in the DO** (no R2): the 2 MiB row cap is below real
datasets with notes. **Record-level deltas**: see §9.

### 6. Entitlement, switches, and what Settings says

- Sync is a Supporter benefit today, and stays one: ww-api answers puts,
  reads and the socket only for an account `isAccountSupporter` says is a
  Supporter (403 `supporter_required` otherwise). KV `sync:entitlement`
  (`supporter` or `everyone`) makes Cloud Sync free with one command. KV
  `sync:enabled` is the kill switch (503 `disabled`), falling back to the
  `SYNC_ENABLED` var. Deleting a slot and reading the status always work.
- `GET /app/v1/config` carries `sync: { enabled, entitlement }`, so a device
  without a session knows whether opening one would get it Cloud Sync, and
  `GET /accounts/v1/sync` gives the account's own answer.
- **A suspended account keeps syncing its own data**, as it keeps backing
  up: sync never reaches another person, which is what suspension stops.
- **Settings → Sync** shows the choice, Cloud Sync first, and why it's the
  more secure one, in plain words that stay accurate: Cloud Sync is always end
  to end encrypted, so only the User's own devices can read it; WitnessWork
  doesn't encrypt iCloud or Google Drive sync data end to end. (We don't
  claim iCloud is unencrypted: Apple encrypts it, and Advanced Data Protection
  can make it end to end. We claim only what we do.)
- **Mixed fleets**: when this device is on iCloud/Drive and the account has
  other signed-in devices, Settings says this device syncs only with devices
  on iCloud/Drive, and the others may be on Cloud Sync. On Cloud Sync it says
  it works across iPhone and Android.

### 7. Account changes

- **Leaving the account** (Sign In with QR Code or a recovery key to another
  account): before the key is replaced, the device flushes its pending push,
  deletes its own slot, and stops. It never touches the other devices' slots,
  which ADR 0026's handoff lessons require (a device leaving must not take
  the account's shared data with it). After the new key's session opens, the
  device is a never-chosen device on the new account (§3): a device without
  records pulls everything, one with records asks Merge or Replace.
- **A key change noticed later** (the stored server account doesn't match
  the session's) resets Cloud Sync's bookkeeping, like an Apple Account change
  does for iCloud, and decides again as above. Only a change of `accountId`
  counts: a new key for the same account (Change Account Key, ADR 0039, or
  signing back in after it) keeps the bookkeeping and the device's slot, so
  there's no Merge or Replace prompt and no leave, and offline edits go up
  through the normal merge.
- **Signed out remotely** (revoked from another device): the next call is
  401, the session client opens a new session (attesting again); the slot is
  rewritten under it.

### 8. The app

- The live socket runs only in the foreground, one per device (the Buddies
  socket's guards against duplicate sockets on Android), through the session
  client so it reconnects with a fresh token after a refresh. It reconnects
  with backoff, and on open compares the server's `seq` with the last one it
  pulled. Foreground catch-up and the connection returning pull as before.
- The engine's bookkeeping names (`iCloud…`) are kept; they describe
  whichever transport the device is on.
- Backup stays separate and available whatever the sync option is.

### 9. Later phases

- **Photos.** Cloud Sync carries photo references only, as iCloud does with
  photo transfer off; a device on Cloud Sync shows initials for a contact
  photo another device picked. Phase 2 adds encrypted photo blobs on the same
  account (Buddies' photo blobs are the model) with the same immutable
  revision names.
- **Deltas.** Each push uploads the whole dataset, debounced by 5 seconds.
  Phase 2 sends record-level changes (the engine's merge is already per
  record) and keeps the snapshot as the periodic base, so a typed note costs
  bytes, not megabytes.
- **Web clients** would use the same slots and keys.

## Consequences

- iPhone and Android sync with each other, and changes appear on an open
  device within seconds.
- Sync data on our server is ciphertext we can't read; losing every device and
  the recovery key loses it, as with backups.
- Every new install and every never-chosen existing install of an entitled
  User starts uploading its dataset to ww-api. R2 holds one snapshot per
  device; the caps bound abuse, not normal use.
- Mixed fleets are possible and confusing; the one-time offer and Settings'
  note are the mitigation. Devices on old versions keep iCloud/Drive.
- A device that switches leaves a frozen iCloud/Drive file behind, which other
  devices on that cloud merge harmlessly and can remove from their Devices
  list.
- Production needs, in order: the `ww-account-sync` bucket (every deploy's
  `r2-lifecycle.mjs` creates it), the DO migration, the server deploy, then
  KV `sync:enabled` on before the app release that defaults to Cloud Sync.
