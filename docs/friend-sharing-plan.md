# Friend Sharing Plan

iOS-only. Adds an opt-in **friends layer** on top of the existing iCloud Drive sync: pair two users, exchange end-to-end-encrypted "events" (badge unlocked, milestone hit, month completed, ad-hoc broadcast), receive cross-device push notifications, and render friend progress inside the app for friendly social pressure. Status: **proposed, not yet implemented**.

The personal sync stays exactly as-is (`witness-work-<deviceId>.json` per-device files in iCloud Drive, see [`icloud-sync.md`](./icloud-sync.md)). This plan adds a **second cloud surface** — CloudKit's _public_ database — used strictly as an encrypted message bus between users. Apple servers see only opaque ciphertext; the keys never leave the user's devices.

> **Scope of this doc:** plumbing only. Settings/onboarding screen placement is called out where it lands, but no UI design.

## Goals

- **End-to-end encrypted by construction.** Apple, iCloud, and any future ww-proxy operator see only ciphertext + non-correlatable record IDs. A subpoena to Apple yields no friend-graph or event content.
- **No new backend.** Reuse the existing CloudKit container (already provisioned for the iCloud Drive sync) with its public database enabled. ww-proxy stays stateless.
- **Apple-ecosystem-native.** No third-party push, no third-party auth. CloudKit + APNs + CryptoKit + Universal Links.
- **Multi-device per user.** A user's iPhone, iPad, and Mac all act as one logical identity. Any device can publish; all receive.
- **Privacy-first defaults.** Off until explicitly enabled. No address-book scraping, no telephone-number-based discovery. Pairing is consent-based and per-link.
- **Offline-tolerant.** Events queue locally if the user is offline; CloudKit zone retry handles delivery.

## Non-goals

- Group chats, comments, reactions. One-way broadcast only — A's events fan out to A's friends. No reply channel beyond reciprocal events.
- Cross-platform (Android, web). The architecture is iOS-bound by design; future cross-platform would require a different transport.
- Server-pushed marketing or admin messages. The friends bus is friend-to-friend only.
- Content censorship, abuse moderation, or content filtering. Out-of-band; pairing is mutual-consent so abuse mitigation = unfriend.
- Backfilling historical events on first pair. Friendship begins at pairing time; prior milestones are not retroactively shared.
- Rich profile data (avatar, address, congregation). Display name only. Avatars deferred to a later phase modeled on [`icloud-image-sync-plan.md`](./icloud-image-sync-plan.md).

## Mental model

Two cloud planes, two purposes.

```text
                                ┌──────────────────────────────────────┐
                                │           iCloud Drive               │
   ┌─────────┐                  │  /Documents/                          │
   │ Device A│ ───── personal ──▶ witness-work-<deviceId>.json          │
   │  (you)  │ ◀──── personal ── (other A devices)                      │
   └─────────┘                  └──────────────────────────────────────┘
        │
        │ same Apple ID, same data, same friend keypair
        ▼
   ┌─────────┐                  ┌──────────────────────────────────────┐
   │ A devices │ ── encrypted ──▶│        CloudKit public DB            │
   │ publish    │                │  zone: _defaultZone                  │
   │ events     │                │  records: FriendEvent (ciphertext)   │
   │ ◀─ silent  │                │           FriendInvite (handshake)   │
   │   push     │ ◀───────────── │           FriendIdentity (pubkey)    │
   └─────────┘                  └──────────────────────────────────────┘
                                         │              ▲
                                         ▼              │ APNs (silent + mutable-content)
                                    ┌─────────┐         │
                                    │ Device B│ ◀───────┘
                                    │ (friend)│
                                    └─────────┘
```

- **iCloud Drive** = your private memory. Carries everything in `SyncPayload` plus the friend keypair, friend list, and friend-event inbox snapshot.
- **CloudKit public DB** = the friend-to-friend transport. Stores opaque encrypted envelopes addressed by recipient public-key fingerprint. Apple sees no plaintext.
- **APNs (via CloudKit subscriptions)** = the wakeup signal. A push arrives, the device fetches the matching record, the Notification Service Extension decrypts and renders the alert.

The iCloud Drive payload schema does **not** carry friend events for transport — those go through CloudKit. iCloud Drive only carries the friend list, keypair, and a local cache of decrypted events so all of a user's devices show the same feed without each one re-decrypting from CloudKit.

## Identity model

Each **user** (not device) gets a stable identity:

- **Device-shared keypair**, generated once on first enable, sync'd to all of a user's devices via the existing iCloud Drive payload:
  - `ed25519` signing keypair (long-term, for authenticity / non-repudiation at the friend layer)
  - `x25519` Diffie-Hellman keypair (long-term, for ECDH session derivation)
- **Public-key fingerprint** = first 16 bytes of `SHA-256(ed25519_pubkey || x25519_pubkey)`, base32-encoded → ~26 chars. Used as the public address in CloudKit records (e.g., `recipient: "abc23xyz...mn"`).
- **Display name** is opt-in, plaintext only when sent over an established friendship channel. CloudKit records carry only the fingerprint, never a human-readable name.

The keypair lives **only** inside the user's iCloud Drive payload (which already has Apple-account-scoped access control). Keychain storage is intentionally avoided so all devices that decrypt the iCloud Drive payload converge on the same identity without an additional keychain-sync mechanism.

```ts
// added to preferences.ts as new syncable keys
export type FriendIdentity = {
  ed25519PrivateKey: string // base64
  ed25519PublicKey: string // base64
  x25519PrivateKey: string // base64
  x25519PublicKey: string // base64
  fingerprint: string // base32
  createdAt: number
}
```

`friendIdentity` is allow-listed for sync. **Do not add to `NON_SYNCABLE_PREFERENCE_KEYS`** — multi-device parity is the whole point.

## Pairing flow

Pairing is a one-round-trip handshake delivered over the user's choice of transport (iMessage / AirDrop / QR code in-person). CloudKit is **not** required for pairing — it's pre-pair plaintext over Universal Links, similar to the existing `/c/*` contact-share scheme.

### Step-by-step

1. **A taps "Invite a friend"** in Settings → Friends.
2. App composes a Universal Link: `https://ww-proxy.leviwilkerson.com/f/<base64url(payload)>` where payload is:
   ```ts
   {
     v: 1,
     fingerprint: A.fingerprint,
     ed25519PublicKey: A.ed25519PublicKey,
     x25519PublicKey: A.x25519PublicKey,
     displayName: 'Levi',         // opt-in, plaintext
     inviteId: '<random 16 bytes>', // single-use anti-replay
     issuedAt: 1776000000000,
   }
   ```
3. **A shares** via Share Sheet (iMessage, AirDrop, etc.). Or A shows a QR code rendering the same URL.
4. **B opens the link.** ww-proxy already serves AASA for `applinks:ww-proxy.leviwilkerson.com`; we extend the AASA `details.paths` array to include `/f/*`. The same trick used for `/c/*` (see [ww-proxy README]) — universal link if app installed, otherwise an HTML fallback explaining the link.
5. B's app parses the payload, shows confirmation ("Add Levi as a friend?"), and on accept:
   - Records A's pubkeys + fingerprint locally (`friends` store, status `pending-outbound-ack`).
   - Generates B's response payload (B's fingerprint + pubkeys + display name + the same `inviteId`).
   - Composes the reciprocal Universal Link `https://ww-proxy.leviwilkerson.com/f/<...>` and presents the Share Sheet pre-targeted to A's iMessage thread.
6. **B sends** the response via iMessage to A.
7. **A opens the response link.** App matches `inviteId` against the pending invite, stores B's pubkeys/fingerprint, marks status `active`.
8. **Both sides post a `FriendIdentity` record** to CloudKit public DB so future devices joining the friendship can resolve fingerprints → pubkeys without re-doing the handshake. (See _Schema_ below.)

The link is **not** the secret — possession of the link doesn't grant access. The `inviteId` only prevents replay; the actual friendship is sealed when both sides write each other's fingerprints into their local friend list. A man-in-the-middle who intercepts the iMessage can substitute their own pubkeys, so we _strongly_ encourage in-person QR or short-fingerprint verification ("ask your friend if their code starts with `abc23`").

### Threat model on the link

- iMessage is E2EE, so the link is private between A and B over Apple's transport.
- AirDrop is local-only and authenticated.
- Pasted to email or a non-E2EE channel is the user's choice; we surface a one-line warning in the share sheet preview ("Share over iMessage or AirDrop for best privacy").
- The fingerprint is short enough (26 chars) to be read aloud; a future "verify in person" UI can compare fingerprints. Out of scope for v1, but the data model supports it.

### Pairing UI lands at

- `src/screens/settings/preferences/screens/PreferencesFriendsScreen.tsx` — "Friends" section in Settings. Toggle to enable, list of friends, "Invite a friend" button, "Pending invites" subsection.
- `src/screens/AcceptFriendInviteScreen.tsx` — full-screen confirmation when a `/f/*` link is opened. Routed via the Universal Link handler.
- `src/components/onboarding/steps/Friends.tsx` _(optional, deferred)_ — onboarding step to enable friends after iCloud sync is set up.

## Cryptography

CryptoKit-backed via a small Swift wrapper. All primitives are Apple's stdlib — no third-party crypto libraries.

| Purpose                    | Primitive                                                                                        | Library                             |
| -------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------- |
| Long-term identity signing | Ed25519                                                                                          | CryptoKit `Curve25519.Signing`      |
| Key agreement              | X25519 ECDH                                                                                      | CryptoKit `Curve25519.KeyAgreement` |
| Per-friendship session key | HKDF-SHA256 over shared secret + concat'd fingerprints (sorted) + context label `"ww-friend-v1"` | CryptoKit `HKDF`                    |
| Symmetric encryption       | ChaCha20-Poly1305 (AEAD)                                                                         | CryptoKit `ChaChaPoly`              |
| Record ID derivation       | SHA-256 truncated to 32 chars (idempotency under multi-device republish)                         | CryptoKit `SHA256`                  |

### Session key derivation

```text
sharedSecret = X25519(ourPriv, theirPub)
sortedFps    = sort([ourFingerprint, theirFingerprint]).join("|")
sessionKey   = HKDF-SHA256(
                 ikm: sharedSecret,
                 salt: utf8(sortedFps),
                 info: utf8("ww-friend-v1"),
                 length: 32
               )
```

`sessionKey` is deterministic from the keypair pair, so all devices on either side derive it independently without any state exchange. Cached in-memory per-friend for the app session; never persisted (rederivable from the keypairs already in the synced payload).

### Envelope format

Each event becomes one CloudKit record carrying an opaque `payload` blob:

```text
payload bytes:
  [0..1]    version (uint16, big-endian)
  [2..13]   nonce (12 bytes, ChaChaPoly nonce)
  [14..]    AEAD ciphertext = encrypt(sessionKey, nonce, plaintext, aad)
            where aad = senderFingerprint || recipientFingerprint || timestampMs (8 bytes)
```

Ciphertext plaintext (after decrypt + JSON-parse):

```ts
type FriendEventBody = {
  type: 'badge' | 'milestone' | 'monthCompleted' | 'goalUnlocked' | 'custom'
  title: string // human-readable, localized by sender
  detail?: string // optional secondary line
  payload?: Record<string, unknown> // type-specific structured data
  emittedAt: number // when the event happened (epoch ms)
  signature: string // Ed25519(senderEd25519Priv, sha256(envelopeAAD || ciphertext_pre_signing))
  signerFingerprint: string // = sender for non-repudiation
}
```

The receiver's app verifies signature → AEAD decrypt → matches `signerFingerprint` against the friend record's stored Ed25519 pubkey. A signature mismatch drops the event silently and logs at `warn` level. (No retry — re-encrypted events are idempotent under the same record name; see _Multi-device coordination_.)

## CloudKit schema

Three record types in the public database, default zone. CloudKit Dashboard schema deployment will be required for both Development and Production environments at first ship.

### `FriendIdentity`

Public, world-readable. Maps a fingerprint → pubkeys so a third device joining either side of a friendship can resolve.

| Field                   | Type      | Indexed   | Notes                                                                            |
| ----------------------- | --------- | --------- | -------------------------------------------------------------------------------- |
| `recordName`            | String    | (always)  | = `id-<fingerprint>`                                                             |
| `fingerprint`           | String    | queryable | Same as `recordName` minus prefix                                                |
| `ed25519PublicKey`      | Bytes     | —         | 32 bytes                                                                         |
| `x25519PublicKey`       | Bytes     | —         | 32 bytes                                                                         |
| `displayNameCiphertext` | Bytes     | —         | _Optional_, encrypted under each friend's session key — see "Display name" below |
| `version`               | Int       | —         | Schema version                                                                   |
| `createdAt`             | Date/Time | —         | Server-side `___createTime` is also available                                    |

_Permissions_: write requires that the writer's CloudKit user record (Apple's anonymous CKUserRecordID) is the owner of the record. Reads are world. CloudKit default ACL handles this automatically when records are written by the user.

### `FriendInvite`

_Optional, deferred to v1.1._ Used when iMessage isn't viable (web link, async). Encrypted handshake parked in CloudKit so the recipient can pick it up later.

For v1 we use Universal Links over iMessage and skip this record type. Documented here so the schema isn't a forward-incompat surprise.

### `FriendEvent`

The hot path. One record per `(event, recipient)` pair.

| Field        | Type      | Indexed       | Notes                                                                                                                                                                                                                                                                              |
| ------------ | --------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `recordName` | String    | (always)      | = `e-<sha256(eventId + recipientFingerprint)>` (truncated to 32 chars). Idempotent across A's devices republishing the same event.                                                                                                                                                 |
| `recipient`  | String    | **queryable** | Recipient fingerprint. Subscriptions filter on this.                                                                                                                                                                                                                               |
| `payload`    | Bytes     | —             | Encrypted envelope (see _Envelope format_)                                                                                                                                                                                                                                         |
| `senderHint` | String    | queryable     | Sender fingerprint **in plaintext**. Required so recipient can pick the right session key without trial-decrypting against every friend. Trades a small metadata leak for a large CPU win. _Acceptable because the recipient already knows the sender's fingerprint from pairing._ |
| `version`    | Int       | —             | Envelope schema version                                                                                                                                                                                                                                                            |
| `serverTime` | Date/Time | —             | CloudKit `___createTime` (auto)                                                                                                                                                                                                                                                    |

_Permissions_: write by anyone with a CloudKit user record (i.e., any signed-in iCloud user using our app). Read by the targeted recipient via the subscription's predicate match. Public DB defaults are sufficient.

### Subscription

Each user (per-device) creates one `CKQuerySubscription`:

```text
recordType:    FriendEvent
predicate:     recipient == <my fingerprint>
options:       firesOnRecordCreation
notification:  shouldSendContentAvailable: true,
               shouldSendMutableContent:   true,
               alertBody:                  "" (placeholder, NSE rewrites)
```

The `mutable-content` flag is the key: APNs delivers a placeholder alert, the Notification Service Extension wakes, fetches and decrypts the matching `FriendEvent`, then mutates the alert title/body to the decrypted text before iOS shows it. **The push payload itself never contains plaintext.**

### Display name

Cleartext display names in `FriendIdentity` would let any reader (or Apple) correlate fingerprint → name. Two options:

1. **Plaintext display name** in `FriendIdentity`. Simpler. Leaks identity-to-fingerprint linkage to Apple. _Rejected._
2. **Per-friendship encrypted display name.** A and B store each other's display names in their _local_ friend records (received during the pairing handshake over iMessage, never written to CloudKit). `FriendIdentity` carries no display name. _Chosen for v1._

If a third device (A's new iPad) needs B's display name and didn't witness the original handshake, it gets the name via the **iCloud Drive sync** (the friends store rides in `SyncPayload`), not via CloudKit. CloudKit only ever carries fingerprints + pubkeys.

## Notification Service Extension (NSE)

A new build target. We already use `@bacons/apple-targets` for the widget extension; we add a sibling target for the NSE.

```text
targets/
  notification-service/
    Info.plist
    NotificationService.swift
    Target.swift             // @bacons/apple-targets manifest
```

### Responsibilities

1. Accept the incoming `aps` payload from CloudKit.
2. Read `recordID` from the CloudKit-formatted push payload (CloudKit puts it in `ck.qry.rid` etc.).
3. Open the App Group container, load the user's friend keypair + friends list (already shared via the existing App Group `group.com.leviwilkerson.jwtime`).
4. Fetch the `FriendEvent` record from CloudKit (the NSE can use `CKContainer.default().publicCloudDatabase`).
5. Decrypt the envelope, verify the signature.
6. Mutate the notification's `title` and `body` to:
   - `title` = sender's local display name (from friends list)
   - `body` = `event.title` (the localized human-readable line set by sender)
7. Cache the decrypted event in App Group storage so when the app foregrounds it doesn't refetch.

### Constraints

- NSE has **30 seconds** wall-clock and **24 MB** memory. Decrypt + 1 record fetch fits trivially.
- NSE cannot show its own UI; it can only mutate the alert.
- If decryption fails (corrupt record, signature mismatch, unknown sender), NSE falls through to the placeholder alert. We choose the placeholder to be intentionally vague: `"New activity from a friend"` — better than dropping the notification entirely.

### App Group keys read by NSE

The NSE reads (never writes) these from the App Group:

- `friendIdentity` — keypair + fingerprint
- `friends` — array of `{ fingerprint, ed25519PublicKey, x25519PublicKey, displayName }`

These are mirrored from the preferences/friends store into a small NSE-specific JSON file written by the main app on every change. (The main store is MMKV-backed; MMKV via App Groups does work, but a single JSON snapshot is simpler for the NSE's read-only use.)

`src/lib/sync/nseSnapshot.ts` — new file, takes the current friend identity + friends list, writes to `groupContainer/nse-snapshot.json`. Called from the friends store on any change.

## Native module: `cloudkit-bridge`

A new local Expo module sibling to `icloud-bridge`. Wraps CloudKit operations the JS layer needs.

```text
modules/
  cloudkit-bridge/
    expo-module.config.json
    index.ts
    package.json
    ios/
      CloudKitBridge.podspec
      CloudKitBridgeModule.swift
```

### TS surface

```ts
export type FetchedFriendEvent = {
  recordName: string
  senderHint: string
  payload: ArrayBuffer
  serverTime: number
}

export type FriendIdentityRecord = {
  fingerprint: string
  ed25519PublicKey: ArrayBuffer
  x25519PublicKey: ArrayBuffer
}

declare class CloudKitBridgeNative {
  isAvailable(): boolean

  // Account
  getCurrentUserStatus(): Promise<
    'available' | 'noAccount' | 'restricted' | 'unknown'
  >

  // Subscriptions
  ensureFriendEventSubscription(myFingerprint: string): Promise<void>
  removeFriendEventSubscription(): Promise<void>

  // FriendIdentity
  publishMyIdentity(rec: {
    fingerprint: string
    ed25519PublicKey: ArrayBuffer
    x25519PublicKey: ArrayBuffer
  }): Promise<void>
  fetchIdentity(fingerprint: string): Promise<FriendIdentityRecord | null>

  // FriendEvent
  publishEvent(rec: {
    recordName: string
    recipient: string
    senderHint: string
    payload: ArrayBuffer
  }): Promise<void>
  fetchEventsSince(
    myFingerprint: string,
    cursor: string | null
  ): Promise<{
    events: FetchedFriendEvent[]
    nextCursor: string | null
  }>
  fetchEventByRecordName(recordName: string): Promise<FetchedFriendEvent | null>

  // Cleanup
  deleteAllMyEvents(): Promise<void>
  deleteFriendIdentity(): Promise<void>

  // Events
  // none — push wakeup arrives via APNs → AppDelegate, not via this module
}
```

### Design notes

- All operations run on the **public** database. We never touch the user's CloudKit private DB from this module — the existing iCloud Drive sync is the personal-data path and we don't want to muddy that boundary.
- `ensureFriendEventSubscription` is idempotent. CloudKit refuses duplicate subscription IDs; the module catches that and treats it as success.
- `publishEvent` uses `CKModifyRecordsOperation` with `savePolicy: .ifServerRecordUnchanged` and an explicit `recordName`, so multi-device republish from the user's other devices results in a "record already exists" path that the module silently swallows.
- `fetchEventsSince` is the foreground catchup query — runs on app foreground and on each silent-push wake. Uses CloudKit's `CKQueryOperation` with `desiredKeys` limited to what the JS layer needs.

### Permissions / capability

CloudKit capability is added via the `with-icloud-container` config plugin (already in place — it injects the iCloud entitlement). The plugin needs an extension to also enable `CloudKit` services on the same container, not only `CloudDocuments`. Plugin diff:

```js
// plugins/with-icloud-container.js
container.iCloudServices = ['CloudDocuments', 'CloudKit']
```

CloudKit Dashboard schema deployment is a one-time-per-environment manual step (Development → Production promote). Documented in a new `docs/cloudkit-schema-deploy.md` companion at ship time.

## JS layer

### Files

| File                          | Purpose                                                                                                                                                                                                                                                                               |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/friends/identity.ts` | Generate, load, persist the user's keypair. Imports CryptoKit via a small Swift helper exposed through a sibling `crypto-bridge` module (or piggybacks `cloudkit-bridge` if scope creep is acceptable).                                                                               |
| `src/lib/friends/crypto.ts`   | Session key derivation, envelope encrypt/decrypt, signature sign/verify. Pure JS-callable wrappers around the native crypto bridge.                                                                                                                                                   |
| `src/lib/friends/pairing.ts`  | Build / parse `/f/*` invite links. Validate invite payloads. Reciprocal handshake state machine.                                                                                                                                                                                      |
| `src/lib/friends/events.ts`   | Compose outbound `FriendEventBody`. Match inbound events against local friend list. Hand off to local notification scheduler when the app handles wake itself (vs. NSE).                                                                                                              |
| `src/lib/friends/sync.ts`     | The orchestrator analogous to `iCloudSync.ts`. `installFriendSync()` wires up store subscriptions, AppState foreground catchup, push-wake handler. Methods: `enable()`, `disable()`, `inviteFriend()`, `acceptInvite()`, `removeFriend()`, `publishEvent()`, `pullSinceLastCursor()`. |
| `src/lib/friends/cursor.ts`   | Per-device cursor for "events newer than this `serverTime`" so foreground pull doesn't refetch the world. Cursor lives in non-syncable preferences (one cursor per device, not per user).                                                                                             |
| `src/lib/sync/nseSnapshot.ts` | Mirror friends + identity into the App Group JSON the NSE reads.                                                                                                                                                                                                                      |
| `src/stores/friends.ts`       | Zustand store. State: `{ status, identity, friends, pendingInvites, recentEvents }`. Subscribed by `iCloudSync` (rides in `SyncPayload`) and by `friendSync` (handles CloudKit).                                                                                                      |

### Store schema additions

`src/stores/friends.ts`:

```ts
type FriendStatus = 'active' | 'pendingOutbound' | 'pendingInbound' | 'removed'

type Friend = {
  fingerprint: string
  ed25519PublicKey: string // base64
  x25519PublicKey: string // base64
  displayName: string
  pairedAt: number
  status: FriendStatus
  lastSeenEventAt?: number
}

type PendingInvite = {
  inviteId: string
  direction: 'outbound' | 'inbound'
  theirFingerprint?: string // present when inbound
  ed25519PublicKey?: string
  x25519PublicKey?: string
  displayName?: string
  issuedAt: number
  expiresAt: number // 7 days
}

type RecentEvent = {
  id: string // = recordName
  friendFingerprint: string
  emittedAt: number
  receivedAt: number
  type: FriendEventBody['type']
  title: string
  detail?: string
  payload?: Record<string, unknown>
  read: boolean
}

type FriendsState = {
  identity: FriendIdentity | null // null until first enable
  friends: Friend[]
  pendingInvites: PendingInvite[]
  recentEvents: RecentEvent[] // bounded — last 200, see Capacity
}
```

### Sync payload changes

`src/lib/sync/payload.ts` gains a `friendsStore` slice. New keys are versioned via a bump to `PAYLOAD_VERSION` and parsed permissively (missing slice = empty state, not an error) so older versions of the app on other devices keep working.

```ts
type SyncPayload = {
  // ... existing fields ...
  friendsStore?: {
    identity: FriendIdentity | null
    friends: Friend[]
    pendingInvites: PendingInvite[]
    recentEvents: RecentEvent[] // see "Recent events sync" below
    updatedAt: number // stamping for LWW
  }
}
```

**LWW for friends:** `merge.ts` gains a per-list LWW merge for `friends` (keyed by fingerprint, `pairedAt` as the resolver), `pendingInvites` (keyed by `inviteId`, expired entries dropped), and `recentEvents` (keyed by `id`, retain newest 200 across both sides).

**Identity merge:** if both local and remote have a non-null `identity` and they differ, **prefer the older one** (`createdAt` smaller) to avoid a multi-device first-enable race producing two distinct identities. The losing device wipes its in-flight subscriptions and re-creates with the winning identity. The race window is small (only first-enable) but the recovery is automatic.

**`friendsStore` is opt-in for sync:** the merge skips this slice entirely when `iCloudSyncEnabled` is false. (Friends can technically work without iCloud Drive sync — single-device — but multi-device parity requires it.)

**Recent events sync:** small enough (~200 events × ~500 bytes = 100 KB worst case) to ride iCloud Drive. Avoids each device having to re-decrypt the same CloudKit records. When a device decrypts a new event, it both stores locally _and_ schedules an iCloud Drive push so siblings pick it up. The slice is included in the LWW merge and capped at 200 newest entries (sorted by `emittedAt`) on every push to keep payload size bounded.

## Multi-device coordination

A user with N devices publishing the same event to M friends would naively produce N×M records. Two layers of dedup keep it to M:

1. **Deterministic record names.** `recordName = "e-" + sha256(eventId + recipientFingerprint).truncated(30)`. CloudKit rejects duplicate writes to the same record name. First write wins, subsequent attempts no-op. The `eventId` is generated by the device that first observes the user's underlying milestone (e.g., monthly hours threshold cross) and stored in the iCloud Drive sync — so the second device that learns about the milestone via iCloud Drive sync sees the event already has an ID and computes the same record name.
2. **Publish gating.** Each device only publishes an event if its `friendsStore.recentEvents` slice doesn't already contain a "published" marker for that event. Markers ride in iCloud Drive so all devices converge.

Equivalently for **inbound** events: NSE-decrypted events are written into App Group storage; the main app on next foreground reads them, dedupes against the existing `recentEvents` array (by `id`), pushes the union via iCloud Drive. Sibling devices pick up via iCloud Drive without round-tripping CloudKit.

## Notification flow (end-to-end)

```text
User A unlocks "First 50 hours"

  ↓ A's iPhone observes the threshold cross
  detectMilestone() ──▶ friendsStore.recentEvents (with eventId, status: pending)
                  ──▶ schedule iCloud Drive push (siblings learn the eventId)

  ↓ For each active friend B in friends list:
  encrypt(sessionKey_AB, FriendEventBody) ──▶ envelope
  cloudkit.publishEvent({ recordName: e-<hash>, recipient: B.fp, senderHint: A.fp, payload })
                                                        │
  ┌─────────────────────────────────────────────────────┘
  │
  ▼  CloudKit push subscription matches recipient == B.fp
  APNs ──▶ B's iPhone (silent + mutable-content)

  ↓ Notification Service Extension wakes
  read group container ──▶ B's keypair + B's friends list
  fetch FriendEvent by recordName from CloudKit public DB
  decrypt envelope ──▶ "Levi unlocked First 50 hours"
  mutate alert: title = "Levi", body = "unlocked First 50 hours"

  ↓ iOS shows the banner

  ↓ B taps banner → app opens →
  pullSinceLastCursor() ──▶ also fetches the same record (idempotent)
  upsert recentEvents[id] ──▶ schedule iCloud Drive push for B's other devices
```

If APNs is throttled or the app was force-killed and the silent push doesn't wake the NSE: foreground `pullSinceLastCursor()` on next app open catches up. The user sees a missed-notifications banner inside the app instead of an iOS banner. Acceptable.

## Phases

Six phases shippable in any order after Phase 0/1.

### Phase 0 — Container & schema setup _(no user-visible changes)_

- Update `plugins/with-icloud-container.js` to enable `CloudKit` service alongside `CloudDocuments`.
- Generate CloudKit Dashboard schema for `FriendIdentity` and `FriendEvent` in Development.
- Document the schema deploy steps in `docs/cloudkit-schema-deploy.md`.
- Native rebuild required.

### Phase 1 — Crypto + identity _(internal only)_

- New module `cloudkit-bridge` (CloudKit ops only).
- New crypto wrapper (Swift CryptoKit, exposed via `cloudkit-bridge` or a sibling).
- `src/lib/friends/identity.ts` + `crypto.ts`.
- Plumb `friendIdentity` into preferences (allow-listed for sync). Don't generate yet — only when enabled.
- Unit tests for envelope encrypt/decrypt round-trip and session-key determinism across two synthetic identities.

### Phase 2 — Pairing flow _(no events yet, no notifications)_

- Universal Link handling for `/f/*` (extends `applinks:ww-proxy.leviwilkerson.com`).
- ww-proxy AASA update to include `/f/*` in `details.paths` _(see `ww-proxy/src/`)_, plus a fallback HTML landing page mirroring the `/c/*` pattern.
- `src/lib/friends/pairing.ts` round-trip state machine.
- `src/stores/friends.ts` with friend list + pending invites.
- Settings UI placeholder: `PreferencesFriendsScreen.tsx` skeleton — list, "Invite a friend" button (composes link, opens Share Sheet), accept-invite confirmation screen.
- iCloud Drive sync of `friendsStore` slice (without `recentEvents`).

### Phase 3 — Event publishing _(half-duplex: send only)_

- Detect milestone events in `src/lib/milestones.ts` and emit to `friends/events.ts`.
- `cloudkit-bridge.publishEvent` integration.
- Multi-device dedup via record-name hashing + `friendsStore.recentEvents` markers.
- Manual receive: a debug screen that lists incoming events fetched on foreground via `pullSinceLastCursor` (no push notifications yet).

### Phase 4 — Push notifications _(NSE)_

- New `targets/notification-service/` build target.
- App Group snapshot writer (`nseSnapshot.ts`).
- CloudKit subscription create on enable, delete on disable.
- End-to-end test: A unlocks milestone → B's lock screen shows decrypted banner.

### Phase 5 — Friends UI integration _(deferred from this plan)_

- Friends tab / Progress screen integration showing recent events.
- Profile detail overlay shows friend stats.
- _Not specified here — UI design happens later._

### Phase 6 — Hardening

- Friend removal (delete from list, delete subscription, optionally delete prior events from CloudKit via `deleteAllMyEvents` — but that's destructive across friends; default to leaving server-side records to expire on their own retention).
- Key rotation flow (regenerate identity, re-handshake all friends). Manual user-initiated.
- Recovery from "lost identity" (user wiped + restored from non-iCloud-synced source). Treated identically to "new identity" — friends must re-pair.
- Reset / wipe friends button in Settings.
- Diagnostic logs gated on `developerTools` (`[friendSync/...]` prefix) following the existing iCloud sync pattern.

## Where settings/screens land

UI design deferred. Plumbing is wired so these screens can hang off the listed routes:

| Screen file                                                             | Purpose                                                                                                   |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `src/screens/settings/preferences/screens/PreferencesFriendsScreen.tsx` | Master toggle, friend list, invite button, pending invites, key fingerprint display, reset                |
| `src/screens/settings/preferences/screens/FriendDetailScreen.tsx`       | Per-friend: display name edit (local-only), pubkey/fingerprint, paired date, recent events, remove button |
| `src/screens/AcceptFriendInviteScreen.tsx`                              | Universal-link landing — confirm + send reciprocal invite                                                 |
| _(deferred)_ `src/screens/FriendsTabScreen.tsx`                         | The actual social feed. Phase 5.                                                                          |
| _(optional)_ `src/components/onboarding/steps/Friends.tsx`              | Onboarding step prompting to invite friends after iCloud restore                                          |

## Development setup & testing

### CloudKit Dashboard

The app already provisions split dev/prod iCloud containers (`iCloud.com.leviwilkerson.jwtimedev` and `iCloud.com.leviwilkerson.jwtime`), both currently hosting only the CloudDocuments scope used by iCloud Drive sync. To enable friends:

1. **Enable the CloudKit service on both containers.** Phase 0 patches `plugins/with-icloud-container.js` to add `'CloudKit'` alongside `'CloudDocuments'`. After prebuild, verify in [CloudKit Dashboard](https://icloud.developer.apple.com/dashboard/) that both environments list both services.
2. **Deploy the schema in Development first.** CloudKit auto-creates record types in Development on first record write — ship a one-shot `scripts/deploy-cloudkit-schema.ts` that writes a synthetic `FriendIdentity` + `FriendEvent` to seed the schema, then deletes them. Development indexes (`recipient` queryable on `FriendEvent`, `fingerprint` queryable on `FriendIdentity`) must be added manually in the Dashboard.
3. **Promote schema to Production via the Dashboard "Deploy Schema Changes" button** before each release that touches schema. _Production never auto-creates record types._ Forgetting this step is the canonical "works in TestFlight, broken in App Store" failure mode for CloudKit apps; the release checklist in `docs/build.md` must be amended to gate releases on schema parity.

### Local testing matrix

| Test                                                              | Hardware                                                                                    | Notes                                                                                                            |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Crypto envelope round-trip (encrypt → decrypt → signature verify) | Simulator OK                                                                                | Pure CryptoKit, no network                                                                                       |
| iCloud Drive sync of `friendsStore` slice                         | Simulator OK if signed into iCloud; two devices preferred                                   | Same caveats as existing iCloud sync; single Apple ID across all participating devices                           |
| Universal Link `/f/*` opens app                                   | Simulator via `xcrun simctl openurl booted "https://ww-proxy.leviwilkerson.com/f/<base64>"` | AASA must already be deployed to ww-proxy; on a fresh simulator install, AASA is fetched on first launch         |
| Pairing handshake (full round-trip)                               | Two devices on **different** Apple IDs                                                      | Required — same Apple ID on both makes A and B the same CloudKit user, which collapses the test                  |
| CloudKit publish + subscription delivery                          | Two physical devices, different Apple IDs                                                   | Simulators receive APNs pushes since iOS 16, but CloudKit silent-push delivery on simulator is flaky in practice |
| NSE decrypts and mutates the alert                                | Physical device only                                                                        | NSE entitlements + push-payload mutation are not reliably exercisable on simulator                               |
| End-to-end "A unlocks → B sees decrypted banner"                  | Two physical devices                                                                        | The integration test                                                                                             |

### Two-device dev rig

Treat the friend-feature dev loop the way the existing iCloud sync work was tested: two enrolled devices on the dev provisioning profile, signed into **different** Apple IDs, both running the dev variant (`com.leviwilkerson.jwtimedev`), both targeting the dev CloudKit container.

Recommended:

- Device A → primary dev Apple ID
- Device B → secondary test Apple ID (a free Apple ID is fine; no payment method needed for CloudKit dev usage)

A simulator + a physical device works for everything except the NSE-decrypt push test.

### Test fixtures

Two scripts under `scripts/dev/` (added in Phase 1 / Phase 2):

- `seed-fake-friend.ts` — generates a synthetic peer keypair and injects a `Friend` into the local store with a known fingerprint, plus a small batch of inbound `RecentEvent`s. Lets UI work proceed without a second device.
- `clear-cloudkit-public.ts` — deletes all `FriendEvent` + `FriendIdentity` records authored by the current iCloud user from the dev container. Run when iterating on schema or recovering from corrupt test data.

### Unit tests

Vitest, alongside the existing `src/lib/sync/__tests__/`. New folder `src/lib/friends/__tests__/`:

- `crypto.test.ts` — envelope round-trip, signature verify + reject, AAD tampering detection, nonce-uniqueness check
- `pairing.test.ts` — invite payload encode/decode, `inviteId` replay rejection, expiry, MITM-substituted-pubkey detection (once invite signing lands; see _Open questions_ #2)
- `merge.test.ts` extension — friend-list LWW, identity tie-breaker (older `createdAt` wins), `recentEvents` cap-to-200, expired pending invite drop

Native CryptoKit operations are stubbed in tests; the JS crypto wrapper carries a deterministic pure-JS fallback gated on `process.env.NODE_ENV === 'test'` so round-trip tests run without the native module.

### Manual integration smoke test

A companion doc `docs/friend-sharing-testing.md` (written at Phase 4 ship) walks through the end-to-end:

1. Pair A and B via QR code (faster than iMessage during dev).
2. Trigger a milestone on A using a debug-menu button (added in Phase 3 — injects a synthetic `FriendEventBody` without requiring the user to actually log enough hours).
3. Confirm B's lock screen receives the decrypted alert.
4. Confirm B's app, on foreground, shows the event in `recentEvents`.
5. Force-kill B's app, trigger another event from A, confirm B catches up on next foreground via `pullSinceLastCursor`.
6. Disable friends on A, confirm subscription removal and that B no longer receives events.

### Resetting dev state

In dev builds (gated on `__DEV__` or the existing `developerTools` preference), `PreferencesFriendsScreen` exposes a **"Reset friends"** button that:

- Wipes `friendIdentity`, `friends`, `pendingInvites`, `recentEvents` from preferences
- Calls `cloudkit-bridge.deleteFriendIdentity()` and `deleteAllMyEvents()`
- Calls `removeFriendEventSubscription()`
- Triggers an iCloud Drive push so sibling devices converge to the empty state

Intentionally **not** exposed in production — losing the friend identity invalidates every existing friendship (all friends must re-pair from scratch). The reset is dev-only by design.

### Diagnostic logs

Following the existing iCloud sync pattern (see [`icloud-sync.md` § Diagnostic logs](./icloud-sync.md#diagnostic-logs)): all friend-sync log lines prefixed `[friendSync/deviceName]`, gated on `developerTools || __DEV__`. NSE has its own prefix `[friendSync/NSE]` and writes to the unified log; collect with:

```bash
log stream --predicate 'eventMessage CONTAINS "friendSync"' --device --style compact
```

NSE crashes (rare but possible — 30s wall-clock budget) are visible in `~/Library/Logs/DiagnosticReports/` after device sync via Xcode's Devices window.

## Capacity

| Component                                  | Growth                       | Bound                                                                                       |
| ------------------------------------------ | ---------------------------- | ------------------------------------------------------------------------------------------- |
| `FriendEvent` records per user, per friend | Linear with events generated | One record per (event, friend). Typical: ~5 events/month/user; 5 friends = 25 records/month |
| Per-record size                            | Constant                     | ~200–500 bytes ciphertext + metadata                                                        |
| `friendsStore.friends`                     | Linear with friends          | No hard cap; UI suggests 25 max                                                             |
| `friendsStore.recentEvents` (synced)       | Bounded                      | 200 newest, ~100 KB worst case                                                              |
| App Group NSE snapshot                     | Linear with friends          | < 50 KB at 25 friends                                                                       |
| CloudKit public DB free tier               | 50 MB / user / app           | ~3 years of constant moderate use before approaching limits                                 |

CloudKit public DB is per-user-per-app; A's records count against A's iCloud quota, B's against B's. No shared pool. Apple recommends pruning older records if approaching the limit; we add a background prune at v1.1 (records older than 90 days deleted by sender on next foreground).

## Privacy & threat model

| Threat                                         | Mitigation                                                                                                                                                                                                                                                                                                           |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Apple reads my data                            | All payloads ChaCha20-Poly1305 AEAD encrypted with keys never on Apple's servers. Apple sees only fingerprints + encrypted blobs + record-creation timestamps.                                                                                                                                                       |
| Apple correlates my fingerprint to my Apple ID | Unavoidable — CloudKit operations are authenticated by Apple. Mitigation: our record-name scheme doesn't link a user's events together (each record's name is a hash derived from event+recipient, not user). Apple still has access logs by `___createdBy`. Acceptable trade for "no own backend."                  |
| ww-proxy operator reads / drops invites        | Invite payloads are public-key material only; ww-proxy serves AASA + a static fallback HTML page. ww-proxy never sees the link payload (it's path-based; routing happens in iOS, not over HTTP).                                                                                                                     |
| Friend impersonation during pairing            | Universal Link over iMessage = E2EE transport. In-person QR + fingerprint readback for high-assurance pairing (deferred UI).                                                                                                                                                                                         |
| Friend impersonation post-pairing              | Every event is Ed25519-signed; receiver verifies signature against the friend's stored pubkey. A compromised CloudKit record cannot forge events.                                                                                                                                                                    |
| Replay of old events                           | Envelope AAD includes `timestampMs`; receiver drops events with `emittedAt > now + 1 hour` or `< now - 30 days`. Idempotent record names mean replays simply overwrite themselves.                                                                                                                                   |
| Lost device, attacker has iCloud password      | Attacker can sign in to iCloud, restore the user's iCloud Drive payload, and obtain the keypair. **Acceptable** — this is the same threat surface as the existing iCloud Drive sync. Mitigation lives at the Apple ID layer (2FA, Advanced Data Protection). Documented in user-facing privacy notes at enable time. |
| Quantum break of X25519/Ed25519                | Out of scope. Re-keying flow exists in Phase 6 if needed.                                                                                                                                                                                                                                                            |
| Spam / unsolicited friend requests             | Pairing requires both sides to actively share & approve a Universal Link. No fingerprint-search, no address-book lookup. Spam surface is iMessage spam, which Apple already handles.                                                                                                                                 |
| Subpoena to Apple targeting fingerprint X      | Yields ciphertext + access logs; no plaintext recoverable without device-resident keys.                                                                                                                                                                                                                              |

## Gotchas

- **CloudKit user account required.** If the user is signed out of iCloud, friends is unavailable. The existing `availabilityChange` listener pattern from `icloud-bridge` extends naturally; surface the same "iCloud not available" UI in `PreferencesFriendsScreen`.
- **Schema deploy is manual & per-environment.** Forgetting to promote the dev CloudKit schema to production is a "works on TestFlight, broken in App Store" footgun. The release checklist in `docs/build.md` must be amended.
- **Subscription identity follows the device, not the user.** Each device creates its own subscription; deleting on disable must run on every device that ever had it enabled. We track per-device a `friendsSubscriptionInstalledAt` in non-syncable preferences and re-call `removeFriendEventSubscription` on disable.
- **NSE has no MMKV.** It reads a JSON snapshot we write, not the live store. Forgetting to update the snapshot on friend-list change = NSE can't decrypt new friends' events. Snapshot write must be tied to the friends store subscription, not lazy.
- **Universal Link AASA caching.** iOS caches AASA aggressively. Adding `/f/*` requires either bumping the app build (`applinks` revalidates on install/update) or waiting up to 7 days for users on stale caches. Plan for a launch where `/f/*` AASA ships at least one app version before the friends UI surfaces.
- **CloudKit subscription quota.** 100 subscriptions per user per app. We use exactly 1, so we have headroom, but don't ever create a second per-friend subscription or the math breaks at 100 friends.
- **Tombstones aren't enough for friend removal.** Removing a friend means removing them locally + removing the subscription _doesn't_ help (the subscription is on _our inbox_, not theirs). Inbound events from a removed friend will still arrive via CloudKit until the friend stops publishing. Receiver-side filter on every inbound event: drop if sender isn't in active friends list. Documented as the source of truth.
- **Event ordering.** CloudKit's `___createTime` is server-assigned and not strictly monotonic across regions. We display events ordered by `emittedAt` (sender wall clock); CloudKit timestamps are used only for cursor pagination. Trust the sender's local clock; a sender with a wildly wrong clock just gets out-of-order events on receivers — no security impact.
- **Multi-account on same device.** If a user logs out of iCloud and into a different Apple ID, the in-memory friend identity is now stranded — it was tied to the previous Apple ID's iCloud Drive payload. Detection mirrors the existing `availabilityChange` handler; we re-run the iCloud Drive read which will produce a different `friendIdentity`.

## Alternatives considered

- **CloudKit Private DB + `CKShare`** — Apple's blessed sharing API, but `CKShare` ergonomics assume "share a document with N people" not "broadcast events to N peers." Each shared zone has fixed participants, share-by-share invite UX, and weaker E2EE guarantees (CloudKit private isn't E2EE unless the user has Advanced Data Protection on). Rejected for v1; revisit if the app-layer E2EE we describe here proves brittle.
- **CloudKit `CKSyncEngine`** — automatic conflict resolution, but only works on private/shared DBs. Public DB ops are still classic `CKModifyRecordsOperation` style. Doesn't apply.
- **iMessage-only "snapshot share"** — extends the existing `.witnesswork` file pattern. Zero CloudKit, zero NSE, zero subscriptions. But no real-time updates — the recipient has to manually import or the sender has to remember to re-share. Drops the "Julia just unlocked X" experience, which was the explicit goal.
- **Game Center friends + GKAchievement** — Apple does the heavy lifting, but the model is public-leaderboards-and-trophies, not E2EE message bus. Not E2EE. Branding mismatch with a ministry app. Rejected.
- **Own backend on Cloudflare Workers + D1 + APNs** — most flexible, supports cross-platform later, but introduces user-account identity, ops cost, APNs cert management, and a target for subpoenas. Explicitly off the table per goals.
- **MLS (Messaging Layer Security) over CloudKit** — group-key-agreement protocol with forward secrecy and post-compromise security. Overkill for friend-to-friend broadcast where the threat model already accepts iCloud-restore-plus-password-compromise as out of scope. Worth revisiting if we add real chat. For now: per-friendship session key derived from long-term ECDH is sufficient and ~100× simpler.
- **Signal Protocol** — same overkill argument as MLS.

## Open questions (to resolve before Phase 1)

1. **Crypto bridge or piggyback on `cloudkit-bridge`?** Encapsulation argues for a separate `crypto-bridge`; native code line-count argues for one combined module. _Recommendation: combined for v1, split if it grows past ~500 lines of Swift._
2. **Display name verification in pairing.** Today the only check is "did the inviteId match." Should we require the sender to also sign the invite payload with their Ed25519 key so the receiver verifies authenticity at acceptance time? _Recommendation: yes; trivial to add and closes the iMessage-MITM gap meaningfully._
3. **Per-friend mute / per-friend notification preferences.** Defer to Phase 5 (UI).
4. **Cross-app universal-link namespace.** `/c/*` is contacts; `/f/*` is friends. Future namespaces? Document an ad-hoc registry in `ww-proxy/README.md`.
5. **Should `friendIdentity` rotation be automatic on a schedule, or manual only?** _Recommendation: manual only for v1; rotation breaks all friendships._
