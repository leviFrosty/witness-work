# iCloud sync (and Google Drive sync on Android)

WitnessWork uses a private iCloud Drive container on iOS and the hidden Google
Drive app data folder on Android ([ADR 0019](./adr/0019-android-sync-over-google-drive-app-data.md)).
Supporter access and this device’s opt-in are required for ongoing sync on
both. One engine (`src/app/sync/iCloudSync.ts`) makes every sync decision and
reads and writes only through a `SyncTransport`
(`src/lib/syncTransport/types.ts`), so everything below applies to both
platforms except where a section says otherwise. Sync between an iPhone and an
Android device isn't supported.

## Data and identity

Each installation writes `witness-work-<deviceId>.json`. Pulls read and merge
foreign snapshots, excluding the account file and this installation’s own file.
One-shot restore also excludes the current device’s snapshot. Keep legacy JSON
files after absorbing them: an older app may write between our read and a delete.

JSON carries contacts, visits, time entries, day plans, recurring plans,
categories, custom field definitions, mileage (cars, fuels, price and car setup
histories, trips, and one shared tombstone list in the optional `mileageStore`
slice), shared preferences, and profile data.
Saved Views for the Contacts list are a shared preference; which view a device
is showing, and its unsaved edits, stay on that device. A view this build can't
read (e.g. a filter from a newer version) is skipped with its stamp, leaving the
local copy as is, rather than failing the payload.
Photo references travel even when photo transfer is off; local filesystem paths
and photo metadata do not. Device identity, onboarding progress, sync controls,
address prefill, data protection mode, and analytics consent remain local.
`syncPreferencePolicy.ts` is the incoming/outgoing exclusion policy.

JSON backups additionally include categories, mileage, and profile. Restoring a backup
preserves installation identity and local consent/settings, including backups
created by older versions that included them. Missing optional stores are kept.
Photo bytes are not embedded in JSON backups.

## Merge rules

Records merge by id and `updatedAt`; an equal timestamp uses canonical content
ordering so both devices choose the same result. Local photo paths and OS
notification identifiers do not participate in that comparison. Tombstones win
unless an active record has a strictly newer timestamp. Change detection compares
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

`installiCloudSync` subscribes to stores and availability/foreground events.
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

A supporter lapse pauses transfer and preserves the user’s enable choice.
Access returning resumes an enabled device. Auto-enable conflicts set a visible
notifications-tray prompt; they do not silently overwrite data. An explicit off
choice stays off. Restart onboarding is local; Set up fresh disables sync until
the user explicitly enables it again.

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

Turning off photo transfer pauses this device. “Remove iCloud photos” is a
separate explicit cleanup of uploaded files; local copies remain. Other enabled
devices can upload them again, so the confirmation asks the user to pause photo
sync on those devices first. Rebuild removes obsolete binaries before uploading
the current photos when enabled.

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

## Files and validation

| Path                                                                            | Responsibility                                              |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `src/app/sync/iCloudSync.ts`                                                    | Runtime, retries, initial enable, restore, image sequencing |
| `src/lib/syncTransport/`                                                        | Transport interface; iCloud and Google Drive transports     |
| `modules/google-drive-auth/`                                                    | Android Drive authorization (access tokens only)            |
| `src/app/sync/payload.ts`, `payloadValidation.ts`                               | Wire boundary, legacy normalization, known setting types    |
| `src/app/sync/merge.ts`, `preferencesMerge.ts`                                  | Record/tombstone and per-entry preference merge             |
| `src/app/sync/foldRemotePayloads.ts`                                            | Fold foreign snapshots for restore                          |
| `src/app/sync/definitionReconciliation.ts`, `src/lib/contactRetention.ts`       | Legacy repair and deleted-detail expiry                     |
| `src/app/sync/imageSync.ts`, `imageSources.ts`, `imageNames.ts`                 | Photo transfer, reference guards, cleanup policy            |
| `src/app/notifications/useReconciledReminders.ts`                               | Local reminder reconciliation on iOS and Android            |
| `src/features/settings/screens/preferences/screens/PreferencesiCloudScreen.tsx` | Settings and recovery controls                              |
| `src/features/onboarding/components/steps/iCloudRestore.tsx`                    | Onboarding one-shot restore                                 |
| `modules/icloud-bridge/ios/ICloudBridgeModule.swift`                            | Coordinated iCloud IO and metadata query                    |

Swift and Kotlin changes require a native rebuild. Pure merge, validation,
photo, clock, backup, and store regressions live in `src/app/sync/__tests__` and
`src/__tests__`. Drive transport tests are in
`src/lib/syncTransport/googleDrive/__tests__`, and
`src/app/sync/__tests__/googleDriveSync.test.ts` runs several Android devices
against one fake Drive.
For the addressed audit checklist and remaining Critical/High work, see
[icloud-sync-audit-fixes.md](./icloud-sync-audit-fixes.md).
