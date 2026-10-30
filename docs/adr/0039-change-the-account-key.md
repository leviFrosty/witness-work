---
status: proposed
---

# Change the account key

## Context

The account key is the account. Whoever has it, or the recovery key (the same
thing written out), can:

- sign in;
- read every backup and Cloud Sync slot;
- act as the User in Buddies.

Until now, the only way to replace the key was Delete Buddies, which also
starts a new server account.

The web keeps the key in the browser (ADR 0038 §8), so a stolen, unlocked
computer can give it away. Signing that browser out stops its access to the
server, but a copied key still works anywhere else.

## Decision

### 1. Same account, new key

"Change account key" is in Settings → Account, and is also offered after
signing out a lost device. It generates a new account key and keeps the same
server account. Sessions, Supporter links, the activity log, sync and backup
slots, and inbox links all key on `accountId`, so they carry over.

### 2. Who can change it

The User must pass a fresh check: Face ID, or a passkey with user
verification. The session must also be at least 24 hours old, or belong to an
attested phone. A browser that signed in minutes ago can't change the key.

The recovery key is the account key, so whoever has it and acts first wins.
There's no support override.

### 3. Server

`POST /accounts/v1/account/rekey` needs a live session and signatures by both
the old and new keys. One batch:

1. Swaps `account_pub`, but only while the stored key and a `key_epoch` still
   match.
2. Adds the old public key to a retired list.
3. Ends every other session.
4. Deletes passkey wraps, re-wrapping the passkey just used, if any.
5. Stores the key history blob (§6).
6. Logs `account.key_changed`.

Around it:

- **Retired keys:** a session open with a retired key is refused with
  `key_retired`. It never creates a new account.
- **Key epoch:** access tokens carry it, and writes with an older epoch are
  refused, so a signed-out device's last token can't overwrite re-encrypted
  data.
- **Suspended accounts:** they can still change the key, since it only
  protects the User's own data.

### 4. On the device

Ordered, and resumable after a crash:

1. Create the new key as pending.
2. Show the new recovery key and require "I've saved it".
3. Commit on the server.
4. Store the key in iCloud Keychain, Block Store, or the browser.
5. Re-encrypt every Cloud Sync slot, Cloud Sync photo (ADR 0040 §6) and
   backup slot under the new key, including other devices' slots.
6. Reset Buddies with reconnect invites (§5).
7. Delete the old key. The keys derived from it for each old Buddies pairing
   stay, in this device's own secret storage, until every pairing is left.

Two devices changing the key at once can't both win, because of the epoch
check.

### 5. Buddies reset, with reconnect invites

Anyone with the old key can write to every buddy as the User and read their
inbox. Before the change, while the old key is still the account's, the app
links the old inbox to the account if it isn't yet. Then it:

1. Creates a new inbox from the new key, and links it to the same account.
2. Deletes the old inbox, naming the new one as its successor. The server
   records it only for an inbox of the same account linked under the
   account's current key, so only the new key can name one.
3. Sends each buddy a sealed reconnect invite through the old pairing, then
   seals that pairing's slot in their inbox (`slot/seal`) right away. After
   that, nothing more can be written there with the old key, whoever signs.
4. Leaves each buddy once they claim it, or 24 hours after their invite.
   Leaving a sealed slot keeps the invite for them to read.

A buddy gets no invite if someone with the old key sealed the slot first,
or if the server keeps refusing the invite. The app seals the slot anyway
and leaves it at once.

If the server can't record the successor, the app still deletes the old
inbox, sends no invites, and leaves every buddy at once, so the change always
ends.

A buddy accepts a reconnect invite only when the server names its inbox as
the old inbox's successor. Buddies on a current version reconnect with one
tap. Others see the User leave.

The old key's writes to a buddy end at the seal, right after their invite.
The new inbox has room for an invite to every buddy (at most 5) at once, so
every slot is sealed right away. If the changing
device stops before a seal, the buddy's app still ends the pairing: when they
reconnect or dismiss the invite, when a write to the User finds the old inbox
gone, or when the invite lapses (7 days) and the server names a successor.

Someone who kept the old key can still deny a buddy their reconnect. They can
seal or leave the slot before the invite is written, or use up its request
budget so the invite keeps failing. They can't impersonate the User: a buddy
takes only the invite to the successor the server names. The buddy and the
User can pair again by hand.

### 6. Key history

Old "My Account" backup files, which are locked to the account key, still
open. A server blob readable only with the current key holds the keys derived
from older account keys, not the older keys themselves.

### 7. Passkeys and other devices

- **Passkeys** keep working for sign-in. Each one saves a new wrap the next
  time it's used on a device that has the new key.
- **Other devices** are signed out. They rejoin with a passkey, a QR from a
  signed-in device, or the new recovery key.
- **A device that comes back with the old key** is refused and asked to sign
  in again. It never writes old data.

### 8. iCloud Keychain

The key stays synchronizable in iCloud Keychain. So the new key reaches the
User's other Apple devices, including a lost one that's still signed in to
the Apple Account. The Help Center tells Users to remove a lost Apple device
from their Apple Account. The flow adds no step of its own for this.

### 9. Supporter link

The old key reveals the account's RevenueCat id, which travels in the
encrypted sync data (ADR 0040 §7). Another account could link that id to claim
Supporter status. So on a key change, ww-api unlinks each of the account's
RevenueCat customers from every other account that first linked it later than
this account did. When no account linked it earlier, ww-api also refuses new
links to it from other accounts for 90 days.
Accounts that linked it earlier keep their links, so changing a key can't take
Supporter status from the customer's first owner.

### 10. Older app versions

Sessions record the app version. The flow warns when a signed-in device is too
old to rejoin, and `minAppVersion` rises one release after this ships.

## Considered options

- **Keep buddies connected by rotating keys in the relay.** Every buddy would
  need a new version, and the relay would learn more than it does today. Much
  larger.
- **Keep the old key for Buddies only.** A thief keeps impersonating the User
  to their buddies.
- **Delete Buddies, which starts a new account.** It loses Supporter links,
  history and the account's identity.
- **Keep the old keys themselves in the key history.** Unnecessary, because
  derived keys are enough.
- **Make the key this-device-only so lost Apple devices don't receive it.**
  The User's own iPad and Mac would stop just working. It may come later as
  an option.

## Consequences

- A copied key stops working everywhere, except on Apple devices that still
  receive iCloud Keychain.
- Buddies have to reconnect after a change.
- The old key can write to a buddy until that pairing ends (§5): at worst
  until the buddy's app next runs.
- The successor check protects buddies only after the change, and only when
  the old inbox was linked to the account first. If someone holding the old
  key linked an inbox from before accounts to their own account before the
  change, they can name its successor at any time. The change only detects
  it and leaves every buddy without inviting them.
- Delete Buddies can later reuse the same operation to keep the account.
