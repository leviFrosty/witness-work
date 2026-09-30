# iCloud Sync

iOS-only. Syncs contacts, conversations, service reports, and syncable preferences across a user's devices using iCloud Drive. Zero account setup — the iCloud identity the device is already signed into is the identity.

Opt-in and supporter-gated. When off, the app is fully local-first. When on, every store mutation enqueues a debounced push, and the app pulls on every foreground transition and whenever sync becomes ready while it's active.

## Mental model

Think of iCloud as a **dumb blob store** — each device owns one JSON file named after its device id, writes only to that file, and reads every file in the folder on pull. The merge is a local-first, per-record **last-writer-wins** fold that happens in JS at pull time.

```text
iCloud Drive /Documents/
  witness-work-<iPhone deviceId>.json   ◀──  iPhone writes only here
  witness-work-<iPad deviceId>.json     ◀──  iPad writes only here
  witness-work-<Mac deviceId>.json      ◀──  Mac writes only here
  ...

Every device on pull:
  readFiles() ──▶ [own file, sibling file, sibling file, ...]
         │
         ├─ skip own (already in local state)
         ├─ parsePayload + mergePayload (LWW) ──▶ zustand stores
         └─ legacy files (pre-upgrade) are absorbed + deleted
```

**There is no "consolidated" file on iCloud.** The consolidated view exists only in each device's zustand stores, recomputed on every pull. The merge algorithm is associative under LWW, so every device arrives at the same result given the same set of input files.

## Why per-device files

iCloud Drive handles concurrent writes to the _same_ filename poorly: rather than merging, it creates conflict duplicates (`witness-work.json`, `witness-work 2.json`, `witness-work 3.json`, ...) that neither device ever reads. We lived through this bug — a 23 KB payload on one device stranded itself as `witness-work 4.json` while the other device happily read its own empty `witness-work.json`.

Per-device filenames make the collision impossible. Two devices never write the same path. `NSFileCoordinator` handles the same-device coordination, iCloud does the transport, and JS does the merge.

## Architecture

```text
zustand stores ──▶ buildPayload() ──▶ witness-work-<deviceId>.json ──▶ iCloud Drive
      ▲                                                                    │
      │                                                                    ▼
 zustand set() ◀── mergePayload() ◀── readFiles() ◀── NSMetadataQuery ◀─ remote write
                       (LWW)           (parallel
                                       download)
```

### Push path

1. Any subscribed store change (`useContacts`, `useConversations`, `useServiceReport`, `usePreferences`) schedules a debounced push (5 s trailing).
2. `push()` builds a `SyncPayload` from the current stores and writes it to `witness-work-<deviceId>.json` via the native bridge using a coordinated atomic write.
3. On backgrounding, any pending debounced push is flushed so the user doesn't lose edits.

### Pull path

1. `pullAndMerge()` runs on every incoming `onRemoteChange` event, on pull-to-refresh, and on the Settings "Sync now" button. `catchUp()` runs it on app foreground and whenever sync becomes ready while the app is active (see "Catching up" below).
2. `readFiles()` lists every `witness-work*.json` in the container, drops the account file, and has the native bridge trigger parallel iCloud downloads for any placeholders, wait up to 10 s total, and return the materialized files plus the names still downloading (`pending`).
3. JS filters out its own file, parses the rest, and folds each remote payload through `mergePayload(local, remote)` — the same LWW algorithm documented below.
4. The merged result is written to the stores via each store's raw `set()`. Preferences are applied via `useStore.setState(...)` to bypass the stamping wrapper (so remote per-key timestamps survive the write).

If `readFiles()` rejects (the container briefly unreachable), the pull retries itself after 5 s, 20 s, then 60 s — only while the app is active and `canSync()` holds. Backgrounding and uninstall cancel the retry, a successful read from any trigger resets it, and each foreground starts a fresh budget, so an outage costs at most three extra reads per foreground and one error report. Files that are merely still downloading don't trigger it: the metadata query reports them when they land.

### Catching up

`canSync()` requires supporter status, which loads asynchronously from RevenueCat after launch. Remote-change events from the initial metadata gather usually arrive before it, and a cold launch usually delivers no foreground `AppState` event at all, so both are dropped. `installiCloudSync()` therefore also runs `catchUp()` when supporter status turns true, when iCloud becomes available, and at install — each only while the app is active. Without this, a device opened from a cold launch stayed stale until the user tapped "Sync now".

The catch-up is deliberately **not** triggered by `iCloudSyncEnabled` turning on: enable flows reconcile themselves, and a concurrent pull would race "Keep this device's data" (which enables sync before wiping the remote files).

`catchUp()` runs its steps in order — pull, push any edit made while sync wasn't ready, upload images, then GC — and one catch-up at a time. Image GC deletes every container binary with no local owner, so it runs only after the initial scan, once no pull is running or queued, and only if the most recent pull was **complete**: every remote payload read and parsed, nothing still downloading. Running it against the pre-merge contact list deleted the photos of contacts still on their way in. On binaries that predate `readFiles`, completeness is unknown and GC is skipped.

GC and pulls never overlap. GC judges orphans against the contact list it read when it started, so a pull that starts mid-sweep (a remote change, pull-to-refresh) asks it to stop before its next delete and waits for it — at most one coordinated delete, capped at 10 s so a hung delete can't stall pulls. GC also stops when the contact list or profile avatar changes locally mid-sweep, since a new photo may be uploading. A stopped sweep resumes at the next catch-up.

A peer on a newer `PAYLOAD_VERSION` makes every pull incomplete — its contacts can't be merged, so their photos would look orphaned — and GC stays off until this device updates. That's deliberate; the pull logs `skipping newer payload version` and leaves a `skipped newer payload version; image GC paused` breadcrumb, and the catch-up logs `image gc skipped`.

### Own-write filter

Metadata query events fire for _every_ write to matching files, including our own. The native module tracks `lastObservedModifiedAt` per filename (updated on every read and every write). Events only bubble to JS when some file's content-change date is strictly newer than what we've observed for that file — preventing every local push from looping back as a pull.

Because a read marks a file observed, each reader must read only the files it consumes: `readFiles(include)` lists first, then reads just the matching names. The account reader once read every file to find the account file, which silently consumed the event for a data file that no pull ever merged. The sync pull likewise skips the account file. Files still downloading at the deadline are returned in `pending` and left unobserved, so the metadata query reports them again once they land.

That re-report is what retries the account reconcile (ADR 0011). A still-downloading account file may be another device's claim, so `readAccountFile()` reports it as `pending` and `AccountProvider` decides nothing on that read — claiming would overwrite the claim on its way in — and skips canonicalizing conflict duplicates. The `remote-change` event when it lands re-runs the reconcile. Binaries that predate `readFiles` can't report `pending`; they keep the old behaviour (claim once the initial scan finishes) rather than never claiming.

The native download poll reads status from a fresh `URL` each time. `URL.resourceValues` serves from a per-object cache that never clears on a GCD queue, so polling the enumerated URL kept reporting a finished download as unfinished.

### New-device backup detection

On a cold-launched fresh install, `FileManager.contentsOfDirectory` over the ubiquity container can return empty for several seconds even when a remote per-device file exists — iCloud materializes the listing asynchronously via `NSMetadataQuery`. If the onboarding restore probe races that materialization and reports "no backup", the user proceeds through onboarding with fresh `Date.now()` timestamps on their preferences and defaults. Once sync is later enabled, those fresh timestamps beat the real remote values in the LWW merge, silently overwriting data from the old device.

Three defenses guard against this:

1. **`peekRemotePayload()` only answers from a complete view.** It awaits `waitForInitialScan(5000)` — the native bridge flips an `initialGatheringDidFinish` flag when `NSMetadataQueryDidFinishGathering` fires — and reads again if a remote file is still downloading. It returns `incomplete` instead of an answer when the scan times out, a file is still downloading after the second read, or a payload comes from a newer app version; a failed read is `unavailable`. "No backup" and a partial fold would both be wrong there.
2. **`iCloudRestore` re-probes on `onRemoteChange`.** If a file lands after the probe — or finishes downloading — but before the user advances, the screen upgrades to "found" automatically. The `incomplete` state says iCloud isn't ready yet, and a **"Search again"** button on the `noBackup` / `unavailable` / `incomplete` states lets users force a retry.
3. **`hasMeaningfulLocalData()` ignores `onboardingComplete`.** Even if detection still fails (different Apple ID mid-fix, flaky connectivity, race we haven't thought of), a freshly-onboarded device with no user-created records is treated as non-meaningful. First-enable auto-pulls the remote instead of showing the merge/replace sheet, which means the real data wins instead of the onboarding defaults. Any real user records (contacts, conversations, reports, plans, tombstones) flip it back to meaningful and surface the sheet.

**Every first-enable call site must route through `resolveInitialEnable()`** — the shared helper in `iCloudSync.ts` that peeks at remote, consults `hasMeaningfulLocalData()`, and classifies the situation as `seed` / `pull` / `conflict` / `incomplete` / `unavailable`. Callers then invoke `applySeedEnable()` or `applyPullEnable(remote)` for the safe branches; the `conflict` branch must defer to a user-facing resolver (Settings renders `FirstEnableSheet`; headless auto-enable paths must leave sync disabled so the user lands in Settings). `incomplete` must leave sync off: Settings explains that iCloud isn't ready yet, and `SupporterSyncDefault` decides again on the next `onRemoteChange` or foreground. Skipping this and unconditionally flipping `iCloudSyncEnabled: true` is what made the new-device hazard a data-loss bug instead of a detection inconvenience — a 5-second debounced push fires before the next foreground `pullAndMerge`, and the new device seeds iCloud with onboarding defaults the old device then merges back.

## Payload shape

Example `witness-work-uojwbs14.json`:

```json
{
  "version": 1,
  "writtenAt": 1776481094069,
  "deviceId": "uojwbs14vn0w6xmwmo3acqui",
  "deviceName": "iPhone 15 Pro Max",
  "contactStore": {
    "contacts": [
      {
        "id": "c-abc123",
        "name": "Alex",
        "address": "...",
        "updatedAt": 1776480000000
      }
    ],
    "deletedContacts": [{ "id": "c-old999", "updatedAt": 1776400000000 }]
  },
  "conversationStore": {
    "conversations": [
      {
        "id": "conv-xyz",
        "contact": { "id": "c-abc123" },
        "date": "2026-04-17T12:00:00.000Z",
        "note": { "content": "..." },
        "updatedAt": 1776480500000
      }
    ],
    "deletedConversations": [
      { "id": "conv-retired", "deletedAt": 1776470000000 }
    ]
  },
  "serviceReportStore": {
    "serviceReports": {
      "2026": {
        "3": [
          {
            "id": "rep-apr17",
            "date": "2026-04-17T00:00:00.000Z",
            "hours": 2,
            "minutes": 30,
            "updatedAt": 1776480900000
          }
        ]
      }
    },
    "dayPlans": [],
    "recurringPlans": [],
    "deletedServiceReports": []
  },
  "preferencesStore": {
    "values": {
      "publisher": "regularPioneer",
      "publisherHours": { "regularPioneer": 50 },
      "onboardingComplete": true
    },
    "updatedAt": {
      "publisher": 1776000000000,
      "publisherHours": 1776000000000,
      "onboardingComplete": 1775900000000
    }
  }
}
```

Every user record carries an `updatedAt` epoch ms stamped at write time by the store. Tombstones (`deletedContacts`, `deletedConversations`, `deletedServiceReports`) carry `deletedAt` for the same purpose. Preferences use a per-key `preferenceUpdatedAt` map so a theme toggle on one device doesn't revert a publisher-type change on another.

Schema is versioned via `PAYLOAD_VERSION`. Devices reject unknown-future versions rather than corrupt local state.

## Merge algorithm (LWW)

Pairwise merge of local against each remote payload. For records with matching `id`:

- **Both sides present** — keep the one with the larger `updatedAt`. A record without `updatedAt` is treated as older than any stamped record (covers pre-sync historical rows backfilled by `backfillUpdatedAtIfNeeded`).
- **Remote-only** — insert locally.
- **Local-only** — keep local, it will propagate on the next push.
- **Tombstones** — a tombstone with `deletedAt > record.updatedAt` removes the record. Tombstones from either side propagate. Tombstones older than 90 days are dropped on merge (bounded retention).
- **Contact resurrection** — if a contact appears in both active and deleted lists after per-list merge, whichever has the larger timestamp wins; the other side is dropped.
- **Preferences** — per-key last-writer-wins using `preferenceUpdatedAt`. `NON_SYNCABLE_PREFERENCE_KEYS` (device-local bookkeeping, dev flags, sync timestamps themselves) never cross the wire.

The merge is deterministic and associative under LWW, so folding N remote files in any order yields the same result.

## Legacy file absorption

The original sync scheme used a single `witness-work.json`. This doc supersedes that — but prior installs (and cross-device conflict duplicates created during the bug window) left files named `witness-work.json`, `witness-work 2.json`, ... in the container.

`pullAndMerge()` absorbs these on every pull: it reads, parses, and merges their contents exactly like per-device files, then deletes them. Safe even when another device is still running pre-upgrade code — that device simply re-creates `witness-work.json` on its next push, and we re-absorb it. Eventually all devices upgrade and the legacy names stop appearing.

## Device identity

On first push, each device generates a stable ~24-char random id stored in `preferences.iCloudDeviceId`. This id is:

1. The filename suffix (`witness-work-<id>.json`)
2. Stamped into the payload's `deviceId` field for display
3. The basis for own-write filtering on pull

Device id is in `NON_SYNCABLE_PREFERENCE_KEYS` and must stay there. If it were ever overwritten by a remote preferences merge, the device would start writing to a file another device owns.

## Key files

| File                                                                   | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | --------------------------------------------------------------------- |
| `src/lib/sync/payload.ts`                                              | `SyncPayload` schema + `buildPayload()` / `parsePayload()`. Allow-lists syncable preference keys. Bump `PAYLOAD_VERSION` on breaking shape changes.                                                                                                                                                                                                                                                                                                                                                                                             |
| `src/lib/sync/merge.ts`                                                | `mergePayload(local, remote)` — pairwise LWW fold. Handles tombstone retention (90-day window), contact resurrection, nested service report year/month structure.                                                                                                                                                                                                                                                                                                                                                                               |
| `src/lib/sync/iCloudSync.ts`                                           | Public API. `installiCloudSync()` wires up store subscriptions + AppState + remote-change listeners, and catches up when supporter status or iCloud availability turns sync on. `push()`, `pullAndMerge()`, `peekRemotePayload()`, `replaceLocalWithRemote()`, `overwriteRemoteWithLocal()`. Also `resolveInitialEnable()` / `applySeedEnable()` / `applyPullEnable()` — the shared look-before-leaping helpers every first-enable call site must route through. Owns the `witness-work-<deviceId>.json` filename scheme and legacy absorption. |
| `modules/icloud-bridge/index.ts`                                       | TS bindings: `readFiles(include)`, `write(filename, json)`, `deleteFile(filename)`, `deleteAll()`, `waitForInitialScan(timeoutMs)`, `addRemoteChangeListener()`, `addAvailabilityChangeListener()`.                                                                                                                                                                                                                                                                                                                                             |
| `modules/icloud-bridge/ios/ICloudBridgeModule.swift`                   | Native Expo module. NSFileCoordinator for coordinated reads/writes. NSMetadataQuery (predicate `FSName LIKE "witness-work*.json"`) for remote-change events AND an initial-gather flag powering `waitForInitialScan`. Parallel iCloud downloads. Filename namespace guard.                                                                                                                                                                                                                                                                      |
| `src/stores/preferences.ts`                                            | `NON_SYNCABLE_PREFERENCE_KEYS` allow-list, per-key `preferenceUpdatedAt` stamping wrapper around `set()`.                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `src/screens/settings/preferences/screens/PreferencesiCloudScreen.tsx` | Settings UI: toggle, recent sync status display, first-enable merge/replace sheet, reset button (calls `deleteAll()` then re-pushes).                                                                                                                                                                                                                                                                                                                                                                                                           |
| `src/features/onboarding/components/steps/iCloudRestore.tsx`           | Onboarding step — calls `peekRemotePayload()` then `replaceLocalWithRemote()` on accept. Re-probes on `onRemoteChange` and exposes a "Search again" button so a slow-materializing container doesn't trap the user on a stale "no backup" or "not ready" verdict.                                                                                                                                                                                                                                                                               |
| `src/lib/logger.ts`                                                    | Logs gated on `developerTools                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |     | **DEV**`. All sync log lines prefixed with `[iCloudSync/deviceName]`. |
| `plugins/with-icloud-container.js`                                     | Config plugin that injects the ubiquity container entitlement.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `ios/WitnessWork*/WitnessWork*.entitlements`                           | Dev: `iCloud.com.leviwilkerson.jwtimedev`. Prod: `iCloud.com.leviwilkerson.jwtime`.                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

## Gotchas

- **Native rebuild required** when changing the Swift module. JS-only changes reload via Metro as normal.
- **`developerTools` preference gates logs in Release.** Dev simulator auto-logs via `__DEV__`. TestFlight builds need the user to tap the version number 5× to enable logs before diagnosing.
- **iCloud account parity is silent.** If the Mac "Designed for iPad" version is signed into a different Apple ID than the iPhone, the containers are entirely separate and sync silently does nothing. Rule this out first when sync appears broken.
- **`replaceLocalWithRemote()` uses `setState` directly**, not the stamping `set()` wrapper, so the remote's per-key preference timestamps survive. Using `set()` would re-stamp every key with `Date.now()` and flip the merge direction on the next pull.
- **Non-syncable preferences must include `iCloudDeviceId`.** Losing it via a remote merge would cause the device to start writing to the wrong filename.
- **The payload is one snapshot per push, not a delta.** Each device's file contains that device's full local state at push time. Storage cost is bounded (see capacity section below).
- **Every preference `set()` stamps `Date.now()` into `preferenceUpdatedAt`, including writes during onboarding.** This means onboarding defaults on a new device are timestamped _newer_ than the old device's real values, and any path that lets them through to a merge will clobber the real data. The "New-device backup detection" section above describes the defenses; the practical rule is: don't add code that merges preferences from a device that may be freshly onboarded without first checking it's either restored-from-remote or has real user records.

## Capacity

| Component                 | Growth                           | Bound                                            |
| ------------------------- | -------------------------------- | ------------------------------------------------ |
| Per-device file           | Linear with device's local state | ~25 KB typical, ~100 KB heavy user               |
| Tombstone arrays          | Linear with deletions            | Bounded — 90-day rolling retention in `merge.ts` |
| `preferenceUpdatedAt` map | Bounded                          | One entry per syncable preference key (~35)      |
| Retired device files      | One per retired device           | Not auto-collected — negligible at ~25 KB each   |

Worst-case for a user with 6 active + 10 retired devices over 10 years, 500 deletions/year: ~1 MB in the container. Well under iCloud's free tier.

## Diagnostic logs

With `developerTools` enabled, the log stream for a successful pull looks like:

```text
[iCloudSync/iPhone 15 Pro Max] pullAndMerge start                   { reason: "foreground" }
[iCloudSync/iPhone 15 Pro Max] pullAndMerge: read                   { totalFiles: 2, filenames: [...], pending: [] }
[iCloudSync/iPhone 15 Pro Max] pullAndMerge: local snapshot         { contacts: 4, conversations: 7, ... }
[iCloudSync/iPhone 15 Pro Max] pullAndMerge: merge result           { changed: true, remoteFiles: 1, legacyFiles: 0 }
[iCloudSync/iPhone 15 Pro Max] pullAndMerge: applied merge to stores
```

`pullAndMerge: read` lists `pending` files. Other lines worth knowing: `read failed` and `read retries exhausted` (see the pull path), `image gc skipped` / `image gc stopped early`, `skipping newer payload version`, and `peekRemotePayload: remote incomplete` with its `reason`. The account reconcile logs `[Account] deferred (account file downloading)`.

To collect logs from a USB-connected device:

```bash
log stream --predicate 'eventMessage CONTAINS "iCloudSync"' --device --style compact
```

Drop `--device` for the local Mac "Designed for iPad" version.

## Alternatives considered

- **CloudKit (`CKSyncEngine`)** — per-record conflict handling and silent-push, but requires Swift + schema deployment to CloudKit Dashboard for both dev and prod, and a much larger native surface. If document sync proves viable, a future migration is a transport swap under this same payload shape.
- **`NSUbiquitousKeyValueStore`** — 1 MB total, 1 KB per key. Contacts alone blow past that.
- **Single-file with `NSFileVersion` conflict resolution** — keeps the single-file model, but the conflict merge must understand the JSON schema and runs on every read. Error-prone, and a bad merge corrupts the shared file for everyone. Per-device files trade a small amount of storage bloat for zero conflict-resolution complexity.
- **Server-side sync** — off the table. The app is intentionally serverless.
