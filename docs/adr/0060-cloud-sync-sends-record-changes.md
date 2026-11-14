---
status: accepted
supersedes: [0030]
---

# Cloud Sync sends record changes, and the snapshot becomes the base

> Carries out [ADR 0030](./0030-cloud-sync-through-ww-api.md) §9 "Deltas", and replaces the part of §5 that says the live socket never carries data.

## Context

Every Cloud Sync push uploads the device's whole dataset as one sealed blob, 5
seconds after any edit. Every other device then downloads that whole blob and
merges it record by record. Cloud Sync is about to be free for everyone, so it
goes from about 25 accounts to most of roughly 4,600 weekly users.

Production, measured 2026-11-14 UTC:

- A slot is 13.5 KB at p50 and 44.5 KB at most. A heavy test account has a
  2.3 MB JSON snapshot, so real accounts will pass today's largest.
- An account uploads 3.4 times a day at p50. 61% of a device's consecutive
  uploads differ by 4 bytes or fewer.
- `sync/put` takes 520 ms at p50 and 1,686 ms at p95 of server wall time, with
  about 6 ms of CPU. `sync/list` takes 299 and 1,391 ms. `GET /accounts/v1/sync`
  takes 828 ms at p50.
- One edit, sent as one sealed record, is about 521 bytes.

The wall time is I/O in sequence, not work. The same week shows where it goes.
`sync/photos/list` checks the token and the entitlement and makes one Durable
Object call: 53 ms at p50, 130 ms at p95. `sync/list` does the same and adds one
D1 read: 299 and 1,391 ms. The account's Durable Object runs near the User. D1
has one primary. A put adds a D1 session read, an R2 write, and a second Durable
Object call on top.

So the design has two jobs. Send only what changed. And put nothing on the
write path except the account's own Durable Object.

What must not change:

- ww-api sees only ciphertext, sizes and times.
- The engine's merge rules decide every conflict.
- Google Drive and iCloud keep whole snapshots.
- A device on an older app version, which knows only snapshots, keeps syncing
  with the User's other devices.

## Decision

### 1. A slot is a base and a tail of changes

Each device keeps its slot. The slot's snapshot is now its **base**: the same
blob, in the same R2 object, read and written by the same routes.

A device sends each edit as a **change**: one small sealed blob with only the
records that changed. A slot's changes that aren't in its base yet are its
**tail**. The base plus the tail is what the device's snapshot would hold today.

Changes live in the account's `AccountSync` Durable Object, in SQLite, each with
the next number of the account's one **sequence** (`seq` on the old routes).
Nothing about a change touches R2 or D1.

### 2. A change says how the slot's payload changed

The plaintext of a change is `{ v: 1, leaves, records, removedLeaves,
removedRecords }`. A path is the keys from the payload's root, joined by `/`:

- `records`: each added or edited record, whole, under its list's path (a
  contact under `contactStore/contacts`, a time entry under its year and
  month). A new tombstone is a record in its tombstone list.
- `removedRecords`: the ids that left a list.
- `leaves`: the new value of anything that isn't a record. Preferences, the
  profile, the reset generation and the Supporter claim are each one value,
  sent whole when they change. `writtenAt` and `calibratedClock` are in every
  change.
- `removedLeaves`: paths that are gone.

A reader keeps each other slot as its base plus the changes after it, and
applies them in sequence order. **The result is the payload that slot's
snapshot would hold.** The engine gets one payload a slot, as it does from a
snapshot, and passes it to `parsePayload` and `mergePayload`. So no merge rule
is written twice, and nothing that reads a slot's payload (reset generations,
the Devices list, the Supporter claim) had to change.

Sealed like a slot, under the same sync key, so the key history opens old ones:

- `changeId`: 16 random bytes, `b64u`, made by the device.
- `0x01 ‖ nonce[24] ‖ XChaCha20-Poly1305(syncKey, nonce, padded, aad)`.
- `aad = UTF-8("ww-account/v1/sync-change\n" + accountId + "\n" + slotId + "\n" + changeId)`.
- `padded = u32be(length) ‖ gzip(JSON) ‖ zeros`, so the sealed blob is a
  multiple of 256 bytes.

The padding hides which kind of record changed. A time entry and a visit are
both one or two 256-byte blocks. ww-api sees the slot, the padded size, the
time, and the key epoch of the session that sent it. It can't tell how many
records a change holds, or which.

One change holds at most 256 KiB. A larger set of edits (a big import) is
published as the base instead (§5).

### 3. What a device publishes

The device keeps a **fingerprint** for each record its slot holds: a short hash
of the copy it last sent. To publish, it builds the payload as today
(`buildPayload`), fingerprints each record, and puts the ones that differ in a
change. The fingerprints are saved on the device, so a relaunch doesn't upload
the dataset again.

- **Nothing changed, nothing is sent.** This replaces the whole-payload hash
  from PR #1374 on Cloud Sync. Drive still uses that one.
- **A device doesn't send back what it received.** It leaves out a record that
  another slot of the same reset generation already holds, unchanged. So an
  edit goes up once, from the device that made it.
- **It waits 300 ms** after the last edit, at most 2 seconds while edits keep
  coming, and at least 2 seconds after the change before. The wait is 5
  seconds today, because each push carried the dataset.
- **The base is published instead** when the device has no fingerprints for
  this slot (a new device, another account or account key, a browser's first
  write after a load), when its reset generation changes (Rebuild, "Keep this
  device's data", joining a newer one), when the slot is gone, and when the
  edits don't fit one change.
- **When another slot goes away** (a device left, was removed, or retention
  took it), the records only that slot held are no longer "held by another
  slot". The device's next push sends them, and the transport asks for that
  push at once. Otherwise those records would be on phones but in no slot, and
  a device that joins later would never get them.

### 4. Catching up

A device keeps a **cursor**: the sequence it has every slot through. It asks for
everything after it, in one request:

`{ afterSequence }` → `{ sequence, slots, changes, more }`

- `slots` is the listing, as `sync/list` gives it, plus each slot's
  `floorSequence` and `changedAt`.
- `changes` are other slots' changes after the cursor, oldest first:
  `{ sequence, slotId, changeId, keyEpoch, createdAt, blob }`.
- **A device downloads a base only when `floorSequence` is past its cursor.**
  Then it applies the changes after that floor.
- With nothing new, the answer is the listing and an empty list.
- A cursor of 0 means "everything": every base, then every tail.

The cursor moves only once every base and change of the answer is saved on the
device. It goes back to 0 when the account or the account key changes, when the
server's sequence is behind it, and when a slot the device should have isn't in
its store.

The device keeps the bases and changes sealed, as they came, and applies them
again at each launch. So a build that couldn't read a field, or a change from a
newer version, reads it again once it can, with no download. Until then that
slot shows as "newer version", as a snapshot from a newer app does today.

### 5. Compaction

Only a device can read its own changes, so only it can fold them into its base.
It does so by writing its snapshot, exactly as today, with one more header:
`x-ww-covers-sequence`, the sequence of its last change the snapshot includes.

- ww-api stores the base, deletes that slot's changes up to that sequence, and
  sets the slot's `floorSequence` to it.
- A device whose cursor is past that floor already has those changes. It
  doesn't download the base.
- A device whose cursor is behind it downloads the base, because the changes
  are gone.
- A base put **without** the header replaces everything: the whole tail is
  deleted and the floor is the new sequence, so every device downloads it. An
  older app's put is this case, and so are the "base instead" cases in §3.

A device compacts when its tail reaches 50 changes or 128 KiB. It does it when
the app leaves the foreground or at the next launch, never in front of an edit.
At 150 changes it compacts right after the change it just sent. ww-api refuses
a change when a tail holds 200 changes or 1 MiB (`tail_full`), and the device
then puts a base that replaces everything.

A reader does the same on its side. Once it holds 64 changes on top of a stored
base, it seals the result as its own stored base, so a launch never replays a
long tail.

### 6. The live socket carries the changes

Today the socket says only "changed", and each device then lists and downloads.
Now:

- After `hello`, a device sends `{ "type": "sync", "afterSequence": n }`. The
  Durable Object answers on the socket with the catch-up from §4. **A launch
  with nothing new is the socket upgrade and nothing else.** If the socket
  isn't open within 2 seconds, the device catches up over HTTP
  (`sync/changes/list`) instead.
- When a device puts a change, the Durable Object sends it, sealed, to the
  account's other sockets: `{ "type": "change", … }`. They apply it and merge,
  without a request.
- A full base put, a delete, and a photo change still send `changed`, and the
  device catches up.
- While a socket stays open, it gets every event in order, so the cursor moves
  with each one. After a reconnect the device asks again from its cursor.
- A socket that never sends `sync` belongs to an older app. It gets `changed`
  for base puts and deletes, as today.

ADR 0030 kept data off the socket so that a signed-out device's open socket
would learn nothing. To keep that:

- Each socket is bound to its session.
- Sign Out, a remote sign-out, and an account key change close that
  session's sockets at once.
- A session that a new one replaced at the device limit isn't named to the
  Durable Object. So every time a session opens, it checks each open
  socket's session in D1 again and closes the ones that ended.
- The Durable Object sends a change only to a socket whose session it confirmed
  live in D1 in the last 15 minutes. It checks after the writer has its answer,
  so no write waits for D1. If a close notice is lost, a signed-out device gets
  at most 15 more minutes of changes. That's what its last access token can
  already read over HTTP today.
- A browser's socket still closes when its token expires.

### 7. The write path is one Durable Object call

`POST /accounts/v1/sync/changes/put`: `{ slotId, changeId, blob }` as JSON,
with the sealed change in base64url. The ids are in the body because Workers
Logs record every request header (found while measuring the baseline). The
Worker verifies the token, reads the switches from the edge cache, reads the
body, and calls the Durable Object once. In one SQLite transaction it checks the limits, stores the change, takes
the next sequence, and sends it to the other sockets.

Answer: `{ ok, sequence, tailCount, tailBytes, snapshotReaders }`. If the
sequence is the device's cursor plus one, nobody else wrote, and its cursor
moves too.

What `sync/put` does that this doesn't, and why that's safe:

- **No R2 write.** Changes are small rows.
- **No SHA-256 header.** The AEAD tag already fails a damaged blob.
- **No D1 session read.** `sync/put` reads the session so that a signed-out
  device can't write over data re-sealed after an account key change (ADR
  0039). The Durable Object now holds the two facts that rule needs:
  - **The account's key epoch.** The rekey route tells it, and it also takes
    the highest epoch on any valid token. A token from before the change is
    401 `key_changed`, with no read.
  - **Sessions that ended.** Sign Out and a remote sign-out tell it which
    session ended, and it refuses that session until its last token has
    expired.

  If that second notice is lost, or the session ended another way (replaced
  at the device limit, or renewed), the device can add changes until its
  token expires, 15 minutes at most. It can't write over anything: a change
  only adds to its own tail. Base puts, deletes and re-seals keep the D1 read.

- **No D1 read for the entitlement.** The access token carries the session's
  capabilities (`sync-everyone`), so the check is the token and the cached
  switch. A token without them reads D1, as today.
- **Idempotent.** A retry with the same `changeId` gets the first answer. A
  change applied twice changes nothing.

The catch-up (`POST /accounts/v1/sync/changes/list`) is one Durable Object read
by the same rules. It leaves out `live`, which costs `sync/list` its D1 read.
The one flow that needs it (a browser clearing old browser slots) still calls
`sync/list`.

### 8. Tombstones and merge rules

Unchanged. A deletion travels as its tombstone in a change. A record added
again under a deleted id is stamped past its tombstone, as today. Records merge
by id and `updatedAt`, ties by content, and tombstones win unless the record is
strictly newer. Preferences merge per key and per entry.

Tombstones still never expire. A base holds all of them, and a change holds
only the new ones.

### 9. Reset generations

Each slot's payload carries its writer's `resetEpoch`, so the engine's rules
apply as they are:

- A slot from an older generation is ignored.
- Rebuild and "Keep this device's data" delete every slot, and with each slot
  its tail. Then they write a base with the new generation.
- A device publishes its base, never a change, when its generation changes. So
  a slot never mixes two generations.
- A record only counts as "held by another slot" (§3) when that slot is on the
  device's own generation.

### 10. Account key changes

- The device that changes the key folds its tail into its base first: step 0
  of `account-key-change.md` already pushes, and that push compacts.
- Step 5 re-seals other devices' changes as it re-seals their slots:
  `POST /accounts/v1/sync/changes/reseal` replaces one change's bytes and its
  key epoch. It keeps the sequence, slot and time, needs a live session, and
  works for 7 days after the change. The bytes move to the new key unread.
- A change that wasn't re-sealed stays under the old key. The key history
  opens it, as it opens a slot.
- Nobody can add a change with a token from before the key change (§7).
- A device that signs back in reads from cursor 0, as it reads every slot
  again today.

### 11. Limits and retention

- **20 slots an account**, unchanged. A tail belongs to its slot and is deleted
  with it.
- **A change**: 256 KiB. **A tail**: 200 changes and 1 MiB. So an account's
  Durable Object holds 20 MiB of changes at the very most, and a few KB in
  practice.
- **Rate**: 60 changes a slot a minute and 3,000 an account a rolling day, in
  the Buddies write edge tier. A device sends at most one change every 2
  seconds while edits keep coming, which is 30 a minute, so the limit only
  stops a client that runs away. Base puts keep their limits.
- **Retention** counts a change as a write: a slot is deleted 30 days after its
  last put or change once its writer's session has ended, and after 400 days
  whatever its session. A catch-up also marks the slot as seen, at most once a
  day, and that counts too. So a device in use doesn't have to upload its
  snapshot every day to keep its slot, as PR #1374 does.
- The account's Cloud Sync request counts a change as "this phone has written".

### 12. Older app versions

An older app reads and writes only snapshots.

- **It writes**: its put has no `x-ww-covers-sequence`, so the floor moves and
  every device downloads its base. Same cost as today.
- **It reads**: it would miss what's only in a tail. So ww-api notes the
  session of each `sync/list` that doesn't say `x-ww-sync-changes: 1`, and
  answers `snapshotReaders: true` while any session was noted in the last 14
  days. While that's true, a device still sends each edit as a change, and
  also compacts 5 seconds later, as it pushes today. Devices on this version
  get the edit in under a second and skip the base. The older device gets it
  as it does now.
- **It updates**: the session stays the same across an app update, so its
  first catch-up (or a list with the header) takes it off the list. A session
  that ends comes off too. An account is done paying for both paths as soon as
  its last device has updated, not 14 days later. The note is per session for
  this reason: every account starts with only older devices, and one mark for
  the whole account would keep each of them uploading bases for two weeks
  after it updated.
- **It comes back after 14 days**: it reads bases that may lack their tails,
  and its list sets `snapshotReaders` again. Each newer device compacts the
  next time it runs, and the older one pulls again.
- **`minAppVersion`**: once it passes the first build with changes,
  `snapshotReaders` is never true, and that code can go. The snapshot routes
  stay: they're the base.

A kill switch covers the new path: KV `sync:changes` (var `SYNC_CHANGES`). Off,
the change routes and the socket's `sync` answer `changes_disabled`, and
devices publish whole snapshots as today. `GET /app/v1/config` and
`GET /accounts/v1/sync` say whether it's on, so a device doesn't have to try.
Production starts off.

### 13. The web

The same protocol, with one difference. The browser keeps its cursor, its
fingerprints and the other slots in memory for the page load: its store doesn't
hold slots (`web-storage.md`). So each load reads every base, as it does
today, and its first write after a load is its base. After that it sends and
gets changes like a phone.

### 14. Photos

Unchanged. Photos stay sealed blobs under keyed names in their own bucket, and
a photo put or delete still sends `changed`.

### 15. The app

- All of this is in `src/lib/syncTransport/server/` and behind the transport
  (`recordChanges.ts`, `payloadDiff.ts`, `changeCrypto.ts`). Its read hands the
  engine one payload a slot, built from the base and its changes. Its write
  takes the payload and sends a change, a base, or nothing.
- The engine changed in three small places: the shorter wait before a push,
  not hashing the payload itself when the transport already skips unchanged
  writes, and a push when the transport asks for one (to compact, or after
  another slot went away).
- Sealed bases stay on the phone (`slotStore.ts`, PR #1374), and now the sealed
  changes, the cursor and the fingerprints too (`changeStore.ts`).
- Google Drive and iCloud take none of it.

### 16. What this folds in from the launch audit

- **The sync status read**, for a device on Cloud Sync. The catch-up carries
  `photos` and `requestedAt`, and it succeeds only for an entitled account, so
  the launch and each return to the foreground don't call
  `GET /accounts/v1/sync` (828 ms at p50). Settings, a refused catch-up, and
  devices not on Cloud Sync still call it.
- **Not** one socket per account, and **not** one launch read for the config
  and Scribe. Neither follows from this design.

## Targets

Measured at the end against the baseline, with the same scripts.

|                                         | Today                                                                       | Target                                               |
| --------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------- |
| Upload for one edit (sealed body)       | 13.5 KB p50, 44.5 KB max, the dataset                                       | 512 bytes for a typical record, whatever the dataset |
| Download on another device for one edit | The writer's whole slot, after a list                                       | The same sealed change on the socket, no request     |
| Requests for one edit, writer           | 1 `sync/put`                                                                | 1 `sync/changes/put`                                 |
| Requests for one edit, each open reader | 1 `sync/list` and 1 `sync/get`                                              | 0                                                    |
| `sync/put` server wall time             | 520 ms p50, 1,686 ms p95                                                    | `sync/changes/put`: 80 ms p50, 200 ms p95            |
| Catch-up server wall time               | `sync/list` 299 ms p50, 1,391 ms p95, then a get per changed slot           | `sync/changes/list`: 80 ms p50, 200 ms p95           |
| Launch with nothing new                 | 2 `sync/list`, 1 status read, the socket (and before #1374 a get and a put) | The socket upgrade, under 2 KB each way              |
| Edit shown on another open device       | 5 s wait, then put, list and get                                            | About 1 second                                       |
| Uploads when nothing changed            | 61% of puts                                                                 | None                                                 |

The wall-time targets come from `sync/photos/list`, today's one route with this
shape (53 ms p50, 130 ms p95).

## Considered options

- **Hand each change to the merge as a partial payload**, with no copy of the
  other slots kept in the transport. It was this ADR's first design. Rejected
  while building it:
  - `parsePayload` validates a whole payload, and the preference merge reads
    per-entry stamps that a partial payload doesn't carry.
  - Reset generations, the Devices list, the Supporter claim and the restore
    offer all read every slot's whole payload on every pull. Each would need
    its own memory of the last base.
  - Applying changes to a kept base gives the engine exactly what a snapshot
    gave it, so the whole existing test suite runs on the new path unchanged.
- **One record store for the account**, as Shared Cars has (ADR 0056): ww-api
  keeps the newest sealed copy of each record under a random id. It needs no
  compaction and stores the data once. Rejected:
  - ww-api would learn the User's record count, each record's size, and how
    often each one changes. For householder data that's more than ADR 0030
    promised.
  - Cloud Sync's merge is more than "newest stamp wins" (ties by content,
    deleted contacts that keep details, definitions with alias ids, pet
    history, per-entry preferences). The server can't apply it to ciphertext.
  - An older app can't read it, so every account would run both systems until
    `minAppVersion` moved.
  - Reset generations, the Devices list, key change and the restore offer are
    all built on slots.
- **A device sends back what it merges**, so every slot always holds
  everything. Simpler to reason about, but each edit costs one more write for
  each other device, and every device receives every copy. The rule in §3 for a
  slot that goes away keeps the same guarantee at a cost paid only then.
- **Field-level changes or binary diffs.** A whole record is already about 500
  bytes, and the merge is per record. A diff needs a shared base version, which
  is the bug class this design avoids.
- **Changes in R2.** Each would cost the R2 write that makes today's put slow.
- **Writes over the socket.** It would skip the Worker, but a write needs the
  token's key epoch, an answer the retry logic understands, and a path that
  works when the socket doesn't. HTTP is one hop already.
- **Keep the socket notice-only.** It keeps ADR 0030's rule with no session
  binding. It costs each open device a request for each edit, and each launch a
  second request. The 15-minute rule in §6 gives a signed-out device nothing
  that its token doesn't already.
- **A D1 session read on every change**, as `sync/put` has. It's the slow step
  in the baseline. §7 keeps what the read is for.
- **Compaction on the server.** It can't read the changes.
- **No padding.** It saves about 150 bytes a change, and tells ww-api whether
  the User logged time or wrote a visit.
- **Every device downloads every base once a day**, as a safety net. At 2.3 MB
  a device that's megabytes a day for no edit. The safety nets are the ones in
  §3 and §4: base instead of changes whenever the fingerprints can't be
  trusted, and cursor 0 on a new app version.

## Consequences

- An edit costs hundreds of bytes and one short request, and a quiet launch
  costs the socket.
- Changes sit in the account's Durable Object. R2 is written only for bases.
- ww-api sees more events than before: one padded size and one time for each
  edit, where it saw one for each snapshot. It still can't see what changed.
- The Durable Object becomes the authority for two facts D1 owns: the key
  epoch and ended sessions. Every route that ends a session, and the rekey
  route, must tell it. A missed notice is bounded at 15 minutes.
- The live socket carries the User's sealed data, which ADR 0030 said it never
  would. §6 says what keeps a signed-out device from getting it.
- The device keeps fingerprints, a cursor, and each other slot's base and
  changes. If any of it is lost, the cost is one whole upload or one whole
  download, not lost data.
- Each pull still parses and merges every other slot's whole payload on the
  device, as it does today. That's CPU on the phone, not bytes or requests.
- An account with a device on an older version pays for both paths until that
  device updates, signs out, or goes quiet for 14 days. The same holds after
  the kill switch was off for a while: a device that synced whole snapshots
  then counts as an older one until its next catch-up.
- Order: ww-api first with `sync:changes` off, then the app build, then the
  switch on in dev and Beta, then production with the release.
