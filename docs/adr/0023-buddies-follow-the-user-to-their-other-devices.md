---
status: proposed
---

# Buddies follow the User to their other devices through the roster, started by iCloud Sync

## Context

Buddies' root seed is a synchronizable iCloud Keychain item, so every device on
the Apple Account already has the same identity and inbox. Users with iCloud
Sync still didn't see their buddies on their other devices:

- Buddies ran only after a device had registered the inbox itself (inviting,
  accepting, or pulling to refresh in Buddies). A second device showed the
  first-visit intro and then an empty list, and got no Buddies alerts.
- Answers to invitations, and which bell entries were read or dismissed, lived
  on one device. Another device kept asking for an answer already given.
- A nickname, color, or calendar choice reached only a device that didn't know
  the buddy yet.
- Once two devices ran, both sent every shared Plan and every change to it with
  their own `rev`, so buddies got each alert twice. Starting Buddies on every
  device would have made that the norm.

## Decision

1. **The roster carries the User's marks**: answers (newest per invitation, a
   cancel's mark beating answers given before it), bell entries read or
   dismissed, and a `prefsAt` per buddy. Last-writer-wins per entry, unioned
   like the roster's tombstones, capped to stay inside the 32 KB roster.
2. **A device starts Buddies by itself** when the seed is there, iCloud Sync (or
   Google Drive) is on and has pulled once. The first sync registers the device,
   restores everything above, and push registration follows.
3. **Sends stay idempotent across devices.** Shares already in a device's data
   at its first sync, or arriving through iCloud Sync, are taken as sent. Sends
   that alert use the Plan's or Follow-up's sync `updatedAt` as `rev`, so two
   devices produce one event id and the relay alerts once. A device without the
   Profile photo file publishes Buddy Cards only for its own changes.

## Considered options

- **Buddies state in the iCloud Sync payload.** Rejected: iCloud Drive isn't
  end-to-end encrypted under standard data protection, Buddies' design keeps
  its keys and buddy graph out of it, and the payload is Supporter-only while
  the roster serves every User whose devices share the seed. The payload adds
  nothing a device without the seed could use.
- **The seed in iCloud Drive** for Users with iCloud Keychain off. Rejected for
  the same reason; a device-link QR remains the way to cover them.
- **Starting Buddies on every device with the seed.** Rejected: without iCloud
  Sync a device's Plans differ, and its Buddy Card would replace the other
  device's for every buddy.

## Consequences

- iCloud Sync Users get Buddies, with the same answers and bell, on every
  device; Users without it keep opening Buddies on each device themselves.
- Devices with iCloud Keychain off still have separate identities.
- A device without the Profile photo still drops the photo from buddies' view
  when the User changes their Plans on it.
- Older builds ignore the new roster fields and write rosters without them; a
  newer device writes them back on its next sync.
