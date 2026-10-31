# Shared Cars protocol v1

The wire contract between the WitnessWork app and ww-api's Shared Spaces (`ww-api/src/spaces`), plus the Buddies events that invite people to a car. Design and rationale: [ADR 0037](./adr/0037-shared-cars-are-encrypted-record-spaces.md). Product rules: [mileage-tracking-prd.md](./mileage-tracking-prd.md#shared-cars).

The server is **blind** and generic. It stores sealed records under random ids, per-member token hashes and public keys, and wrapped keys. It never sees a car, a name, a trip, or which accounts are on a space.

## Conventions

- **Transport:** `POST {BASE}/spaces/v1/{op}` with a JSON body. Ids and secrets travel in bodies, **never in URLs**. The one exception is the [live signal](#live-signal), a WebSocket whose fields travel in headers.
- **Encoding:** base64url without padding (`b64u`), as in [Buddies](./buddies-protocol.md#conventions).
- **Time:** integer milliseconds since the Unix epoch.
- **Ids:** `spaceId`, `memberId`, and `inviteId` are `b64u` of 16 bytes (22 characters, `^[A-Za-z0-9_-]{22}$`). A `recordId` matches `^[A-Za-z0-9._-]{1,64}$`; mileage records use their UUIDs.
- **Secrets:** `token` and `joinSecret` are 32 bytes. `dhPub` is a 32-byte X25519 public key.
- **Authentication:** every op takes `Authorization: Bearer <access token>` from the account session ([accounts protocol](./accounts-protocol.md#sessions)), sent and refreshed exactly as for Buddies. The session proves the request comes from an attested app, and the server uses it for suspension and rate limits. It isn't recorded against the space: membership is shown by the member token (below), much as Buddies writer ops show theirs with a writer signature.
- **Member ops** also carry `spaceId`, `memberId`, and `token`. The server compares `SHA-256(token)` with the member's stored hash in constant time.

## Responses

Success: HTTP 200 with `{ "ok": true, ... }`. Failure: `{ "ok": false, "error": "<code>", "code": "<code>" }`:

| HTTP | `error`        | Meaning                                                                                                                                           |
| ---- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 400  | `bad_request`  | Malformed body, bad ids or sizes, a `memberId` that doesn't match its `dhPub`, or a stamp more than 24 h past the server's clock                  |
| 401  | `unauthorized` | Bearer token missing, expired, or invalid (refresh once and resend)                                                                               |
| 403  | `forbidden`    | Wrong member token, an owner-only op from a non-owner, a wrong join secret, or a `put` naming someone else's reserved record                      |
| 403  | `suspended`    | The session's account is suspended and the op reaches other people (see [Suspension](#suspension))                                                |
| 404  | `not_found`    | Unknown, expired, closed, or burned invite; an invite whose inviter is no longer on the space; a space that never existed (on `join`)             |
| 409  | `conflict`     | `spaceId` already exists; already a member (on `join`); an `inviteId` reused; a `rekey` whose wraps don't name the current members                |
| 409  | `stale_key`    | A `put`, `invite/create`, or fresh `join` for an epoch that isn't current, or a `rekey` to anything but the current epoch + 1; nothing was stored |
| 410  | `gone`         | The space was deleted, or this member isn't on it (removed or left)                                                                               |
| 413  | `too_large`    | A record or body over its cap, or a `put` of more than 100 records                                                                                |
| 429  | `limit`        | A count or size cap was hit (members and invites, records, bytes)                                                                                 |
| 429  | `rate_limited` | A rate limit was hit; carries `Retry-After`                                                                                                       |
| 503  | `disabled`     | Kill switch is off; carries `Retry-After`                                                                                                         |

## Operations

| Op              | Who                      | Body (beyond the member fields where noted)                                                                     | Response                       |
| --------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `create`        | any session              | `spaceId`, `memberId`, `dhPub`, `tokenHash`, `wrap`                                                             | `{ ok, seq, joinedAt }`        |
| `sync`          | member                   | `since` (int ≥ 0), `limit?` (≤ 1,000)                                                                           | see below                      |
| `put`           | member                   | `records`: 1–100 of `{ recordId, epoch, stamp, deleted?, blob }`                                                | `{ ok, seq, results }`         |
| `invite/create` | member                   | `inviteId`, `joinVerifier`, `expiresAt`, `epoch`                                                                | `{ ok }`                       |
| `invite/delete` | the inviter or the owner | `inviteId`                                                                                                      | `{ ok }`                       |
| `join`          | any session              | `spaceId`, `inviteId`, `joinSecret`, `epoch`, `memberId`, `dhPub`, `tokenHash`, `wrap`                          | `{ ok, seq, epoch, joinedAt }` |
| `leave`         | member                   | none                                                                                                            | `{ ok }`                       |
| `member/remove` | owner                    | `removeId`                                                                                                      | `{ ok }`                       |
| `rekey`         | owner                    | `epoch` (current + 1), `wraps`: `{ memberId, wrap }` for exactly the current members, `link`: `{ stamp, blob }` | `{ ok, seq }`                  |
| `delete`        | owner                    | none                                                                                                            | `{ ok }`                       |

When several refusals apply, `put` answers `forbidden` before `stale_key`, `invite/create` answers `stale_key` before `conflict` (an identical retry after a rekey is `stale_key`; its id never opens again either way), and `join` checks the secret, then whether the caller is already a member, then the epoch, then the cap.

Every change to a space advances its `seq`: stored records, joins, leaves, removals, invites created, deleted, or burned, and rekeys.

- **`create`** makes the space at epoch 1, with the caller as its only member and owner. `tokenHash` is `b64u(SHA-256(token))`. `wrap` is epoch 1's key wrapped to the caller ([Keys](#keys)).
  - The server checks that `memberId` matches `dhPub` ([Keys](#keys)); if it doesn't, the answer is `bad_request`.
  - The answer's `seq` is 1. `joinedAt` is the server's time.
  - A space id that exists is `conflict`. The exception is an identical retry (same `memberId`, `dhPub`, `tokenHash`, and `wrap`) on a space nothing has changed since, which gets the same answer again.
  - The id of a deleted space is `gone`: the server keeps a tombstone of it for good.
- **`put`** stores each record unless the server already holds one with that `recordId` and a higher `stamp`.
  - **Ties:** on an equal stamp, a deletion wins, then the lower hex `SHA-256` of the decoded blob.
  - **Resends:** an identical resend is `stored: true` and takes no new `seq`.
  - **Order:** records apply in the order given.
  - **Reserved ids:** `m.<memberId>` can be put only by that member, and `k.<x>` only by the owner. A put naming one of someone else's is `forbidden`, and nothing in it is stored. So a member can't overwrite another member's record or the key chain ([Keys](#keys)).
  - **`results`** lists `{ recordId, stored }` in that order. `stored: false` means a newer version is already there, and the next `sync` returns it.
  - **Epoch:** every record must carry the current `epoch`. Otherwise the answer is `stale_key` and nothing is stored, and the put doesn't count against the member's rate.
  - **Caps:** a put that would take the space past its record or byte cap is `limit`.
  - **Live signal:** a put that stores nothing sends no `changed`.
- **`invite/create`**: `joinVerifier` is `b64u(SHA-256(joinSecret))`, and `expiresAt` is at most 7 days (plus 5 minutes) after the server's clock.
  - **Epoch:** `epoch` is the epoch of the key the invitation will carry. It must be current (`stale_key` otherwise), so an open invite always carries the current key.
  - **Cap:** members plus open invites may not pass the member cap (`limit`).
  - **Inviter:** the server keeps which member made the invite.
  - **Retries:** an identical retry by the same member is `ok` while the invite is open. Any other reuse of an `inviteId`, including one that was closed, used, or burned before it expired, is `conflict`.
- **`invite/delete`** is idempotent: an unknown, used, or expired invite is `ok` for any member, and changes nothing. An open invite deleted by anyone but its inviter or the owner is `forbidden`.
- **`join`** checks the invite, compares `SHA-256(joinSecret)` with its verifier in constant time, and checks that `memberId` matches `dhPub`.
  - **Wrong secrets:** a wrong secret is `forbidden`. The fifth burns the invite, and later tries get `not_found`.
  - **Invite no longer valid:** an invite whose inviter has since left or been removed is `not_found`.
  - **Space state:** a space that never existed is `not_found`, and a deleted one `gone`. Members plus open invites are checked against the cap again, so a lowered cap gives `limit`.
  - **On success:** the caller becomes a member, the invite is consumed (kept until it expires, so a retry can be recognized), and `wrap` (the current epoch's key, wrapped to the caller) is stored.
  - **Epoch:** `epoch` is the invitation's, and a fresh join's must be current (`stale_key` otherwise). So nobody joins with a key for another epoch, and a fresh join's answer carries the invitation's `epoch`.
  - **Retries:** an identical retry (same `joinSecret`, `memberId`, `dhPub`, and `tokenHash`, whatever its `epoch`) from someone still on the space gets `{ ok }` with its original `joinedAt` and the current `epoch`. Any other join by a current member is `conflict`.
- **`leave`** deletes the caller's token hash and wraps, and closes the invites the caller made that nobody has used. When the owner leaves, the member who joined first becomes owner. When no member is left, the space is deleted.
- **`member/remove`** does the same to `removeId`, and closes every open invite, not only theirs: otherwise the removed person could rejoin through another member's invitation before the rekey. Inviters send them again after the rekey that follows. The owner can't remove themselves (`bad_request`); they leave or delete instead. An unknown `removeId` is `ok`.
- **`rekey`** checks its epoch and its wraps:
  - **Epoch:** below 2 is `bad_request`. Any other epoch but current + 1 is `stale_key`.
  - **Wraps:** they must name exactly the current members. Naming a member twice is `bad_request`. Missing a member, or naming someone who isn't on the space, is `conflict`: membership changed, so sync and try again.
  - **Link:** `link` is the record `k.<epoch>` ([Key chain](#keys)), sealed under the new epoch. It's stored in the same step, at the new epoch, replacing any version of `k.<epoch>` the space holds, so a link planted ahead of time can't block it. Its blob and stamp follow `put`'s rules (`too_large`, `bad_request`), and it counts against the space's record and byte caps (`limit`) but not against the put rates. It takes a `seq` of its own after the rekey's, and the answer's `seq` is that one.
  - **Invites:** it closes every open invite.
- **`delete`** wipes the space: records, members, wraps, invites. The members' next requests get `gone`.

`sync` response:

```json
{
  "ok": true,
  "seq": 812,
  "epoch": 2,
  "wrap": "<b64u>",
  "ownerId": "<22>",
  "members": [{ "memberId": "<22>", "dhPub": "<43>", "joinedAt": 0 }],
  "invites": [{ "inviteId": "<22>", "invitedBy": "<22>", "expiresAt": 0 }],
  "rekeyNeeded": false,
  "records": [
    {
      "recordId": "…",
      "epoch": 2,
      "stamp": 0,
      "deleted": false,
      "blob": "…",
      "seq": 811
    }
  ],
  "more": false
}
```

- **`records`** holds the current version of every record with `seq > since`, in `seq` order. A page stops at `limit` records or about 4 MiB of blob characters, whichever comes first, but always holds at least one record.
- **`seq`** is the space's head, or with `more: true` the `seq` of the last record returned. The client syncs again from there.
- **`members` and `invites`** are always the complete current lists. Expired invites are left out.
- **`wrap`** is the caller's own wrap for the current `epoch`.
- **`rekeyNeeded`** is true when a member has left or been removed since the current epoch began. Only the owner acts on it.
- A sync touches the space's `lastActiveAt` when it's more than a day old, so syncs aren't writes.

### Live signal

`GET {BASE}/spaces/v1/live` with `Upgrade: websocket`, carrying:

- the bearer token;
- `x-ww-space-auth`: `b64u(UTF-8 JSON { spaceId, memberId })`. Its name contains "auth" so Cloudflare's logs redact it;
- `x-ww-space-token`: `b64u(token)`. The name contains "token" so Cloudflare's logs redact it.

The Worker checks the session and passes the upgrade to the space without the `Authorization` header.

- **Messages:** the server sends `{ "type": "hello", "seq": N }` after the upgrade, then `{ "type": "changed", "seq": N }` after every change that advances `seq`. These go to every socket on the space, the writer's own devices included, because a write over HTTP doesn't say which socket its device holds. Messages never carry content.
- **Keepalive:** `ping` gets `pong` without waking the Durable Object.
- **Closes:**
  - `4001 "gone"`: the space is deleted, or the member is no longer on it.
  - `4002 "replaced"`: a socket past the cap opened (4 per member the cap allows, so 40 at 10). The server closed the opener's own oldest socket if they already held 4 or more, and otherwise the oldest socket of whichever member holds the most, so one member can't push everyone else off.

The app keeps one socket per shared car while in the foreground and reconnects with the backoff Buddies uses. After `4002` it waits at least a minute. After `4001` it syncs first, and reconnects if the car is still there.

### Suspension

When the session's account is suspended (checked as for Buddies, cached up to 30 s), `create`, `put`, `invite/create`, and `join` answer `403 suspended`. The other ops still work. A suspended person can still read their cars, leave them, and protect the others (`member/remove`, `rekey`, `delete`).

## Limits and retention

| Item                                   | Limit                                                                             |
| -------------------------------------- | --------------------------------------------------------------------------------- |
| Members plus open invites per space    | 10 (KV `spaces:maxMembers`, 1–100, so it can rise)                                |
| Invite lifetime                        | 7 days                                                                            |
| Wrong join secrets per invite          | 5, then burned                                                                    |
| Records per space (deletions included) | 50,000                                                                            |
| Bytes per space                        | 256 MiB of decoded blobs                                                          |
| Record blob                            | 16 KB decoded                                                                     |
| Wrap                                   | 512 bytes decoded                                                                 |
| `put` body                             | 100 records, 1 MiB                                                                |
| Other bodies                           | 256 KiB                                                                           |
| `sync` page                            | 1,000 records, or about 4 MiB of blob characters                                  |
| Puts                                   | 60 a minute per member; 10,000 records a rolling day per space                    |
| Spaces created                         | 20 per account per rolling day (a counter, not a list of spaces)                  |
| Live sockets                           | 4 per member the cap allows (40 at 10); live headers ≤ 1,024 characters           |
| Stamps                                 | At most 24 h past the server's clock                                              |
| Space                                  | Deleted after at least 400 days without a `sync` or `put`; its id is never reused |

These limits leave room to seed a car's whole history in one go. Deletions are kept as long as their space exists, because the newest-stamp rule needs them. Every op is also rate limited per caller, on Buddies' tiers.

## Kill switch

Shared Spaces runs when KV `spaces:enabled` is `"true"`. When that key is absent, the `SPACES_ENABLED` var decides (dev `"true"`, prod `"false"`). While it's off, every op answers `disabled` except `leave`, `member/remove`, and `delete`, so people can always leave. New live sockets are refused, but open ones stay open. There's no Supporter check: Shared Cars is free.

## Client cryptography (app only)

The primitives are those of [Buddies](./buddies-protocol.md#client-cryptography-app-only--the-relay-never-sees-any-of-this) and the [backup](./accounts-protocol.md#backup): HKDF-SHA256, X25519, SHA-256, and XChaCha20-Poly1305, through `@noble/*`. Known-answer vectors are in `src/lib/sharedSpaces/testing/spaceVectors.json`. Vitest checks them, and so does `__WW_DEV__.checkSharedSpacesCryptoVectors()` in Hermes.

### Keys

- **Space key** `K_e`: 32 random bytes for key epoch `e` (1, 2, …), made by whoever creates the space or rekeys it.
- **Record key:** `HKDF(K_e, "", "ww-spaces/v1/record", 32)`.
- **Per member values** come from the User's Buddies root seed, so every device of the User derives the same ones, and two spaces' values can't be linked:

| Derived                | How                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------ |
| Member token           | `HKDF(seed, "", "ww-spaces/v1/member-token\|{spaceId}", 32)`                         |
| Member DH key (X25519) | `HKDF(seed, "", "ww-spaces/v1/member-dh\|{spaceId}", 32)`; its public key is `dhPub` |
| `memberId`             | `b64u(SHA-256("ww-spaces/v1/member-id\|" + spaceId + "\|" + b64u(dhPub))[0..16])`    |
| Check key              | `HKDF(seed, "", "ww-spaces/v1/member-check\|{spaceId}", 32)`                         |

- **Why the id is a hash of the key:** `memberId` commits to `dhPub`. The server checks the commitment on `create` and `join`, and every device checks it before wrapping a key to a member. So neither the server nor another member can swap in a key of their own.
- **Wrap** (the space key for one member):
  - Make an ephemeral X25519 key `eph`.
  - `wrapKey = HKDF(X25519(eph, dhPub), "", "ww-spaces/v1/wrap|" + b64u(ephPub) + "|" + b64u(dhPub), 32)`.
  - `wrap = b64u(ephPub[32] ‖ 0x01 ‖ nonce[24] ‖ XChaCha20-Poly1305(wrapKey, nonce, K_e, aad))`, with `aad = UTF-8("ww-spaces/v1/wrap\n" + spaceId + "\n" + e + "\n" + memberId)`.
  - A device opens its own wrap with its derived member DH key.
- **Key chain:** a rekey to epoch `x ≥ 2` stores a record `k.<x>` holding `K_{x-1}`, sealed under `K_x` (a repair may seal it under a later epoch's key). A `k.<x>` sealed below epoch `x` never counts.
- **Trusted keys.** A wrap is built from public values only, so the server could wrap a key of its own to anyone. A device seals and reads only under keys it trusts, and keeps only those in its keyring. A key is trusted when:
  - **the device made it** (`create`, `rekey`);
  - **an invitation brought it** (`car.invite`'s `key`, end to end through Buddies), for the invitation's epoch, once `join` took that invitation (a fresh join, or an identical retry of one). A join answered `conflict`, or found by a sync to have landed, doesn't make it trusted by itself, since the User may already have been on the car: there it's trusted only when the device's own wrap for that epoch opens to the same key;
  - **the chain ties it to a trusted key:**
    - _Backward:_ a link that opens under trusted `K_y` teaches the key it holds.
    - _Forward:_ a candidate `K_x` is trusted when a link sealed under it opens and holds a key the device trusts, or one that leads there through further links. The server holds no trusted key, so it can't make that link.
  - **the User's key check vouches for it:** the User's own `member` record, sealed under epoch `x` and opened under candidate `K_x`, carries a `check` that matches (below). Only the User's devices hold the check key. This is how a device that trusts no key of the car yet (another of the User's devices, or a reinstall) tells the real key from a planted one.
- **The own wrap** gives a candidate for the current epoch:
  - **Same key** as a trusted one: nothing to do.
  - **Different key** for an epoch the device trusts: the device keeps its own key, reports a key mismatch, and goes on sealing under its own.
  - **Epoch the device holds no key for:** the device walks the chain back from the candidate until it reaches a trusted key or a `check` that matches. Every key on that path becomes trusted.
  - **Until then:** the car waits. Records under that epoch stay sealed, and puts wait.
- **The car's epoch** is the server's, as of the last sync, so a car that waited on a planted wrap goes on once the server is honest again. A device seals only under the current epoch's trusted key, and never at an epoch older than the newest one it trusts. So a server can't roll a car back to a key a removed member holds; that car waits instead.
- **Key check:** `check = b64u(HMAC-SHA256(checkKey, UTF-8(JSON.stringify(["ww-spaces/v1/member-check", spaceId, x, b64u(K_x), name, avatar ?? null, tag, joinedAt])))[0..16])`, where `x` is the epoch the `member` record is sealed under.
  - **What it covers:** the record's own contents. So a record someone else wrote, or one carrying a check copied from an older version, doesn't match.
  - **Rewriting:** a device rewrites the User's record whenever the `check` on the car doesn't match, including when the car's newest version doesn't open. The rewrite is stamped past every version the device has seen. The device keeps the last version that matched, sealed, for verifying keys after it loses its keyring.
  - **Links:** likewise, the owner puts a link again when the car's newest version of it doesn't open, doesn't count, or holds the wrong key. Devices keep the last version of each link that counted.
- **Rekey wraps** go only to members this device can vouch for. Each needs a live `member` record, `m.<memberId>`, sealed under a trusted key, and a `dhPub` the `memberId` commits to. A listed member without both means the owner's device waits and doesn't rekey. That member shows as "Someone who joined", and the owner can remove them. So the server can't list a member of its own and receive the next key.
- **The device keyring** caches opened keys on the device, outside the sync payload, our backups, and, where the platform allows, device backups. It can always be rebuilt from the device's wrap, the key chain, and the User's own `member` record, which the device keeps sealed for that. Invitation secrets (`joinSecret`, and the `key` a `car.invite` carries) are kept the same way, by invite id, and only while an invitation needs them, never in a saved store.
- **Joining:** `joinVerifier = b64u(SHA-256(joinSecret))`.

### Records

`blob = b64u(0x01 ‖ nonce[24] ‖ XChaCha20-Poly1305(recordKey_e, nonce, UTF-8(JSON), aad))` with a random nonce and

```text
aad = UTF-8("ww-spaces/v1/record\n" + spaceId + "\n" + e + "\n" + recordId + "\n" + (deleted ? "1" : "0") + "\n" + stamp)
```

The server picks which version to keep. It can't change a record's stamp or deletion flag, move it to another id or space, or forge one.

Every plaintext is `{ "v": 1, "kind": "<kind>", "data": { … } }`. `data` leaves out the record's id; a reader sets `updatedAt` to the stamp. Unknown fields stay in `data` when a device writes the record back, so an older build doesn't strip what a newer one added. A record a reader can't use yet (an unknown kind, or `v` from a newer app) is kept and read again after the app updates. It never stops the sync.

| Kind     | `recordId`     | `data`                                                                                                           |
| -------- | -------------- | ---------------------------------------------------------------------------------------------------------------- |
| `car`    | the car's id   | `Vehicle`: `name`, `archived?`, `createdAt`. One per space.                                                      |
| `setup`  | its id         | `VehicleSetup`, with the car's id as `vehicleId`                                                                 |
| `fuel`   | its id         | `Fuel`. The car's own fuels, which setups on this car may name.                                                  |
| `price`  | its id         | `FuelPrice` for one of the car's fuels                                                                           |
| `trip`   | its id         | `Trip`, plus `loggedBy` (the `memberId` who added it) and `editedBy?` (the last to change it)                    |
| `member` | `m.<memberId>` | `name` (≤ 40), `avatar?` (emoji, or a 40 px JPEG ≤ 4,000 characters), `tag`, `joinedAt`, `check` ([Keys](#keys)) |
| `invite` | `i.<inviteId>` | `invitedBy` (`memberId`), `name` (the invitee's Buddy Card name), `tag`, `expiresAt`                             |
| `keys`   | `k.<x>`        | `prev` (`b64u` of `K_{x-1}`)                                                                                     |

- A deletion is `deleted: true` with plaintext `{ "v": 1, "kind": "<kind>" }`. Its `stamp` is the deletion time.
- `stamp` is the record's `updatedAt`, which the store already sets past the version it replaces.
- `tag` is `b64u(SHA-256("ww-spaces/v1/member-tag|" + spaceId + "|" + inboxId)[0..16])`, derived from the person's Buddies inbox. A device works it out for each of its own buddies, so it can show them as it knows them (nickname, color, photo). To anyone else, it means nothing. `name` and `avatar` follow the person's Buddies sharing: `card.name`, and a photo only while `sharing.photo` is on.
- `trip.note` and `trip.noteDoc` are shared with everyone on the car. Photos in a note are local files and don't travel, so the trip form offers no photos on a shared car. A photo a trip already had shows as "not on this device" elsewhere, and survives other people's edits. The trip form keeps a shared trip's sealed record within the 16 KB cap. The engine never cuts what a device stores.

## Invitations (Buddies events)

These events go through the Buddies relay's ordinary `event/put`, sealed with the pair's content key ([Sealed blobs](./buddies-protocol.md#sealed-blobs)):

| Kind         | Written by                        | Plaintext                                                                                                   | Push           |
| ------------ | --------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------- |
| `car.invite` | a member, to one of their buddies | `{ "v": 1, "id": spaceId, "rev", "inviteId", "joinSecret", "epoch", "key", "name", "people", "expiresAt" }` | yes, immediate |
| `car.cancel` | the inviter                       | `{ "v": 1, "id", "rev", "inviteId" }`                                                                       | no             |
| `car.reply`  | the invitee                       | `{ "v": 1, "id", "rev", "inviteId", "status": "joined" \| "declined" }`                                     | `joined` only  |

- **Fields:** `key` is `b64u(K_e)` for `epoch`, the current epoch when `invite/create` succeeded. `name` is the car's name (≤ 60), and `people` is how many are on it.
- **Expiry:** a receiver keeps an invitation no longer than 7 days and 5 minutes after it arrives, whatever its `expiresAt` says.
- **Event ids:** `eventId` is `SHA-256("ww-spaces/v1/car-event|" + kind + "|" + senderInboxId + "|" + recipientInboxId + "|" + inviteId)[0..16]`, so a resend is the same event.
- **Before sending:** a `car.invite` is sent only while its invite is still open on the car. A device that finds it closed drops it.
- **Named alerts** ([Buddies](./buddies-protocol.md#named-alerts)): `car.invite` reads "Anna shared a car with you" / "Open Mileage to join." `car.reply` with `joined` reads "Joe joined a shared car" / "Open Mileage to see it." Like every Buddies Alert, they never include the car's name or other free text. Both kinds take the relay's template count from 16 to 18 of 32. `car.invite` is one of the relay's immediate kinds.
- **Bell entry:** "Anna shared Mazda CX-5 with you", with Join and Decline. It stays until it's answered, canceled, or expired, like a pending Plan invitation. An invitation to a car the User is already on reads as joined, and its Decline is gone.

## Lifecycle

### Sharing a car

1. Make `spaceId` and `K_1`, derive the member values, and `create`.
2. Put the car, its setups, a copy of each fuel its setups name (new ids, with the setups pointed at the copies) and their prices, every trip (`loggedBy` the owner), and the owner's `member` record, 100 records a put.
3. Only once every put has landed:
   - tombstone the car, its setups, and its trips in the personal store (personal fuels stay, since other cars may use them);
   - add the space to the roster.

   A local flag makes a seeding that stopped part-way resume rather than start over. A refusal that retrying can't fix (`too_large`, `limit`, or a `bad_request` that a clock refresh didn't cure) ends the share: the device deletes the space, keeps the car personal, and tells the User.

4. Invite.

### Inviting and joining

1. **The inviter's device:** runs `invite/create` at its current epoch, puts the `i.<inviteId>` record, and sends `car.invite`. It retries until the relay accepts it.
   - On `stale_key` it syncs, opens its new wrap, and creates the invite again.
   - A device sends only the invitations it made.
2. **The invitee chooses Join:**
   1. It saves a "joining" mark first, holding the wrap it's about to send. Only the User's own key opens it, so the mark holds no key, yet a confirm after a lost answer can tell whether the server kept this join.
   2. It runs `join` with its own `dhPub`, token hash, and a wrap to itself.
   3. It puts its `member` record, adds the space to the roster, and syncs from 0.
   4. It sends `car.reply` with `joined`.

   If the answer to `join` is lost, the mark makes the next attempt sync with the derived member values, which shows whether the join landed. `conflict` means the User is already on the car, for instance from another of their devices, and counts as joined. A retry answered with a later epoch than the invitation's (the join landed, then the car was rekeyed) counts as joined too. The next sync opens the device's wrap and trusts its key through the chain back to the invitation's key.

3. **When any member's device sees the new member record,** it deletes the `i.` record. A member without a member record (a join that never finished) shows in People as "Someone who joined", and the owner can remove them.
4. **Decline, cancel, expiry, and rekey:**
   - **Decline** sends `car.reply` with `declined`. The inviter then runs `invite/delete` and deletes the `i.` record.
   - **Canceling** is `invite/delete`, `car.cancel`, and deleting the `i.` record.
   - **Expiry:** after an invite expires, any member's device deletes its `i.` record.
   - **Rekey:** a rekey closes open invites. The device that sent each one sends it again under a new `inviteId`, with the new key: `car.cancel` for the old, `car.invite` for the new.
   - **Inviter leaves:** when the inviter leaves or is removed, the server closes the invites they made.

### Leaving, removal, rekeying, and stopping

- **Leave:** make the personal copy (below), record the space in the roster's `leftCars`, and drop the local car. Then send `leave`, retrying until it lands. Joining the car again cancels a `leave` not yet sent.
- **Removed:** the person's next `sync` gets `gone`. A socket's `4001` triggers that sync, and only the sync's answer ends the car. Their device makes the personal copy from what it last synced and records `leftCars`.
- **Rekey:** when `sync` says `rekeyNeeded`, an owner device that holds the current key makes `K_{e+1}`. It wraps the new key to each member it can vouch for ([Keys](#keys)), and runs `rekey` with `k.<e+1>` as its `link`. On `conflict` it syncs and tries again. Other devices' puts get `stale_key`: they sync, trust the new key through the link, and seal again. A key nobody has linked yet stays untrusted.
- **Stop Sharing:** the owner's device syncs (pull and push) first, then makes its own personal copy and runs `delete`. Every other member then gets `gone` and makes a copy.
- **Last one left:** only on a car that has had another member. When the owner's device sees no other member, no open invite, and no unexpired `i.` record (an invitation still waiting to be sent again), it makes a personal copy and runs `delete`.
- **Personal copy:**
  - **Ids:** the car, its setups, fuels, prices, trips, and tombstones go into the personal store under new ids, `uuid(SHA-256("ww-spaces/v1/copy|" + spaceId + "|" + joinedAt + "|" + id))`. `uuid` is an RFC 9562 version 8 UUID made from the first 16 bytes, in lowercase. Every device of the person makes identical records, which personal sync merges into one copy.
  - **Contents:** trips logged by others stay in the copy.
  - **Hidden records:** personal records the car was hiding (below) are tombstoned, so they don't come back beside the copy.
- **Buddies:** removing a buddy changes no car, but it closes open invitations to that buddy. Delete My Buddies Data first leaves every car the User is on (including cars this device knows only from the roster), keeping copies, then deletes the seed. It refuses while any car can't be left.

## Another of the User's devices

The Buddies roster carries:

```json
{
  "cars": { "<spaceId>": { "at": 0 } },
  "leftCars": { "<spaceId>": 0 }
}
```

They merge as a union. An entry in `leftCars` wins over a `cars` entry whose `at` is at or before it. Times come from the synced clock.

Everything else comes from the root seed and the space: a device derives its member values, syncs from 0, opens its wrap, and trusts its key once the chain reaches the User's `check` ([Keys](#keys)). A device that starts Buddies by itself (ADR 0023) picks up the User's cars. Devices with separate Buddies identities don't see each other's cars.

## Client behaviour

- **One view.** Every mileage reader goes through one view of personal and shared cars: screens, Home, Progress, report and CSV, the watch snapshot, and Siri's Log Trip.
  - **Moved records:** a personal record whose id is on a shared car, or that points at a shared car, is moved into the car on the next sync when it's newer. Its stamp is kept, and the personal version is tombstoned past it. So an edit from an offline device or an older build is neither lost nor shown twice.
- **Writes** go to the store the car lives in. On a shared car, a new trip gets `loggedBy` and an edited one gets `editedBy`, both set to this person's `memberId`. A trip moved between shared cars keeps its `loggedBy`.
- **When it syncs:**
  - on foreground, on the socket's `hello` (past its cursor) and `changed`, 2 s after a local change, on pull to refresh in Mileage, and on any `car.*` Buddies event;
  - it merges what it pulls with mileage's per-record rule, and on equal stamps between two live versions it takes the server's;
  - it puts only records changed locally since their last put;
  - unsent records are kept locally until a put stores them, so edits work offline.
- **Clock:** stamps and expiries come from the synced clock (`syncTimestamp`, `syncNow`).
  - A `put` refused with `bad_request` forces a clock refresh and stamps the records again.
  - Records still more than about 23 h ahead are held back, and the car shows that its changes aren't being shared.
- **Odometer:** prefill uses the car's latest reading from anyone. A trip whose odometer range overlaps another trip on the same car gets a gentle warning.
- **Costs** use the car's fuels and prices, so everyone sees the same estimate. Amounts show in each device's own currency format.
- **Backups** don't carry shared cars. With the same account key (recovery key, or Set Up Another Device), the roster brings them back.
- **Suspended:** changes made while a `put` answers `suspended` stay on the device and go out once a put succeeds. Meanwhile the car shows that they aren't being shared.
- **Analytics** count sync failures by reason, never with ids, names, or amounts.
