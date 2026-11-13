# Territories protocol v1

The wire contract for shared Territories: how a territory maps onto ww-api's Shared Spaces (`ww-api/src/spaces`), the scoped mode Shared Spaces gains for it, guest links that open in a browser, hand-offs, and the Buddies events that invite people. Design and rationale: [ADR 0046](./adr/0047-shared-territories-are-scoped-record-spaces.md). Everything not restated here works exactly as in the [Shared Cars protocol](./shared-cars-protocol.md): transport, encoding, ids, member values, wraps, the key chain, trusted keys, rekeys, the device keyring, invitations, the roster. Read that first.

The server stays **blind**. It sees opaque scope ids (one per street), record id prefixes, counts, sizes and times. It never sees a territory, a street name, an address, an outcome, a name, or which accounts are on a space.

## Summary

- **One space per shared territory**, created the first time the owner shares it, makes a guest link, or hands off a street. A territory nobody has shared travels in the User's own sync and backups instead ([below](#unshared-territories-sync-and-backup)).
- **Every street is a scope.** Its records carry the street's scope id in their record id, and are sealed under a key derived for that scope. The server filters reads and checks writes per scope, so people given some streets get only those streets.
- **Guest links** are capability URLs. The secret travels in the URL fragment and never reaches the server. The guest page calls two public ops, `guest/sync` and `guest/put`, holding only the keys of its streets.
- **A hand-off** makes a buddy the server-recorded **holder** of one street. Only the owner can hand off, and a space's owner never changes, so a holder can never hand a street off again.
- **Returning** the territory deletes the space, which ends every share, link and hand-off at once.

## Conventions

As in [Shared Cars](./shared-cars-protocol.md#conventions), plus:

- **Scope id** `S`: `b64u` of the street id's 16 UUID bytes (22 characters). Street ids are RFC 9562 UUIDs; seeding gives a new UUID to any street whose id isn't one.
- **`linkId`**: `b64u` of 16 random bytes (22 characters).
- **Guest ops** carry no `Authorization`. They're the only Shared Spaces ops without a session ([Guest ops](#guest-ops)).
- **Base URLs** are the app's usual ww-api hosts. The Beta app and the Beta web host both use production ww-api (`https://api.witnesswork.app`).

## The space

### Modes

`create` takes `mode: "scoped"` for a territory. Spaces created without it (cars) keep every rule of the Shared Cars protocol, unchanged. Everything below applies to scoped spaces only. A space's mode never changes.

### Record ids

The server parses record ids in a scoped space and refuses any id outside this grammar with `bad_request`:

| Id             | Kind (in the plaintext)         | Sealed under                       | Class for permissions |
| -------------- | ------------------------------- | ---------------------------------- | --------------------- |
| `h`            | `territory`                     | record key                         | header                |
| `s.<S>`        | `street`                        | scope key of `S`                   | street header         |
| `s.<S>.w`      | `worked`                        | scope key of `S`                   | in scope              |
| `s.<S>.<uuid>` | `door`, `doNotCall`, or `guest` | scope key of `S`                   | in scope              |
| `d.<uuid>`     | `doNotCall` (no street)         | record key                         | territory-wide        |
| `m.<memberId>` | `member`                        | record key                         | member                |
| `i.<inviteId>` | `invite`                        | record key                         | invite                |
| `k.<x>`        | `keys`                          | record key of epoch `x` (as today) | key chain             |
| `g.<linkId>`   | `guestKeys`                     | link key                           | link keys             |

Regex for the server: `^(h|s\.[A-Za-z0-9_-]{22}(\.(w|[0-9a-f-]{36}))?|d\.[0-9a-f-]{36}|[mig]\.[A-Za-z0-9_-]{22}|k\.[1-9][0-9]{0,8})$`. The server stores the scope (`S`, or null) with each record so it can filter.

### Keys

All of [Shared Cars' keys](./shared-cars-protocol.md#keys) apply: space key `K_e` per epoch, wraps, key chain, trusted keys, key check, rekey. Added:

| Derived         | How                                                                                                        | Used for                                        |
| --------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Scope key       | `HKDF(K_e, "", "ww-spaces/v1/scope-record\|" + S, 32)`                                                     | every `s.<S>` and `s.<S>.*` record at epoch `e` |
| Link secret `L` | `HKDF(seed, "", "ww-spaces/v1/link\|" + spaceId + "\|" + linkId, 32)`, from the link creator's account key | the URL fragment                                |
| Link token      | `HKDF(L, "", "ww-spaces/v1/link-token", 32)`; the server keeps `verifier = b64u(SHA-256(linkToken))`       | guest ops                                       |
| Link key        | `HKDF(L, "", "ww-spaces/v1/link-key", 32)`                                                                 | sealing `g.<linkId>`                            |

- Blobs and AAD are exactly [Shared Cars' records](./shared-cars-protocol.md#records); only the key changes by id. `g.<linkId>` uses the link key directly as the XChaCha20-Poly1305 key, with the usual AAD at the space's current epoch.
- Because `L` derives from the creator's seed, every device of the creator can show the QR code again and keep `g.<linkId>` current. `L` is never stored in a saved store.
- Members hold `K_e`, so they can derive every scope key. **The server's filter, not the key, is what keeps a street-only member to their streets.** Guests never hold `K_e`; they hold only their streets' scope keys.
- Known-answer vectors for the new derivations go in `src/lib/sharedSpaces/testing/spaceVectors.json`.

### Records

Plaintext is `{ "v": 1, "kind", "data" }` as in Shared Cars, with the same rules for deletions, unknown fields, and records a reader can't use yet. `stamp` is the record's `updatedAt`.

| Kind        | `data`                                                                                                                                                                                                                                                                                                            |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `territory` | `id` (territory UUID), `number` (≤ 20), `name?` (≤ 80), `link?` (≤ 2,000), `coordinate?`, `outline?` (≤ 200 points, 6 decimals), `checkedOutAt`, `returnBy?`, `createdAt`, `houseRecords` (bool, [Privacy mode](#territory-privacy-mode)). One per space. No `photo`: the card photo stays on the owner's device. |
| `street`    | `id` (street UUID), `name` (≤ 80), `numbering`, `first?`, `descending?`, `saveLocations?`, `houses?` (string array, ≤ 300 labels of ≤ 12 characters, numeric order; the street's house numbers from the map lookup), `order` (number; lists sort by it). Never `next`, `doors`, `handoff`, or `workedAt`.         |
| `worked`    | `at?` (absent: not worked), `by`, `byName?`                                                                                                                                                                                                                                                                       |
| `door`      | `label` (≤ 40), `outcome` (`notHome` \| `spoke` \| `doNotCall`), `at`, `tries`, `coordinate?`, `coordinateSource?`, `description?` (a place description, ≤ 200), `by`, `byName?`                                                                                                                                  |
| `doNotCall` | `address` (≤ 200), `at`, `coordinate?`, `label?`. **Only a place and a date: never a name or a reason**, and no field for either.                                                                                                                                                                                 |
| `guest`     | `name` (1–40), `linkId`, `joinedAt`. Lives in the first scope of the guest's link (scope ids sorted).                                                                                                                                                                                                             |
| `member`    | as Shared Cars                                                                                                                                                                                                                                                                                                    |
| `invite`    | as Shared Cars, plus `scopes?` (scope ids) and `handoff?` (bool)                                                                                                                                                                                                                                                  |
| `keys`      | as Shared Cars                                                                                                                                                                                                                                                                                                    |
| `guestKeys` | `title` (the territory's display title, ≤ 100), `from` (the creator's name, ≤ 40), `houseRecords` (bool), `scopes`: `{ "<S>": { "<epoch>": "<b64u scope key>" } }` for every epoch from 1 to current, `expiresAt`                                                                                                 |

- **`by`** is the recorder's person id: a `memberId` for buddies, the guest's UUID for guests. **`byName`** is their name when they recorded it, so "recorded by" still reads after someone leaves and on the guest page, which has no people list. Readers prefer the buddy's own nickname, then the member or guest record, then `byName`.
- **Seeding** sets `by` to the owner's `memberId` on the owner's own earlier records, which had none.
- **`next`** (the stepper's next house) is per device and never shared. Each device advances its own when a record for its `next` arrives, as `receiveDoor` does today.

### Merge rules

These are `lib/sharing.ts`'s rules, applied to records:

1. **The same record edited twice:** the newest `stamp` wins, everywhere. A deletion wins a tie, then the server's version (as Shared Cars).
2. **Removal** is a tombstone, which wins unless a version is strictly newer. Removing a street tombstones `s.<S>`, `s.<S>.w`, and every door and do-not-call in it. Records under a tombstoned street are hidden; a newer `street` version brings the street back with them.
3. **Two records for the same house** (two people recorded house 12 offline): both stay on the server. On a numbered street, the view groups live `door` records by trimmed `label` (unnumbered streets never group) and folds each group with `mergeDoor`, in ascending record id order. So the do-not-call wins, otherwise the later visit wins, and `tries` counts days. The next device to record or edit that house writes the folded door to the group's lowest id and tombstones the others, in one `put`.
4. **Do-not-call wins** between different records (rule 3). Within one record, a later edit replaces it (rule 1): changing a do-not-call is a deliberate edit by someone who saw it.
5. **Undo** puts the previous version again at a new stamp, or tombstones a record that the undone action created.

### Territory privacy mode

`territoryPrivacyOn` (`src/lib/territoryPrivacy.ts`) is a device setting. What it does to a shared territory:

| Who has it on   | What changes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **The owner**   | It applies to the whole territory. The owner's device writes `houseRecords: false` in `h`, and turns every live do-not-call `door` into a `doNotCall` record (as `clearDoorRecords` does) and tombstones every `door` in one pass. Nobody (members, holders, guests) records doors while it's false: the app and the guest page offer only "worked" and do-not-calls. Creators' devices rewrite their `g.` records to match. Turning it off writes `houseRecords: true`; old doors don't come back. |
| **Anyone else** | It applies to their device only. The device doesn't store or show `door` records, except do-not-call doors, which it keeps as address and date only. It writes no doors. It still marks streets worked and records do-not-calls. Other people's doors stay on the space. Turning it off syncs the space again from 0.                                                                                                                                                                               |

The server can't see any of this; it's kept by the clients.

## People, roles and permissions

### Roles

| Role                  | Who                                                                                                | Server state                                                               |
| --------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| **Owner** (O)         | Whoever created the space. Never changes: an owner can't `leave` a scoped space, only `delete` it. | `ownerId`                                                                  |
| **Whole member** (W)  | A buddy the owner shared the whole territory with. Gets streets added later.                       | member with `scopes: null`                                                 |
| **Street member** (P) | A buddy the owner shared some streets with.                                                        | member with `scopes: [S…]`, `invitedBy` = owner                            |
| **Holder** (H)        | The buddy a street was handed off to. May also be W or P.                                          | `holders[S].memberId`; joined through a hand-off invite with `scopes: [S]` |
| **Onward member** (Q) | A buddy a holder shared their street with.                                                         | member with `scopes ⊆` the holder's streets, `invitedBy` = holder          |
| **Guest** (G)         | Anyone with a live link, in a browser. Not a member.                                               | the link: `createdBy`, `scopes`, `expiresAt`, `endedAt`                    |

A street `S` is **held** while `holders[S]` names a member, or a pending hand-off invite. **May write `S`**:

- `S` held by `H`: `H`, and members whose `invitedBy` is `H` and whose scopes include `S`.
- `S` not held: the owner, whole members, and members whose scopes include `S`.
- A guest: when `S` is in its link's scopes and the link's creator may write `S` now. A guest may read exactly what it may write.

While the hold is a pending invite, nobody writes `S`. So once a street is handed off, the owner, whole members and the owner's links can only read it; the holder's people and links work it.

### Who reads and writes which records

| Record             | O                            | W                            | P                                                  | H                            | Q                            | G                                                           |
| ------------------ | ---------------------------- | ---------------------------- | -------------------------------------------------- | ---------------------------- | ---------------------------- | ----------------------------------------------------------- |
| `h`                | read, write                  | read                         | read                                               | read                         | read                         | —                                                           |
| `s.<S>`, `s.<S>.*` | read; write if may write `S` | read; write if may write `S` | read if `S` in scopes; write if also may write `S` | read and write their streets | read and write their streets | read; write `s.<S>.*` (never bare `s.<S>`) if may write `S` |
| `d.*`              | read, write                  | read, write                  | —                                                  | —                            | —                            | —                                                           |
| `m.<memberId>`     | read; write own              | same                         | same                                               | same                         | same                         | —                                                           |
| `i.<inviteId>`     | read, write                  | read                         | own invites only                                   | own invites only             | —                            | —                                                           |
| `k.<x>`            | read, write                  | read                         | read                                               | read                         | read                         | —                                                           |
| `g.<linkId>`       | read; write own links        | read                         | own links                                          | own links                    | —                            | its own link, read only                                     |

"Own invites" and "own links" are those the member made; the server knows the inviter and the link creator. A put naming any record the caller may not write is refused whole with `forbidden`, as in Shared Cars.

### Who may run which op

| Op                                   | O                                         | W   | P   | H                                        | Q   | G                         |
| ------------------------------------ | ----------------------------------------- | --- | --- | ---------------------------------------- | --- | ------------------------- |
| `invite/create` (share)              | whole, or unheld streets                  | —   | —   | their streets only                       | —   | —                         |
| `invite/create` with `handoff`       | one unheld street                         | —   | —   | **refused** (`forbidden`)                | —   | —                         |
| `invite/delete`                      | any                                       | —   | —   | own                                      | —   | —                         |
| `handoff/create`                     | one unheld street, to a member            | —   | —   | **refused** (`forbidden`)                | —   | —                         |
| `handoff/end` (take back, give back) | any held street                           | —   | —   | their streets                            | —   | —                         |
| `member/scopes`                      | members the owner invited                 | —   | —   | —                                        | —   | —                         |
| `member/remove`                      | anyone but self                           | —   | —   | their onward members                     | —   | —                         |
| `link/create`                        | unheld streets                            | —   | —   | their streets only                       | —   | —                         |
| `link/end`                           | any                                       | —   | —   | own                                      | —   | —                         |
| `leave`                              | refused (`bad_request`); `delete` instead | yes | yes | yes, which gives every street back first | yes | —                         |
| `rekey`, `delete`                    | yes                                       | —   | —   | —                                        | —   | —                         |
| `sync`, `put`, `live`                | yes                                       | yes | yes | yes                                      | yes | `guest/sync`, `guest/put` |

**What the server can and can't enforce.** It enforces who may read and write each scope, the header, the key chain, member and link-key records, who may invite, hand off and make links, and that a hand-off can't be repeated. It can't tell a door from a do-not-call or a guest record inside a scope, so within a scope anyone who may write it may write any of them, including `by` and `byName`: attribution rests on trust, as on Shared Cars. It can't see `houseRecords` or privacy mode. Members of any role hold the space key, so a street member colluding with the server could read other streets; guests can't.

## Operations

All are `POST {BASE}/spaces/v1/{op}` with a JSON body, under [Shared Cars' responses](./shared-cars-protocol.md#responses) and error codes. Member ops carry `Authorization: Bearer`, `spaceId`, `memberId`, `token`, as today.

### Reused as is

`sync`, `put`, `invite/create`, `invite/delete`, `join`, `leave`, `member/remove`, `rekey`, `delete`, and `GET /spaces/v1/live` keep their bodies and answers. In a scoped space they also follow the rules below. On spaces without a mode nothing changes.

### Changes in scoped spaces

| Op              | Change                                                                                                                                                                                                                                                                                                                                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `create`        | Optional `mode: "scoped"`. Part of an identical retry.                                                                                                                                                                                                                                                                                                                                                       |
| `invite/create` | Optional `scopes` (1–100 distinct scope ids; absent means the whole territory) and `handoff` (bool; needs exactly one scope). Permissions as above. A scope that's held, or has a pending hand-off, is `conflict` for a hand-off and `forbidden` for a share by the owner. `scopes` or `handoff` on a space without a mode is `bad_request`. A hand-off invite makes the street held at once, by the invite. |
| `join`          | The new member gets the invite's `scopes` (or `null`) and `invitedBy` = the inviter. A hand-off invite makes them the street's holder.                                                                                                                                                                                                                                                                       |
| `invite/delete` | Deleting a pending hand-off invite also clears the hold. So does its expiry, the next time anything touches the space (which advances `seq`).                                                                                                                                                                                                                                                                |
| `put`           | Ids outside [the grammar](#record-ids) are `bad_request`; records the caller may not write are `forbidden`, checked before `stale_key`, as today.                                                                                                                                                                                                                                                            |
| `sync`          | Returns only records the caller may read. The page still stops at `limit` returned records. Adds the fields below.                                                                                                                                                                                                                                                                                           |
| `leave`         | The owner gets `bad_request`. A holder's leave first runs `handoff/end` for every street they hold.                                                                                                                                                                                                                                                                                                          |
| `member/remove` | Also allowed to a holder for members whose `invitedBy` is them. Removing a holder first runs `handoff/end` for their streets.                                                                                                                                                                                                                                                                                |

`sync` answers in a scoped space add:

```json
{
  "mode": "scoped",
  "members": [
    {
      "memberId": "<22>",
      "dhPub": "<43>",
      "joinedAt": 0,
      "scopes": null,
      "invitedBy": null
    }
  ],
  "invites": [
    {
      "inviteId": "<22>",
      "invitedBy": "<22>",
      "expiresAt": 0,
      "scopes": ["<22>"],
      "handoff": true
    }
  ],
  "holders": [
    { "scopeId": "<22>", "memberId": "<22>", "inviteId": null, "since": 0 }
  ],
  "links": [
    {
      "linkId": "<22>",
      "createdBy": "<22>",
      "scopes": ["<22>"],
      "createdAt": 0,
      "expiresAt": 0,
      "endedAt": null
    }
  ]
}
```

- `members` and `holders` are always complete, so every device can name who has what.
- `invites` and `links` are complete for the owner and whole members, and only the caller's own for everyone else.
- `links` keeps ended and expired links for 24 hours after `expiresAt`, so the owner sees what ended.

### New member ops

| Op               | Who                                            | Body (beyond member fields)                                                          | Response      | Errors and rules                                                                                                                                                                                                                                                               |
| ---------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------ | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `member/scopes`  | owner                                          | `target` (`memberId`), `scopes` (1–100 scope ids, or `null` for the whole territory) | `{ ok }`      | Only for members the owner invited, never the owner. The new scopes must keep every street the target holds and may not include a street someone else holds (`conflict`). Narrowing sets `rekeyNeeded`. An unknown target is `conflict` (sync and retry).                      |
| `handoff/create` | owner                                          | `scopeId`, `target` (`memberId`, not the owner)                                      | `{ ok, seq }` | `S` held or pending: `conflict`. A street-scoped target gains `S` in its scopes. Anyone else: `forbidden`.                                                                                                                                                                     |
| `handoff/end`    | owner, or `S`'s holder                         | `scopeId`                                                                            | `{ ok, seq }` | Idempotent: an unheld street is `ok`. See [Hand-off](#hand-off-take-back-give-back).                                                                                                                                                                                           |
| `link/create`    | owner (unheld streets), holder (their streets) | `linkId`, `verifier`, `scopes` (1–30), `expiresAt`, `epoch`                          | `{ ok, seq }` | `expiresAt` must be after now and at most 24 h + 5 min ahead (`bad_request`). `epoch` must be current (`stale_key`). 10 open links per space and 30 created per rolling day (`limit`). An identical retry by the creator is `ok`; any other reuse of a `linkId` is `conflict`. |
| `link/end`       | the link's creator, or the owner               | `linkId`                                                                             | `{ ok, seq }` | Idempotent; unknown, ended or expired is `ok`.                                                                                                                                                                                                                                 |

`handoff/end S` does, in one step:

1. Clears the hold. A pending hand-off invite is closed.
2. Removes `S` from the scopes of the holder (unless they're a whole member) and of every member whose `invitedBy` is the holder. A member left with no scopes is removed, as `member/remove` does.
3. Ends every link the holder made that names `S`.
4. If anyone was removed: closes every open invite and sets `rekeyNeeded`, as removal does today.

All of these advance `seq` and send `changed` on the live socket.

### Guest ops

`POST {BASE}/spaces/v1/guest/sync` and `POST {BASE}/spaces/v1/guest/put`. No `Authorization`. Bodies carry `spaceId`, `linkId`, and `linkToken` (`b64u`, 32 bytes). CORS admits them from `WEB_APP_ORIGINS` like every other route.

| Op           | Body (beyond those)                                                                               | Response                                                                                                                                       |
| ------------ | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `guest/sync` | `since` (int ≥ 0), `limit?` (≤ 500)                                                               | `{ ok, seq, epoch, expiresAt, records, more }`; `records` as in `sync`, holding only `g.<linkId>` and the streets the guest [may read](#roles) |
| `guest/put`  | `records`: 1–20 of `{ recordId, epoch, stamp, deleted?, blob }`, each `s.<S>.w` or `s.<S>.<uuid>` | `{ ok, seq, results }` as `put`                                                                                                                |

Checked in this order:

1. **Switches:** `spaces:enabled` and `spaces:guests` both on, otherwise `503 disabled` with `Retry-After`.
2. **Per network:** 120 guest requests a minute per IP (IPv6 by /64), keyed by an HMAC of it, never the IP: `429 rate_limited` with `Retry-After`.
3. **Body:** 64 KiB, fields, sizes (`bad_request`, `too_large`).
4. **The link**, in the space: a space that never existed, an unknown `linkId`, or a token whose `SHA-256` doesn't match the verifier (compared in constant time) are all `404 not_found`, the same answer. A deleted space, or a link ended by `link/end` or `handoff/end`, is `410 gone` with `reason: "ended"`. A link past `expiresAt` is `410 gone` with `reason: "expired"`.
5. **Per link:** 120 syncs and 30 puts a minute, and 2,000 records a rolling day (`rate_limited`).
6. **Records:** a record the guest may not write, or a bare `s.<S>`, is `forbidden`, and nothing in the put is stored. A blob over 4 KiB decoded is `too_large`. Then `stale_key` and the space's caps, as `put`.

A wrong token never burns a link: it's 32 random bytes, and burning would let anyone holding a `linkId` end someone's link. Guest ops never wake a space for a request refused in steps 1–3. Nothing about a guest (IP, user agent) is stored or logged; the guest's name is only inside its sealed `guest` record.

### Errors

No new codes. `gone` gains an optional `reason` (`"ended"` or `"expired"`) on guest ops. The Shared Cars table applies otherwise, with the new refusals listed above.

### Limits

Shared Cars' limits apply, plus:

| Item                                    | Limit                                                      |
| --------------------------------------- | ---------------------------------------------------------- |
| Members plus open invites per territory | 10 (`spaces:maxMembers`), holders' onward members included |
| Scopes per invite or member             | 100                                                        |
| Scopes per link                         | 30 (the `g.` record has to fit 16 KB)                      |
| Link lifetime                           | 24 h (no extension: make a new link)                       |
| Open links per space                    | 10                                                         |
| Links created per space                 | 30 a rolling day                                           |
| Guest requests                          | 120 a minute per IP                                        |
| Guest syncs, puts per link              | 120 and 30 a minute; 2,000 records a rolling day           |
| Guest put                               | 20 records, 64 KiB body, 4 KiB blob each                   |
| `guest/sync` page                       | 500 records                                                |

### Kill switches

- `spaces:enabled` (KV, else `SPACES_ENABLED`) as today, for everything.
- `spaces:guests` (KV, else the `SPACES_GUESTS` var: dev `"true"`, prod `"false"`) for the guest ops only, so the public surface can be turned off alone. `link/create` still works while it's off, and the guest page says links are paused while `guest/sync` answers `disabled`.
- **Production today:** `spaces:enabled` is absent and `SPACES_ENABLED` is `"false"`, so Shared Spaces is off. Beta testing needs both keys set to `"true"` in production KV. That doesn't show Shared Cars to anyone: its app flag stays off.

No Supporter check: Territories are free.

## Buddies events

Sent through the relay's ordinary `event/put`, exactly like the [`car.*` events](./shared-cars-protocol.md#invitations-buddies-events), with the same sending, receiving, retry, secret-keeping, rekey and ending rules:

| Kind                | Written by                       | Plaintext                                                                                                                          | Push           |
| ------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| `territory.invite`  | the owner, or a holder           | `{ "v": 1, "id": spaceId, "rev", "inviteId", "joinSecret", "epoch", "key", "title", "streets", "handoff", "people", "expiresAt" }` | yes, immediate |
| `territory.cancel`  | the inviter                      | `{ "v": 1, "id", "rev", "inviteId" }`                                                                                              | no             |
| `territory.reply`   | the invitee                      | `{ "v": 1, "id", "rev", "inviteId", "status": "joined" \| "declined" }`                                                            | `joined` only  |
| `territory.handoff` | the owner, to an existing member | `{ "v": 1, "id", "rev", "scopeId", "street" }`                                                                                     | yes, immediate |

- `title` is the territory's display title (≤ 100). `streets` lists the shared streets' names (≤ 30 names of ≤ 80), empty for the whole territory. `handoff` is a bool.
- `eventId = SHA-256("ww-spaces/v1/territory-event|" + kind + "|" + senderInboxId + "|" + recipientInboxId + "|" + (inviteId or scopeId + "|" + since))[0..16]`.
- **Templates** (they name no one): `territory.invite` "A buddy shared a territory with you" / "Open Territories to see it."; `territory.reply` "A buddy joined your shared territory"; `territory.handoff` "A buddy handed you a street". That's 3 more of the relay's 32 (22 at most).
- **Named alerts** on Android, worded by the app: "Anna shared a territory with you", "Anna handed you a street", "Joe joined your territory". The iOS Notification Service Extension keeps the templates in v1, so no native build is needed.
- The relay adds `territory.invite` and `territory.handoff` to its immediate kinds.
- **Tray entry:** "Anna shared 12 · North Hill with you" or "Anna handed you Oak Street", with Join (Accept for a hand-off) and Decline.

## Lifecycles

### First share: moving a territory into a space

When the owner first shares, makes a link, or hands off a street:

1. Make `spaceId` and `K_1`, derive the member values, and `create` with `mode: "scoped"`.
2. Put `h`, every street, `worked`, door and do-not-call record, and the owner's `member` record, 100 records a put.
3. Once every put has landed, the territory lives in the shared territories store and leaves the personal one, and the space goes in the roster. A local flag resumes a seeding that stopped part-way. A refusal retrying can't fix (`too_large`, `limit`) deletes the space, keeps the territory personal, and tells the User.
4. Then the share, link, or hand-off.

The space then stays until the territory is returned or deleted, even when nobody else is on it, so the owner's other devices keep it.

### Without Buddies

Only sharing with buddies and handing off need Buddies: they travel as Buddies events between inboxes. A space, its records and its guest links need only what every space op needs: the account key (Shared Cars calls it the Buddies root seed; it's the same key) and an attested account session. So a User who has never set up Buddies, or has turned it off, can make, show and end guest links, and see what guests record.

- **Account.** Making a link calls `accountSessions.ensure()` first when the device has no account key, which makes the key and opens a session the way Scribe AI does. Nothing in the background makes one.
- **Member values** come from the account key, as always, so they don't change when Buddies is set up later.
- **Member record.** `name` is the Profile name, as on the Buddy Card (empty when the User has none; the guest page then shows only the territory's title). `tag` is `memberTag(spaceId, inboxId)` with the inbox id Buddies derives from the same key (`HKDF(seed, "", "ww-buddies/v1/inbox-id", 16)`, `deriveInboxId`), registered or not. No photo. Once Buddies is set up, the member is the same `memberId` with the same `tag`; the name follows the Profile name as for any rename, and `g.<linkId>`'s `from` keeps the name the link was made with.
- **Roster.** The space is in `memberships` from seeding, as for anyone. When Buddies starts on a device that has territory spaces, the device saves the roster soon after, so they join it like any other.
- **Runtime.** Sync, live sockets and seeding run whenever Territories is on, with or without Buddies. Pushes, invitations, hand-offs and the roster still need Buddies running.
- **The Share screen** shows Set Up Buddies in place of the buddy list, and the Hand Off screen does the same, so the needs-Buddies refusal isn't reachable from a link.

### Sharing with buddies

- **Whole territory:** `invite/create` without `scopes`, put `i.<inviteId>`, send `territory.invite`. Joining is Shared Cars' sequence, then `territory.reply`.
- **Some streets:** the same with `scopes`.
- **More streets to someone already on it:** `member/scopes` with the union (`shareWithPeople`'s rule); to someone with an open invite, cancel it and invite again with the union.
- **Stop sharing with someone:** `member/remove`, then the owner's device rekeys when `rekeyNeeded`.
- **Their device** shows a received territory: kind `shared` while they have no held street, `handoff` when every street they have is one they hold. Its "from" is the inviter's member record.

### Guest links

1. **Create** (online only): make `linkId`, derive `L`, run `link/create`, then put `g.<linkId>`. Show the QR code and the link only once both landed.
2. **URL**, by app variant (`src/lib/appVariant`):

   | App         | Link                                                                                 |
   | ----------- | ------------------------------------------------------------------------------------ |
   | production  | `https://app.witnesswork.app/territories/guest#v1.<spaceId>.<linkId>.<b64u(L)>`      |
   | beta        | `https://beta.app.witnesswork.app/territories/guest#v1.<spaceId>.<linkId>.<b64u(L)>` |
   | development | `https://app-dev.witnesswork.app/territories/guest#v1.<spaceId>.<linkId>.<b64u(L)>`  |

   The QR code holds the same URL. The fragment never reaches a server. The page talks to its own web profile's ww-api, so a link only works on the web host of the app that made it.

3. **The guest page** reads the fragment, then replaces the URL with `/territories/guest` before analytics, Sentry, or anything else can read it. It derives the link token and key, runs `guest/sync` from 0, and opens `g.<linkId>`.
4. **Name:** the guest types a name once. The page makes a guest UUID and puts the `guest` record. Every door it records carries `by` (that UUID) and `byName`. Changing the name rewrites the `guest` record. The owner and members see guests by these records, beside the link.
5. **Recording:** doors, `worked`, and do-not-calls, as `houseRecords` allows, sealed under `g`'s scope keys at the epoch from the last `guest/sync`. The page syncs after each put, every 15 s while visible and active, every 60 s after 10 idle minutes, and not while hidden.
6. **After a rekey**, guest puts get `stale_key`. The page re-reads `g.<linkId>` until it has the new epoch's keys, keeping its records meanwhile. The creator's devices add the new epoch's keys to every live link they made on their next sync.
7. **Ending:** `link/end` (the owner, or the holder for their links), `handoff/end`, returning the territory, or 24 hours. The guest's next request gets `gone`.

**What a guest's browser stores**, in `localStorage` under `ww.territoryGuest.v1.<linkId>` and a `current` pointer: the fragment's values (`spaceId`, `linkId`, `L`), its guest UUID and name, its sync cursor, the sealed records it synced, and its unsent records. Everything for a link is deleted when the link answers `gone` or `not_found`, at `expiresAt`, or when the guest chooses Forget This Link. Nothing goes into the web app's own storage. The page also registers the web app's service worker for `/territories/guest` only (`docs/web-offline.md`, "The guest page"), which keeps the page's shell and the script and font files it loaded in the `ww-guest` cache, so a later visit opens from the device, offline too. Those files are the same for every link: the cache holds nothing from the fragment and no record, the shell is stored under `/index.html` and never under the address that was opened, and the cache stays when a link is forgotten.

### Hand-off, take back, give back

**Hand off `S` to a buddy who isn't on the territory:**

1. Owner: `invite/create { scopes: [S], handoff: true }`. From now `S` is held by the invite: the owner and whole members read it only, and the owner's links stop reaching it.
2. Owner: put `i.<inviteId>`, send `territory.invite` with `handoff: true`. The street shows "handed off to Joe, waiting".
3. Joe accepts: `join`. He becomes the holder, with `scopes: [S]`. He sends `territory.reply`.
4. Declined, canceled, or expired: the hold clears and the street is back with the owner.

**Hand off `S` to someone already on it:** `handoff/create { scopeId: S, target }`, then `territory.handoff`.

**The holder shares onward:** `invite/create { scopes ⊆ held }` to their own buddies, and `link/create` on their streets. A holder's `invite/create` with `handoff`, or any `handoff/create`, is `forbidden`. That's the server's refusal of a second hand-off; the app never offers it.

**What the giver sees:** everything on `S`, live and read-only, and who it's shared with: `members` whose `invitedBy` is the holder (named by their member records) and `links` whose `createdBy` is the holder.

**Take back** (owner) or **give back** (holder): `handoff/end { scopeId: S }`. The holder's onward members lose `S` (and leave if it was all they had), the holder's links on `S` end, and the owner's device rekeys if anyone was removed. The owner can write `S` again. Undo on the "Handed off" toast is the same call.

### Returning a territory

The owner's device syncs (pull and push), then runs `delete`. That ends every share, link, and hand-off. The returned territory goes back to the personal store, with its door records cleared as `returnTerritory` does today. Every other device gets `gone`.

### Leaving, removal, rekey

- **A member leaves:** `leave`, retried until it lands. Their received territory goes away.
- **Removed, taken back, or returned** (`gone`, or their last street taken back): the received territory stays, read-only and marked ended, with its door records cleared as on return (worked and do-not-calls kept), until the User removes it.
- **Rekey:** Shared Cars' rule, by the owner. Afterwards each link creator's devices update their `g.` records.
- **Delete My Buddies Data** first deletes every space the User owns (keeping each territory personal) and leaves every other one.

## Live updates, offline, and conflicts

- **Members** use the live socket exactly as Shared Cars: one socket per territory space while the app is in the foreground, sync on `hello` and `changed`, on foreground, 2 s after a local change, on pull to refresh, and on any `territory.*` event. `changed` reaches every member's socket, so a street member learns when other streets change, but not what.
- **The guest page** polls ([Guest links](#guest-links)). A live socket for guests is left for later.
- **Offline:** every write is kept locally until a put stores it, and stamped with the synced clock (`syncTimestamp`). The guest page stamps with its clock corrected by the last response's `Date` header.
- **Refused writes:**
  - `forbidden` on a member's put (the street was handed off or taken back meanwhile): sync, drop the records it may no longer write, put the rest, and tell the User once that changes to that street weren't shared.
  - `gone`: the territory ended for this person; unsent records are dropped, and the received territory says so.
  - On the guest page, `gone` shows the ended state with how many records weren't saved.
- **Conflicts** follow [Merge rules](#merge-rules).

## Another of the User's devices

The Buddies roster gains `territories: { "<spaceId>": { "at" } }` and `leftTerritories: { "<spaceId>": at }`, merged like `cars` and `leftCars`. Every device of the User derives the same member values, so it's the same owner, member, or holder, and sees every territory space the User is on.

A territory the User owns also names its space in personal sync, so devices without Buddies find it too: the `shared` mark on `h` carries `space: { id, owner, at }` (the space id, the owner's `memberId`, the owner's `joinedAt`; see [Shared and unshared](#shared-and-unshared)). A device that sees such a mark for a space it doesn't have derives its own member values for that space and, only if its `memberId` is `owner` (the same account key), adds the space as the roster would (`adoptOwnSpace`, then `addFromRoster(spaceId, at)`). The same `leftTerritories` check applies, so a space this device saw end isn't added again. A device with another account key leaves the mark alone. It does this at start, on foreground, when the account becomes ready, and when a synced ledger brings a new mark. Territories shared or handed to the User still reach other devices only through the roster.

## Unshared territories: sync and backup

The User's own territories that aren't in a space travel in the sync payload, so every sync option (Cloud Sync, iCloud, Google Drive), the account Backup, Set Up Another Device (which restores that Backup) and backup files carry them. They're never put on a space for this: that would put a User's territories on our server without their choosing it, against ADR 0030 §3, and need Buddies on every device. Code: `src/features/territories/lib/personalSync.ts` (pure records, merge and projection), `src/app/sync/territoryStoreSync.ts` (the store glue).

### Records

The optional payload slice `territoryStore` holds `territoryRecords` (`{ id, kind, data, updatedAt }`) and `deletedTerritoryRecords` (`{ id, deletedAt }`). `id` is `<territoryId>:<key>`:

| Key                 | Kind                                               | `data`                                                                                                   |
| ------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `h`                 | `territory`                                        | the space's `territory` data without `houseRecords`, plus `finishedAt?` (returned) and `shared?` (below) |
| `s.<streetId>`      | `street`                                           | as in a space                                                                                            |
| `s.<streetId>.w`    | `worked`                                           | `at`                                                                                                     |
| `s.<streetId>.<id>` | `door` or `doNotCall`                              | as in a space, without `by` and `byName`                                                                 |
| `d.<id>`            | `doNotCall` (no street, or its street was deleted) | as in a space, plus `streetId?` for one whose street was deleted                                         |

Street, door and do-not-call ids are the store's own (any case, UUIDs since the v2 migration), not scope ids. The card photo and each street's next house stay on the device. Received territories (live or ended) aren't in the slice: they belong to the other person's space.

The territories store keeps the same records with their stamps in its persisted `ledger`. A store subscriber diffs every changed territory against it (`restampLedger`) and stamps what changed with the synced clock (`syncTimestamp`), so a stamp is the edit's time. A change to the ledger is a local data change for sync and the Backup. Building a payload restamps everything first, which catches edits made before the subscriber was attached.

### Merge

- **A record:** the newest `updatedAt` wins; a tie goes to the larger canonical JSON. A tombstone beats any version that isn't strictly newer, so Undo can put a door back.
- **A deleted territory (`h` tombstoned) or street (`s.<id>` tombstoned) is deleted for good.** No later version brings it back, and its children are dropped from the ledger, keeping only the one tombstone. A deleted street's do-not-calls move to `d.<id>` (with `streetId`), so a do-not-call recorded on another device while the street was being deleted isn't lost. A territory a device keeps when its space ends (`removeSpace`'s `keep`) isn't kept if it was deleted elsewhere.
- **Two records for one house** fold as in a space ([Merge rules](#merge-rules), rule 3); the next restamp writes the fold.
- **A missing slice is not a deletion.** 1.46.0 and earlier don't know `territoryStore` (their schema drops it) and write snapshots without it; a merge with such a payload changes nothing, and a restore (Replace, or a backup file) without it keeps this device's territories. Every device writes only its own snapshot, so an older one can't remove another's. The merge is commutative, associative and idempotent; `personalSync.test.ts` checks convergence over random edits and sync orders.
- **The `territories` flag doesn't gate any of it.** A device with the flag off merges, stores and writes territories like any other record, so turning the flag off and on again loses nothing.

### Shared and unshared

A territory is in exactly one place at a time on a device: its space, or the personal records.

- **First share.** When the territory moves into a space (seeding), it leaves the personal list, and the device writes `h` again with `shared: true` and `space: { id, owner, at }` (only if `h` is older than the space's creation, the owner's `joinedAt`). Other devices hide a territory whose `h` says `shared` until its space reaches them, through the roster or the mark's `space` ([Another of the User's devices](#another-of-the-users-devices)), unless they edited it after the mark, in which case their next restamp writes it back. Its personal records stay, frozen, and nothing else reads them. `space` is a known field, so writing `h` again without the mark drops it; marks written before it existed have none.
- **While shared,** the space is the source of truth. Personal sync never deletes or marks a territory this device sees in a space, and never shows a personal copy beside one: a view replaces a personal territory with the same id (`placeView`).
- **When the share ends,** the owner's devices keep the territory personal, as now ([Returning](#returning-a-territory)); the restamp writes `h` without `shared` and every record that changed, so it comes back on every device, returned. A device with a stale space (the flag off, or it hasn't heard `gone` yet) leaves the newer personal records alone instead of marking them again.
- **Deleted while shared,** the device that deleted it tombstones `h`, and the other devices' finished copies are dropped.
- A territory shared before this shipped has no personal records; it comes back on a new device only through the roster, as before.

### Territory privacy mode

A device with territory privacy mode (or data protection mode) on keeps no door records, its own or anyone's:

- Turning it on clears this device's doors (`clearAllDoorRecords`); the restamp tombstones them, so they're cleared on the User's other devices too and no stale snapshot brings them back. Do-not-call doors become do-not-calls under the same id.
- A pull drops other devices' door records before they reach the ledger or the screen, without tombstoning them; do-not-call doors become do-not-calls. Doors recorded later on a device with privacy off stay there and come back here once privacy is off.

### Limits

A door record is about 360 bytes of JSON; a territory of 40 streets and 5,000 doors with locations and descriptions is about 1.8 MB, against 20 MiB a Cloud Sync snapshot and 20 MiB a Backup. Tombstones are kept like every sync tombstone: returning or checking out a territory again tombstones each of its doors (about 70 bytes each), so a territory worked many times grows by that each round. A deleted territory or street shrinks to one tombstone.

## Migration from the prototype

The territories store goes from version 1 to 2. Its migrate step removes everything the dev harness simulated, since none of it reached anyone:

- territories with `received` are deleted;
- `people` and `shares` are cleared;
- `handoff`, `workedBy`, and door `by` are cleared;
- street, door and do-not-call ids that aren't UUIDs get new UUIDs.

What's left are the User's own territories, still unshared. The prototype was only behind the `territories` flag, so only test devices have any.

## Prototype behaviour that changes

| Where                                                               | Today                                                          | With the real thing                                                                                                                                                                               |
| ------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/sharing.ts` `GUEST_LINK_BASE`, `guestLinkUrl`                  | `https://witnesswork.app/t/<token>`                            | Wrong host and path: the web app's host per variant, `/territories/guest#…` ([URL](#guest-links)). The website apex is for app links (ADR 0042), and a token in the path would reach server logs. |
| `TerritoryShare.token` in the store                                 | A random token saved in MMKV                                   | Removed. `L` derives from the root seed and is never saved.                                                                                                                                       |
| `TerritoryShareLinkScreen`, `GuestLinkQrCard`                       | The link exists the moment it's made, offline too              | Needs a connection; the QR shows after `link/create` and `g.` land. Links end at 24 h and can't be extended.                                                                                      |
| `useHandOffStreet`, `TerritoryHandoffScreen`                        | Immediate, offline, to anyone                                  | Needs a connection; pending until the buddy accepts; only active buddies. Undo is `handoff/end`.                                                                                                  |
| `StreetActionChips`                                                 | Owner hands off; members can't share                           | Unchanged, now enforced by the server too. A holder's Share stays; Hand Off never appears for them.                                                                                               |
| `TerritoryShareScreen` scope picker                                 | Any number of people                                           | 10 people a territory, open invitations and holders' onward people included. Whole members can't share.                                                                                           |
| `TerritoryReceived`, `TerritoryReceivedSection`, `useLeaveReceived` | Made by the dev harness                                        | Derived from spaces. Leave is `leave`, Give Back is `handoff/end`. An ended item keeps no door records.                                                                                           |
| `TerritoryCardPhotoRow` on received territories                     | Photo shown                                                    | No photo: it isn't shared.                                                                                                                                                                        |
| `TerritoryStreet.next`                                              | Part of the street                                             | Device-only; never shared.                                                                                                                                                                        |
| `TerritoryGuestScreen`                                              | Preview on a copy                                              | Stays the in-app preview. The real page is the web route.                                                                                                                                         |
| `PreviewBuildNote` and the `share.previewBuild*` strings            | Shown                                                          | Removed once the real paths work.                                                                                                                                                                 |
| `src/app/dev-harness/territorySharing.ts`                           | Writes fake people into the store                              | Must never touch a space. Rework it to drive `fakeSpacesServer` in tests, or remove it.                                                                                                           |
| Owner privacy mode while shared                                     | Copy says sharing carries only worked streets and do-not-calls | Now true for the whole group, guests included ([Privacy mode](#territory-privacy-mode)).                                                                                                          |

## House numbers from the map

Find Streets in the Outline also asks ww-api for the house-number address points inside the outline: `POST /maps/v1/addresses` with the account session's bearer and `{ "outline": [{ "latitude", "longitude" }, …] }` (3–200 points, bounding box about 3 km a side at most). ww-api looks the outline up in OpenStreetMap through the Overpass API, caches the answer for a week, and answers `{ ok: true, source: "openstreetmap", attribution, addresses: [{ street, number, latitude, longitude }] }`. Errors: 400 `bad_request`, 413 `area_too_large`, 429 `rate_limited` or `daily_limit`, 503 `upstream_busy`, 502 `upstream_error`. Only the outline is sent: no names, notes, or door records.

The app groups the answer by street with the same key street names match on (`streetKey`) and saves each street's numbers as `houses` on the street record above. A list the owner already has is never replaced. Every failure falls back quietly: streets still come from the device's geocoder, and the recorder counts doors as before. With `houses`, the recorder steps through the known houses on the street's side before counting, and the street and territory show the share of houses with a door record.

## Build plan

Three workstreams, in parallel against this contract. Backend lands on ww-api `main` first; the Beta build releases it (`scripts/release-api.sh`).

### 1. Backend (ww-api, `feat/territory-qr-navigation`)

**Files:** `src/spaces/contracts.ts` (mode, grammar, new ops and parsers, guest limits), `src/spaces/spaceDO.ts` (schema, permissions, filters, new methods), `src/spaces/route.ts` (new member ops, guest routes without bearer), `src/spaces/switches.ts` (`spaces:guests`), `src/spaces/openapi.ts`, new `src/spaces/scoped.test.ts` and `src/spaces/guest.test.ts`, `src/buddies/contracts.ts` (immediate kinds), `wrangler.toml` (the `SPACES_GUESTS` var and a `SPACES_GUEST_LIMITER` rate-limit binding, in both envs), `AGENTS.md` (Shared Spaces section, KV commands).

**Order:**

1. Schema, added with `IF NOT EXISTS` and guarded `ALTER TABLE`, so existing spaces start cleanly: `space.mode`; `member.scopes` (JSON or NULL) and `member.invited_by`; `invite.scopes` and `invite.handoff`; `record.scope` with an index on `(scope, seq)`; new tables `holder (scope_id PK, member_id, invite_id, since)`, `link (link_id PK, created_by, verifier, scopes, created_at, expires_at, ended_at)`, and per-link counters like `member_put`. No new Durable Object class or migration tag.
2. `create` with mode; the id grammar; read and write permissions in `put` and `sync`; the extra `sync` fields.
3. `invite/create` and `join` with scopes and hand-off; `invite/delete` and expiry clearing holds; owner `leave` refused; holder rules in `leave` and `member/remove`.
4. `member/scopes`, `handoff/create`, `handoff/end`, `link/create`, `link/end`.
5. Guest ops: switch, per-IP limiter before any Durable Object call, link check, per-link limits, record rules.
6. OpenAPI for every new and changed op; `AGENTS.md`.

**Acceptance:**

- Every existing spaces test passes unchanged (spaces without a mode behave exactly as before).
- Tests cover each cell of the [permission tables](#who-reads-and-writes-which-records), each `handoff/end` effect, a holder's hand-off refused both ways, owner `leave` refused, a guest reading and writing only its streets, `gone` reasons, every limit, and `not_found` being identical for an unknown space, link, or token.
- Nothing logs or reports a token, link token, verifier, IP, or blob.
- `pnpm test` and typecheck pass; `verify-ww-api` drives a scoped space and a guest link against the local Worker.
- Rollout: deployed to prod from `main`; `spaces:enabled` and `spaces:guests` set to `"true"` in production KV when the owner approves Beta testing.

### 2. App (sharing and sync)

**Files:** `src/lib/sharedSpaces/` (client: new ops, mode, scoped sync fields, `guestSync`/`guestPut`; new `scopes.ts`: scope ids, scope key, link derivations, URL build and parse; `records.ts`: grammar and client-side permission mirror; vectors), new `src/app/territories/` runtime beside `TerritorySharingProvider.tsx` (engine, store of shared territories, projection to `Territory`, seeding, invitations, hand-off, links, endings, live), `src/features/territories/` hooks and screens, Buddies event handling and tray rows, `src/lib/platformCapabilities.ts` (`territorySharing: ['ios', 'android']`), the territories store migration, `docs/feature-flags.md`, `docs/analytics.md`, Help Center answers in `services/marketing/content/help/`.

Reuse `src/lib/sharedSpaces` (client, crypto, keyring, keyTrust, live, invite secrets) as is. `src/app/sharedCars/engine` is car-specific: copy what fits into the territory engine, and only extract shared pieces where that's mechanical.

**Order:**

1. **`src/lib/sharedSpaces` first, pushed early**, because the guest page imports it: `scopes.ts` with the derivations, guest client calls, client ops, vectors.
2. Territory records: codecs per kind, the projection from records to today's `Territory` shape (one view of personal and shared territories, as Mileage has), merge rules 1–5, privacy mode.
3. Engine: seeding, sync, put, outbox, live socket, rekey, roster entries.
4. Sharing: Buddies events and templates, tray entries and Android named alerts, whole and street shares, `member/scopes`, stop sharing, received territories, leave.
5. Links: create, show again, end, keep `g.` current.
6. Hand-off: hand off, pending, take back, give back, onward shares, what the giver sees.
7. Returning, ending, refused writes, migration of prototype data; retire the harness's fake sharing.
8. Remove `PreviewBuildNote` and its strings. Turn the `territories` flag on for Beta in PostHog (release condition `app_variant = beta`; register `app_variant` as a person property for flags if it isn't). Document the flag in `docs/feature-flags.md`.
9. Analytics, documented in `docs/analytics.md`, no ids, names or addresses: `territory_shared` (`scope`: `whole` \| `streets`, `people`), `territory_invite_answered` (`answer`, `handoff`), `territory_link_created` (`streets`), `territory_link_ended` (by the User only), `territory_handoff` (`action`: `handed` \| `taken_back` \| `given_back`), `territory_sync_failed` (`reason`, once per UTC day per reason).
10. Help Center: sharing a territory, guest links (what guests see, 24 hours, ending one), handing off a street, privacy mode with sharing; `minAppVersion` set, iOS and Android.
11. Readme architecture diagram: only if it needs the guest page's calls to `/spaces/v1` shown.

**Acceptance:**

- Vitest: vectors, merge rules (same record, same house, do-not-call wins, tombstones, undo), privacy mode both ways, projection, migration, and engine flows against `fakeSpacesServer` with scoped mode added to it.
- On two iOS simulators against the dev API (`verify-witnesswork`, Buddies staging): share whole and street-only, record live both ways, hand off, onward share by the holder with the giver seeing it, take back, give back, return; a hand-off by the holder never offered. One Android pass for the invitation alert, since Android words it in JS.
- typecheck, lint, `pnpm testFinal` pass. Screenshots before and after for the share screen, a received territory, and a handed-off street.

### 3. Guest web page

**Files:** `src/app/launch/start.web.ts` (on the web, `/territories/guest` loads the guest root as its own chunk, without the app or its storage unlock, sign-in, and app-lock gates), new `src/app/territory-guest/TerritoryGuestRoot.web.tsx` (with a native `TerritoryGuestRoot.tsx` that renders nothing), new `src/features/territories/guest/` (fragment parsing and URL clearing, `localStorage` store, session: sync, put, polling, outbox, clock), a presentational `components/sharing/GuestPageBody.tsx` shared with the in-app preview `TerritoryGuestScreen`, guest strings in `src/locales/en-US.json`, and a dev script `scripts/verify/territory-guest-link.mjs` that makes a scoped space and link on the dev API with a dev session and prints the URL.

**Order:**

1. Route and root: minimal providers (theme from the system, i18n from the browser, safe area, toasts). No account, sync, Buddies, app storage, or session replay.
2. Clear the fragment first; then link parsing and the `localStorage` store. Until the app workstream's `scopes.ts` lands, build against `fakeSpacesServer`.
3. States: loading, invalid (`not_found`), ended and expired (`gone` with `reason`), paused (`disabled`), offline banner with queued records.
4. Name step, then the street picker, the recorder (`GuestStreetRecorder`), worked, and do-not-calls (shown on the guest's streets, with the address and date only), honoring `houseRecords`. "Recorded by" from `byName`. Ends-at time always visible.
5. Polling and the outbox; `stale_key` handling; Forget This Link.
6. Events through `analytics`, following the web's consent rules, with the URL already cleared: `territory_guest_page_opened` (`state`: `ready` \| `ended` \| `expired` \| `invalid` \| `paused`), `territory_guest_named`, `territory_guest_first_record` (once per guest and link). Documented in `docs/analytics.md`.

**Acceptance:**

- Playwright through `wwv web test`, Chromium at phone size first, and once at desktop size: open a link from the dev script, give a name, record doors, see another person's record arrive (put through the dev script), end the link and see the ended state; an expired and an unknown link; WebKit once for Safari on iPhone.
- The URL holds no fragment after load, and no request, log, or analytics event carries `L`, the link token, or the fragment.
- Works with no account in a fresh browser profile; 44 pt targets; no hover-only actions.
- Unit tests for parsing, storage, the outbox, clock correction, and the state machine.

## Deferred

- Card photos in sync and backups: a card photo stays on the device that took it.
- Compacting the door tombstones of a territory returned or checked out again many times.
- A live socket for guests (they poll).
- Named alerts in the iOS Notification Service Extension (templates meanwhile).
- Per-member street keys, so a street-only member couldn't read other streets even with the server's help.
- Signed membership changes (as ADR 0037 notes for cars).
- Card photos on shared territories, a guest map, and extending a link.
- Turnstile on guest ops, if links leak and abuse shows up; it isn't configured in production yet.
- Territories in the web app for signed-in users (`territorySharing` is iOS and Android).
