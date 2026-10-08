---
status: proposed
---

# Buddies on Android: Block Store root seed, FCM pushes, App Links

## Context

Buddies was iOS-only. Its identity is a 32-byte root seed in a synchronizable
iCloud Keychain item (`modules/buddies-keychain`), which survives reinstalls
and follows the User to every device on their Apple Account. Its alerts go
through APNs, and a `content-available` alert wakes the app to sync before the
User opens it. Invite links open the app through universal links. None of that
exists on Android, so `BuddiesKeychain.isAvailable()` returned false there and
the feature stayed hidden.

Everything above the seed is already portable: the protocol is plain HTTPS and
a WebSocket, and the crypto is `@noble/*` in JavaScript, so the same code runs
in Hermes on both platforms. Android needs three native pieces (the seed, push,
and invite links) and one relay change (sending to FCM).

## Decision

### The root seed: Android Keystore on the device, Block Store for restore

The seed is sealed with AES-256-GCM under a non-exportable Android Keystore key
(usable after first unlock, like the iOS item, so a push can sync on a locked
phone) and the ciphertext is kept in `noBackupFilesDir`. The seed is also
stored in **Block Store**, Google Play services' store for small secrets, with
cloud backup requested only while `isEndToEndEncryptionAvailable()` is true
(Android 9+ with a screen lock). The choice is re-checked at each launch, so
setting or removing a screen lock moves the seed into or out of the cloud
backup.

We considered Auto Backup, Android's app-data backup to Google Drive:

|                             | **Block Store** (chosen)                                              | Auto Backup                                                                                                |
| --------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| What it backs up            | One 33-byte entry we write explicitly                                 | Whole files; Keystore keys never back up, so it would have to copy the raw seed                            |
| End-to-end encryption       | Asked for only when available; otherwise the seed stays on the device | Only with a screen lock, and the app can't tell or require it: without one, Google could read the raw seed |
| Reinstall on the same phone | Restored while Google backup is on                                    | Restored only if a backup ran before the uninstall (about daily, on Wi-Fi and charging)                    |
| New phone                   | Restored from the cloud backup (screen lock) during setup             | Restored during setup                                                                                      |
| Timing                      | Written at once                                                       | Whenever the next backup runs, so a new identity can be lost to a reinstall the same day                   |
| Needs Google Play services  | Yes; without them the seed is local only                              | No                                                                                                         |

Block Store wins on the rule that matters most, never backing up raw key
material unless it is end-to-end encrypted, and on timing. Its cost is Google
Play services, which FCM needs anyway.

Restore never guesses. When the local copy is missing, the module asks Block
Store first; a backup it can't check right now (Play services updating, a
timeout) is an error, not "no seed", because creating a new seed would
overwrite the restorable one. A copy it can't decrypt (its Keystore key is
gone) counts as missing. Delete My Buddies Data deletes the Block Store entry
first and fails, keeping everything for a retry, if a backup it wrote can't be
deleted, so a deleted identity can't come back with a reinstall.

What doesn't match iOS:

- Block Store restores at setup and reinstall; it doesn't sync between devices
  in use. A second Android device, or an iPhone and an Android phone, is a
  separate identity with its own buddies. Linking devices stays future work
  (the device-link QR in `buddies-recommendations.md`).
- Without a screen lock the seed survives a reinstall only while Google backup
  is on, and doesn't reach a new phone.
- Without Google Play services the seed lives only on the device.

Auto Backup still copies the app's MMKV data, including Buddies state. If it
restores that without the seed, the device starts a new identity; the old
buddies' slots are missing from the new inbox, so the engine reads them as
ended and clears them, as on iOS when a device backup comes back without
iCloud Keychain.

### Pushes: FCM data-only messages, routed per device

The app registers Android devices with `pushService: "fcm"` and an FCM
registration token; iOS keeps sending its APNs fields with no `pushService`,
so iOS builds in the field are unchanged. The relay stores the service with
each device (a `push_device` table that replaces `device`, migrated in place)
and sends each target through APNs or FCM HTTP v1.

FCM messages are **data-only and high priority**. expo-notifications shows the
localized `title` and `message` in a `buddies` channel, hands the JSON in
`body` to the app as notification data (the same `ww` marker as APNs), and runs
the app's background push task, which syncs as the iOS `content-available`
wake does. A `notification` message would be shown by the system without
waking the app. The Worker signs in with a service account whose custom role
holds only `cloudmessaging.messages.create`, and reuses the JWT-bearer token
code Play Integrity already had (now `src/googleAuth.ts`).

Firebase lives in the existing Google Cloud project (`turing-striker-403102`),
with Android apps for the production and dev packages in one
`google-services.json`, which ships in every APK and holds no secrets.

### Invite links: App Links on the same host

The app's auto-verified intent filter adds `/b`. Verification is per host, so
the `assetlinks.json` that already verifies `/c` covers it. Android hands the
whole URL, fragment included, to the app, and the existing listener routes it.
The no-app page lists Google Play beside the App Store. Without iOS's
`Alert.prompt`, Enter Invite Link on Android reads the link from the clipboard
when tapped.

### Request auth

The relay accepts and ignores the reserved `attest` field, so Android isn't
blocked on attestation. When the relay enforces it, Android uses Play
Integrity, as Notes Import does (ADR 0017).

### Analytics

Invite cards, claims, and `pair.confirmed` carry the sender's platform, inside
the encryption, and each side records `buddy_paired` with its `role` and the
buddy's platform. That answers which pairings of iOS and Android complete,
without names or ids. Builds that don't send a platform show as `unknown`.

## Consequences

- Buddies shows on Android builds with the new native module, behind the same
  `buddies` flag and relay kill switch as iOS.
- Android alerts need Google Play services and the `FCM_SERVICE_ACCOUNT_JSON`
  secret on the Worker; without either, Android still syncs on launch,
  foreground, and the live signal.
- Emulators without Play services, and devices without a screen lock, can't
  exercise cloud restore.
