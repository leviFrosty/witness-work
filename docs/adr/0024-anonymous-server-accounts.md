---
status: proposed
---

# Anonymous server accounts, starting with suspending Buddies abuse

## Context

WitnessWork has no accounts, by design: no email, phone number, or sign-in.
That leaves two gaps.

- **Abuse.** Buddies' relay is blind: an inbox is a random id and an owner key.
  A buddy can remove someone, but we can't stop a person from using Buddies at
  all, and Apple's guideline 1.2 expects a way to block abusive users.
- **Moving between platforms.** A User's identity (the Buddies root seed) and
  their data live in their platform's storage: iCloud Keychain and iCloud
  Drive, or Block Store and Google Drive. Moving from iPhone to Android, or
  back, loses their buddies and leaves their data behind.

Both need something the server owns and the User can prove they hold, without
asking who they are.

## Decision

1. **An account key and a server account.** The account key is the User's one
   secret: today the Buddies root seed, which is already 32 random bytes that
   follow the User through iCloud Keychain or Block Store. Every key derives
   from it with its own HKDF label. The server owns an `accounts` row: a
   random `accountId` it mints, the public half of the account signing key,
   and a status. No personal data. Wire contract:
   [`docs/accounts-protocol.md`](../accounts-protocol.md).
2. **The server knows which inbox each account owns** (Option A). Registering
   an inbox carries the account key's signature over the inbox id and owner
   key, inside the owner-signed payload, so a link takes both keys. A
   suspension then reaches the account's inboxes without anything on the
   User's devices having to cooperate.
3. **D1 through Drizzle** for the accounts database (`ww-api/src/accounts`),
   beside the existing per-inbox Durable Objects. Account writes are rare and
   moderation needs queries across accounts. The Buddies hot path never reads
   D1: each inbox keeps a copy of its suspension, and the Worker checks D1
   only at registration.
4. **Suspension** refuses every owner op except leaving (`inbox/delete`,
   `slot/remove`) and closes the live socket. Maintainers suspend and
   reinstate through token-protected admin endpoints; every change is
   recorded with a reason code.
5. **The server goes first.** Production's database (`ww-accounts`) is bound
   in the same ww-api release, which lands before this app version. App
   versions before it never send a proof, so they register unlinked as before.
   Without the D1 binding, accounts are off and the app works unlinked.

This is phase 1. Moving the account to another phone by QR code, a recovery
key, and an end-to-end encrypted backup are ADR 0026, which also drops
anonymous tokens from the plan.

## Considered options

- **Option B: no link on the server.** The account key vouches for each
  inbox only to buddies, inside the encrypted pairing, and the server learns
  the link from a report. It keeps the server from knowing which inbox is
  whose, but enforcing a suspension then needs anonymous tokens on every
  request. Deferred: Option A works now, and tokens can come later.
- **A per-account Durable Object.** Consistent and fast, but moderation needs
  queries across accounts, which would need D1 anyway.
- **Postgres through Hyperdrive.** More than this data needs, and another
  processor for the privacy policy.
- **A new account key separate from the root seed.** Existing Buddies Users
  would need their inbox moved to new keys. Using the seed keeps every
  existing identity, and features that come later derive their keys from it.

## Consequences

- The server can suspend a User's Buddies without knowing who they are.
- The server now knows which inbox belongs to which account. A demand for that
  table would show which inboxes one person owns, not who they are or who
  their buddies are. Inboxes are already pseudonymous, and the buddy graph
  stays encrypted.
- Someone suspended can delete everything and start a new identity. App
  Attest and Play Integrity on registration (reserved, not enforced) are what
  would make that costly.
- On Android, two phones still have two seeds, so two accounts, until the QR
  move (ADR 0026) joins them.
- The name clash with ADR 0011's account id is deliberate to resolve later:
  the server account could become the RevenueCat identity too.
