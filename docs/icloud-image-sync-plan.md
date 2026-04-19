# iCloud Image Sync Plan (Phase 2)

Plan for syncing user-uploaded images (profile avatar + contact avatars) through iCloud Drive as an opt-in extension of the existing iCloud sync. Status: **Phase 1 shipped, Phase 2 proposed but not yet implemented**.

## Phase 1 (shipped)

Already in the codebase. Establishes the privacy-safe default and the preference plumbing that Phase 2 reads:

- **Image avatars stripped from every sync payload** in `src/lib/sync/payload.ts` (`stripImageAvatar` / `stripImageProfileAvatar`). Emoji and `none` avatars still travel. The per-device `file://` URI stored in `avatar.value` would be a dead path on every other device, so it never crosses the wire.
- **Image avatars stripped from the `.witnesswork` file export** in `src/screens/ContactDetailsScreen.tsx`. Matches the universal-link share policy (`contactShareLink.ts` `CONTACT_POLICY.avatar: 'omit'`). The recipient picks their own avatar.
- **`iCloudSyncIncludeImages` preference** (default `false`, non-syncable). Added to `PREFERENCE_DEFAULTS` in `src/stores/preferences.ts` and to `NON_SYNCABLE_PREFERENCE_KEYS`. Not yet surfaced in UI. Per-device so consent isn't implicitly extended across an Apple ID's other devices.

Phase 1 has no user-visible UI. Phase 2 adds the toggle, the warning, and the actual binary sync.

## Goals

- Opt-in image sync that preserves **original upload quality** (contact photos are often used as reference — house numbers, landmarks — so lossy re-encoding is off the table).
- Preserve the local-first posture: images still live in `FileSystem.documentDirectory`; iCloud is a replication layer, not the source of truth.
- Make the privacy trade-off loud on enable. The user must be told plainly that images will leave the device and live in iCloud Drive.
- Complete cleanup on disable: previously uploaded copies are deleted from the ubiquity container.

## Non-goals

- Compressing or re-encoding images to save iCloud storage. Originals only.
- Partial sync (only profile, or only some contacts). Whole-or-nothing — the setting gates all images.
- Backfilling images into the `.witnesswork` file export or the universal-link share. Those paths stay image-free regardless.

## Storage approach: separate binary files in the ubiquity container

Chosen over inline base64 in the JSON payload because:

1. **Quality preservation.** Inline base64 forces the payload to carry full-resolution bytes on every push — a ~1 MB photo re-encodes on every edit to an unrelated field. Separate files let us upload an image exactly once per actual change.
2. **Payload size hygiene.** `buildPayload` currently snapshots every store on each push. Embedding images would grow the common-case payload from ~KBs to MBs.
3. **Atomic deletes.** On disable we can delete image files without rewriting the JSON payload on every device.

Trade-off: Phase 2 requires new Swift bridge methods and a second filename namespace. Accepted.

### Filename namespace

A sibling to the existing `witness-work-<deviceId>.json` JSON namespace. Image files live at:

```text
iCloud Drive /Documents/
  witness-work-<deviceId>.json                       ◀──  JSON sync (Phase 1)
  witness-work-img-profile.jpg                       ◀──  user's profile image
  witness-work-img-contact-<contactId>.jpg           ◀──  per-contact image
```

Validator rules in `ICloudBridgeModule.swift` `isValidImageFilename`:

- Must start with `witness-work-img-`.
- Must end with `.jpg` (we always re-wrap to JPEG at save time via `ImagePicker` for consistent decoding).
- No path separators, no `..` components.

Filenames are deterministic — same contact id always maps to the same filename — so pushes overwrite atomically and pulls have a single source of truth per identity.

### Why no per-device image files?

Unlike JSON payloads (which need per-device files to avoid iCloud Drive conflict duplicates), images are keyed by _the identity they belong to_, not the device that wrote them. Two devices editing the same contact's avatar is a last-write-wins situation already governed by `contact.updatedAt`. `NSFileCoordinator` handles the same-filename write contention locally; iCloud Drive handles the transport. The worst case — a rare conflict duplicate — resolves on the next push.

## Architecture changes

### Native bridge (`modules/icloud-bridge/ios/ICloudBridgeModule.swift`)

New methods, all following the existing coordinated-read/coordinated-write pattern:

- `writeBinary(filename: String, base64: String) -> Promise<Double>` — writes image bytes to the ubiquity container under a validated image filename, returns `modifiedAt` epoch ms.
- `readBinary(filename: String) -> Promise<String>` — kicks off `startDownloadingUbiquitousItem` if needed, polls up to 10 s for `.current`, then returns base64-encoded bytes.
- `deleteBinaryFile(filename: String) -> Promise<null>` — coordinated delete, idempotent.
- `listBinaryFiles() -> Promise<[String]>` — enumerates every `witness-work-img-*.jpg` in the container.
- `deleteAllBinaries() -> Promise<null>` — used by the disable path.

Filename validation shares the existing hardened rules — `isValidImageFilename` is the binary-namespace twin of `isValidSyncFilename`. Anything outside the namespace is rejected at the bridge boundary.

### TS bridge (`modules/icloud-bridge/index.ts`)

Matching exports for each of the above. Same optional-native-module guard pattern (no-op on non-iOS, throws on `write` when unavailable).

### Payload (`src/lib/sync/payload.ts`)

`stripImageAvatar` / `stripImageProfileAvatar` become conditional on `prefs.iCloudSyncIncludeImages`:

- When `false` (default): behavior unchanged from Phase 1 — images stripped.
- When `true`: `avatar.value` is rewritten from the local `file://...` URI to the container-relative filename (`witness-work-img-contact-<id>.jpg`). The type stays `image`.

### Push path (`src/lib/sync/iCloudSync.ts`)

On each push, when `iCloudSyncIncludeImages` is `true`:

1. Walk local contacts + profile for `avatar.type === 'image'`.
2. For each, compute the deterministic container filename from the identity.
3. Read the local image file from `FileSystem.documentDirectory` as base64.
4. Call `writeBinary(filename, base64)`.
5. Track which filenames this device uploaded in a local map (keyed by identity id) so we can diff next time and skip no-op uploads. The map is non-syncable bookkeeping.

Images upload _in parallel_ after the JSON push completes. A failure to upload a single image logs but doesn't fail the overall sync — the record's `updatedAt` still propagates and the next push retries.

### Pull / merge path (`src/lib/sync/merge.ts`, `iCloudSync.ts`)

After the existing merge produces the new local state:

1. For any merged contact/profile whose `avatar.type === 'image'` and whose `avatar.value` matches the `witness-work-img-*` pattern (i.e. it came from another device), check whether we have a local copy at the expected `FileSystem.documentDirectory` path.
2. If missing or stale (we track per-filename `modifiedAt` from `readAll`), call `readBinary(filename)`, write the bytes to `FileSystem.documentDirectory/contact-<id>-avatar.jpg` (or `profile-avatar.jpg`), and rewrite `avatar.value` to the freshly-written local `file://` URI with the existing cache-buster pattern (`?t=<ts>`).
3. Downloads happen in parallel, bounded (max ~4 concurrent) to avoid hammering the network.

On-device-only images (this device's uploaded originals) continue to live at their existing `documentDirectory` paths — we don't rename them.

### Disable path (toggle off)

Triggered from `PreferencesiCloudScreen` when the user flips `iCloudSyncIncludeImages` → `false`:

1. Confirm with the user (destructive alert — see UI copy below).
2. Call `listBinaryFiles()` → `deleteBinaryFile(filename)` for every returned name, or `deleteAllBinaries()` for efficiency.
3. Next push uses the Phase 1 stripping rule — images vanish from the JSON payload too.
4. Local `documentDirectory` images are **not** touched. The user's own device copy stays intact; only the iCloud replicas are removed.

Other devices pull the next JSON payload (images stripped), observe their merged contacts no longer reference image filenames, and fall back to the letter/emoji/icon avatar. Their _previously-downloaded_ local copies stay on disk but become orphaned references; a follow-up sweep could GC these, but it's not urgent.

## UI (PreferencesiCloudScreen)

New `Section` below the enable toggle + status rows, visible only when `iCloudSyncEnabled` is `true`:

```text
┌──────────────────────────────────────────────┐
│ Include images in sync          [toggle]     │
│ Upload profile + contact photos to iCloud so │
│ they appear on your other devices.           │
└──────────────────────────────────────────────┘
```

On toggling **to on**, present a confirmation alert:

> **Upload images to iCloud?**
>
> Your profile picture and any contact photos you've added will be copied to your iCloud Drive. They'll sync to your other devices and count against your iCloud storage quota — originals are uploaded uncompressed to preserve quality (helpful for reference photos like house numbers).
>
> For the strongest privacy, we recommend enabling **Advanced Data Protection** for iCloud (Settings → [Your Name] → iCloud → Advanced Data Protection) so images are end-to-end encrypted with only your devices holding the keys.

Actions: **Enable** (destructive styling — this changes what leaves the device) / **Cancel**.

On toggling **to off**, present a destructive confirmation:

> **Remove images from iCloud?**
>
> Photos already uploaded will be deleted from iCloud Drive on your next sync. Your local copies stay on this device. Your other devices will lose their downloaded copies on their next sync and fall back to initials.
>
> Continue?

Actions: **Remove** (destructive) / **Cancel**.

### Supporting copy placements

- Subtitle under the toggle label: `Upload profile + contact photos. Originals preserved; counts against iCloud storage.`
- Info footer below the section (small text, `theme.colors.textAlt`): `Images are stored in your iCloud Drive and follow whatever encryption you have enabled for your Apple ID. Enable Advanced Data Protection for end-to-end encryption.`
- Optional link row: `Learn about Advanced Data Protection` → opens `https://support.apple.com/guide/security/advanced-data-protection-for-icloud-sec973254c5f/web`.

## Preference wiring recap

| Key                       | Default                                               | Syncable? | Purpose                                  |
| ------------------------- | ----------------------------------------------------- | --------- | ---------------------------------------- |
| `iCloudSyncEnabled`       | `false` (seeds `true` for supporters on first launch) | No        | master iCloud sync switch                |
| `iCloudSyncIncludeImages` | `false`                                               | No        | image binary opt-in (Phase 2 reads this) |

Both stay per-device. A user enabling image sync on their iPhone does **not** implicitly enable it on their iPad — they must flip the toggle there too, and confirm the warning there too.

## Testing plan

Cannot be fully exercised in unit tests — requires two iOS devices signed into the same iCloud account.

- **Unit** (`src/lib/sync/__tests__/`): extend payload tests to cover the pref-on / pref-off avatar stripping branches. Mock the binary bridge; verify push/pull handlers call it with the expected filenames.
- **Swift** (manual): on-device, enable image sync, add a contact with a photo, observe `witness-work-img-contact-<id>.jpg` appear in the ubiquity container (Files.app → iCloud Drive → WitnessWork).
- **Two-device** (manual): enable on both devices; add image on Device A; verify it appears on Device B after foreground pull. Disable on Device A; verify image removed from iCloud and Device B falls back to initial.
- **Quota pressure**: test with `iCloudSyncIncludeImages` on while the user has <10 MB free in iCloud. Expect `writeBinary` to reject and the sync to log without failing overall.
- **Advanced Data Protection**: verify the Settings link deep-links correctly on iOS 16.2+.

## Open questions

- **GC for orphaned local downloads on other devices**: after a disable, pulled copies are left on `FileSystem.documentDirectory` with no referencing contact. Sweep on next launch, or leave them as harmless dead files? Proposed: sweep on app launch when `iCloudSyncIncludeImages` transitions false → anything, using a small manifest file tracking image filenames-we-downloaded.
- **Multi-device race on disable**: Device A disables + deletes; Device B pushes in parallel with image sync still on locally. Device B's push re-uploads. Mitigation: the disable flow writes a `disabled-at` timestamp into the JSON payload; receiving devices see it and auto-flip their own `iCloudSyncIncludeImages` to false. Needs UX review — silently flipping a privacy-impacting preference on another device is dicey. May be safer to just accept the transient inconsistency.
- **Non-JPEG source images**: `ImagePicker` outputs JPEG already, but future-proofing: if we ever accept PNG/HEIC, the filename extension needs to reflect the actual encoding, or we re-wrap on save. Phase 2 ships JPEG-only.
