---
status: proposed
---

# Android syncs through the Google Drive app data folder

## Context

iCloud Sync (docs/icloud-sync.md) keeps a Supporter's devices in step with no
app account: each device writes `witness-work-<deviceId>.json` (plus photo
binaries) into a private iCloud container, and every device merges the others'
snapshots. The account file in the same container shares the RevenueCat
account id (ADR 0011). Android had none of it, only JSON backups.

Android needs the same thing on Google's storage, under the same rules: data
stays in the user's own cloud account, our servers never see it, nothing
changes for iOS, and the merge, payload, fold, and photo logic stays shared.

## Decision

### Storage: the Drive app data folder (`drive.appdata`)

Android writes the same files, with the same names and payloads, to the Drive
**app data folder** (`spaces=appDataFolder`) of a Google Account the user
connects. The folder is hidden from the Drive UI and from every other app,
including apps with full Drive access; only our Cloud project can read it.
Users can delete it in Drive → Settings → Manage apps, and it counts against
their Google storage.

The only scope is `https://www.googleapis.com/auth/drive.appdata`, which
Google classifies as **non-sensitive**. Publishing the consent screen to
production needs no Google verification and no security assessment; brand
verification is optional and only adds our name and logo to the consent
screen. In Testing status, grants for test users expire after seven days.

Drive is called over REST from JS (`src/lib/syncTransport/googleDrive`), with
photos moved file-to-file by `expo-file-system`. The native code is a small
Expo module, `modules/google-drive-auth`. It wraps Google Identity Services'
`AuthorizationClient` (play-services-auth 21.6.0) and only hands back
short-lived access tokens. It needs no Credential Manager sign-in, no web
client ID, and no ID token. Google's account picker and consent screen appear
when the user connects; afterwards tokens refresh silently about hourly.

### One engine, two transports

`SyncTransport` (`src/lib/syncTransport/types.ts`) is the boundary. The engine,
still `src/app/sync/iCloudSync.ts`, makes every sync decision and touches
storage only through `syncTransport()`:

- **iOS**: `iCloudTransport` forwards to `modules/icloud-bridge` unchanged. The
  iCloud test suites run against it without modification.
- **Android**: `googleDriveTransport`, registered by `initializeApp`. Keeping it
  out of the shared module's imports keeps the Drive client (which reads
  stores) out of every iOS test's module graph.

The engine's `iCloud*` preference keys hold the same device-local state on
both platforms. They're already in `NON_SYNCABLE_PREFERENCE_KEYS`, so Android
inherits the preference exclusion policy, reset generations, Devices list,
pending-push retries, Supporter auto-enable and lapse pause, and notices as
they are. Renaming them would mean a persisted-key migration for no behavior
change. Copy is chosen by transport: `syncKey` picks an `…Android` string,
naming Google Drive, when the device syncs through Drive.

### Making Drive look like a container

Drive differs from an iCloud container in ways the transport hides:

- **Duplicate names.** Drive allows several files with one name, so two
  devices claiming the account file at once create two. Reads show the newest
  copy (ties broken by id, so every device picks the same one); writes and
  deletes remove the rest. Only the account file has more than one writer,
  and ADR 0011 already resolves it newest-wins.
- **Revisions.** Updating content keeps up to 100 old revisions for 30 days,
  counted against the user's storage. JSON is written copy-on-write instead:
  create the new copy, then delete the old one. A reader always finds one
  complete copy, and nothing piles up. Photos are immutable revisions, so they
  are uploaded once, through resumable sessions that never leave a partial
  file.
- **No change events.** Drive pushes only to public HTTPS webhooks, which would
  route notifications through our servers. Instead, while the app is in the
  foreground, the transport lists the folder every 60 s and fires the
  remote-change event once for each copy it hasn't read. The foreground
  catch-up does the rest.
- **Upload confirmation.** A Drive write resolves after Google has stored it
  (`writeConfirmsUpload`), so a successful push counts as uploaded and the
  Uploading state never shows. A full Google account rejects the write with
  `storageQuotaExceeded`, which shows the same storage-full status as iCloud.
- **Offline.** There's no offline queue: Google turned down the Drive Android
  API that had one. The engine's persisted pending-push flag and its retry and
  catch-up steps cover offline edits, as they do for failed iCloud writes.

### Identity

- **Account.** `AuthorizationResult` doesn't say which account the user picked.
  After each fresh token, `about.get?fields=user(permissionId)` (allowed with
  `drive.appdata`) names it, and only a SHA-256 hash of that id is stored
  (`googleDriveAccountId`). If silent authorization returns a different account
  (the connected one was removed from the phone, or this is a restored copy),
  the token is refused before Drive is used. The changed hash then makes
  `checkICloudIdentity` turn sync off, exactly as an Apple Account switch does.
  Each transport operation captures the connected account when it's called,
  and its token requests fail once another account is connected, so a push
  queued before a switch can't land in the new account's Drive. A token
  request that started before a connect or disconnect is discarded, so it
  can't undo the user's choice.
  "Use a different Google Account" shows Google's account picker
  (`Prompt.SELECT_ACCOUNT`). Disconnecting forgets the account and clears its
  token on this device only. Google's grant is shared by every install on that
  account, so revoking it would stop the user's other devices too. Users can
  remove access entirely in their Google Account. A cached token revoked that
  way is dropped and requested once more before the device asks to reconnect.
- **Device.** Android Auto Backup copies MMKV, so a phone restored from another
  phone's backup would inherit `iCloudDeviceId` and the stored install id. On
  Android the device binding uses the id derived from `ANDROID_ID`
  (`androidDeviceInstallId`), which a restore can't carry, so a restored copy
  gets its own snapshot file.
- **Shared account id.** The ADR 0011 account file lives in the same folder, so
  the user's Android devices share Supporter status once each has connected the
  same Google Account. A new phone typically connects during onboarding's
  "From Google Drive" restore, which isn't Supporter-gated. Otherwise Restore
  Purchases still works.

### Quotas

Since May 2026 Drive meters per-user and per-project quota units (a list is
100, a download 200, an update 50; 325,000 per user per minute). Copy-on-write,
downloads cached by file id, and a 60 s foreground-only poll keep a device well
below that: one list a minute while open, plus a download only when another
device has actually written. Requests that are throttled (429,
`userRateLimitExceeded`) or hit server errors back off and retry twice. The
engine's own retries cover longer outages. Before a large rollout, check the
project's daily total against Google's announced billing threshold.

## Considered options

- **Block Store** for the shared account id. Restore-only: data moves to a new
  phone during device setup, never between two phones in use. It holds 1 KB per
  entry, and survives a reinstall only when backup is on. It can't replace the
  account file. It could later let a restored phone show Supporter status
  before Drive is connected.
- **Android Auto Backup.** A nightly, per-device, 25 MB backup restored at
  install. It isn't sync, and it's the reason for the device binding above.
- **Drive `drive.file` scope / visible folder.** Users could see, move, or
  delete individual sync files and break the namespace. `drive.file` is also
  non-sensitive, but files in My Drive are easy to tamper with by accident.
- **`changes.watch` push notifications.** Need a public webhook and channel
  renewal; notifications would pass through our infrastructure. Polling keeps
  the "our servers never see it" property.
- **Firebase / Firestore or our own backend.** Gives cross-platform sync for
  free but requires an account system and puts householder data on servers we
  operate, which the product rules out (as in icloud-sync-plan.md).
- **Legacy Google Sign-In** (`GoogleSignInClient`): deprecated in 2024 and
  removed in play-services-auth 22.0.0.

## Consequences

- Google Cloud project `turing-striker-403102` needs the Drive API (enabled),
  an External consent screen in production listing `drive.appdata`, and one
  Android OAuth client for each package and signing certificate: the debug key
  for `com.leviwilkerson.jwtimedev`, and the Play app-signing and EAS upload
  keys for `com.leviwilkerson.jwtime`. Without a matching client,
  authorization fails with `DEVELOPER_ERROR`, shown as "Couldn't connect".
- Data never touches WitnessWork's servers. Google holds it under the user's
  Google Account like their other Drive data. It isn't end-to-end encrypted,
  and the privacy note and FAQ say so.
- The Drive app data folder appears to belong to the Cloud project rather than
  to one OAuth client. An iOS client in the same project could later read the
  same folder, and the payloads are already identical. Cross-platform sync
  would then be a transport choice on iOS. It hasn't been tested and is out of
  scope here.
- `iCloudSync.ts` and its `iCloud*` preferences keep their names for now; a
  rename to neutral names is a later, mechanical change.
- Verification can't use a real Google Account in automation without a test
  account. `scripts/verify/fake-google-drive-server.mjs` serves the same fake
  Drive the unit tests use, so dev builds on emulators can sync through it
  (`__WW_DEV__.fakeGoogleDrive`). The native consent flow still needs a
  manual check on a device with a Google Account.
