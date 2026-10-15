---
status: proposed
---

# Move the server account to another phone, recover it, and back it up

## Context

ADR 0024 gave each User an anonymous server account whose one secret, the
account key, is the Buddies root seed. The key follows the User only inside
one platform (iCloud Keychain, or Block Store), and their data only inside one
cloud (iCloud Drive, or Google Drive, for Supporters). So:

- Moving from iPhone to Android, or the other way, loses their buddies and
  leaves their data behind.
- A User without iCloud Keychain, or with two Android phones, has a separate
  identity on each phone.
- A lost phone without a platform backup loses everything.

We still don't want an email, phone number, or password.

## Decision

### 1. The account key is app-wide

The account key stops being a Buddies detail. It's created the first time any
account feature needs it (Buddies, a backup, Set Up Another Device, or the
recovery key), still in the same iCloud Keychain item or Block Store entry.
Buddies keeps deriving its keys from it, so every existing identity carries
over.

A device can now **replace** its account key with one it received
(`replaceRootSeed`). Before it does, it runs Delete Buddies for the old key
when that key has buddies, so they're told, and warns first. On iOS the item
is synchronizable, so the replacement reaches the User's other Apple devices,
which is what they want.

### 2. Set Up Another Device: a QR handoff, like 1Password

The phone that already has the account shows a QR code. The new phone scans
it, from onboarding ("Already use WitnessWork?") or Settings → Account. Both
show the same six-digit code. The old phone asks "Allow *Pixel 9* to sign
in?" and, once allowed, sends the account key sealed to the new phone. The
old phone stays signed in.

- The QR holds a channel id, the old phone's temporary X25519 public key, and
  a 16-byte secret, in a link fragment the server never sees.
- ww-api relays the exchange through one Durable Object per channel. It sees
  the channel id, two temporary public keys, and ciphertext. It keeps nothing
  longer than ten minutes and deletes the channel once the key is picked up.
- The first phone to answer the code claims the channel. A photo of the QR
  isn't enough: the old phone still has to approve, and its code wouldn't
  match.

### 3. A recovery key

The account key written for people: 32 bytes and a 2-byte checksum in
Crockford base32, in groups (`WW1-XXXXX-…`). Settings → Account shows it to
copy, save, or print. Entering it on any phone works like a handoff. The key
is the account, so it's shown only after the device's own authentication
(Face ID, Touch ID or passcode, or the Android screen lock) when one is set.

### 4. An end-to-end encrypted backup, kept by ww-api, for everyone

The app uploads its data, encrypted with a key derived from the account key
(`ww-account/v1/backup`), to an R2 bucket under the account.

- **Per-device slots**, like iCloud Sync's per-device files: each device
  writes only its own, and a restore folds them all with the sync merge. Two
  phones on one account never overwrite each other.
- **The sync payload** (`buildPayload`) is what's backed up, so a restore
  reuses the payload's validation and merge. Photos come in a later change.
- **Opt-in**, from onboarding and Settings → Account, free for every User.
  iCloud and Google Drive sync stay a Supporter feature for keeping devices in
  step; the backup is for moving and recovering.
- **Restore** is offered when a device gets an account key that has a backup:
  after a handoff, a recovery key, or on a fresh install where iCloud Keychain
  or Block Store brought the key back.
- The server stores the ciphertext, its size, upload times, and a random slot
  id per device. The device's name is inside the ciphertext. A deleted slot is
  gone from R2 immediately. Slots not written for 400 days are deleted.
- Delete Buddies deletes the account key, so it deletes the account's backup
  first, and the next backup uploads under the new key. The recovery key then
  changes, and the app says so.

### 5. Anonymous tokens are not planned

ADR 0024 listed anonymous tokens so the relay could suspend someone without
knowing which inboxes are theirs. The inboxes are already pseudonymous, the
cost is a blind-signature scheme on the hot path, and they don't stop a
suspended User from starting over. Option A stays.

## Considered options

- **The new phone shows the QR** (WhatsApp, Signal). Keeps every secret off
  the screen, but isn't the flow Users know from 1Password; the approval and
  matching code cover a photographed QR.
- **Moving data only during a handoff**, with nothing kept. Less to hold, but
  a lost phone would lose everything and a recovery key would bring back only
  the account.
- **One backup per account.** Simpler, but two phones without sync would keep
  replacing each other's backup.
- **24 recovery words.** Easier by hand, but English-only and
  cryptocurrency-like; a grouped key is easier to copy and paste.

## Consequences

- iOS ↔ Android moves keep the account, inbox, buddies, and data (photos
  later).
- ww-api now stores User data. It's ciphertext the server can't read, but the
  privacy policy, the FAQ, and the privacy claims in onboarding must say so.
- Losing both the phones and the recovery key loses the backup: no one can
  read it, including us.
- Whoever has the recovery key has the account. The app says so where it
  shows it.
- Two phones on one account without sync both run Buddies; ADR 0023's Buddy
  Card caveat applies.
