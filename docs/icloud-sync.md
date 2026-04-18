# iCloud Sync

iOS-only. Syncs contacts, conversations, service reports, and syncable preferences across a user's devices using iCloud Drive. Zero account setup — the iCloud identity the device is already signed into is the identity.

Opt-in and supporter-gated. When off, the app is fully local-first. When on, every store mutation enqueues a debounced push and every foreground transition pulls.

## Mental model

Think of iCloud as a **dumb blob store** — each device owns one JSON file named after its device id, writes only to that file, and reads every file in the folder on pull. The merge is a local-first, per-record **last-writer-wins** fold that happens in JS at pull time.

```text
iCloud Drive /Documents/
  witness-work-<iPhone deviceId>.json   ◀──  iPhone writes only here
  witness-work-<iPad deviceId>.json     ◀──  iPad writes only here
  witness-work-<Mac deviceId>.json      ◀──  Mac writes only here
  ...

Every device on pull:
  readAll() ──▶ [own file, sibling file, sibling file, ...]
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
 zustand set() ◀── mergePayload() ◀── readAll() ◀──── NSMetadataQuery ◀─ remote write
                       (LWW)           (parallel
                                       download)
```

### Push path

1. Any subscribed store change (`useContacts`, `useConversations`, `useServiceReport`, `usePreferences`) schedules a debounced push (5 s trailing).
2. `push()` builds a `SyncPayload` from the current stores and writes it to `witness-work-<deviceId>.json` via the native bridge using a coordinated atomic write.
3. On backgrounding, any pending debounced push is flushed so the user doesn't lose edits.

### Pull path

1. `pullAndMerge()` runs on app foreground, on every incoming `onRemoteChange` event, and on the Settings "Sync now" button.
2. The native bridge enumerates every `witness-work*.json` in the container, triggers parallel iCloud downloads for any that are still placeholders, waits up to 10 s total, and returns the materialized files.
3. JS filters out its own file, parses the rest, and folds each remote payload through `mergePayload(local, remote)` — the same LWW algorithm documented below.
4. The merged result is written to the stores via each store's raw `set()`. Preferences are applied via `useStore.setState(...)` to bypass the stamping wrapper (so remote per-key timestamps survive the write).

### Own-write filter

Metadata query events fire for _every_ write to matching files, including our own. The native module tracks `lastObservedModifiedAt` per filename (updated on every read and every write). Events only bubble to JS when some file's content-change date is strictly newer than what we've observed for that file — preventing every local push from looping back as a pull.

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

| File                                                                   | Purpose                                                                                                                                                                                                                                                                                          |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --- | --------------------------------------------------------------------- |
| `src/lib/sync/payload.ts`                                              | `SyncPayload` schema + `buildPayload()` / `parsePayload()`. Allow-lists syncable preference keys. Bump `PAYLOAD_VERSION` on breaking shape changes.                                                                                                                                              |
| `src/lib/sync/merge.ts`                                                | `mergePayload(local, remote)` — pairwise LWW fold. Handles tombstone retention (90-day window), contact resurrection, nested service report year/month structure.                                                                                                                                |
| `src/lib/sync/iCloudSync.ts`                                           | Public API. `installiCloudSync()` wires up store subscriptions + AppState + remote-change listeners. `push()`, `pullAndMerge()`, `peekRemotePayload()`, `replaceLocalWithRemote()`, `overwriteRemoteWithLocal()`. Owns the `witness-work-<deviceId>.json` filename scheme and legacy absorption. |
| `modules/icloud-bridge/index.ts`                                       | TS bindings: `readAll()`, `write(filename, json)`, `deleteFile(filename)`, `deleteAll()`, `addRemoteChangeListener()`, `addAvailabilityChangeListener()`.                                                                                                                                        |
| `modules/icloud-bridge/ios/ICloudBridgeModule.swift`                   | Native Expo module. NSFileCoordinator for coordinated reads/writes. NSMetadataQuery (predicate `FSName LIKE "witness-work*.json"`) for remote-change events. Parallel iCloud downloads. Filename namespace guard.                                                                                |
| `src/stores/preferences.ts`                                            | `NON_SYNCABLE_PREFERENCE_KEYS` allow-list, per-key `preferenceUpdatedAt` stamping wrapper around `set()`.                                                                                                                                                                                        |
| `src/screens/settings/preferences/screens/PreferencesiCloudScreen.tsx` | Settings UI: toggle, recent sync status display, first-enable merge/replace sheet, reset button (calls `deleteAll()` then re-pushes).                                                                                                                                                            |
| `src/components/sync/SyncPopover.tsx`                                  | Manual "Sync now" entry point.                                                                                                                                                                                                                                                                   |
| `src/components/onboarding/steps/iCloudRestore.tsx`                    | Onboarding step — calls `peekRemotePayload()` then `replaceLocalWithRemote()` on accept.                                                                                                                                                                                                         |
| `src/lib/logger.ts`                                                    | Logs gated on `developerTools                                                                                                                                                                                                                                                                    |     | **DEV**`. All sync log lines prefixed with `[iCloudSync/deviceName]`. |
| `plugins/with-icloud-container.js`                                     | Config plugin that injects the ubiquity container entitlement.                                                                                                                                                                                                                                   |
| `ios/WitnessWork*/WitnessWork*.entitlements`                           | Dev: `iCloud.com.leviwilkerson.jwtimedev`. Prod: `iCloud.com.leviwilkerson.jwtime`.                                                                                                                                                                                                              |

## Gotchas

- **Native rebuild required** when changing the Swift module. JS-only changes reload via Metro as normal.
- **`developerTools` preference gates logs in Release.** Dev simulator auto-logs via `__DEV__`. TestFlight builds need the user to tap the version number 5× to enable logs before diagnosing.
- **iCloud account parity is silent.** If the Mac "Designed for iPad" version is signed into a different Apple ID than the iPhone, the containers are entirely separate and sync silently does nothing. Rule this out first when sync appears broken.
- **`replaceLocalWithRemote()` uses `setState` directly**, not the stamping `set()` wrapper, so the remote's per-key preference timestamps survive. Using `set()` would re-stamp every key with `Date.now()` and flip the merge direction on the next pull.
- **Non-syncable preferences must include `iCloudDeviceId`.** Losing it via a remote merge would cause the device to start writing to the wrong filename.
- **The payload is one snapshot per push, not a delta.** Each device's file contains that device's full local state at push time. Storage cost is bounded (see capacity section below).

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
[iCloudSync/iPhone 15 Pro Max] pullAndMerge: readAll                { totalFiles: 2, filenames: [...] }
[iCloudSync/iPhone 15 Pro Max] pullAndMerge: local snapshot         { contacts: 4, conversations: 7, ... }
[iCloudSync/iPhone 15 Pro Max] pullAndMerge: merge result           { changed: true, remoteFiles: 1, legacyFiles: 0 }
[iCloudSync/iPhone 15 Pro Max] pullAndMerge: applied merge to stores
```

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
