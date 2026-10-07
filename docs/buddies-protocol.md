# Buddies relay protocol v1 (MVP)

The wire contract between the WitnessWork app (`src/features/buddies`) and the ww-proxy relay (`ww-api/src/buddies`). Design rationale lives in [`buddies-recommendations.md`](./buddies-recommendations.md); this file is the source of truth for bytes on the wire. Anything not specified here is an implementation detail of one side.

The relay is **blind**: it stores ciphertext, random ids, public keys, and push tokens. It never sees names, Plans, or which inboxes belong to which people.

## MVP scope

In: inbox registration, device/push registration, invite create → fetch → claim → confirm, Buddy Cards (Plans), removal from either side, delete-all, encrypted roster for multi-device restore, generic localized pushes, kill switch.

Deferred (must land before any production rollout): App Attest on `inbox/register` and `invite/*` (reserved `attest` field below), Notification Service Extension decryption, QR invites, safety codes, activity/awards.

Since the MVP: shared Plans and Follow-up invitations (event kinds below). They need no relay changes.

## Conventions

- **Transport:** `POST {BASE}/buddies/v1/{op}` with a JSON body. All ids travel in bodies — **never in URLs** (production persists request URLs in logs). The one exception to POST is the [live signal](#live-signal), a WebSocket whose signed envelope travels in headers.
- **Binary encoding:** base64url without padding everywhere (`b64u`).
- **Time:** integer milliseconds since the Unix epoch.
- **Ids:** `inboxId`, `slotId`, `inviteId`, `deviceId`, `eventId` are `b64u` of 16 random or derived bytes (22 chars). Servers validate `^[A-Za-z0-9_-]{22}$`.

### Request envelope

```json
{ "p": "<b64u(UTF-8 JSON payload)>", "s": "<b64u(Ed25519 signature)>" }
```

- The signed message is `UTF-8("ww-buddies/v1\n" + op + "\n")` followed by the **decoded bytes of `p`**. The server verifies against those exact bytes; it never re-serializes JSON.
- `op` is the path segment after `/buddies/v1/`, e.g. `inbox/sync`.
- Every signed payload carries `ts` (ms) and `nonce` (`b64u` of 16 random bytes). The server rejects `|now − ts| > 300 000` with `stale`, and a nonce seen within the last 10 minutes for the same inbox with `replay`.
- Unsigned ops (`invite/fetch`, `invite/claim`) send `{ "p": "…" }` only; `ts`/`nonce` are not required there.

### Which key verifies

| Kind        | Ops                                                                                                                                             | Verifying key                                                                    |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Self-signed | `inbox/register`                                                                                                                                | `payload.ownerPub` (proof of possession)                                         |
| Owner       | `inbox/sync`, `inbox/delete`, `device/register`, `device/unregister`, `slot/add`, `slot/remove`, `roster/put`, `invite/create`, `invite/delete` | the `ownerPub` stored for `payload.inboxId`                                      |
| Writer      | `card/put`, `event/put`, `slot/leave`                                                                                                           | the `writerPub` stored for `(payload.inboxId, payload.slotId)`                   |
| Unsigned    | `invite/fetch`, `invite/claim`                                                                                                                  | none — capability is knowledge of `inviteId` / `claimSecret`; rate-limited by IP |

Ed25519 public keys are 32 raw bytes, `b64u`-encoded (43 chars).

### Responses

Success: HTTP 200 with `{ "ok": true, ... }`. Failure: `{ "error": "<code>" }` with:

| HTTP | `error`            | Meaning                                                               |
| ---- | ------------------ | --------------------------------------------------------------------- |
| 400  | `bad_request`      | Malformed envelope/payload, wrong sizes, bad ids                      |
| 401  | `bad_signature`    | Signature missing or invalid                                          |
| 401  | `stale`            | `ts` outside ±5 min                                                   |
| 409  | `replay`           | Nonce reused                                                          |
| 404  | `not_found`        | Unknown inbox / invite (includes expired, deleted, or burned invites) |
| 409  | `conflict`         | Inbox already registered with a different key; invite already claimed |
| 410  | `gone`             | Slot does not exist (buddy removed you)                               |
| 429  | `limit`            | A count cap was hit (slots, invites, devices)                         |
| 429  | `rate_limited`     | A rate limit was hit                                                  |
| 503  | `disabled`         | Kill switch is off                                                    |
| 426  | `upgrade_required` | `inbox/live` requested without a WebSocket upgrade                    |

## Operations

Payload fields listed are **in addition** to `ts` and `nonce` for signed ops.

### Inbox (owner)

| Op                  | Payload                                                                                                                | Response      | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `inbox/register`    | `inboxId`, `ownerPub`, `attest?`                                                                                       | `{ ok }`      | Idempotent for the same `ownerPub`; `conflict` if different, even after the inbox was wiped. `attest` is reserved (ignored in MVP).                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `inbox/sync`        | `inboxId`, `since` (int ≥ 0)                                                                                           | see below     | Touches `lastActiveAt`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `inbox/delete`      | `inboxId`                                                                                                              | `{ ok }`      | Wipes the inbox (slots, cards, events, devices, roster) and every open invite it created, keeping only a hash of the owner key. Allowed even when disabled.                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `device/register`   | `inboxId`, `deviceId`, `apnsToken` (hex), `apnsEnvironment` (`"sandbox"` \| `"production"`), `apnsTopic?`, `templates` | `{ ok }`      | Upsert by `deviceId`. Max 10 devices per inbox (least recently registered evicted). `templates` is `{ [kind]: { title, body } }`, strings ≤ 200 chars — already localized by the device. `apnsTopic` is the app's bundle id (e.g. `com.leviwilkerson.jwtimebeta` for Beta); it must be one the worker accepts (`IOS_BUNDLE_ID` or `IOS_ADDITIONAL_BUNDLE_IDS`), else `bad_request`. Absent means `IOS_BUNDLE_ID`. Re-registering an unchanged device is an idempotent refresh that bumps its eviction order (and re-creates it if the relay removed it); apps re-register about daily. |
| `device/unregister` | `inboxId`, `deviceId`                                                                                                  | `{ ok }`      | Idempotent.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `slot/add`          | `inboxId`, `slotId`, `writerPub`                                                                                       | `{ ok }`      | Registers a buddy's writer key. Idempotent for the same key. `limit` when `slots + open invites ≥ 5`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `slot/remove`       | `inboxId`, `slotId`                                                                                                    | `{ ok }`      | Deletes the slot, its card, and its events. Idempotent. Allowed even when disabled.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `roster/put`        | `inboxId`, `blob` (≤ 32 KB decoded)                                                                                    | `{ ok, seq }` | Replaces the encrypted roster.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

`inbox/sync` response:

```json
{
  "ok": true,
  "seq": 42,
  "slots": [{ "slotId": "…", "createdAt": 0 }],
  "cards": [{ "slotId": "…", "blob": "…", "seq": 40, "updatedAt": 0 }],
  "events": [
    {
      "eventId": "…",
      "slotId": "…",
      "kind": "…",
      "blob": "…",
      "seq": 41,
      "createdAt": 0
    }
  ],
  "roster": { "blob": "…", "seq": 12 }
}
```

- Every write to an inbox (card, event, roster) takes the next value of a per-inbox monotonic `seq`.
- `cards`, `events`, and `roster` include only items with `seq > since`; `roster` is `null` when unchanged. `slots` is always the complete current list (≤ 5), so a missing slot tells the owner that buddy ended the connection.
- Events created by the relay itself (invite claims) use `slotId: ""`.

### Live signal

While the app is in the foreground it keeps a WebSocket open to its own inbox, so a buddy's claim, confirmation, invitation, reply, or request to join shows up within a second instead of at the next foreground or push. The socket only says _that_ something changed; the app then runs `inbox/sync` as usual.

- **Request:** `GET {BASE}/buddies/v1/inbox/live` with `Upgrade: websocket`. Owner-signed exactly like a POST owner op, with op `inbox/live` and payload `{ inboxId, ts, nonce }`, but the envelope travels in headers so no id reaches a URL: `x-buddies-p` (the `p` value) and `x-buddies-s` (the `s` value). Same stale and replay checks. Not a POST op (`POST /inbox/live` is 404).
- **Refusals (before upgrading):** kill switch off → `503 disabled`; not a WebSocket upgrade → `426 upgrade_required`; then the usual `bad_request`, `bad_signature`, `stale`, `replay`, `not_found`.
- **Messages (server → app):** `{ "type": "hello", "seq": N }` right after the upgrade, where `N` is the inbox's current `seq` (what a full `inbox/sync` returns); then `{ "type": "changed", "seq": N }` after every committed write that changes what `inbox/sync` returns: `event/put` (new events only), `card/put`, `roster/put`, a delivered claim, and `slot/add`, `slot/remove`, `slot/leave` that changed a slot. No content, ever. Slot changes don't advance `seq`, so the app syncs on every `changed` and on a `hello` past its cursor.
- **Keepalive:** the app sends `ping` about every 25 s; the relay answers `pong` without waking the inbox's Durable Object. No `pong` within 10 s means the connection is dead and the app reconnects. Anything else the app sends is ignored.
- **Closes:** `4001 "gone"` when the inbox is deleted or wiped for inactivity (the app syncs, which restores it); `4002 "replaced"` when an 11th socket opens, closing the oldest. The app reconnects with backoff (1 s → 60 s, jittered) while in the foreground and closes the socket when backgrounded.
- An open socket is not owner activity for the 180-day wipe. Turning the kill switch off refuses new sockets but doesn't close open ones.

### Buddy writes (writer)

| Op           | Payload                                                                                                          | Response      | Notes                                                                                                                                                                                                                                                                                                        |
| ------------ | ---------------------------------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `card/put`   | `inboxId`, `slotId`, `blob` (≤ 16 KB decoded)                                                                    | `{ ok, seq }` | Replaces that slot's card. `gone` if the slot doesn't exist.                                                                                                                                                                                                                                                 |
| `event/put`  | `inboxId`, `slotId`, `eventId`, `kind` (≤ 40 chars, `^[a-z][a-z0-9.]*$`), `blob` (≤ 8 KB decoded), `push` (bool) | `{ ok, seq }` | Deduplicated on `eventId` (a repeat returns the original `seq` and queues no second push; the original's push is already durable). When `push` is true, alerts every device in the inbox using that device's `templates[kind]` (skipped for devices without the template), subject to the push budget below. |
| `slot/leave` | `inboxId`, `slotId`                                                                                              | `{ ok }`      | The writer removes its own slot (and card/events) from the recipient's inbox — used when ending a connection. Idempotent. Allowed even when disabled.                                                                                                                                                        |

### Invites

| Op              | Signed | Payload                                                                                                    | Response                          | Notes                                                                                                                                                                                                                                                                                                                       |
| --------------- | ------ | ---------------------------------------------------------------------------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `invite/create` | Owner  | `inboxId`, `inviteId`, `claimVerifier` (`b64u` SHA-256, 32 bytes), `blob` (≤ 4 KB), `expiresAt`, `attest?` | `{ ok }`                          | `expiresAt ≤ now + 7 days + 5 min`. `limit` when the inbox has 3 open invites or `slots + open invites ≥ 5`. `conflict` if the `inviteId` exists.                                                                                                                                                                           |
| `invite/delete` | Owner  | `inboxId`, `inviteId`                                                                                      | `{ ok }`                          | Only the creating inbox may delete. Idempotent. Used for cancel, confirm, and reject.                                                                                                                                                                                                                                       |
| `invite/fetch`  | —      | `inviteId`                                                                                                 | `{ ok, blob, expiresAt, status }` | `status` is `"open"` or `"claimed"`. Expired/deleted/burned → `not_found`.                                                                                                                                                                                                                                                  |
| `invite/claim`  | —      | `inviteId`, `claimSecret` (`b64u`, 32 bytes), `blob` (≤ 4 KB)                                              | `{ ok }`                          | Constant-time compare `SHA-256(claimSecret)` to `claimVerifier`. First valid claim wins (`conflict` afterwards). 5 wrong secrets burn the invite. On success the relay appends an event `{ slotId: "", kind: "invite.claimed", eventId: inviteId, blob }` to the creator's inbox and pushes with template `invite.claimed`. |

The relay keeps `inviteId → creator inboxId` only until the invite is deleted or expires.

## Limits and retention

| Item                                       | Limit                                                                                                                |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Slots + open invites per inbox             | 5                                                                                                                    |
| Open invites per inbox                     | 3                                                                                                                    |
| Invite creations per inbox                 | 20 per 24 h                                                                                                          |
| Writes per slot (`card/put` + `event/put`) | 60 per hour                                                                                                          |
| Pushes per slot                            | 10 per 24 h, at least 60 s apart; `*.cancel`/`*.decline` kinds get 5 more per 24 h (see [Push budget](#push-budget)) |
| Devices per inbox                          | 10                                                                                                                   |
| Events                                     | Deleted 30 days after creation                                                                                       |
| Invites                                    | Deleted at `expiresAt` (plus a short grace)                                                                          |
| Inbox                                      | Wiped after 180 days without an owner op                                                                             |
| Owner key hash of a wiped inbox            | Kept, with no expiry (see below)                                                                                     |

Unsigned ops are rate-limited by client IP.

A wipe (180 days without an owner op, or `inbox/delete`) keeps one value: `b64u(SHA-256(UTF-8("ww-buddies/v1/inbox-owner\n" + ownerPub)))`, with `ownerPub` the owner's canonical `b64u` key. It is pseudonymous (linking it to anyone takes their public key), it is all that's kept, and it never expires, since an expiry would let another key take the `inboxId` over. Only that key can register the `inboxId` again; every other op treats the inbox as unknown, as before. The app derives `inboxId` and `ownerPub` from the same root seed, so an owner who comes back (after the inactivity wipe, or on another device) registers with the same key. Delete-all also deletes the seed, so later use of Buddies starts a new inbox; the old one keeps only the hash.

## Push delivery

- APNs HTTP/2 with token auth (ES256 JWT, `kid = APNS_KEY_ID`, `iss = APPLE_TEAM_ID`), host chosen by the device's `apnsEnvironment`, `apns-topic` = the device's registered `apnsTopic` (`IOS_BUNDLE_ID` for devices registered without one), `apns-push-type: alert`, `apns-collapse-id` stable across every attempt of the same alert, `apns-expiration` = the alert's retry deadline.
- Body: `{ "aps": { "alert": { "title", "body" }, "sound": "default", "thread-id": "buddies", "content-available": 1 }, "ww": { "kind": "<kind>", "seq": <int> } }`. `content-available` lets iOS wake the app (remote-notification background mode) to sync what the alert announced before the User opens it; best effort, at iOS's discretion. `seq` is the inbox `seq` of the event the alert is about (the latest one, for a coalesced alert); the app finds that event in `inbox/sync`. No user content, names, ids, or tokens — the device supplied the localized strings.
- **Durable:** the relay stores the push intent (one outbox row per target device) in the same transaction as the event, attempts it immediately, and retries transient failures (network, 10 s request timeout, 429, 5xx) with exponential backoff (30 s doubling to 1 h) for up to **6 hours** after the event, then gives up (`expired`). Permanent rejections (e.g. `DeviceTokenNotForTopic`, payload errors) are not retried.
- Delete a device whose token returns HTTP 410 or `BadDeviceToken`; it is not retried.
- Per inbox, the relay keeps a bounded outcome history (last 200 records, ≤ 30 days): kind, outcome (`sent`, `unregistered`, `failed`, `retrying`, `expired`, `deferred`, `suppressed`), attempt count, and times — never tokens, ids, or text.

### Push budget

Per slot (sender) in the recipient's inbox:

- At most 10 alerts per 24 h, at least 60 s apart.
- **Immediate kinds** skip the spacing and alert at once, because someone is waiting on them: `pair.confirmed`, `share.reply`, `plan.invite`, `followup.invite`, and `join.request.*`. They still count toward and are limited by the daily cap, and they count as the slot's latest alert for the spacing of other kinds.
- An alert that arrives inside the 60 s spacing is **deferred**, not dropped: the slot keeps one pending alert and sends it when the spacing allows. A later alert replaces it (latest `kind` and `seq` win), except that a pending cancellation (`*.cancel`, `*.decline`) is kept over a newer non-cancellation.
- Over the daily cap the alert is suppressed (the event is still stored and synced). Cancellations may use 5 extra alerts per 24 h past the cap so they are not lost to it; they still respect the spacing.
- Relay events (`invite.claimed`) don't count against any slot.

## Kill switch

Buddies is enabled when KV `buddies:enabled` is `"true"`; if the key is absent, the `BUDDIES_ENABLED` env var decides (dev `"true"`, prod `"false"`). When disabled every op returns `disabled` except `inbox/delete`, `slot/remove`, and `slot/leave`, so people can always leave and delete.

## Client cryptography (app only — the relay never sees any of this)

Primitives: HKDF-SHA256 (RFC 5869), X25519 (RFC 7748), Ed25519 (RFC 8032), ChaCha20-Poly1305 (RFC 8439). `HKDF(ikm, salt, info, L)`; empty salt means zero-length.

The MVP app implements these with the audited pure-JS `@noble/*` libraries so the exact same code runs in vitest and in Hermes; only the root seed lives in native code (`modules/buddies-keychain`). A future Notification Service Extension will use CryptoKit's identical primitives and must pass shared test vectors.

### Identity (from the root seed)

The root seed is 32 random bytes in a **synchronizable** iCloud Keychain item (`AfterFirstUnlock`), so the same identity appears on every device on the Apple Account.

| Derived                  | `info`                                    | Use                 |
| ------------------------ | ----------------------------------------- | ------------------- |
| Owner key (Ed25519 seed) | `ww-buddies/v1/owner-sign`                | Signs owner ops     |
| Identity DH key (X25519) | `ww-buddies/v1/identity-dh`               | Pairing             |
| `inboxId`                | `ww-buddies/v1/inbox-id` (first 16 bytes) | Relay address       |
| Roster key               | `ww-buddies/v1/roster-key`                | Encrypts the roster |

### Sealed blobs

`blob = b64u(0x01 ‖ nonce[12] ‖ ciphertext ‖ tag[16])`, ChaCha20-Poly1305 with a random nonce and a UTF-8 AAD string:

| Blob        | Key         | AAD                                                   |
| ----------- | ----------- | ----------------------------------------------------- |
| Invite card | invite key  | `ww-buddies/v1/invite-card\|{inviteId}`               |
| Claim       | invite key  | `ww-buddies/v1/invite-claim\|{inviteId}`              |
| Buddy Card  | content key | `ww-buddies/v1/card\|{inboxId}\|{slotId}`             |
| Event       | content key | `ww-buddies/v1/event\|{inboxId}\|{slotId}\|{eventId}` |
| Roster      | roster key  | `ww-buddies/v1/roster\|{inboxId}`                     |

### Invite link and secrets

- Secret `s`: 16 random bytes. Link: `https://ww-proxy.leviwilkerson.com/b#1{b64u(s)}` — the leading `1` is the link version. Nothing identifying is in the path.
- `inviteId = b64u(HKDF(s, "", "ww-buddies/v1/invite/id", 16))`
- `inviteKey = HKDF(s, "", "ww-buddies/v1/invite/key", 32)`
- `claimSecret = HKDF(s, "", "ww-buddies/v1/invite/claim", 32)`; `claimVerifier = b64u(SHA-256(claimSecret))`

Invite card and claim plaintext (JSON):

```json
{
  "v": 1,
  "name": "Levi",
  "dhPub": "<b64u>",
  "inboxId": "<22>",
  "offer": { "plans": "daysTimes" }
}
```

### Pair keys

```text
pairSecret = HKDF(X25519(myDh, theirDh), s, "ww-buddies/v1/pair|" + min(inboxA, inboxB) + "|" + max(inboxA, inboxB), 32)
```

For the direction _sender → recipient R_ (`R` = the recipient's `inboxId`):

| Derived                   | `info`                                             |
| ------------------------- | -------------------------------------------------- |
| `slotId`                  | `ww-buddies/v1/slot\|{R}` (first 16 bytes, `b64u`) |
| Writer key (Ed25519 seed) | `ww-buddies/v1/writer\|{R}`                        |
| Content key               | `ww-buddies/v1/content\|{R}`                       |

Both people can derive both directions; each registers the _incoming_ direction's `slotId` + writer public key in their own inbox.

### Pairing sequence

1. **A** creates `s`, uploads the invite card (`invite/create`), and shares the link.
2. **B** opens the link → `invite/fetch` → decrypts the card → pre-accept screen.
3. **B** accepts → derives `pairSecret` → `slot/add` for A→B in B's inbox → `invite/claim` with its own card.
4. **A** gets `invite.claimed` (push + sync) → decrypts the claim → **confirm** → `slot/add` for B→A in A's inbox → `event/put` `pair.confirmed` (push) into B's inbox → `card/put` → `invite/delete`.
   **Reject** → `invite/delete` only; B's pending request expires locally.
5. **B** receives `pair.confirmed` → marks A active → `card/put` into A's inbox.

### Ending

The remover purges locally, records the pairing as ended (`removedBuddies`, see [Multi-device roster](#multi-device-roster)), and queues the removal durably, then calls `slot/remove` (their inbox, the other person's slot) and `slot/leave` (the other person's inbox, their own slot). Both are idempotent, so a removal stays queued and is retried on every sync until both succeed. Delete-all wipes the inbox and the root seed only after every buddy has been left, because the seed is the only way to retry. The other side sees the slot vanish from `inbox/sync` and purges and records it too. No push.

### Multi-device roster

The roster is the User's own state, sealed with the roster key, so only their devices can write one. The relay can't forge a roster, but it keeps every blob it was given and can hand back an old one, or list a slot that was removed. The merge rules below make that harmless: nothing the relay returns can bring back a pairing the User ended.

Roster plaintext (JSON):

```json
{
  "v": 1,
  "version": 7,
  "buddies": [
    {
      "inboxId": "<22>",
      "name": "Anna",
      "nickname": "Annie",
      "avatar": { "t": "emoji", "v": "🙂" },
      "dhPub": "<b64u>",
      "inviteSecret": "<22>",
      "status": "active",
      "pairedAt": 0,
      "colorIndex": 0,
      "showOnCalendar": true
    }
  ],
  "outgoingInvites": [
    { "inviteId": "<22>", "secret": "<22>", "createdAt": 0, "expiresAt": 0 }
  ],
  "incomingClaims": [
    {
      "inviteId": "<22>",
      "secret": "<22>",
      "name": "Joe",
      "dhPub": "<b64u>",
      "inboxId": "<22>",
      "receivedAt": 0,
      "expiresAt": 0
    }
  ],
  "closedInviteIds": { "<inviteId>": 0 },
  "removedBuddies": { "<inboxId>": 0 },
  "sharing": { "photo": true, "tenure": true, "updatedAt": 0 }
}
```

- `buddies` (≤ 5) may also carry `tenure`, `color` (a hex this User picked), and `expiresAt` (only while `awaitingConfirm`). `avatar` is an emoji only; each device gets photos from Buddy Cards.
- `version` counts roster writes across the User's devices: each write is the newest version the device has read or written, plus one, and only a write the relay accepted counts. Rosters from builds before it have none.
- `closedInviteIds`: invites cancelled, rejected, or confirmed (`inviteId → expiresAt`), pruned once they expire. A rejected claim goes with its invite: the claim expires at the same moment.
- `removedBuddies`: ended pairings (`inboxId → removedAt`). A pairing with that buddy whose `pairedAt ≤ removedAt` is over. A removal the User makes records the time. When the relay shows the buddy left (their slot is gone, or a write returns `gone`) or an unconfirmed request lapses, the device records that pairing's own `pairedAt` instead, so a device that missed a newer pairing made on another device can't end it. Pairing again on purpose (accepting an invite, or confirming a claim) drops the local entry and starts the new pairing after any `removedAt` this device knows. Entries never expire. Past 200, the smallest `removedAt` is dropped first; only the User's own pairings add entries, so one is dropped only after 200 later removals. 200 entries take about 8 KB of the 32 KB roster cap.
- Readers drop fields they don't know rather than reject them, and the AAD has no version, so older builds still open and parse rosters that carry fields added since.

`roster/put` is last-writer-wins, so clients merge rather than replace. On every sync that returns a roster:

1. **Older rosters are ignored.** A roster whose `version` is below the newest this device has read or written is a replay or a stale write. The client ignores it and writes its own roster back. A device that wrote without having synced recovers its change on its next sync: it merges the newer roster and writes the union. A roster with no `version` comes from an older build and is merged, but local tombstones still win over it.
2. **Otherwise the client merges.** Buddies, invites, and claims union with local state, and so do `closedInviteIds` and `removedBuddies` (the later `removedAt` per buddy wins). Then:
   - a pairing that has ended is never added, whichever roster lists it; a local buddy whose pairing another device ended is dropped, and its slots are withdrawn as in [Ending](#ending);
   - closed or expired invites and claims are dropped;
   - a local `awaitingConfirm` buddy turns `active` only when the roster shows the same pairing (same `inviteSecret`) active;
   - a `removedBuddies` entry older than that buddy's current `pairedAt` is dropped;
   - the device keeps the higher `version`.
3. **Changes are written back.** If the merged result differs from the relay's copy, the client writes it back with a new `version`. This also heals a concurrent overwrite and restores tombstones an older build left out. When the merge adds a buddy, the client re-syncs from `since: 0` to pick up cards and events it had already synced past.

A removed buddy's slot is gone from the inbox too, so the next sync drops them on every device even without a tombstone. Only the roster can add a buddy without the User acting; the slots in `inbox/sync` only take buddies away, and a claim waits for the User to confirm it.

**Limits.** A device restoring from the root seed with no Buddies data yet has neither a version nor tombstones of its own, so it relies on the roster the relay serves it. A relay that serves such a device a roster from before a removal can bring that buddy back there. Builds without roster versions don't read tombstones, and removals made on them leave none.

The roster also carries the User's sharing choices (`sharing`: `{ photo, tenure, updatedAt }`), merged last-writer-wins on `updatedAt`, so every device publishes the same Buddy Card. A withheld photo or Tenure is left out of invites, claims, `pair.confirmed`, and cards; the next card clears the buddy's copy. Push templates are per device: a device that registers without a kind's template (Buddies notifications off there) gets no push for it.

If `inbox/sync` returns `not_found` (inactivity wipe), the client re-registers the inbox, re-adds every buddy's slot, and writes its roster. A local flag makes a failure part-way retry instead of looking like every buddy left.

### Buddy Card plaintext

```json
{
  "v": 1,
  "name": "Levi",
  "updatedAt": 0,
  "level": "daysTimes",
  "days": [{ "d": "2026-09-27", "p": [{ "s": 540, "m": 180 }] }]
}
```

`d` is the sender's local calendar day; `s` (start, minutes after midnight) is present only when the Plan has a start time; `m` is planned minutes. The window is today through +56 days. Day Plans and resolved Recurring Plan instances only — never Categories, notes (MVP), Time Entries, or goals.

### Event kinds (MVP)

| Kind             | Written by       | Plaintext                         | Push |
| ---------------- | ---------------- | --------------------------------- | ---- |
| `invite.claimed` | relay (on claim) | the claim blob                    | yes  |
| `pair.confirmed` | inviter          | `{ "v": 1, "name": "<inviter>" }` | yes  |

### Shared Plans and Follow-ups

A User can invite buddies to a one-time Plan or a Follow-up. Each is a **share**. Its `id` (22-char `b64u`) is `SHA-256("ww-buddies/v1/share|" + senderInboxId + "|" + key)[0..16]`, where `key` is `plan:<dayPlanId>` or `followUp:<visitId>`, so every device of the sender uses the same id. The client works declaratively: on each publish it compares the shares its data implies with what it last sent to each recipient (content hash per recipient). It then invites new recipients, updates changed shares, and cancels removed recipients and deleted shares. `rev` is the sender's clock at send time. Recipients ignore anything older than what they have, and a cancel wins a tie.

| Kind                                  | Written by | Plaintext                                                         | Push |
| ------------------------------------- | ---------- | ----------------------------------------------------------------- | ---- |
| `plan.invite` / `plan.update`         | sender     | `{ "v": 1, "id", "rev", "type": "plan", "expiresAt", "details" }` | yes  |
| `followup.invite` / `followup.update` | sender     | same, with `"type": "followUp"`                                   | yes  |
| `plan.cancel` / `followup.cancel`     | sender     | `{ "v": 1, "id", "rev" }`                                         | yes  |
| `share.reply`                         | recipient  | `{ "v": 1, "id", "rev", "status": "going" \| "declined" }`        | yes  |

`details`: `d` (sender's local day, `YYYY-MM-DD`), `s?` (start, minutes after midnight), `m?` (Plan minutes), `title?` (≤ 100), `location?` (`{ name?, address?, latitude?, longitude? }`), `note?` (≤ 2000, Plans only), `firstName?` (≤ 40) and `topic?` (≤ 80), Follow-ups only.

- **Follow-ups carry minimal householder data:** date and time, the Contact's first name, a one-line address and coordinate, and the topic. Never the surname, phone, email, notes, history, or Bible Study flag. In data protection mode the sender's picker is hidden, and the recipient sees only the date and time.
- **Multi-device senders:** what was sent is tracked per device. Another of the sender's devices without that record re-sends under the same `id`; recipients see identical details and add no queue entry, though the push may still arrive once.
- **Expiry:** a Plan share expires 24 h after the Plan ends; a Follow-up 24 h after its time. Both phones drop it then, locally and without needing the network: on launch, on foreground, and on every sync (the relay deletes events after 30 days).
- **Going:** answering "Going" to a Plan adds a linked Day Plan (`buddyShare: { from, shareId }`) that mirrors the sender's changes and is removed when they cancel or the User changes their answer. Deleting that Plan answers "declined". An answer is saved before it's sent and retried on every sync until the relay accepts it, so it holds offline. Accepted Follow-ups appear read-only on the schedule day.
- **Relay limits:** `push` is true for invites, cancels, and replies, but for an update only when `d`, `s`, `m`, or `location` changed; a new title or note arrives quietly, so edits don't spend the 10-per-day push budget. A client sends at most 30 share events per buddy per hour, leaving room under the 60-writes cap for Buddy Cards; anything over waits for a later publish. A `note` too long for the 8 KB event cap is shortened.
- **Ending:** when a buddy is removed, leaves, or the User deletes all Buddies data, the client takes that buddy off the User's Plans and Follow-ups (so pairing again never re-sends an old invitation), and Plans that followed their invitations become ordinary Plans.
- **Notification queue:** claims, confirmations, invites, changes, cancellations, replies, and requests to join are queued on the device (no user content — references only) behind the Home header bell. Entries are pruned after 30 days or when the share they point at is wiped, except that an invitation or claim still waiting on an answer is never aged out, evicted by the queue cap, or dismissible; a pending invitation whose entry was lost is put back. Push alerts carry the event's `seq`, which the client stores on the entry it creates.

### Requests to join

A User can ask a buddy to invite them to a Plan seen on that buddy's Buddy Card. The request carries only what the card already showed, and the owner answers through an ordinary Plan invitation (or not at all).

| Kind                 | Written by | Plaintext                                               | Push                       |
| -------------------- | ---------- | ------------------------------------------------------- | -------------------------- |
| `join.request.<tag>` | asker      | `{ "v": 1, "id", "rev", "d", "s"?, "m"?, "expiresAt" }` | first ask only (see below) |
| `join.cancel`        | asker      | `{ "v": 1, "id", "rev" }` (the asker withdrew it)       | no                         |

- **Id and rev:** `id` is `SHA-256("ww-buddies/v1/join|" + askerInboxId + "|" + ownerInboxId + "|" + d + "|" + (s ?? ""))[0..16]`, so asking again for the same Plan is the same request. `rev` is set when the User asks or withdraws (always increasing), not when it's sent. The owner ignores anything older than what it has, and a withdrawal wins a tie.
- **Per-buddy alerts without a relay change:** `<tag>` is the first 6 bytes, as lowercase hex, of `SHA-256("ww-buddies/v1/join-kind|" + slotId)`, where `slotId` is the slot the asker writes into the owner's inbox. Both people derive it, and the relay already knows which slot wrote an event, so the tag itself tells it nothing new. The owner's device registers the same localized template under each active buddy's kind, leaving out buddies muted on that device, or all of them when Ask to Join alerts are off there. The relay pushes only kinds a device registered (see `device/register`), so a muted buddy's request arrives silently and is listed already read. The set of templates a device registers does tell the relay which of its buddies that device muted. Five buddies add five templates to the nine fixed kinds, within the relay's 32.
- **Few alerts:** a request alerts the owner only on its first ask, and at most three requests per buddy alert in a rolling day; the rest go out with `push: false`, so they arrive in the tray without an alert. The alerting send is retried under the same `eventId` until the relay accepts it, and the relay never alerts twice for one `eventId`, so a request first sent offline still alerts exactly once. The asker keeps a withdrawn request until it lapses, and asking for that Plan again goes quietly. The owner keeps a withdrawn request too, so one asked again is listed already read. A User has at most three open requests per buddy.
- **No orphans:** the asker records that a request was handed to the relay before sending it, so withdrawing sends a `join.cancel` even when the send seemed to fail. Deliveries run one at a time, so asking, withdrawing, and syncing can't send duplicates. The asker withdraws a request automatically when the buddy's card no longer shows the Plan at that day and start (moved or dropped), and when it's still unsent inside the two-hour cutoff.
- **Answering:** the owner's tray lists the request with Invite and Not Now. Invite opens their one-time Plan at that time (or a new one seeded from the recurring instance there, which then replaces it for that day) with the asker added. Saving sends a normal `plan.invite`. There's no Invite when the owner's Plan follows someone else's invitation (only its organizer can invite), or when the owner has several one-time Plans that day and none is at the requested time: a new Plan beside them would count the time twice. A request is answered once the owner's shares include the asker on a Plan that day, and the asker's copy clears when a `plan.invite` from the owner for that day arrives. Not Now is local only and nothing is sent; the owner keeps the dismissed request until it lapses, so the same request stays quiet. The asker can't tell a request passed over from one not yet seen.
- **Expiry:** `expiresAt` is the Plan's start (noon when it has none). The owner clamps it to the start of that day and time in its own time zone plus a day, and drops a request for a day beyond the Buddy Card window. Both phones drop the request when it lapses, locally, without the network. Asking closes two hours before the start.
- **Delivery:** a request (or withdrawal) is saved before it's sent and retried on every sync, and it counts against the 30 share events per buddy per hour.
- **Per device:** requests are per device on the asker's side, and Not Now, mutes, and the Ask to Join alerts switch are per device on the owner's.
- **Ending:** removing a buddy drops requests both ways, and their mute.
