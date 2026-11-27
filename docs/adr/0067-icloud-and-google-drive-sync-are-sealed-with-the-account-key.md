---
status: proposed
---

# iCloud and Google Drive sync are sealed with the account key

## Context

iCloud Sync (iOS) and its Android twin over the Google Drive app data folder
(ADR 0019) write each device's whole database as plaintext JSON
(`witness-work-<deviceId>.json`), plus contact, profile and note photos as
plaintext JPEGs (`witness-work-img-*.jpg`, `witness-work-note-*.jpg`). Apple
and Google can read all of it, unless the User turned on Advanced Data
Protection. Cloud Sync (ADR 0030, 0040, 0060) already seals the same payloads
end to end with keys derived from the account key. The owner decided that
iCloud and Google Drive sync get the same protection, and that existing users
are migrated.

What makes this harder than Cloud Sync:

- **No server decides who's in the folder.** Any device signed in to the same
  Apple Account or Google Account reads and writes the folder. Today those
  devices need no WitnessWork account in common.
- **The account key isn't always shared.** iOS keeps it synchronizable in
  iCloud Keychain (ADR 0039 §8), so an iPhone and iPad with Keychain on share
  it. Android keeps it in Block Store (ADR 0020), which restores to a new phone
  during setup but never syncs between two phones in use. Two Android phones
  set up separately have different account keys, and different accounts,
  unless the User moved one with the handoff QR code, a passkey or the
  recovery key.
- **Old builds stay in the folder.** A User may run an old build on an iPad
  for months. Old builds can't read a sealed file. JS also ships by OTA update
  onto older native builds, so the format can't need new native code.
- **Nothing may be lost.** The cloud copy is often the only copy left after a
  lost phone.

## Decision

### 1. The key: the account key, through Cloud Sync's derived keys

Files are sealed with the keys Cloud Sync already derives from the account
key: `sync` for snapshots, `syncPhoto` for photos and `syncPhotoName` for
photo names (`deriveSyncKey`, `derivePhotoKeys`). They're domain-separated
from Cloud Sync by their associated data (`ww-account/v1/platform-sync`,
`ww-account/v1/platform-sync-photo`, `ww-account/v1/platform-sync-photo-name`),
so a Cloud Sync blob can never be passed off as a folder file or the other way
round.

Reusing those three keys, rather than deriving new ones, means ADR 0039's key
history already carries them: after a key change, a device opens files sealed
under an older key with `olderAccountKeys(accountId, 'sync')` and
`olderPhotoKeys`, as Cloud Sync does.

The primitives are Cloud Sync's: snapshots use `sealPlaintext` /
`openPlaintext` (XChaCha20-Poly1305 over gzip, the `BackupPlaintext`
envelope); photos use the chunked XChaCha20-Poly1305 of `photoCrypto`.

Each sealed file says which key sealed it with a **key id**: the first 16 bytes
of HMAC-SHA256(sync key, `ww-account/v1/platform-sync-key-id`). It tells two
files apart by key without saying anything about the key or the account.

How the key reaches each device is unchanged: iCloud Keychain, Block Store,
the handoff QR code, a passkey, or the recovery key. A device with no account
key yet, or a different one, can't read a sealed folder (§4).

### 2. File format

- **Sealed snapshot**: next to the plaintext name, `witness-work-<id>.sealed.json`.
  It matches the native module's `witness-work*.json` rule, so it needs no
  native change. Its text is
  `{"version":9007199254740991,"sealed":1,"key":"<key id>","blob":"<b64u>"}`.
  The huge `version` is the payload's own forward-compatibility marker: an old
  build reads the file as "a device on a newer version", skips it without
  deleting anything, and shows "Update WitnessWork to sync all devices".
  `blob` is `sealPlaintext` with associated data
  `ww-account/v1/platform-sync\n<plaintext filename>`, so a file can't be
  moved to another device's name.
- **Plaintext snapshots advertise.** While the folder is still plaintext, a new
  build starts its JSON with `"sealing":{"v":1,"key":"<key id>"|null}`. Old
  builds' payload schema drops unknown keys, so they read it as before.
- **Sealed photo**: `witness-work-note-s_<b64u>.jpg`, where the name itself
  seals the original filename. The `_` keeps old builds' note-photo GC
  (`[A-Za-z0-9-]{8,64}` ids) and avatar GC from ever matching it. The name is
  deterministic (nonce = HMAC(name key, filename)), so one photo always has
  one name and every device finds it without a listing, and the filename is
  padded to 64 or 128 bytes, the way Cloud Sync pads photo meta, so names show
  no length. The content is sealed with a random nonce and associated data
  bound to the original filename.
- Photo bodies aren't padded, as in Cloud Sync: a JPEG's size says little, and
  padding would cost the User's own iCloud or Google storage.
- The account file (ADR 0011, `witness-work-account.json`) stays plaintext. It
  holds a RevenueCat id and a Supporter flag, no records, and is read at
  launch before any account key may exist.

All of this lives in one transport decorator (`createSealedTransport`) around
the iCloud and Drive transports. The sync engine keeps seeing plaintext names
and payloads; Cloud Sync's transport is untouched.

### 3. Migration: plaintext until every recent device can read the sealed format

A device switches the folder to sealed only when all of these hold:

1. The remote switch is on (§6).
2. It has an account key.
3. Its last complete read of the folder is under 15 minutes old.
4. Every other device file written in the last 30 days advertises the same
   key id (in its plaintext prefix, or by being sealed under it).

A device that doesn't advertise (an old build), advertises no key, or
advertises another key holds the switch. The settings screen says which and
why ("needs an app update", "isn't signed in to your WitnessWork account").
Devices quiet for 30 days don't hold it: an iPad last used two months ago
would otherwise keep every User plaintext forever.

The switch, for the device's own file:

1. Seal, then open the sealed bytes in memory and compare with the payload.
2. Write `….sealed.json`.
3. Read it back from iCloud or Drive, open it, and compare again.
4. Only then delete its own plaintext file.

A failure at any step leaves the plaintext file in place and plaintext writes
continuing. It's retried on a later push. Once a sealed file is in the folder,
every new build writes sealed, whatever the switch says, and the decision is
remembered per iCloud or Google account on the device.

**The migration never loses a plaintext copy it hasn't replaced.**

- Readers prefer a device's sealed file, but if it doesn't open and the same
  device's plaintext file is there, they read that instead. A file that opens
  for nobody is shown as unreadable and skipped, never deleted or overwritten
  by the reader.
- New builds keep reading plaintext files. A device that was quiet comes back
  on an old build, keeps writing plaintext, and its changes still reach the
  others; it sees the update notice for theirs.
- Plaintext files of devices quiet for 30 days, in a sealed folder, are sealed
  by any device that has read them: written under the same device name,
  read back and checked, and the plaintext deleted only if it hasn't changed
  since it was read. That moves gone devices' old data out of plaintext
  without dropping it.
- Photos move the same way, a batch per photo pass: download the plaintext
  photo, seal and upload it, download the sealed copy and compare, then
  delete the plaintext one. Other devices download each moved photo once more.

### 4. Devices without the key

- **A device with another account key** (a second Android phone set up on its
  own, or an iPhone with iCloud Keychain off) reads every sealed file as
  locked: no merge, no deletion, and the status "Some devices use a different
  WitnessWork account". It still writes, sealed under its own key, so nothing
  of it is plaintext once the folder is sealed. Signing in to the same account
  on it (handoff QR code, passkey or recovery key) makes everything readable.
  Its own local data is never touched.
- **A device with no account key at all** doesn't write to a sealed folder: a
  push fails with `unauthorized` and retries, until the device has its key.
- **Onboarding's "From iCloud" / "From Google Drive" restore** on such a
  device reports the folder as locked rather than empty, so it never seeds a
  fresh, empty copy over the User's data, and tells the User to sign in first.
- **Account key change** (ADR 0039): the changing device reads files under the
  old key through the key history and writes its own under the new key. Other
  devices pick up the new key (iCloud Keychain, or signing in again) and do
  the same on their next push. Files aren't re-sealed by another device: each
  file has one writer, and iCloud would turn a second writer into a conflict.
  A file under the old key needs the old key and the User's Apple or Google
  account to read.

### 5. Restoring an old plaintext folder

A new install restoring from a folder with only plaintext files (an old
backup, devices long gone) reads them as today. Its next push goes through the
same gate: the other files are over 30 days old, so it seals its own file, and
then seals the gone devices' files as in §3.

### 6. Rollout and pause: ww-api's app config, not a PostHog flag

`GET /app/v1/config` gains `platformSync.sealing` (KV `sync:platform-sealing`,
`on`/`off`; absent or unreadable means on, in every environment). The app keeps the last answer. Only `true` lets a device start a
migration or move photos; an app that never read it, or a worker from before
this, starts nothing.

A PostHog flag would reach only Users with analytics on: PostHog flags don't
load when analytics is off, and those Users care most about this. The config
reaches everyone, without an account. Pausing stops new migrations and photo
passes. It doesn't turn sealed folders back to plaintext: that would expose
data Users were told is sealed. A real defect in reading sealed files gets a
fixed build.

No Lab (ADR 0061): this changes an existing feature, Labs are per device while
the migration is per folder, and a Lab off by default in production would
leave the very Users it's for unprotected.

### 7. Minimum version

The migration needs no `minAppVersion` bump: old builds keep working on
plaintext folders and see "update" notices on sealed ones. Once nearly every
active device runs this release, raising `minAppVersion` to it would stop
quiet old devices from writing plaintext again. That's a separate decision
for the owner.

## Considered options

- **A separate folder key**, random and shared some other way. Every way to
  share it end to end is already a way the account key travels, so it only
  adds a second secret to lose.
- **Seal at once, in place, using `minAppVersion` to force updates.** Simpler,
  but it locks out every old build at once and overwrites the plaintext copy
  in the same write that creates the sealed one.
- **Seal regardless of other devices.** A second Android phone on another
  account, or an old iPad, would silently stop syncing.
- **Sealed photo names as plain HMACs, with a sealed index file.** It needs a
  second file kept in step with the photos, and listing photos would need it
  first.
- **PostHog flag as the kill switch.** It doesn't reach Users with analytics
  off (§6).

## Consequences

- Once a folder is sealed, every device in it needs the same WitnessWork
  account. A new Android phone that wasn't restored from Block Store has to
  sign in (QR code from another device, passkey, or recovery key) before
  "From Google Drive" can restore. This is new for iCloud and Google Drive
  sync, which needed no account before.
- Devices on old builds stop receiving changes once the folder is sealed, and
  see "Update WitnessWork to sync all devices". Their own changes still reach
  new builds.
- A plaintext copy lingers only on devices that are quiet less than 30 days
  and on old builds, and in the account file.
- Apple and Google still see file names, sizes, times, how many devices, and
  how many photos.
- Analytics: `platform_sync_sealing_waiting`, `_started`, `_completed`,
  `_failed`, and `platform_sync_photos_sealed` (`docs/analytics.md`).
- Verification couldn't use a real iCloud or Google account: the transport is
  proven against in-memory and fake-Drive backends, and on a simulator with a
  local fake.
