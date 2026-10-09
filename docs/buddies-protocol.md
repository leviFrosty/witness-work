# Buddies relay protocol v1 (MVP)

The wire contract between the WitnessWork app (`src/features/buddies`) and the ww-proxy relay (`ww-api/src/buddies`). Design rationale lives in [`buddies-recommendations.md`](./buddies-recommendations.md); this file is the source of truth for bytes on the wire. Anything not specified here is an implementation detail of one side.

The relay is **blind**: it stores ciphertext, random ids, public keys, and push tokens. It never sees names, Plans, or which inboxes belong to which people.

## MVP scope

In: inbox registration, device/push registration, invite create → fetch → claim → confirm, Buddy Cards (Plans), removal from either side, delete-all, encrypted roster for multi-device restore, generic localized pushes, kill switch.

Deferred (must land before any production rollout): App Attest on `inbox/register` and `invite/*` (reserved `attest` field below; Android will use Play Integrity, as Notes Import does in ADR 0017), QR invites, safety codes, activity sharing.

Since the MVP: shared Plans and Follow-up invitations, requests to join, and badges with reactions to them (Encourage; event kinds below), which need no relay changes; [named alerts](#named-alerts), whose pushes carry the event they're about; Android (FCM pushes, a `pushService` on `device/register`, and a Block Store root seed), with every pairing of iOS and Android devices.

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

Success: HTTP 200 with `{ "ok": true, ... }`. Failure: `{ "ok": false, "error": "<code>", "code": "<code>" }` (`code` repeats `error`; older relays sent `error` alone) with:

| HTTP | `error`            | Meaning                                                               |
| ---- | ------------------ | --------------------------------------------------------------------- |
| 400  | `bad_request`      | Malformed envelope/payload, wrong sizes, bad ids                      |
| 401  | `bad_signature`    | Signature missing or invalid                                          |
| 401  | `stale`            | `ts` outside ±5 min; carries `serverTime` (ms) and a `Date` header    |
| 409  | `replay`           | Nonce reused                                                          |
| 404  | `not_found`        | Unknown inbox / invite (includes expired, deleted, or burned invites) |
| 409  | `conflict`         | Inbox already registered with a different key; invite already claimed |
| 410  | `gone`             | Slot does not exist (buddy removed you)                               |
| 429  | `limit`            | A count cap was hit (slots, invites, devices)                         |
| 429  | `rate_limited`     | A rate limit or a stored-event cap was hit; carries `Retry-After`     |
| 503  | `disabled`         | Kill switch is off; carries `Retry-After`                             |
| 426  | `upgrade_required` | `inbox/live` requested without a WebSocket upgrade                    |

- Every `rate_limited` and `disabled` refusal sends `Retry-After` (seconds) and repeats it as `retryAfter` in the body: the time until the limit's window frees a request (a minute for the per-caller limits, the rest of the hour for writes per slot, until the oldest stored event expires for the stored-event caps), or 60 s for the kill switch. `limit` has none: only the User freeing a spot helps.
- A `stale` refusal carries the relay's clock as `serverTime` (epoch ms, the unit of `ts`) and in the `Date` header. A client corrects its clock offset from it and re-signs once with a fresh `ts` and `nonce`. `GET /health` also returns `Date` and `serverTime`, uncached, for calibrating before a request.

### Client behaviour

How the app calls the relay (`src/features/buddies/lib/relay.ts`, through the shared `request()` client):

- **Timeouts.** Every call gives up after 15 s, 30 s for an `inbox/sync` from `since: 0`, and 8 s in the background push task. A timeout reads as offline in the UI. Callers can cancel a call with an abort signal; the background task and push registration do.
- **No automatic resend.** A signed envelope's nonce is accepted once, so a retry is a new request with a new signature. The one exception: a `stale` answer (the device clock is more than 5 minutes off) signs the call again, once, on the relay's clock: from the answer's `serverTime` when it has one (later calls keep that correction), else after recalibrating the app's clock from `/health`'s `Date` header.
- **Back-off.** `Retry-After` on a `429 rate_limited` (60 s when absent) or `503` holds back the app's automatic syncs (returning to the app, the live signal, polls) until it passes. `disabled` holds them back for at least 15 minutes and stops the live socket; the User's own pull-to-refresh or Try Again still goes through.
- **Stable event ids.** `share.reply`, Plan and Follow-up invitations, updates and cancels, `pair.confirmed`, and badge events use an `eventId` derived from what they say (sender, recipient, share, kind, `rev`), so a resend after a lost answer is the same event, which `event/put` stores and alerts once.
- **Lost claim answers.** When `invite/claim` gets no answer, the app claims again with the same blob, then reads the invite: `claimed` means the claim landed. Relays that answer a repeated identical claim with `ok`, and ones that answer `conflict`, both work.
- **Polling** happens only while the live socket hasn't been heard from for 35 s, about once a minute (15 s while a Buddies code is on screen), doubling after each failure.

## Operations

Payload fields listed are **in addition** to `ts` and `nonce` for signed ops.

### Inbox (owner)

| Op                  | Payload                                                                                                                                                                                                            | Response                                   | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `inbox/register`    | `inboxId`, `ownerPub`, `attest?`                                                                                                                                                                                   | `{ ok }`                                   | Idempotent for the same `ownerPub`; `conflict` if different, even after the inbox was wiped. `attest` is reserved (ignored in MVP).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `inbox/sync`        | `inboxId`, `since` (int ≥ 0)                                                                                                                                                                                       | see below                                  | Touches `lastActiveAt`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `inbox/delete`      | `inboxId`                                                                                                                                                                                                          | `{ ok }`                                   | Wipes the inbox (slots, cards, events, devices, roster) and every open invite it created, keeping only a hash of the owner key. Allowed even when disabled.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `device/register`   | `inboxId`, `deviceId`, `pushService?` (`"apns"` \| `"fcm"`), then for APNs `apnsToken` (hex), `apnsEnvironment` (`"sandbox"` \| `"production"`), `apnsTopic?`, or for FCM `fcmToken` and `appAlerts?`; `templates` | `"production"`), `apnsTopic?`, `templates` | Upsert by `deviceId`. Max 10 devices per inbox (least recently registered evicted). `pushService` says how the relay reaches the device: APNs (iOS; also when absent, as builds before Android send none) or FCM (Android); the other service's fields are ignored. `fcmToken` is the device's Firebase Cloud Messaging registration token (32–4096 characters of `[A-Za-z0-9_:-]`). `appAlerts: true` (FCM, a boolean when present) says the app posts its own named alerts; see [FCM](#fcm-android). `templates` is `{ [kind]: { title, body } }`, strings ≤ 200 chars — already localized by the device. `apnsTopic` is the app's bundle id (e.g. `com.leviwilkerson.jwtimebeta` for Beta); it must be one the worker accepts (`IOS_BUNDLE_ID` or `IOS_ADDITIONAL_BUNDLE_IDS`), else `bad_request`. Absent means `IOS_BUNDLE_ID`. One device per token: registering a token another `deviceId` holds moves it. Re-registering an unchanged device is an idempotent refresh that bumps its eviction order (and re-creates it if the relay removed it); apps re-register about daily. | Upsert by `deviceId`. Max 10 devices per inbox (least recently registered evicted). `templates` is `{ [kind]: { title, body } }`, strings ≤ 200 chars — already localized by the device. `apnsTopic` is the app's bundle id (e.g. `com.leviwilkerson.jwtimebeta` for Beta); it must be one the worker accepts (`IOS_BUNDLE_ID` or `IOS_ADDITIONAL_BUNDLE_IDS`), else `bad_request`. Absent means `IOS_BUNDLE_ID`. Re-registering an unchanged device is an idempotent refresh that bumps its eviction order (and re-creates it if the relay removed it); apps re-register about daily. |
| `device/unregister` | `inboxId`, `deviceId`                                                                                                                                                                                              | `{ ok }`                                   | Idempotent.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `slot/add`          | `inboxId`, `slotId`, `writerPub`                                                                                                                                                                                   | `{ ok }`                                   | Registers a buddy's writer key. Idempotent for the same key. `limit` when `slots + open invites ≥ 5`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `slot/remove`       | `inboxId`, `slotId`                                                                                                                                                                                                | `{ ok }`                                   | Deletes the slot, its card, and its events. Idempotent. Allowed even when disabled.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `roster/put`        | `inboxId`, `blob` (≤ 32 KB decoded)                                                                                                                                                                                | `{ ok, seq }`                              | Replaces the encrypted roster.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

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
- **Refusals (before upgrading):** kill switch off → `503 disabled`; too many requests from this caller → `429 rate_limited` (with `Retry-After`); not a WebSocket upgrade → `426 upgrade_required`; then the usual `bad_request`, `bad_signature`, `stale`, `replay`, `not_found`. A refused upgrade is retried with the usual reconnect backoff.
- **Messages (server → app):** `{ "type": "hello", "seq": N }` right after the upgrade, where `N` is the inbox's current `seq` (what a full `inbox/sync` returns); then `{ "type": "changed", "seq": N }` after every committed write that changes what `inbox/sync` returns: `event/put` (new events only), `card/put`, `roster/put`, a delivered claim, and `slot/add`, `slot/remove`, `slot/leave` that changed a slot. No content, ever. Slot changes don't advance `seq`, so the app syncs on every `changed` and on a `hello` past its cursor.
- **Keepalive:** the app sends `ping` about every 25 s; the relay answers `pong` without waking the inbox's Durable Object. No `pong` within 10 s means the connection is dead and the app reconnects. Anything else the app sends is ignored.
- **Closes:** `4001 "gone"` when the inbox is deleted or wiped for inactivity (the app syncs, which restores it); `4002 "replaced"` when an 11th socket opens, closing the oldest. The app reconnects with backoff (1 s → 60 s, jittered) while in the foreground and closes the socket when backgrounded.
- An open socket is not owner activity for the 180-day wipe. Turning the kill switch off refuses new sockets but doesn't close open ones.

### Buddy writes (writer)

| Op           | Payload                                                                                                          | Response      | Notes                                                                                                                                                                                                                                                                                                       |
| ------------ | ---------------------------------------------------------------------------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `card/put`   | `inboxId`, `slotId`, `blob` (≤ 16 KB decoded)                                                                    | `{ ok, seq }` | Replaces that slot's card. `gone` if the slot doesn't exist.                                                                                                                                                                                                                                                |
| `event/put`  | `inboxId`, `slotId`, `eventId`, `kind` (≤ 40 chars, `^[a-z][a-z0-9.]*$`), `blob` (≤ 8 KB decoded), `push` (bool) | `{ ok, seq }` | Deduplicated on `eventId` (a repeat returns the original `seq` and never pushes; the original's alert, if any, was the only one). When `push` is true, alerts every device in the inbox using that device's `templates[kind]` (skipped for devices without the template), subject to the push budget below. |
| `slot/leave` | `inboxId`, `slotId`                                                                                              | `{ ok }`      | The writer removes its own slot (and card/events) from the recipient's inbox — used when ending a connection. Idempotent. Allowed even when disabled.                                                                                                                                                       |

### Shared photos

Photos in a shared Plan's note travel as encrypted blobs the sender stores once under their own inbox (see [Shared note photos](#shared-note-photos)). `b64u` ids and tokens here are 32 bytes (43 characters).

| Op            | Signed | Payload                                                                                                                                                                                                              | Response            | Notes                                                                                                                                                                                                                                                                   |
| ------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `blob/put`    | Owner  | Headers `x-buddies-p` / `x-buddies-s` (the envelope) over `inboxId`, `blobId` (`b64u(SHA-256(body))`), `bytes`, `expiresAt`, `readTokenHash`; the body is the raw sealed bytes (`application/octet-stream`, ≤ 1 MiB) | `{ ok, expiresAt }` | The relay recomputes `blobId` from the body. `expiresAt` within 90 days. Putting a stored `blobId` again keeps its first `readTokenHash` and extends `expiresAt` to the later of the two. `too_large` (413) over 1 MiB; `no_buddies` (403) from an inbox with no slots. |
| `blob/get`    | —      | `{ "p": b64u(JSON { inboxId, blobId, token }) }`                                                                                                                                                                     | The raw bytes       | `token` is the 32-byte read token; the relay compares `SHA-256(token)` with `readTokenHash`. Unknown, expired, and wrong-token reads are all the same `not_found`.                                                                                                      |
| `blob/delete` | Owner  | `inboxId`, `blobIds` (1–50)                                                                                                                                                                                          | `{ ok }`            | Idempotent.                                                                                                                                                                                                                                                             |

All three answer `photos_disabled` (503) while the relay's photo switch is off. `inbox/sync` responses carry `capabilities: { photos }`; a client uploads only while it's true. The relay also sweeps each inbox's objects weekly for leftovers, and its bucket deletes any object 91 days after its last write (ww-api `scripts/r2-lifecycle.mjs`).

### Invites

| Op              | Signed | Payload                                                                                                    | Response                          | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------- | ------ | ---------------------------------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `invite/create` | Owner  | `inboxId`, `inviteId`, `claimVerifier` (`b64u` SHA-256, 32 bytes), `blob` (≤ 4 KB), `expiresAt`, `attest?` | `{ ok }`                          | `expiresAt ≤ now + 7 days + 5 min`. `limit` when the inbox has 3 open invites or `slots + open invites ≥ 5`. `conflict` if the `inviteId` exists.                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `invite/delete` | Owner  | `inboxId`, `inviteId`                                                                                      | `{ ok }`                          | Only the creating inbox may delete. Idempotent. Used for cancel, confirm, and reject.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `invite/fetch`  | —      | `inviteId`                                                                                                 | `{ ok, blob, expiresAt, status }` | `status` is `"open"` or `"claimed"`. Expired/deleted/burned → `not_found`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `invite/claim`  | —      | `inviteId`, `claimSecret` (`b64u`, 32 bytes), `blob` (≤ 4 KB)                                              | `{ ok }`                          | Constant-time compare `SHA-256(claimSecret)` to `claimVerifier`. First valid claim wins (`conflict` afterwards), except that the winner's exact retry (same `claimSecret` and byte-identical `blob`, e.g. after a lost response) gets `{ ok }` again without a second event or push. A retry while the first claim is still being delivered, or a newly sealed blob, still gets `conflict`. 5 wrong secrets burn the invite. On success the relay appends an event `{ slotId: "", kind: "invite.claimed", eventId: inviteId, blob }` to the creator's inbox and pushes with template `invite.claimed`. |

The relay keeps `inviteId → creator inboxId` only until the invite is deleted or expires.

## Limits and retention

Stored-event caps count a slot's events (by number and by base64url bytes) until they expire. An `event/put` past a cap fails with `rate_limited` and stores nothing; stored events are never dropped to make room, and room comes back as they expire. Cards and the roster are replaced in place, so only their blob sizes cap them.

Every op is also rate-limited per caller (the client IP, IPv6 by /64), never per target inbox. Unsigned invite ops, `inbox/register` (also capped per caller per day), reads (`inbox/sync` and `inbox/live`), and every other signed op each have their own budget, sized far above real use. A refused request gets 429 `rate_limited`, usually with `Retry-After` in seconds. Clients treat it like any transient failure and retry later, never in a tight loop.

| Item                                       | Limit                                                                                  |
| ------------------------------------------ | -------------------------------------------------------------------------------------- |
| Slots + open invites per inbox             | 5                                                                                      |
| Open invites per inbox                     | 3                                                                                      |
| Invite creations per inbox                 | 20 per 24 h                                                                            |
| Writes per slot (`card/put` + `event/put`) | 60 per hour                                                                            |
| Stored events per slot                     | 10,000 events and 16 MiB until they expire (see above)                                 |
| Stored events per inbox                    | 128 MiB across all slots (see above)                                                   |
| Pushes per slot                            | 10 per 24 h; non-immediate kinds at least 60 s apart (see [Push budget](#push-budget)) |
| Devices per inbox                          | 10                                                                                     |
| Shared photos per inbox                    | 300 live, 150 MiB live, 100 uploads per 24 h; 1 MiB each                               |
| Shared photos                              | Deleted at `expiresAt` (≤ 90 days out), by `blob/delete`, and with the inbox           |
| Events                                     | Deleted 30 days after creation                                                         |
| Invites                                    | Deleted at `expiresAt` (plus a short grace)                                            |
| Inbox                                      | Wiped after 180 days without an owner op                                               |
| Owner key hash of a wiped inbox            | Kept, with no expiry (see below)                                                       |

Unsigned ops are rate-limited by client IP.

A wipe (180 days without an owner op, or `inbox/delete`) keeps one value: `b64u(SHA-256(UTF-8("ww-buddies/v1/inbox-owner\n" + ownerPub)))`, with `ownerPub` the owner's canonical `b64u` key. It is pseudonymous (linking it to anyone takes their public key), it is all that's kept, and it never expires, since an expiry would let another key take the `inboxId` over. Only that key can register the `inboxId` again; every other op treats the inbox as unknown, as before. The app derives `inboxId` and `ownerPub` from the same root seed, so an owner who comes back (after the inactivity wipe, or on another device) registers with the same key. Delete-all also deletes the seed, so later use of Buddies starts a new inbox; the old one keeps only the hash.

## Push delivery

Each device gets its alerts through the service it registered: APNs for iOS, Firebase Cloud Messaging for Android. The relay has only the generic, localized template each device registered for the kind, because it must never see a name. So every push also carries the event it's about, still sealed, and the app words a named alert from it: "Anna invited you to a Plan", with the day and time ([Named alerts](#named-alerts)). Both services carry the same `ww` marker, and both wake the app to sync before the User opens it.

- **The `ww` marker:** `{ "kind": "<kind>", "seq": <int>, "eventId"?: "<22>", "blob"?: "<sealed blob>" }`. `seq` is the inbox `seq` of the event the alert is about. `eventId` and `blob` are that event's, exactly as `inbox/sync` returns them, and ride along only while the whole push stays within the service's limit: the APNs payload's JSON within 4,096 bytes, the FCM data's keys and values within 4,000. An event too big for it (a Plan invitation with a long note, say) goes without them, and the app fetches it by `seq`. The slot isn't sent: the app finds the sender by whose key opens the blob, so the push names no sender, not even pseudonymously. Ids and ciphertext only; no user content, names, or tokens. Apps from before named alerts read `kind` (and `seq`) and ignore the rest.
- **Best effort, not durable (as built):** the Worker sends the alert after the write commits (`waitUntil`), retrying once after 1 s on a network error, 429, 5xx, or a rejected provider token. Nothing is stored for later, so an alert that fails both tries is lost; the event itself is stored and synced either way. A durable per-device outbox with longer retries is a possible follow-up.

### APNs (iOS)

- APNs HTTP/2 with token auth (ES256 JWT, `kid = APNS_KEY_ID`, `iss = APPLE_TEAM_ID`), host chosen by the device's `apnsEnvironment`, `apns-topic` = the device's registered `apnsTopic` (`IOS_BUNDLE_ID` for devices registered without one), `apns-push-type: alert`, `apns-collapse-id` stable across both attempts of the same alert.
- Body: `{ "aps": { "alert": { "title", "body" }, "sound": "default", "thread-id": "buddies", "content-available": 1, "mutable-content": 1 }, "ww": { … } }`. The alert is the device's template. `mutable-content` lets the app's Notification Service Extension replace it with the named alert; an app without one shows the template. Buddies' badge news (`badge.new`, `badge.reaction`) is passive: `"interruption-level": "passive"` and no `sound`, so it lands in Notification Center without lighting the screen (ADR 0021). `content-available` lets iOS wake the app (remote-notification background mode) to sync what the alert announced before the User opens it; best effort, at iOS's discretion.
- Delete a device whose token returns HTTP 410 or `BadDeviceToken`; it is not retried.

### FCM (Android)

- FCM HTTP v1 (`POST https://fcm.googleapis.com/v1/projects/{project}/messages:send`), authorized by an OAuth token the Worker mints for a service account that may only send messages (`FCM_SERVICE_ACCOUNT_JSON`; its `project_id` is the Firebase project).
- A **data-only** message, so the app's background push task runs for every one, open or not, and syncs as `content-available` does on iOS. High priority lets it through Doze; FCM holds it for 24 h for a device that is off. Its `data` depends on the device's registration:
  - **`appAlerts`** (builds with named alerts): `{ "message": { "token", "data": { "fallbackTitle", "fallbackBody", "body": "{\"ww\":{…}}" }, "android": { "priority": "HIGH", "ttl": "86400s" } } }`. It has no `title` or `message`, so expo-notifications shows nothing itself: the app posts the named alert in its `buddies` channel (badge news in the low-importance `buddies_news` channel: no sound or heads-up), or the template (`fallbackTitle`, `fallbackBody`) when it can't open the event. In the foreground the app's received listener posts it.
  - **Otherwise** (builds before named alerts): `"data": { "title", "message", "body", "channelId": "buddies" }`, which expo-notifications shows in the app's `buddies` channel. So the relay can ship ahead of the app.
  - Either way expo-notifications hands the JSON in `body` (the `ww` marker) to the app. No user content, names, ids, or tokens.
- Delete a device FCM reports as `UNREGISTERED`, `SENDER_ID_MISMATCH`, or whose token it rejects as invalid (`INVALID_ARGUMENT` with a `message.token` field violation). Network errors, 429, and 5xx get the one retry above; after a rejected access token the Worker mints a new one and resends once.
- Needs Google Play services on the device. Without it the device gets no token and no alerts, and Buddies still syncs on launch, on foreground, and over the live signal.

### Named alerts

The device words each alert from its event, with keys that never leave it. The app does this in `src/features/buddies/lib/pushAlerts.ts` (Android, in its push task); on iOS the Notification Service Extension (`targets/notification-service`) mirrors it in Swift.

1. **The event:** from `ww.eventId` and `ww.blob`, or, without them, an owner-signed `inbox/sync` with `since: seq − 1`, keeping the event with that `seq`. It only reads; the app's own sync applies the event as usual.
2. **The sender:** an `invite.claimed` opens with the key of the open invite whose id is the `eventId` (AAD `ww-buddies/v1/invite-claim|{inviteId}`). Anything else opens with the incoming content key of the buddy it authenticates for (AAD `ww-buddies/v1/event|{inboxId}|{slotId}|{eventId}`), trying each buddy (active or awaiting confirmation) in turn; a fetched event names its slot, so only that buddy is tried.
3. **The words:** who, by the name this device shows (the User's nickname for them, else their own name), and what:

| Kind                              | Alert (en-US title / body)                                                                           |
| --------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `invite.claimed`                  | "Joe accepted your invite" / "Open Buddies to confirm your new buddy."                               |
| `pair.confirmed`                  | "You and Anna are buddies now" / "You can now see each other's planned service days."                |
| `plan.invite` / `followup.invite` | "Anna invited you to a Plan" / "Sat, Oct 10 · 10:00 AM"                                              |
| `plan.update` / `followup.update` | "Anna changed a Follow-up" / the new day and start                                                   |
| `plan.cancel` / `followup.cancel` | "Anna canceled a Plan" / the day and start this device had for it, if any                            |
| `share.reply`                     | "Joe is going" or "Joe can't make it" / "Your Plan · Sun, Oct 11 · 9:00 AM"                          |
| `join.request.<tag>`              | "Anna would like to join you" / "Your Plan · Sun, Oct 11 · 9:00 AM"                                  |
| `badge.new`                       | "Levi earned a badge" / "Year Round, Silver"; several: "Levi earned new badges", highest level first |
| `badge.reaction`                  | "Anna reacted 🔥 to your badge" / "Year Round, Gold"                                                 |

- **Never householder data or free text.** A Follow-up's alert has only its day and start, never `firstName`, `location`, or `topic`, in or out of Data Protection Mode. A Plan's has none of its `title`, `location`, or `note`. Days and starts are the sender's, as written, in the app's language, date order, and clock.
- **Mutes:** a `join.request.*` from a buddy muted on this device (or with Ask to Join alerts off), and a `badge.*` with Badge Alerts or badges off, are quiet: Android posts nothing. The relay only pushes kinds a device registered, so this matters only while a changed registration is on its way. iOS can't drop an alert without Apple's filtering entitlement, so there it keeps the template. `join.cancel` never alerts.
- **Fallback:** when the event can't be found, fetched, or opened, doesn't parse, or is a kind this build doesn't word, the alert keeps the template text unchanged. So does an iOS device not unlocked since it restarted (the keys are readable after the first unlock), and an app from before named alerts.
- **Keys on iOS:** the app writes the alert context to a Keychain item in an access group only it and its extension have (`<team id>.<bundle id>.buddies-alerts`), readable after the first unlock, this device only, never synchronized. It holds each buddy's incoming slot, content key, and name on this device; open invites' keys; the day and start of shared Plans and Follow-ups, both ways; the owner key, to fetch an event; and the app's language and date conventions. No root seed and no writer key: nothing in it can write to a buddy's inbox. The extension counts how its alerts turned out (named, quiet, or which fallback) in the App Group, and the app reports the counts (`buddies_alerts_shown`, [analytics](analytics.md)).
- **Vectors:** [`alertVectors.json`](../src/features/buddies/lib/testing/alertVectors.json) holds sealed events of every kind, with the outcome and English alert expected for each. Vitest checks the TypeScript against it, and `pnpm test:buddies-alerts-native` checks the extension's Swift against it and `cryptoVectors.json`.

### Push budget

Per slot (sender) in the recipient's inbox:

- At most 10 alerts per 24 h, at least 60 s apart.
- **Immediate kinds** skip the spacing and alert at once, because someone is waiting on them: `pair.confirmed`, `share.reply`, `plan.invite`, `followup.invite`, and `join.request.*`. They still count toward and are limited by the daily cap, and they count as the slot's latest alert for the spacing of other kinds.
- An alert that arrives inside the 60 s spacing is **dropped**, not deferred: the event is stored and synced, but nothing alerts for it later. Clients that want an alert to land (like `badge.new` and `badge.reaction`) keep their own alerts rare.
- Over the daily cap the alert is suppressed the same way (the event is still stored and synced). Cancellations get no extra allowance.
- Relay events (`invite.claimed`) don't count against any slot.

## Kill switch

Buddies is enabled when KV `buddies:enabled` is `"true"`; if the key is absent, the `BUDDIES_ENABLED` env var decides (dev `"true"`, prod `"false"`). When disabled every op returns `disabled` except `inbox/delete`, `slot/remove`, and `slot/leave`, so people can always leave and delete.

## Client cryptography (app only — the relay never sees any of this)

Primitives: HKDF-SHA256 (RFC 5869), X25519 (RFC 7748), Ed25519 (RFC 8032), ChaCha20-Poly1305 (RFC 8439). `HKDF(ikm, salt, info, L)`; empty salt means zero-length.

The MVP app implements these with the audited pure-JS `@noble/*` libraries so the exact same code runs in vitest and in Hermes on iOS and Android; only the root seed lives in native code (`modules/buddies-keychain`). [`cryptoVectors.json`](../src/features/buddies/lib/testing/cryptoVectors.json) holds known-answer vectors for every byte the wire depends on (base64url, UTF-8, the RFC test vectors of each primitive, the key schedule, a signed envelope, and a sealed blob). Vitest checks them under Node, `__WW_DEV__.checkBuddiesCryptoVectors()` checks them in Hermes on each platform, and ww-api's relay verifies the signed envelope with WebCrypto. The iOS Notification Service Extension uses CryptoKit's identical primitives (ChaCha20-Poly1305 and Ed25519) and passes the same file (`pnpm test:buddies-alerts-native`).

### Identity (from the root seed)

The root seed is 32 random bytes. Everything below derives from it, so it is the User's whole Buddies identity.

- **iOS:** a **synchronizable** iCloud Keychain item (`AfterFirstUnlock`), so the same identity appears on every device on the Apple Account and survives a reinstall.
- **Android:** sealed with AES-256-GCM under a non-exportable Android Keystore key (usable after first unlock) in the app's no-backup directory, and backed up through Google Play services' **Block Store**: it survives a reinstall while Google backup is on, and it is in the Google cloud backup, end-to-end encrypted, only while Block Store can encrypt it end to end (Android 9+ with a screen lock; otherwise it stays on the device). It is restored at setup or reinstall, not synced between devices in use, so two Android devices (or an iPhone and an Android phone) are separate identities. Without Google Play services the seed lives on the device only. See [ADR 0020](./adr/0020-buddies-on-android.md).

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
- The link opens the app through iOS universal links (the AASA's `/b` component) and Android App Links (an auto-verified `/b` intent filter; the host's `assetlinks.json` covers every path). Both hand the app the whole URL, fragment included. Without the app, `GET /b` is a static page with App Store and Google Play buttons and a Copy button; the User installs, then taps the link again or pastes it in Buddies.
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
  "offer": { "plans": "daysTimes" },
  "platform": "android"
}
```

`platform` (`"ios"` \| `"android"`, optional) is the sender's platform, read only for pairing analytics (which platforms pair successfully); the app never shows it. Builds before it send none, and readers drop a value they don't know rather than reject the card.

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
  "sharing": { "photo": true, "tenure": true, "streak": true, "updatedAt": 0 }
}
```

- `buddies` (≤ 5) may also carry `tenure`, `color` (a hex this User picked), and `expiresAt` (only while `awaitingConfirm`). `avatar` is an emoji only; each device gets photos, and streaks, from Buddy Cards.
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

The roster also carries the User's sharing choices (`sharing`: `{ photo, tenure, streak, updatedAt, badges?, badgesUpdatedAt? }`), merged last-writer-wins so every device publishes the same Buddy Card: photo, Tenure, and the streak on `updatedAt`, badges on their own `badgesUpdatedAt`. A roster written before streaks existed reads `streak` as `true`. A withheld photo or Tenure is left out of invites, claims, `pair.confirmed`, and cards; the next card clears the buddy's copy. The streak only ever travels in cards, and the roster never stores a buddy's streak. Withheld badges are left out of cards and not announced. The badges fields came later, so they're optional: a roster without them (written before badges, or by an older app, which drops them when it rewrites the roster) parses, keeps the device's own badges choice and stamp, and counts as different from the device's copy only when that device made a choice (stamp > 0), which it then writes back once. On equal `badgesUpdatedAt`, withholding wins, so devices can't disagree forever. A choice never made defaults to on with stamp 0. Push templates are per device: a device that registers without a kind's template (Buddies notifications off there) gets no push for it.

If `inbox/sync` returns `not_found` (inactivity wipe), the client re-registers the inbox, re-adds every buddy's slot, and writes its roster. A local flag makes a failure part-way retry instead of looking like every buddy left.

### Buddy Card plaintext

```json
{
  "v": 1,
  "name": "Levi",
  "streak": { "n": 12, "until": "2026-10-07" },
  "updatedAt": 0,
  "level": "daysTimes",
  "days": [{ "d": "2026-09-27", "p": [{ "s": 540, "m": 180 }] }],
  "badges": [{ "c": "monthsShared", "l": 2 }, { "c": "firstBuddy" }]
}
```

`d` is the sender's local calendar day; `s` (start, minutes after midnight) is present only when the Plan has a start time; `m` is planned minutes. The window is today through +56 days. Day Plans and resolved Recurring Plan instances only — never Categories, notes (MVP), Time Entries, or goals.

`streak` is optional: the sender's Service Streak (`n`, planned days kept or months in service, 1–10,000) once it's at least 3 and only while `sharing.streak` is on. `until` is the sender's last local day it lasts without more service: the day after the next planned day still waiting for time, or the end of the next month for months. With no Plan ahead it's the end of the Plan window. The receiver hides the streak once its own local date is past `until`, so a streak that lapsed while the sender's app was closed stops showing. Whether `n` counts Plans or months isn't sent. A receiver that can't parse `streak` drops just that field, not the card. The card's content hash includes `streak`, so a change republishes it.

`badges` (optional, added without bumping `v`) lists the sender's earned badges, newest first: each Badge Collection once at its highest level (`c` = collection id, `l` = level 1–4), plus earned One-time Badges (`c` only). First Bible Study stays off the card in data protection mode. Never counts, dates, progress, or locked badges. It's left out when there are none, or when the User turned off badges or sharing them (`sharing.badges`). Receivers take each card's list as the whole truth, drop entries they don't recognize (a newer app's badges) one by one, and treat a malformed list (over 40 entries, wrong shape) as no badges without rejecting the card. Older apps ignore the field. Badges never travel in invites, claims, `pair.confirmed`, or the roster. The card's content hash includes `badges` too.

### Event kinds (MVP)

| Kind             | Written by       | Plaintext                                      | Push |
| ---------------- | ---------------- | ---------------------------------------------- | ---- |
| `invite.claimed` | relay (on claim) | the claim blob                                 | yes  |
| `pair.confirmed` | inviter          | `{ "v": 1, "name": "<inviter>", "platform"? }` | yes  |

### Shared Plans and Follow-ups

A User can invite buddies to a one-time Plan or a Follow-up. Each is a **share**. Its `id` (22-char `b64u`) is `SHA-256("ww-buddies/v1/share|" + senderInboxId + "|" + key)[0..16]`, where `key` is `plan:<dayPlanId>` or `followUp:<visitId>`, so every device of the sender uses the same id. The client works declaratively: on each publish it compares the shares its data implies with what it last sent to each recipient (content hash per recipient). It then invites new recipients, updates changed shares, and cancels removed recipients and deleted shares. `rev` is the sender's clock at send time. Recipients ignore anything older than what they have, and a cancel wins a tie.

| Kind                                  | Written by | Plaintext                                                                       | Push |
| ------------------------------------- | ---------- | ------------------------------------------------------------------------------- | ---- |
| `plan.invite` / `plan.update`         | sender     | `{ "v": 1, "id", "rev", "type": "plan", "expiresAt", "keepUntil"?, "details" }` | yes  |
| `followup.invite` / `followup.update` | sender     | same, with `"type": "followUp"`                                                 | yes  |
| `plan.cancel` / `followup.cancel`     | sender     | `{ "v": 1, "id", "rev" }`                                                       | yes  |
| `share.reply`                         | recipient  | `{ "v": 1, "id", "rev", "status": "going" \| "declined" }`                      | yes  |

`details`: `d` (sender's local day, `YYYY-MM-DD`), `s?` (start, minutes after midnight), `m?` (Plan minutes), `title?` (≤ 100), `location?` (`{ name?, address?, latitude?, longitude? }`), `note?` (≤ 2000, Plans only), `noteDoc?` and `photos?` (Plans only, see [Shared note photos](#shared-note-photos)), `firstName?` (≤ 40) and `topic?` (≤ 80), Follow-ups only.

- **Follow-ups carry minimal householder data:** date and time, the Contact's first name, a one-line address and coordinate, and the topic. Never the surname, phone, email, notes, history, or Bible Study flag. In data protection mode the sender's picker is hidden, and the recipient sees only the date and time.
- **Multi-device senders:** what was sent is tracked per device. Another of the sender's devices without that record re-sends under the same `id`; recipients see identical details and add no queue entry, though the push may still arrive once.
- **Expiry:** a Plan share is kept 30 days after the Plan ends, so buddies can look back at it (and its photos); a Follow-up 24 h after its time, since it carries a householder's details. `expiresAt` stays 24 h after it happens, which builds from before Plans were kept a month read alone; `keepUntil` (Plans only) carries the month, and a recipient keeps a share until the later of the two. Both phones drop it then, locally and without needing the network: on launch, on foreground, and on every sync. The relay deletes events after 30 days, so a share can outlive its event: a device that joins later doesn't get it.
- **After it happens:** a Plan or Follow-up whose time has passed is history. It can still be opened, but not answered: the answer buttons are gone and `share.reply` isn't sent. The sender sends its changes and its cancel only to buddies who already have it, always with `push: false`, and never invites anyone new to it (so updating to a build that keeps Plans a month doesn't re-send Plans that already ended). A recipient's linked Plan stops following it: a later change, cancel, or "declined" leaves the Plan as it was, and deleting it doesn't answer "declined". It adds no queue entry and stops holding the bell.
- **Going:** answering "Going" to a Plan adds a linked Day Plan (`buddyShare: { from, shareId }`) that mirrors the sender's changes and is removed when they cancel or the User changes their answer, until the Plan happens. Deleting that Plan before then answers "declined". An answer is saved before it's sent and retried on every sync until the relay accepts it, so it holds offline. Accepted Follow-ups appear read-only on the schedule day.
- **Relay limits:** `push` is true for invites, cancels, and replies, but for an update only when `d`, `s`, `m`, or `location` changed; a new title or note arrives quietly, so edits don't spend the 10-per-day push budget. A client sends at most 30 share events per buddy per hour, leaving room under the 60-writes cap for Buddy Cards; anything over waits for a later publish. An invitation too big for the 8 KB event cap first loses photos (the last first), then `noteDoc`, and only then has its `note` shortened.
- **Ending:** when a buddy is removed, leaves, or the User deletes all Buddies data, the client takes that buddy off the User's Plans and Follow-ups (so pairing again never re-sends an old invitation), and Plans that followed their invitations become ordinary Plans.
- **Notification queue:** claims, confirmations, invites, changes, cancellations, replies, requests to join, buddies' new badges, and their reactions to the User's badges are queued on the device (no user content — references only) behind the Home header bell. Entries are pruned after 30 days or when the share they point at is wiped, except that an invitation or claim still waiting on an answer (an invitation whose Plan or Follow-up hasn't happened) is never aged out, evicted by the queue cap, or dismissible; a pending invitation whose entry was lost is put back while it can still be answered. The client stores each event's `seq` on the entry it creates, so a push that carries `seq` can find it (see [Push delivery](#push-delivery)).

### Shared note photos

A Plan's note can have formatting and photos (ADR 0022). `note` is always the plain text, for alerts, the Notification Service Extension, and anything that can't read the rest. Two optional `details` fields carry the rest:

- `noteDoc` (≤ 12,000 characters): the note's Tiptap doc as `b64u(deflate(UTF-8 JSON))`, its photos named by the sender's photo ids. Readers inflate it into at most 256 KB, check it like any other note doc, and fall back to `note` when it doesn't read.
- `photos` (≤ 10): `{ id, blob, token, key, w, h }` per photo the doc shows. `id` is the doc's photo id; `blob` is the `blobId` under the sender's inbox (the share's `from`); `key` is the photo's own 32-byte ChaCha20-Poly1305 key; `token` is its read token; `w`/`h` its pixel size.

The sender reads the photo (at most 1,600 px on the long edge), seals it as `0x01 ‖ nonce[12] ‖ ciphertext ‖ tag[16]` with AAD `ww-buddies/v1/photo` under a fresh random key, and `blob/put`s it to expire with its share, a month after the Plan ends, or 89 days from now if that's sooner (the relay takes at most 90). One upload serves every share of that photo while it lasts, so editing the Plan doesn't upload it again. For a Plan further out, a copy with under 30 days left is replaced by a new upload (a new `blob`, so the share is sent again) and the old one deleted. A photo taken out of the note, or whose Plan is deleted or unshared, is deleted with `blob/delete` at once; otherwise it goes when its share does. While the relay's photo switch is off, it answers `no_buddies`, or an upload fails, the share goes without that photo and its doc leaves it out; a later publish adds it.

The recipient downloads each photo of an open invitation (and of a Plan it follows) on sync, checks `SHA-256(bytes) = blob`, opens it, and keeps it as a note photo named by the blob (`hex(blobId)`), so every share of the same photo uses one file. The relay sees only ciphertext, sizes, and who uploads and reads; keys never leave the end-to-end encrypted events.

### Requests to join

A User can ask a buddy to invite them to a Plan seen on that buddy's Buddy Card. The request carries only what the card already showed, and the owner answers through an ordinary Plan invitation (or not at all).

| Kind                 | Written by | Plaintext                                               | Push                       |
| -------------------- | ---------- | ------------------------------------------------------- | -------------------------- |
| `join.request.<tag>` | asker      | `{ "v": 1, "id", "rev", "d", "s"?, "m"?, "expiresAt" }` | first ask only (see below) |
| `join.cancel`        | asker      | `{ "v": 1, "id", "rev" }` (the asker withdrew it)       | no                         |

- **Id and rev:** `id` is `SHA-256("ww-buddies/v1/join|" + askerInboxId + "|" + ownerInboxId + "|" + d + "|" + (s ?? ""))[0..16]`, so asking again for the same Plan is the same request. `rev` is set when the User asks or withdraws (always increasing), not when it's sent. The owner ignores anything older than what it has, and a withdrawal wins a tie.
- **Per-buddy alerts without a relay change:** `<tag>` is the first 6 bytes, as lowercase hex, of `SHA-256("ww-buddies/v1/join-kind|" + slotId)`, where `slotId` is the slot the asker writes into the owner's inbox. Both people derive it, and the relay already knows which slot wrote an event, so the tag itself tells it nothing new. The owner's device registers the same localized template under each active buddy's kind, leaving out buddies muted on that device, or all of them when Ask to Join alerts are off there. The relay pushes only kinds a device registered (see `device/register`), so a muted buddy's request arrives silently and is listed already read. The set of templates a device registers does tell the relay which of its buddies that device muted. Five buddies add five templates to the nine fixed kinds, and badge alerts two more (`badge.new`, `badge.reaction`): at most 16 of the relay's 32.
- **Few alerts:** a request alerts the owner only on its first ask, and at most three requests per buddy alert in a rolling day; the rest go out with `push: false`, so they arrive in the tray without an alert. The alerting send is retried under the same `eventId` until the relay accepts it, and the relay never alerts twice for one `eventId`, so a request first sent offline still alerts exactly once. The asker keeps a withdrawn request until it lapses, and asking for that Plan again goes quietly. The owner keeps a withdrawn request too, so one asked again is listed already read. A User has at most three open requests per buddy.
- **No orphans:** the asker records that a request was handed to the relay before sending it, so withdrawing sends a `join.cancel` even when the send seemed to fail. Deliveries run one at a time, so asking, withdrawing, and syncing can't send duplicates. The asker withdraws a request automatically when the buddy's card no longer shows the Plan at that day and start (moved or dropped), and when it's still unsent inside the two-hour cutoff.
- **Answering:** the owner's tray lists the request with Invite and Not Now. Invite opens their one-time Plan at that time (or a new one seeded from the recurring instance there, skipping that instance for the day) with the asker added. Saving sends a normal `plan.invite`. There's no Invite when the owner's Plan follows someone else's invitation (only its organizer can invite), or when the owner has several Plans that day and none is at the requested time: a new Plan beside them would count the time twice. A request is answered once the owner's shares include the asker on a Plan that day, and the asker's copy clears when a `plan.invite` from the owner for that day arrives. Not Now is local only and nothing is sent; the owner keeps the dismissed request until it lapses, so the same request stays quiet. The asker can't tell a request passed over from one not yet seen.
- **Expiry:** `expiresAt` is the Plan's start (noon when it has none). The owner clamps it to the start of that day and time in its own time zone plus a day, and drops a request for a day beyond the Buddy Card window. Both phones drop the request when it lapses, locally, without the network. Asking closes two hours before the start.
- **Delivery:** a request (or withdrawal) is saved before it's sent and retried on every sync, and it counts against the 30 share events per buddy per hour.
- **Per device:** requests are per device on the asker's side, and Not Now, mutes, and the Ask to Join alerts switch are per device on the owner's.
- **Ending:** removing a buddy drops requests both ways, and their mute.

### Badges

Badges are earned on the device from the User's own records (never revoked). Buddies see them two ways: on the Buddy Card (`badges`, above) and as news when a new level arrives. A buddy can reply to one with a preset reaction ([Reactions](#reactions-encourage), below).

| Kind             | Written by           | Plaintext                                                                       | Push                                             |
| ---------------- | -------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------ |
| `badge.new`      | the badge's owner    | `{ "v": 1, "badges": [{ "c": "<id>", "l": 1–4 }] }`                             | one per buddy per 20 h (below)                   |
| `badge.reaction` | a buddy of the owner | `{ "v": 1, "badge": { "c": "<id>", "l"?: 1–4 }, "e": "<reaction>", "rev": ms }` | one per buddy per 20 h, apart from `badge.new`'s |

- **What's announced:** only Badge Collection levels the User just earned live (not ones found in existing history), each collection once at its highest new level, batched into one event per buddy. One-time Badges are never announced (a first Bible study is personal; a first buddy is the pairing itself). Nothing is announced, or sent, while Buddies is hidden or stopped on that device (its flag off, say), with badges off, `sharing.badges` off, or no active buddies. Turning badges or sharing them off drops news not yet sent.
- **Id:** `eventId` = `SHA-256("ww-buddies/v1/badge|" + senderInboxId + "|" + recipientInboxId + "|" + sortedKeys.join(","))[0..16]`, `b64u`, where keys are `<collection>.<level>`. Another of the sender's devices announcing the same badges, or a retry, writes the same event, which the relay stores once and never alerts for twice.
- **Delivery:** saved before it's sent and retried on every sync until the relay accepts it, for up to 7 days; only buddies active when the news was made get it (one paired later sees the badges on the card). It counts against the client's 30 share events per buddy per hour. `gone` forgets the buddy, as for other events.
- **Few alerts:** `push` is true for at most one badge event per buddy per 20 hours per sending device; later news that day goes with `push: false` and lands in the buddy's tray without an alert. The alert decision is recorded before sending, so a send that seemed to fail is retried with its alert under the same `eventId`. The relay drops an alert within 60 s of the sender's previous one to that inbox, so when the device sent that buddy any alerting event (a reply, an invitation, a request to join) in the last 65 s, a badge alert waits until the spacing has passed (a timer, or the next sync) instead of being sent and lost.
- **Template:** registered only on devices with Buddies notifications and badge alerts on (and badges on). Its text is generic and names no one ("A buddy has a new badge"), because the relay stores it; the device names the buddy and the badge itself ([Named alerts](#named-alerts)).
- **Receiving:** events from anyone but an active buddy are ignored, unknown badges are dropped, and the rest are listed in the tray (references only) at the event's `createdAt` and shown on that buddy's page until their next card. The entry arrives already read when badge alerts are off on that device, when the event is a day or more old, or on the device's first sync (a new device reads up to 30 days of backlog). With badges off it isn't listed, and entries already listed are hidden until badges are back on. Each `eventId` is handled once (kept 31 days), so re-reading the inbox from `since: 0` lists nothing twice. Tapping the entry, or the push when it carries `seq`, opens that buddy.

#### Reactions (Encourage)

- **What:** a reply to one of a buddy's badges with one of six preset reactions, sent as an id: `party` 🎉, `confetti` 🎊, `fire` 🔥, `clap` 👏, `thumbsUp` 👍, `raisedHands` 🙌. No free text and no raw emoji on the wire; an unknown id, or a badge this build doesn't know, drops the event. `badge` is the badge reacted to, as on the Buddy Card (`l` absent for a One-time Badge). A User reacts only to an active buddy's badge that their card shows (or a lower level of one), and only while Buddies runs and badges are on there. Sharing one's own badges isn't needed to react.
- **One per badge:** one reaction per sender, recipient, and badge. Choosing another sends a new event with a higher `rev` (the sender's clock, always increasing). The recipient keeps the highest `rev` per sender and badge and ignores anything older or equal, so re-reading the inbox from `since: 0` changes nothing. There is no way to take a reaction back.
- **Id:** `eventId` = `SHA-256("ww-buddies/v1/badge-reaction|" + senderInboxId + "|" + recipientInboxId + "|" + badgeKey + "|" + rev)[0..16]`, `b64u`, where `badgeKey` is `<collection>.<level>` or the One-time Badge id. A retry writes the same event, which the relay stores once and never alerts for twice.
- **Delivery:** saved before it's sent, so the reaction bar shows it at once, and retried on every sync until the relay accepts it, for up to 7 days. What was sent is per device: another of the sender's devices doesn't show it. It counts against the client's 30 share events per buddy per hour. `gone` forgets the buddy, as for other events.
- **Few alerts:** `push` is true for at most one reaction per buddy per 20 hours per sending device, an allowance apart from `badge.new`'s. Later reactions go with `push: false` and land in the tray without an alert. The alert decision is recorded before sending, so a retry keeps it, and an alert waits out the relay's 60 s spacing exactly as `badge.new` does. Reactions and badge news to a buddy go out one at a time, so neither loses its alert to the other's spacing.
- **Template:** `badge.reaction` is registered with `badge.new`, only on devices with Buddies notifications and badge alerts on (and badges on). Its text names no one ("A buddy reacted to your badge"), because the relay stores it; the device names the buddy, the reaction, and the badge ([Named alerts](#named-alerts)). Nine fixed kinds, a join kind for each of five buddies, and the two badge kinds make at most 16 of the relay's 32 templates.
- **Receiving:** events from anyone but an active buddy are ignored. So are reactions to a badge the recipient doesn't have (one of their Buddy Card badges, or a lower level of one), and every reaction while badges are off there; nothing is kept for them. The rest are kept per badge and sender (`{ e, at, rev }`, `at` being the event's `createdAt`) for that badge's full-screen view, and listed in the tray (references only): "Alex reacted 🎉 to Year Round, Gold". A newer reaction from the same buddy to the same badge replaces both the kept one and its tray entry; the same reaction again (from another of the sender's devices) only updates `rev`. The entry arrives already read when badge alerts are off on that device, when the event is a day or more old, or on the device's first sync. Tapping it, or the push when it carries `seq`, opens that badge.
- **Ending:** removing a buddy, or their leaving, drops reactions both ways. Delete-all drops them all.
