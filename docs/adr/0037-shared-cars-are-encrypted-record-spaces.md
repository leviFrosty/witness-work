---
status: proposed
---

# Shared Cars are end-to-end encrypted record spaces on ww-api, joined through Buddies

## Context

Mileage Tracking keeps cars, fuels, and trips on one User's devices
([mileage-tracking-prd.md](../mileage-tracking-prd.md)). Couples, families, and
pioneer partners often drive one car and want one history for it. The User
asked for:

- sharing per car, with buddies;
- every person on the car able to add, edit, and delete its trips, and see its
  whole history;
- up to 10 people on a car (a large family), more than the five buddies Buddies
  allows;
- totals that count everyone's trips by default, with a filter for one
  person's;
- each person keeping a copy when they leave or the car stops being shared;
- free;
- trip notes shared with the car;
- the same end-to-end encryption and account rules as the rest of the app
  (ADR 0024, ADR 0027).

What already exists:

- **Buddies' relay** carries sealed events between paired buddies, but it
  deletes them after 30 days, caps a slot at 60 writes an hour and an event at
  8 KB, and a device that joins later never gets old events. That's fine for an
  invitation, but it can't hold a car's history.
- **Cloud Sync** (ADR 0030) keeps one sealed snapshot per device and merges
  them. It's built for one person's handful of devices. With 10 people and
  their devices, every edit would make each device download everyone's
  snapshot again.
- **Mileage merges per record:** the newest `updatedAt` wins, and a tombstone
  wins unless the record is strictly newer.

## Decision

1. **A Shared Car is a space on ww-api.** One `SharedSpace` Durable Object per
   car holds sealed records, one per car, fuel setup, fuel, fuel price, trip,
   and person, each with a per-space sequence number. Devices pull what changed
   since their last `seq` and put only what they changed. The server keeps the
   version of each record with the newest stamp (its `updatedAt`, or when it
   was deleted), and a deletion wins a tie. That's mileage's merge rule, so a
   client merging what it pulls ends up where the server did. Records are
   small, so they live in the Durable Object's SQLite, with no R2 bucket. The
   server is blind and generic: it holds ciphertext under random ids and never
   knows the space is a car (route group `/spaces/v1`).

2. **Membership belongs to the car, not to Buddies.** The people on a car are
   its members. Each member's per-space id and token derive from their Buddies
   root seed, so all their devices act as one member, and ww-api can't link one
   person's memberships in two cars. ww-api stores a hash of each member's
   token, never their account. Every request carries the attested session
   (`Authorization: Bearer`). ww-api uses it for suspension and rate limits but
   doesn't record it against the space, as with Buddies writer ops. A car holds
   up to 10 members and open invites together. That cap is a server setting, so
   it can rise later.

3. **Invitations travel through Buddies.** Any member can invite one of their
   own active buddies, so a car can reach 10 people while each person has at
   most five buddies. The invitation is a sealed Buddies event (`car.invite`)
   carrying the car's key and a one-time join secret. The invitee joins with it
   and registers a token of their own, so the inviter never holds it. Members
   who aren't each other's buddies see each other by the name, and emoji or
   photo, each publishes on the car.

4. **Keys.** Each car has a 32-byte key per key epoch. Records are sealed with
   XChaCha20-Poly1305, as backups and Cloud Sync are, with an AAD naming the
   space, the epoch, the record, and its stamp. Each member stores a copy of the
   current key wrapped to their own per-space X25519 key. Their other devices
   derive that X25519 key from the root seed and unwrap the copy. A member's id
   is a hash of that public key, which ww-api and every device check. So the
   car's key never enters iCloud, Google Drive, Cloud Sync, our backups, or the
   Buddies roster; devices cache it outside device backups where the platform
   allows. The roster lists only the cars the User is on and the ones they've
   left.

   **ww-api can't choose a car's key.** A wrap is made from public values, so
   ww-api could wrap a key of its own to anyone. A device therefore seals and
   reads only under keys it trusts:
   - one it made;
   - one an invitation brought through Buddies;
   - one the key chain ties to a key it already trusts;
   - one the User's own key check vouches for.

   A wrap never replaces a trusted key. The key check is a MAC, keyed from the
   root seed, in the User's own member record, so only the User's devices can
   make it. A device with no keys yet (another device, a reinstall) can still
   tell the car's real key from a planted one.

   A rekey wraps the new key only to members whose member record is sealed under
   a trusted key, so ww-api can't add a member of its own. The link to the
   previous key goes into the same request, so nobody has to trust the new key
   before the link exists.

5. **Removal takes effect at once, then the key changes.** When a member is
   removed or leaves, ww-api deletes their token hash, so they can't read or
   write any more, and the invites they made close. Removing someone closes
   every open invite, so they can't rejoin through another member's invitation
   before the key changes. The owner's next sync makes a new key and wraps it
   to every remaining member's X25519 key, each checked against the member's id
   and backed by their member record. The new key also closes open invites, and
   their inviters send them again. Invites are always made at the current key,
   so nobody joins with an old one. Records sealed under older keys stay as
   they are, and the newest key unlocks a chain of older ones.

6. **Roles.** The member who shared the car is its owner. Only the owner
   removes people or stops sharing. Every member can invite their buddies,
   leave, add, edit, and delete trips, fuel setups, fuels, and prices, and
   rename or archive the car. When the owner leaves, the member who joined
   first becomes owner. When the last other person goes, the car becomes the
   remaining person's own car again.

7. **Everyone keeps a copy.** Leaving, being removed, and Stop Sharing each
   leave every affected person a personal copy of the car and its trips as of
   their last sync. Removing a buddy doesn't change any car. Delete My Buddies
   Data leaves every car first, keeping copies, because the root seed is gone
   afterwards.

8. **On the device.** Shared cars live in their own store, outside the iCloud,
   Google Drive, and Cloud Sync payload. Every mileage reader goes through one
   view of personal and shared cars. A trip on a shared car records who logged
   it. Totals on Home, Progress, and the Mileage screen count everyone's trips.
   The Mileage screen and its exports can filter to one person. Sharing an
   existing car moves the car and its history into the space under the same
   ids.

9. **Free,** with a kill switch (KV `spaces:enabled`). A suspended account can
   still read and leave its cars. It can't write, invite, or join, because
   those reach other people.

## Considered options

- **Trips as Buddies events, like shared Plans.** Rejected: events are deleted
  after 30 days and never reach a device that joins later, and the write caps
  don't fit seeding a car's history.
- **Per-device snapshots, like Cloud Sync.** Rejected for groups: each edit
  costs a snapshot download for every other person's every device. And when a
  removed member's snapshot is deleted, so is the only copy of any trip nobody
  else merged.
- **Membership by account on the server.** Revocation would be simpler, but
  ww-api would then hold which accounts share cars, a social graph Buddies is
  built never to store.
- **Raising Buddies' five-buddy limit to 10.** Member invites make it
  unnecessary, and the limit is a product decision about who sees a User's
  schedule. It stays open as a later change.
- **A car-only invite link, without Buddies.** Not now: the User asked to
  invite a buddy, and Buddies already authenticates both people.
- **One account for both spouses.** Rejected: it shares everything, householder
  data included.
- **CloudKit sharing.** Rejected: it's iOS-only, and we don't control its
  encryption.

## Consequences

- People sharing a car see one history across iPhone and Android, with changes
  arriving within seconds while their apps are open.
- ww-api learns a car's record count, record sizes, edit times, and which
  sessions call it. It never learns who's on the car, what the car is, or
  anything about a trip.
- A member can write anything on the car, including who logged a trip. With a
  shared key, attribution rests on trust between members.
- ww-api lets a member put only their own member record, and only the owner
  put the key chain, so members can't alter each other's names or photos, or
  the chain. The key check covers the record it's in, so the User's devices
  also notice a record ww-api altered and rewrite it. Other records, trips
  included, rest on trust between members.
- ww-api on its own can't read a car or get a device to seal under a key it
  knows. A removed member colluding with ww-api could get the next key: they
  still hold the old one, so they can seal a member record under it, and
  ww-api can list them as a member. Stopping that would need members to sign
  membership changes, which v1 doesn't do.
- A device that trusts none of a car's keys and can't verify the User's key
  check can't open the car. That happens only when the User's member record
  never reached the car. Leaving and being invited again fixes it.
- A person who was offline when they left or were removed keeps the copy from
  their last sync.
- Each device keeps the space keys it has opened in its keyring, a cache in
  `modules/device-secrets`: a this-device-only Keychain item on iOS, and a file
  sealed under the Android Keystore in `noBackupFilesDir` on Android. Neither
  syncs nor goes into device backups. A binary without that module keeps the
  keyring in memory for the launch. Either way, a device that lost its keyring
  rebuilds it from its own wrap and the key chain on its next sync.
- A shared car has its own fuels: the owner's personal "Gasoline" is copied
  onto it, so a price change has to be made in both places.
- Shared Cars needs Buddies on every phone. Devices with separate Buddies
  identities don't see each other's cars.
- New work: the `SharedSpace` Durable Object and `/spaces/v1` routes in ww-api,
  landed on `main` first. On the Buddies side, three event kinds and their named
  alerts, in TypeScript and the iOS Notification Service Extension. Also the
  readme's architecture diagram, analytics, the Help Center, and Siri's Log
  Trip on shared cars.
