# Buddies relay protocol v1 (MVP)

The wire contract between the WitnessWork app (`src/features/buddies`) and the ww-proxy relay (`ww-api/src/buddies`). Design rationale lives in [`buddies-recommendations.md`](./buddies-recommendations.md); this file is the source of truth for bytes on the wire. Anything not specified here is an implementation detail of one side.

The relay is **blind**: it stores ciphertext, random ids, public keys, and push tokens. It never sees names, Plans, or which inboxes belong to which people.

## MVP scope

In: inbox registration, device/push registration, invite create → fetch → claim → confirm, Buddy Cards (Plans), removal from either side, delete-all, encrypted roster for multi-device restore, generic localized pushes, kill switch.

Deferred (must land before any production rollout): App Attest on `inbox/register` and `invite/*` (reserved `attest` field below), Notification Service Extension decryption, QR invites, safety codes, activity/awards.

Since the MVP: shared Plans and Follow-up invitations (event kinds below). They need no relay changes.

## Conventions

- **Transport:** `POST {BASE}/buddies/v1/{op}` with a JSON body. All ids travel in bodies — **never in URLs** (production persists request URLs in logs).
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

| HTTP | `error`         | Meaning                                                               |
| ---- | --------------- | --------------------------------------------------------------------- |
| 400  | `bad_request`   | Malformed envelope/payload, wrong sizes, bad ids                      |
| 401  | `bad_signature` | Signature missing or invalid                                          |
| 401  | `stale`         | `ts` outside ±5 min                                                   |
| 409  | `replay`        | Nonce reused                                                          |
| 404  | `not_found`     | Unknown inbox / invite (includes expired, deleted, or burned invites) |
| 409  | `conflict`      | Inbox already registered with a different key; invite already claimed |
| 410  | `gone`          | Slot does not exist (buddy removed you)                               |
| 429  | `limit`         | A count cap was hit (slots, invites, devices)                         |
| 429  | `rate_limited`  | A rate limit was hit                                                  |
| 503  | `disabled`      | Kill switch is off                                                    |

## Operations

Payload fields listed are **in addition** to `ts` and `nonce` for signed ops.

### Inbox (owner)

| Op                  | Payload                                                                                                  | Response      | Notes                                                                                                                                                                 |
| ------------------- | -------------------------------------------------------------------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `inbox/register`    | `inboxId`, `ownerPub`, `attest?`                                                                         | `{ ok }`      | Idempotent for the same `ownerPub`; `conflict` if different. `attest` is reserved (ignored in MVP).                                                                   |
| `inbox/sync`        | `inboxId`, `since` (int ≥ 0)                                                                             | see below     | Touches `lastActiveAt`.                                                                                                                                               |
| `inbox/delete`      | `inboxId`                                                                                                | `{ ok }`      | Wipes the inbox (slots, cards, events, devices, roster) and every open invite it created. Allowed even when disabled.                                                 |
| `device/register`   | `inboxId`, `deviceId`, `apnsToken` (hex), `apnsEnvironment` (`"sandbox"` \| `"production"`), `templates` | `{ ok }`      | Upsert by `deviceId`. Max 10 devices per inbox (oldest evicted). `templates` is `{ [kind]: { title, body } }`, strings ≤ 200 chars — already localized by the device. |
| `device/unregister` | `inboxId`, `deviceId`                                                                                    | `{ ok }`      | Idempotent.                                                                                                                                                           |
| `slot/add`          | `inboxId`, `slotId`, `writerPub`                                                                         | `{ ok }`      | Registers a buddy's writer key. Idempotent for the same key. `limit` when `slots + open invites ≥ 5`.                                                                 |
| `slot/remove`       | `inboxId`, `slotId`                                                                                      | `{ ok }`      | Deletes the slot, its card, and its events. Idempotent. Allowed even when disabled.                                                                                   |
| `roster/put`        | `inboxId`, `blob` (≤ 32 KB decoded)                                                                      | `{ ok, seq }` | Replaces the encrypted roster.                                                                                                                                        |

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

### Buddy writes (writer)

| Op           | Payload                                                                                                          | Response      | Notes                                                                                                                                                                                                                                 |
| ------------ | ---------------------------------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `card/put`   | `inboxId`, `slotId`, `blob` (≤ 16 KB decoded)                                                                    | `{ ok, seq }` | Replaces that slot's card. `gone` if the slot doesn't exist.                                                                                                                                                                          |
| `event/put`  | `inboxId`, `slotId`, `eventId`, `kind` (≤ 40 chars, `^[a-z][a-z0-9.]*$`), `blob` (≤ 8 KB decoded), `push` (bool) | `{ ok, seq }` | Deduplicated on `eventId` (a repeat returns the original `seq` and sends no push). When `push` is true, sends an alert to every device in the inbox using that device's `templates[kind]` (skipped for devices without the template). |
| `slot/leave` | `inboxId`, `slotId`                                                                                              | `{ ok }`      | The writer removes its own slot (and card/events) from the recipient's inbox — used when ending a connection. Idempotent. Allowed even when disabled.                                                                                 |

### Invites

| Op              | Signed | Payload                                                                                                    | Response                          | Notes                                                                                                                                                                                                                                                                                                                       |
| --------------- | ------ | ---------------------------------------------------------------------------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `invite/create` | Owner  | `inboxId`, `inviteId`, `claimVerifier` (`b64u` SHA-256, 32 bytes), `blob` (≤ 4 KB), `expiresAt`, `attest?` | `{ ok }`                          | `expiresAt ≤ now + 7 days + 5 min`. `limit` when the inbox has 3 open invites or `slots + open invites ≥ 5`. `conflict` if the `inviteId` exists.                                                                                                                                                                           |
| `invite/delete` | Owner  | `inboxId`, `inviteId`                                                                                      | `{ ok }`                          | Only the creating inbox may delete. Idempotent. Used for cancel, confirm, and reject.                                                                                                                                                                                                                                       |
| `invite/fetch`  | —      | `inviteId`                                                                                                 | `{ ok, blob, expiresAt, status }` | `status` is `"open"` or `"claimed"`. Expired/deleted/burned → `not_found`.                                                                                                                                                                                                                                                  |
| `invite/claim`  | —      | `inviteId`, `claimSecret` (`b64u`, 32 bytes), `blob` (≤ 4 KB)                                              | `{ ok }`                          | Constant-time compare `SHA-256(claimSecret)` to `claimVerifier`. First valid claim wins (`conflict` afterwards). 5 wrong secrets burn the invite. On success the relay appends an event `{ slotId: "", kind: "invite.claimed", eventId: inviteId, blob }` to the creator's inbox and pushes with template `invite.claimed`. |

The relay keeps `inviteId → creator inboxId` only until the invite is deleted or expires.

## Limits and retention

| Item                                       | Limit                                                                  |
| ------------------------------------------ | ---------------------------------------------------------------------- |
| Slots + open invites per inbox             | 5                                                                      |
| Open invites per inbox                     | 3                                                                      |
| Invite creations per inbox                 | 5 per 24 h                                                             |
| Writes per slot (`card/put` + `event/put`) | 60 per hour                                                            |
| Pushes per slot                            | 10 per 24 h, at least 60 s apart (extra events are stored, not pushed) |
| Devices per inbox                          | 10                                                                     |
| Events                                     | Deleted 30 days after creation                                         |
| Invites                                    | Deleted at `expiresAt` (plus a short grace)                            |
| Inbox                                      | Wiped after 180 days without an owner op                               |

Unsigned ops are rate-limited by client IP.

## Push delivery

- APNs HTTP/2 with token auth (ES256 JWT, `kid = APNS_KEY_ID`, `iss = APPLE_TEAM_ID`), host chosen by the device's `apnsEnvironment`, `apns-topic` = the worker's `IOS_BUNDLE_ID`, `apns-push-type: alert`.
- Body: `{ "aps": { "alert": { "title", "body" }, "sound": "default", "thread-id": "buddies" }, "ww": { "kind": "<kind>" } }`. No user content — the device supplied the localized strings.
- Delete a device whose token returns HTTP 410 or `BadDeviceToken`.

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

The remover purges locally and queues the removal durably, then calls `slot/remove` (their inbox, the other person's slot) and `slot/leave` (the other person's inbox, their own slot). Both are idempotent, so a removal stays queued and is retried on every sync until both succeed. Delete-all wipes the inbox and the root seed only after every buddy has been left, because the seed is the only way to retry. The other side sees the slot vanish from `inbox/sync` and purges too. No push.

### Multi-device roster

`roster/put` is last-writer-wins, so clients merge rather than replace. On every sync that returns a roster, the client unions buddies, invites, and claims with its local state. A removed buddy's slot is gone from the inbox, so the same sync drops them again. Cancelled, rejected, and confirmed invites carry tombstones (`closedInviteIds`: `inviteId → expiresAt`), pruned once they expire. If the merged result differs from the relay's copy, the client writes it back, which also heals a concurrent overwrite. When the merge adds a buddy, the client re-syncs from `since: 0` to pick up cards and events it had already synced past.

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
- **Notification queue:** claims, confirmations, invites, changes, cancellations, and replies are queued on the device (no user content — references only) behind the Home header bell. Entries are pruned after 30 days or when the share they point at is wiped.
