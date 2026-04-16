# iCloud Sync Plan

Plan for adding iCloud sync to WitnessWork. Status: **proposal, not yet implemented**. This doc is the design contract — update it as decisions change.

## Goals

- Multi-device continuity: a publisher with iPhone + iPad sees the same contacts, reports, and conversations on both.
- Zero account setup: use the device's iCloud identity. No email/password, no OAuth.
- Preserve local-first: app keeps working offline; sync is opportunistic.
- Reuse, don't rebuild: piggyback on the existing JSON export format in `ImportAndExportScreen.tsx`.

## Non-goals (for v1)

- Android sync. iCloud is iOS-only; Android users keep the manual export flow.
- Cross-platform web access to data.
- Real-time per-keystroke collaboration.
- Selective sync (pick which stores to sync). All-or-nothing in v1.

## Chosen approach: iCloud Drive document sync

Write a single JSON blob — same shape as the existing `witness-work-backup.json` — into the app's iCloud ubiquity container. iOS handles transport, offline queueing, and cross-device propagation. Each device reads on foreground and merges by `updatedAt` per record.

**Why not CloudKit?** CloudKit gives per-record conflict handling and silent-push updates, but it's a real native module (Swift + `CKSyncEngine` + schema deployment to CloudKit Dashboard in dev _and_ prod environments). The document approach ships in days, validates user demand, and keeps the data shape identical to exports — so a CloudKit migration later is a transport swap, not a rewrite.

**Why not `NSUbiquitousKeyValueStore`?** 1 MB total / 1 KB per key. Contacts alone blow past that.

See [Alternatives considered](#alternatives-considered) for the full tradeoff.

## Architecture

```
zustand stores (MMKV) ──▶ buildBackupPayload() ──▶ witness-work.json (ubiquity container)
                                  ▲                         │
          store.subscribe() (debounced 5s)                  │ NSMetadataQuery
                                  │                         ▼
                          iCloudSync.push()          iCloudSync.pullAndMerge()
                                                             │
                                                             ▼
                                                  per-record updatedAt merge → zustand
```

The payload shape _is_ the existing export format (`src/screens/ImportAndExportScreen.tsx`). One JSON file, four top-level keys: `contacts`, `serviceReports`, `conversations`, `preferences`, plus metadata (`version`, `deviceId`, `writtenAt`).

Conflict resolution happens in JS, not via iCloud's file versioning. iCloud gives us "here's the latest file"; we do a per-record merge against local state by `updatedAt`.

## Key files (to create)

| File                                                                   | Purpose                                                                                                  |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `plugins/with-icloud-container.js`                                     | Expo config plugin. Adds iCloud entitlements + `NSUbiquitousContainers` Info.plist keys during prebuild. |
| `src/lib/sync/payload.ts`                                              | `buildBackupPayload()` / `applyBackupPayload()`. Same shape as `ImportAndExportScreen` export.           |
| `src/lib/sync/merge.ts`                                                | Per-record merge by `updatedAt`. Handles tombstones.                                                     |
| `src/lib/sync/iCloudSync.ts`                                           | `installiCloudSync()`. Subscribes to stores, debounces writes, listens for foreground + remote changes.  |
| `src/screens/settings/preferences/screens/PreferencesiCloudScreen.tsx` | Settings row: toggle, status, last sync, "Sync now", "Reset sync".                                       |
| `src/stores/preferences.ts` (edit)                                     | Add `iCloudSyncEnabled`, `lastiCloudSyncAt`, `iCloudDeviceId`.                                           |

## Entitlements & config

Add to `app.config.ts` ios block (via config plugin, not hand-edited):

```ts
entitlements: {
  'com.apple.developer.icloud-container-identifiers': [
    IS_DEV ? 'iCloud.com.leviwilkerson.jwtimedev' : 'iCloud.com.leviwilkerson.jwtime',
  ],
  'com.apple.developer.icloud-services': ['CloudDocuments'],
  'com.apple.developer.ubiquity-container-identifiers': [
    IS_DEV ? 'iCloud.com.leviwilkerson.jwtimedev' : 'iCloud.com.leviwilkerson.jwtime',
  ],
},
```

Info.plist addition:

```xml
<key>NSUbiquitousContainers</key>
<dict>
  <key>iCloud.com.leviwilkerson.jwtime</key>
  <dict>
    <key>NSUbiquitousContainerIsDocumentScopePublic</key><false/>
    <key>NSUbiquitousContainerName</key><string>WitnessWork</string>
    <key>NSUbiquitousContainerSupportedFolderLevels</key><string>None</string>
  </dict>
</dict>
```

**Dev/prod split**: Mirror the App Group pattern (`group.com.leviwilkerson.jwtime` / `jwtimedev`). Never let dev builds read prod user data.

**Team provisioning**: The iCloud container must be registered in the Apple Developer portal under team `Y3KE7B7AHJ`. EAS build will fail if it isn't. This is a one-time manual step.

## Library choice

**`react-native-cloud-store`** — actively maintained, wraps `NSFileCoordinator` / `NSFilePresenter` / `NSMetadataQuery`. Gives us:

- Read/write to ubiquity container
- Change notifications (file appeared, file updated remotely)
- Upload/download progress
- iCloud availability check (`FileManager.default.ubiquityIdentityToken`)

Alternatives evaluated:

- **`react-native-icloudstore`**: KVS only, doesn't cover documents.
- **`@react-native-community/cloud-storage`**: broader scope (iCloud + Google Drive) but thinner iCloud surface; no `NSMetadataQuery` bindings for remote-change events.
- **Custom Expo module**: correct long-term answer for Option 2 (CloudKit). Overkill for document sync.

Fallback plan: if `react-native-cloud-store` has blocker gaps on Expo SDK 55 / RN 0.83, write a thin Expo module wrapping the three AppKit/Foundation classes. ~300 LOC Swift.

## Sync layer behavior

### Write path (debounced 5s after any store mutation)

1. `buildBackupPayload()` serializes all four Zustand stores.
2. Stamp `writtenAt = Date.now()` and `deviceId` (persisted UUID per install).
3. Write to `<ubiquity-container>/Documents/witness-work.json` via `NSFileCoordinator` write coordination.
4. Update local `lastiCloudSyncAt`.

Debounce prevents a storm of writes when importing a backup or during bulk edits.

### Read path (triggers)

- `AppState` → `active` transition.
- `react-native-cloud-store` remote-change event (another device wrote).
- Manual "Sync now" button in Settings.
- Existing `expo-background-task` hourly hint (extend to also pull).

### Merge algorithm

For each store, compare remote records vs local by `id`:

- **Remote-only** → insert locally.
- **Local-only** → leave alone (it will get pushed on next write).
- **Both** → pick the record with the newer `updatedAt`.
- **Tombstones** (`deletedContacts[]` pattern): a tombstone with `updatedAt > record.updatedAt` wins — deletes propagate.

Preferences are merged key-by-key with last-writer-wins on a per-key `updatedAt` map. This avoids a theme toggle on device A reverting a publisher-type change on device B.

### Schema migration

Add `updatedAt: number` to every record type that doesn't have it (contacts already has `createdAt`; reports and conversations need audit). Backfill on first sync boot: `updatedAt = createdAt ?? 0`. Bump a `PAYLOAD_VERSION` constant in `payload.ts`; mirror the widget snapshot pattern.

## Settings UI

New row in Settings → Preferences → **iCloud Sync**:

- **Toggle**: "Sync with iCloud". Off by default until user opts in. On first enable, show a bottom sheet explaining what syncs and asking whether to **merge** existing local data with iCloud or **replace** iCloud with this device's data.
- **Status**: "Synced 2 minutes ago" / "Waiting for network" / "iCloud signed out — check iOS Settings".
- **Device list**: read from the metadata in the blob — show which devices have written recently.
- **Sync now** button.
- **Reset sync** (destructive, confirm): clears the ubiquity file; next push re-seeds from this device.

Watch `NSUbiquityIdentityDidChangeNotification`. If the user signs out of iCloud mid-session, disable sync and show an inline warning — never silently fail.

## Background refresh

Extend `src/lib/widgets/widgetSync.ts`' existing `BGTaskScheduler` registration to also trigger `iCloudSync.pullAndMerge()`. One background task, two consumers (widget snapshot + iCloud pull). Same 15-min–1h opportunistic schedule iOS gives us.

## Security & privacy

- Data sits in the user's private iCloud container; Apple holds the encryption keys (unless the user has Advanced Data Protection enabled, in which case it's E2E).
- We write no auth credentials, no API tokens, no location-only records that aren't already stored locally.
- Update the privacy policy to list iCloud as a data processor.
- Contacts export has a "share contact via universal link" path — that's unchanged and independent of iCloud sync.

## Edge cases

- **Fresh install on device 2 with existing iCloud blob**: on first launch after enabling sync, detect non-empty remote + empty local → pull without prompt. Show a one-time toast: "Restored X contacts, Y reports from iCloud."
- **Fresh install on device 2 with existing local data AND remote blob**: show the merge/replace sheet described above.
- **Clock skew**: `updatedAt` is device-local `Date.now()`. Two devices with badly wrong clocks can produce incorrect merges. Acceptable — iOS system clocks are NTP-synced.
- **Large payloads**: rough estimate — 1000 contacts + 500 reports + 2000 conversations ≈ <1 MB JSON. Comfortably within iCloud document limits (which are effectively file-size, not quota-per-file).
- **Corrupt remote file**: validate against the same Zod-ish shape the export importer uses. On parse failure, keep local data, surface a "Sync error" in Settings, don't overwrite remote.
- **iCloud quota full**: surface the error; don't retry in a tight loop.
- **Widget App Group container**: unchanged. Widget still reads `snapshot.json` from App Group. After an iCloud pull, regenerate the snapshot locally. Don't sync the snapshot itself.

## Rollout

1. **Internal build** (dev variant, `iCloud.com.leviwilkerson.jwtimedev`) — validate on two of the maintainer's devices.
2. **TestFlight** — opt-in flag off by default. Gather reports.
3. **Production** — enable the Settings row. Keep opt-in off by default for a release; let users discover it. Monitor Sentry for `iCloudSync` errors.
4. **Observability**: add breadcrumbs for `push`, `pull`, `merge-conflict-resolved`, `icloud-unavailable`. No PII in breadcrumbs.

## Open questions

- Do we want a "History" view showing recent writes per device? Probably v2.
- Should preference keys be selectively excluded from sync (e.g., `hasSeenOnboarding`, device-specific theme)? Start with allow-list of syncable keys in `preferences.ts`; everything else stays local.
- How do we handle a user who has both Android and iOS devices? They keep using manual export. Don't conflate the two paths.

## Alternatives considered

### CloudKit with `CKSyncEngine` (iOS 17+)

Proper multi-device sync with per-record conflict handling, silent-push-driven updates, and Apple-managed retries. **Rejected for v1** because it's a real native module (Swift + Expo config plugin + CloudKit Dashboard schema in dev and prod), plus CKRecord mapping for four entity types. Estimated weeks, not days. Revisit if document sync users hit conflict pain.

### `NSUbiquitousKeyValueStore`

1 MB / 1 KB-per-key limit. Contacts alone exceed it. Could use it for preferences-only, but then we have two sync mechanisms. **Rejected** — not worth the complexity.

### Core Data + `NSPersistentCloudKitContainer`

Apple's one-call solution, but requires rewriting from Zustand to Core Data. Not happening.

### Supabase / custom backend

Gives cross-platform sync (Android + web) but requires auth, hosting, a privacy-policy overhaul, and ongoing server costs for a local-first OSS app. **Rejected** — against the product's ethos.

## Milestones

1. **Config plugin + entitlements** — build produces a binary that declares iCloud capability. No runtime code yet.
2. **Sync layer read/write** — `iCloudSync.push()` and `pullAndMerge()` work when invoked manually from a debug menu.
3. **Merge + tombstones** — contacts/reports/conversations pass round-trip tests across two simulators.
4. **Settings UI + opt-in toggle** — user-visible entry point, status, manual controls.
5. **Background pull + foreground auto-sync** — no user action needed for steady-state sync.
6. **TestFlight** — real-device validation, Sentry wired up.
