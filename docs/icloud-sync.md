# Sync: Cloud Sync, iCloud, and Google Drive

Each device syncs through exactly one option ([ADR 0030](./adr/0030-cloud-sync-through-ww-api.md)):

- **Cloud Sync**: the account's end-to-end encrypted slots on ww-api, one per
  device, on iPhone and Android alike. See [Cloud Sync](#cloud-sync).
- **iCloud** on iOS: a private iCloud Drive container.
- **Google Drive** on Android: the hidden app data folder
  ([ADR 0019](./adr/0019-android-sync-over-google-drive-app-data.md)).
- **Off.**

One engine (`src/app/sync/iCloudSync.ts`) makes every sync decision and reads
and writes only through a `SyncTransport` (`src/lib/syncTransport/types.ts`):
`activeSyncTransport()` (`src/lib/syncTransport/provider.ts`) is the option's.
Everything below applies to all three except where a section says otherwise.
Devices on different options don't sync with each other, so an iPhone and an
Android device sync only through Cloud Sync. Sync is free for everyone
([ADR 0040](./adr/0040-sync-is-free-and-cloud-sync-carries-photos.md)): iCloud
and Google Drive have no Supporter gate, and Cloud Sync needs what the server's
`sync:entitlement` says (`everyone`, or a Supporter while it's `supporter`).
Every option needs this device's opt-in.

## Data and identity

Each installation writes `witness-work-<deviceId>.json`. Pulls read and merge
foreign snapshots, excluding the account file and this installation’s own file.
One-shot restore also excludes the current device’s snapshot. Keep legacy JSON
files after absorbing them: an older app may write between our read and a delete.

JSON carries contacts, visits, time entries, day plans, recurring plans,
categories, custom field definitions, mileage (cars, fuels, price and car setup
histories, trips, and one shared tombstone list in the optional `mileageStore`
slice), the Pet Companion (its pet and room records and their tombstones in the
optional `petStore` slice; hearts aren't stored, every device replays them from
the records above, ADR 0030), shared preferences, and profile data.
Saved Views for the Contacts list are a shared preference; which view a device
is showing, and its unsaved edits, stay on that device. A view this build can't
read (e.g. a filter from a newer version) is skipped with its stamp, leaving the
local copy as is, rather than failing the payload.
Photo references travel even when photo transfer is off; local filesystem paths
and photo metadata do not. Device identity, onboarding progress, sync controls,
address prefill, data protection mode, and analytics consent remain local.
`syncPreferencePolicy.ts` is the incoming/outgoing exclusion policy.

Buddies isn't in the payload: its key is in iCloud Keychain, and buddies,
answers, and the bell's read and dismissed entries travel in the end-to-end
encrypted roster on the relay. Sync matters to it in one way: a device with
sync on, that has pulled once, starts Buddies by itself when the Keychain
already holds the User's Buddies key, because its Plans (and so its Buddy Card)
match the User's other devices. See "Another of the User's devices" in
[buddies-protocol.md](./buddies-protocol.md).

### One RevenueCat customer per account

Each payload carries its writer's RevenueCat **claim** in the optional
top-level `revenueCat` (ADR 0040 §7): `{ appUserId, entitled, claimedAt }`, the
RevenueCat app user id the device is logged in as (ADR 0011's account id),
whether it's a Supporter under it, and when that id was first claimed. On Cloud
Sync it's inside the encrypted slot with the rest. Older versions drop the
unknown key and read the payload as before; a claim this version can't read
(an anonymous id, a missing field) is dropped on its own, never the file. The
id is never shown, logged, or reported (ADR 0029 §2). The account backup leaves
it out.

`AccountProvider` reconciles over every claim the device can see, its peers'
payloads on its sync transport, the account file on iCloud or Drive, and its
own, with `decideAccountReconcile` (`src/lib/accountClaim.ts`):

- **The winner** is the same on every device: entitled beats un-entitled, then
  the earliest `claimedAt`, then the smaller id. Claims are taken per id first:
  an id is entitled when any claim for it says so, and claimed at its earliest.
- **An un-entitled device adopts the winner** (`Purchases.logIn`,
  `adoptAccountId`, then the ADR 0029 link as `adopted`). The adopted id keeps
  the winner's `claimedAt`, so a later device can't out-date it.
- **An entitled device never gives up its id**; two entitled ids both stay.
- **The account file** keeps ADR 0011's handling: claimed when missing, claimed
  over by an entitled device, refreshed when its flag disagrees. A device whose
  claim beats an un-entitled file takes the file over, so devices that read
  only the file (older versions) follow. The file adds `claimedAt`; older
  writers drop it and it reads as `updatedAt`.
- **Without RevenueCat** (Android without an SDK key), a device still adopts
  the id and publishes its claim (never entitled), so it's the right customer
  once RevenueCat is there. A device that signs in to an account later adopts
  that account's earlier id by the same rule.

A claim from a device that stopped syncing stays until it's removed from the
Devices list. If it's stale-entitled, un-entitled devices stay on its id; the
account's Supporter status on ww-api (below) still unlocks them.

`useIsSupporter` also accepts ww-api's answer for the account (`GET
/accounts/v1/supporter`, and what each link answers) when RevenueCat doesn't
say Supporter, until its `expiresAt` (or with no end). The answer is kept in
device-local MMKV with a hash of the account it was read for: another account
key, or no session, doesn't count it, and offline keeps the last one. It's read
when a session opens, after a link, and otherwise at most every 4 hours on
launch or foreground, or sooner once it has expired
(`src/lib/serverAccount/serverSupporter.ts`). `since` stays RevenueCat's date,
so it's null on the server's answer alone: Settings shows "You're a supporter"
without a year. The dev override still wins in dev builds.

The account backup ([accounts-protocol.md](./accounts-protocol.md#backup))
uploads the same payload, end-to-end encrypted, to ww-api, without its
`resetEpoch`. Its restore validates each slot with `parsePayload`, folds with
`foldRemotePayloads`, and replaces (`replaceLocalWithRemote`) or merges
(`mergeIntoLocal.ts`, as a pull does), keeping this device's reset generation
and pull bookkeeping, so sync here merges the restored records with its cloud.

JSON backups additionally include categories, mileage, the pet, and profile. Restoring a backup
preserves installation identity and local consent/settings, including backups
created by older versions that included them. Missing optional stores are kept.
Photo bytes are not embedded in JSON backups.

## Merge rules

Records merge by id and `updatedAt`; an equal timestamp uses canonical content
ordering so both devices choose the same result. Local photo paths and OS
notification identifiers do not participate in that comparison. Tombstones win
unless an active record has a strictly newer timestamp. A record added again
under a deleted id (an import run again after its Undo) is stamped past its
tombstone (`stampPastTombstone`), so it outlives the copy other devices keep
even when that tombstone is stamped ahead of this clock. Change detection compares
the final result, including tombstone contents, after deletions are applied.
Deletion ids are retained without a wall-clock expiry; recoverable contact details
have a separate expiry below.

Goal overrides, report comments, publisher hours, Saved Views, and Role History
merge per entry. `preferenceUpdatedAt["<key>:<entry>"]` records a value change or removal.
Membership changes in submitted-report months and seen-tip ids use the same
rule. Older payloads fall back to the enclosing preference timestamp.

Sync timestamps use a best-effort HTTPS Date calibration from the existing
public ww-api health endpoint. No ministry data is sent there. A cached clock
offset works offline; edits advance past their predecessor even if wall time
moves backwards. Calendar dates and appointment times keep their existing
calendar semantics. Legacy writer stamps can be translated using the container
content date; new calibrated payloads are not promoted by replication delays.
Future metadata is bounded. Offline calibration and legacy container dates
cannot provide perfect chronological ordering; equal conflicts still converge.

Legacy record backfill and migrated definitions use the deterministic stamp `1`.
Old label migrations produce stable ids. Reconciliation collapses identical
category/field definitions, rewrites references, and records alias ids so stale
peers and deletions can be reconciled. Custom fields with conflicting values on
a contact remain separate to preserve both values.

On both iOS and Android, deleted contact details remain recoverable for 90 days, then are redacted while
retaining deletion evidence. Undated legacy deletions get a 90-day grace period
from their first observation. Data protection erasure remains immediate.

## Runtime and recovery

`installiCloudSync` subscribes to stores (`subscribeToLocalDataChanges`, which
the account backup uses too) and availability/foreground events.
Changes set a persisted pending-push flag before scheduling the five-second
write. Failed writes back off: 5 s, 20 s, 1, 2, 5 and then every 15 min while
active (at least 1 min when throttled, 15 min when the account is full), and
edits made meanwhile wait for that retry instead of each uploading. Coming back
to the app, Sync now, and the connection returning start the backoff over. The
flag survives readiness changes, backgrounding, and relaunches. A successful
snapshot only clears pending changes if it covers the current edit generation.

Every push uploads the whole dataset (and on Drive a new file every other device
downloads), so foreground catch-up pushes only when edits are pending, a merge
changed local data, this device's snapshot is missing from the listing, or this
launch hasn't published yet. It runs on a real return from the background
(`addForegroundListener`; iOS `inactive` blips such as Control Center don't
count), and returns within 30 s of the last one only push pending edits.
Leaving the foreground (including `inactive`) still flushes a debounced push.

Catch-up waits for the metadata scan, pulls, writes deferred data, then handles
photos. A push resolves once its JSON is written; photos upload as their own
single-flight job. Writes, deletes and photo transfers time out after 60 s and
reads after 120 s, keeping the pending flag, so a call that never settles can't
block later syncs. Malformed files are rejected independently; healthy peers can
still merge. Incomplete reads, invalid files, newer payload versions, and
pending pushes are visible in Settings, as are offline ("Waiting for
connection"), throttled and full-account failures, from the transport's error
code (`iCloudSyncErrorCode`); iCloud bridge errors are classified the same way
as Drive's. Sync now reports incomplete/failed work, says when the device is
offline or Google Drive needs reconnecting instead of trying, and is disabled
while a sync runs. A local coordinated write is still not confirmation that
Apple uploaded it.

Supporter status never pauses sync. A device an older version paused for a
Supporter lapse resumes: the preferences store's v16 migration drops
`iCloudSyncPausedForLapse`, and the enable choice was kept. Auto-enable
conflicts set a visible notifications-tray prompt; they do not silently
overwrite data. An explicit off choice stays off. Restart onboarding is local;
Set up fresh disables sync until the user explicitly enables it again. On a new
install whose sync never ran, skipping the restore in onboarding isn't that
choice: the default turns sync on after onboarding (`freshSetupPreferences`).

Restore/replacement and JSON imports suppress Buddies declines for missing linked
plans. User-initiated plan deletion still declines. Reminders are rebuilt from
current contact/visit/plan intent on launch, foreground, merges, and restores on
both platforms, with local OS identifiers, saved custom offsets, permissions,
and a 60-future-reminder cap. Deletions/reschedules cancel obsolete local ids.
Reminder intent is `notifyMe` plus `reminderOffsetMinutes` (minutes before the
start), which syncs; `notifications[0].date` keeps the fire time for older app
versions. Forms never call the OS: `useReconciledReminders` is the only
scheduler, and it also removes delivered reminders for erased records.

“Keep this device” and “Rebuild iCloud data” delete saved snapshots and photos,
reclaim the account file, and write the local snapshot. Failures are surfaced.
These operations do **not** command other devices to replace their local data;
other devices can send their records back later. A distributed reset marker is
part of the separate Critical audit work.

## Photos

Photos have an immutable revision in their reference and filename:
`witness-work-img-contact-<id>--<revision>.jpg` or
`witness-work-img-profile--<revision>.jpg`. Legacy filenames remain readable.
Picking/cropping a new photo creates a new revision and immutable local cropped
and original paths. An open picker or crop editor owns its source independently
of the saved contact, so remote replacements cannot delete its pending source. Update every device before
relying on revision-aware transfer; older clients do not resolve new filenames.
Cancelling or leaving an uncommitted picker/editor releases its draft files;
late IO completion cannot commit the cancelled photo.

Uploads, downloads, and cleanup share one queue so bookkeeping cannot overwrite
another pass. Publish JSON references before uploading bytes. An unchanged local
photo is re-uploaded when its cloud file is absent. Downloads run at most four
at a time into separate `*-synced[-revision].jpg` destinations and apply only if
the reference is still current; they do not overwrite the picker’s file.
Downloaded files are recorded as already uploaded to avoid echo uploads.

Cloud cleanup requires positive deletion/supersession evidence and a one-day
age for both the binary and the evidence. An owner absent from local state alone
is insufficient. Local photo cleanup rechecks ownership after asynchronous IO.
Recoverable deleted contacts keep their referenced photos and originals for the
same 90-day retention window. Redaction or permanent erasure removes their local
files, including abandoned draft revisions; photo replacements remove superseded
files. Data-protection erasure received from another device also removes local bytes.

On iCloud and Google Drive, photos travel only with “Include photos” on; on
Cloud Sync they always do (see [Cloud Sync](#cloud-sync)). Turning off photo
transfer pauses this device. “Remove iCloud photos” is a
separate explicit cleanup of uploaded files; local copies remain. Other enabled
devices can upload them again, so the confirmation asks the user to pause photo
sync on those devices first. Rebuild removes obsolete binaries before uploading
the current photos when enabled.

### Note photos

Photos in notes (ADR 0022) sync like avatars (behind the same setting on iCloud
and Drive) under their own names,
`witness-work-note-<id>.jpg`, which builds from before note photos ignore, so
their cleanup can't delete them. A note stores only the photo's id and size; the
file is `Documents/note-images/<id>.jpg` on every device. Photos never change
once saved, so each one uploads once, after the JSON that refers to it, and
downloads only when a note refers to it and this device doesn't have it. Cloud
cleanup deletes a note photo no note refers to once it's a day old, after a
complete pull; local cleanup does the same on the device. Erasing householder
data deletes those visits' photo files at once. Reset cleanup keeps photos that
notes refer to, and “Remove iCloud photos” removes note photos too.

Native writes replace atomically. Binary reads stop at a ten-second deadline,
cancel waiting file coordinators, and forbid a timed-out read from writing late.
Metadata-query starts/stops are serialized on the main queue; timed-out initial
scan waiters are removed from the waiter dictionary.

## Android: Google Drive

The user connects a Google Account (Settings → Google Drive Sync, or the
onboarding restore). Google's own account picker and consent screen grant only
`drive.appdata`, a scope that reaches WitnessWork's hidden folder and nothing
else in their Drive. `modules/google-drive-auth` returns short-lived tokens;
all Drive calls are REST from JS. Copy names Google Drive through `syncKey`
(`…Android` strings).

What differs from iCloud, and where it's handled
(`src/lib/syncTransport/googleDrive/`):

- **Account.** Only a hash of the Drive `permissionId` is stored
  (`googleDriveAccountId`). Each fresh token is checked against it. A different
  account turns sync off through `checkICloudIdentity`, the same path as an
  Apple Account switch. Lost consent sets `googleDriveNeedsReconnect`; sync
  waits for Reconnect. Disconnect forgets the account (not Google's shared grant) and turns sync off on this
  device.
- **Device binding** uses the `ANDROID_ID`-derived install id, because Auto
  Backup copies MMKV to restored phones.
- **Writes.** JSON is copy-on-write (create, then delete the old copy) so
  Drive keeps no revisions. Duplicate names read as the newest copy. A write
  is uploaded when it resolves (`writeConfirmsUpload`); a full account is
  `storageQuotaExceeded`, shown as storage full.
- **Remote changes.** There are no push events: while the app is in the
  foreground the folder is listed every 60 s, and each copy this device hasn't
  read fires remote-change once. With sync off it polls only while this device
  could adopt another device's Supporter status (not a Supporter itself). A
  listing is shared by callers within 3 s, so one peer change doesn't list the
  folder for the pull, the account reconcile and the photo pass separately.
  There's no background pull on Android.
- **Errors.** Only 401 and access-related 403 reasons (`insufficientPermissions`
  and the like) count as a refused token; throttling and API quota 403s are
  `rate-limited` and never ask the user to reconnect. Requests retry 4 times
  with exponential backoff (1–8 s plus jitter) or `Retry-After`, up to 32 s.
  JSON over 4 MB uploads through a resumable session.
- **Photos** use the same names, references, consent, and cleanup rules,
  uploaded through resumable sessions.

Verify on emulators without a Google Account through the fake Drive server
(`scripts/verify/fake-google-drive-server.mjs`, `__WW_DEV__.fakeGoogleDrive`).
The Cloud console setup is in ADR 0019's Consequences.

## Cloud Sync

The wire contract is "Sync" in [accounts-protocol.md](./accounts-protocol.md);
the decisions are ADR 0030. Code: `src/lib/syncTransport/server/` (transport,
client, crypto) and `src/app/sync/` (`cloudSync.ts` runtime, `syncOption.ts`
switching, `components/CloudSyncDefault.tsx`).

- **Namespace.** Each slot reads as `witness-work-<slotId>.json`, the slot id
  being the device's sync id, so the engine sees the same names a cloud folder
  gives it. The account file (ADR 0011) stays on iCloud/Drive whatever the
  option.
- **Encryption.** Each snapshot is sealed with a key derived from the account
  key (`HKDF(accountKey, "ww-account/v1/sync")`), which only the User's
  devices hold. The server stores and relays ciphertext, sizes, and times.
- **Reads** list the slots and download only those whose ETag changed;
  **writes** put and resolve once the server has the bytes
  (`writeConfirmsUpload`).
- **Remote changes** come from the live socket (`/accounts/v1/sync/live`),
  open only in the foreground, one per device, never from polling. A `changed`
  message, or a `hello` with a newer `seq`, pulls at once.
- **Gate.** `canSync` uses `cloudSyncEntitled` (from `GET /accounts/v1/sync`)
  instead of the device's Supporter status. A 503 `disabled` or 403
  `supporter_required` records itself and pauses sync; the choice is kept, so
  it resumes when the server allows it again. Settings keeps the option rows for a device on Cloud Sync while the kill switch is off, so it can still move to iCloud, Google Drive, or Off, and its status says Cloud Sync is paused. Settings → Sync and its Devices list have no Supporter gate.
- **Identity.** The namespace is the server account: `cloudSyncAccountToken`
  holds a hash of its id. Moving to another account (a QR code or recovery key)
  flushes, deletes this device's slot, resets the namespace bookkeeping, and
  decides again as a device that never chose. Leaving Cloud Sync forgets the
  account, and switching to it records the current one, so an account changed
  while the device was on iCloud, Drive or Off isn't taken for a change on Cloud
  Sync.
- **Photos** travel too, end-to-end encrypted, without “Include photos” (ADR
  0040 §6; the wire contract is [cloud-sync-photos.md](./cloud-sync-photos.md)).
  The engine's photo passes run as on iCloud and Drive; the binary methods put
  each photo file sealed under a keyed name, and list photos through their
  sealed filenames. A device downloads only photos its records refer to.
  Settings → Sync shows no “Include photos” toggle on Cloud Sync.
  - Only revisioned names travel: a legacy avatar gets a revision (a record
    edit) before its photo is put.
  - Names are immutable, so a revision this device already has a file for is
    current whatever the listing's time (`immutableNames`).
  - After a publish, the photos the User replaced or removed since the last
    one (a contact's or the profile photo, a photo taken out of a note) are
    deleted at once, freeing their space. A deleted contact's photo stays while
    it can be restored; other cleanup keeps its one-day grace.
  - Only the User's edits count as replacing. A restore or Replace (from a
    slot, iCloud, Google Drive, a backup or a backup file), a merge of other
    devices' records, and a dev reset or seed make the new state the baseline
    (`rebasePublishedPhotos`): another device may still use the revision they
    moved away from, and under last-writer-wins a merge can swing a record
    back. A publish such a change overtakes deletes nothing.
  - **Storage full** (2 GB an account): the photo stays on this device, its
    bookkeeping entry says `storage-full`, and it shows “Not synced: storage
    full” (contact, profile and note photos); Settings → Account shows
    “Storage full” and the usage. It retries on foreground and when the
    account's usage drops (a delete here, or a change notice), never on an edit
    (`fullRetriesOnSignal`).
  - The server's photo switch (`photos` in `GET /accounts/v1/sync`,
    `cloudSyncPhotos`) off pauses uploads only (`binaryWritesPaused`); downloads,
    deletes and the rest of Cloud Sync go on. A server that doesn't say holds no
    photos (`supportsBinaries` false).
  - Rebuild and Keep This Device's Data delete the photos the published data
    doesn't refer to, as on iCloud. The server deletes every photo when the
    account's last slot goes.
- **Errors.** `too_large` and `limit` read as storage full (20 MB a snapshot,
  20 devices an account), 429 as rate limited, network as offline, and 5xx as
  `server-error`: retried the same way as offline, with the status saying sync
  needs another attempt rather than waiting for a connection. For photos,
  `storage_full` and `limit` read as storage full; a photo's `too_large` marks
  only that photo; `photos_disabled`, `conflict` and `no_slot` retry later.

### Choosing and switching

- A device that never chose gets Cloud Sync while the server offers it, once
  onboarding is done and it's entitled (`CloudSyncDefault`): it seeds an empty
  account, pulls into a device without records, or asks Merge or Replace.
  While Cloud Sync isn't offered, it gets iCloud or Drive the same way
  (`PlatformSyncDefault`).
- **New and existing installs** (ADR 0040 §2). Those defaults apply to every
  new install. An install from before sync was free isn't switched: it keeps
  the rule it had, where only a Supporter got sync without choosing, so one
  that isn't a Supporter and never chose stays off until the User turns sync
  on. `installedBeforeFreeSync` (device-local) tells them apart: the
  preferences store's v16 persist migration sets it on any store saved by an
  older version, and a new install's store keeps the default, false. The
  decisions are `src/app/sync/syncDefaults.ts`.
- A device already syncing through iCloud or Drive keeps it, and Settings →
  Sync offers the switch once, with the security reason (`cloudSyncOffer`).
- **The tray offer** (ADR 0040 §4, `useCloudSyncTrayOffer`): an install from
  before sync was free, onboarded, not on Cloud Sync (iCloud, Drive, or off,
  chosen or not), while Cloud Sync is offered, gets one notifications-tray
  item. A Supporter gets a thank-you ("Thank you for supporting WitnessWork",
  Turn On Cloud Sync); anyone else gets "Cloud Sync is now free" (Turn On), and
  only while the entitlement is `everyone`. It waits until RevenueCat and
  ww-api's Supporter answer for the account (ADR 0040 §7) are in, so a
  Supporter never sees the other one. Turn On switches in place
  (`switchSyncOption('cloud', 'tray')`); a failure says why in an error toast
  and the item stays. Turning it on, dismissing it, or moving to Cloud Sync any
  other way answers it for good (`cloudSyncTrayOffer: 'answered'`), even if the
  device leaves Cloud Sync later.
- `switchSyncOption` flushes the old option's pending edits, stops, resets the
  namespace bookkeeping (photo bookkeeping keeps only what it knows of local
  files, so each photo is checked against the new option), reads the new option's
  devices, joins their newest reset generation, merges ("Merge both"), and
  pushes. A switch that can't happen (not entitled, offline, unreadable)
  changes nothing.
- The account's Cloud Sync request (ADR 0040 §5, set by a browser): with
  one standing in the status read at launch or on return to the foreground, a
  phone not on Cloud Sync switches through `switchSyncOption` (source
  `account_request`) and shows a toast, once onboarding is done
  (`cloudSyncRequest.ts`). It acts once per `requestedAt`
  (`cloudSyncRequestAnswered`), never clears the request (ww-api does), and
  tries again next time only when the switch couldn't happen yet.
- Leaving Cloud Sync deletes this device's slot. Leaving iCloud or Drive leaves
  this device's file there: it holds nothing newer than the switch, and
  tombstones win over anything not strictly newer, so it can't bring back a
  record deleted later. A switch never touches another device's file or slot.
- Settings explains the security difference: Cloud Sync is end-to-end
  encrypted; WitnessWork doesn't encrypt iCloud or Drive sync end to end. On
  iCloud/Drive it says this device syncs only with devices on the same option.

## Files and validation

| Path                                                                                  | Responsibility                                              |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `src/app/sync/iCloudSync.ts`                                                          | Runtime, retries, initial enable, restore, image sequencing |
| `src/lib/syncTransport/`                                                              | Transport interface; iCloud and Google Drive transports     |
| `modules/google-drive-auth/`                                                          | Android Drive authorization (access tokens only)            |
| `src/app/sync/payload.ts`, `payloadValidation.ts`                                     | Wire boundary, legacy normalization, known setting types    |
| `src/app/sync/merge.ts`, `preferencesMerge.ts`                                        | Record/tombstone and per-entry preference merge             |
| `src/app/sync/foldRemotePayloads.ts`                                                  | Fold foreign snapshots for restore                          |
| `src/app/sync/mergeIntoLocal.ts`, `localChanges.ts`                                   | Merge payloads into the stores; the shared change trigger   |
| `src/app/sync/definitionReconciliation.ts`, `src/lib/contactRetention.ts`             | Legacy repair and deleted-detail expiry                     |
| `src/app/sync/imageSync.ts`, `imageSources.ts`, `src/lib/syncTransport/imageNames.ts` | Photo transfer, reference guards, cleanup policy            |
| `src/app/notifications/useReconciledReminders.ts`                                     | Local reminder reconciliation on iOS and Android            |
| `src/features/settings/screens/preferences/screens/PreferencesiCloudScreen.tsx`       | Settings and recovery controls                              |
| `src/features/onboarding/components/steps/iCloudRestore.tsx`                          | Onboarding one-shot restore                                 |
| `modules/icloud-bridge/ios/ICloudBridgeModule.swift`                                  | Coordinated iCloud IO and metadata query                    |

Swift and Kotlin changes require a native rebuild. Pure merge, validation,
photo, clock, backup, and store regressions live in `src/app/sync/__tests__` and
`src/__tests__`. Drive transport tests are in
`src/lib/syncTransport/googleDrive/__tests__`, and
`src/app/sync/__tests__/googleDriveSync.test.ts` runs several Android devices
against one fake Drive.
For the addressed audit checklist and remaining Critical/High work, see
[icloud-sync-audit-fixes.md](./icloud-sync-audit-fixes.md).
