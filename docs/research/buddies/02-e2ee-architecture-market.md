# 02: How E2EE sharing and collaboration products are built, and what WitnessWork Buddies should do

Prepared 2026-09-23. Read-only research. Nothing in `/Users/levi/dev/witness-work` or `/tmp/ww-api` was changed.

**Confidence labels.**

- **[V]** I read it in a primary source during this session (Apple docs or the Platform Security Guide, vendor docs, source code, whitepaper, or registry metadata). Quotes are verbatim.
- **[S]** A reputable secondary source, or a strong signal from third-party source code.
- **[U]** Unverified: from background knowledge or inference. Treat it as a hypothesis.

**Coverage note.** Parallel research streams were lost when the session was interrupted, and the web-search budget ran out. The critical items were re-verified directly: CloudKit, notifications and CryptoKit, Excalidraw, Bitwarden, 1Password, Proton, Signal, WhatsApp, MLS library status, Keyhive, and the Jazz repo state. These were covered only from background knowledge and are marked **[U]**: tldraw sync, Figma multiplayer, Automerge, Evolu, secsync and p2panda, iMessage Contact Key Verification, and Cloudflare Durable Object pricing. These were **skipped**: Tuta calendar, Apple Fitness/Activity sharing, Find My, Health sharing, iCloud Keychain shared password groups, and Magic Wormhole.

---

## 0. TL;DR

1. **CloudKit does not give you E2EE by default. That includes `encryptedValues` and CKShare.**
   - Apple states [V]: "Third-party app data stored in iCloud is always encrypted in transit and on server. **When you turn on Advanced Data Protection**, third-party app data stored in iCloud Backup and CloudKit encrypted fields and assets are end-to-end encrypted." Source: [support.apple.com/102651](https://support.apple.com/en-us/102651), published 2026-01-05.
   - On sharing, the same page says [V]: "With standard data protection, iCloud content that you share with other people is not end-to-end encrypted." Shared content stays E2EE only "as long as **all participants** have Advanced Data Protection enabled." "Anyone with the link" sharing is never E2EE.
   - New UK users cannot turn on ADP at all [V] ([support.apple.com/122234](https://support.apple.com/en-us/122234)).
   - So the existing plan was **right** to reject CKShare for this reason. `encryptedValues` does not change that conclusion.
2. **The existing plan (Option A) has a bigger problem than CKShare did: its key storage.** It keeps the X25519 and Ed25519 private keys in the iCloud Drive sync payload.
   - Apple lists iCloud Drive under "available-after-authentication" service keys that "are stored in iCloud Hardware Security Modules… and can be accessed by some Apple services" [V] ([Platform Security Guide: iCloud encryption](https://support.apple.com/guide/security/icloud-encryption-sec3cac31735/web)).
   - For any user without ADP, Apple, or a legal order served on Apple, can obtain the keys. The plan's claim that "a subpoena to Apple yields no plaintext" is therefore false for most users.
   - **Fix:** keep identity keys in **iCloud Keychain**. Set `kSecAttrSynchronizable = true`. Synced items "can't be decrypted by any other devices or by Apple" [V] ([Secure keychain syncing](https://support.apple.com/guide/security/secure-keychain-syncing-sec0a319b35f/web)).
3. **The CloudKit public database is a poor encrypted bus.**
   - Apple states it "aren't encrypted" [V].
   - It is readable by every app user, even without an iCloud account [V].
   - Anyone signed into iCloud can create records by default [S]. Only the creator can change or delete a record [V].
   - Records expose the creator's user record name and timestamps [V].
   - Permissions are set per record type, not per record, so nothing can restrict reads to the intended recipient.
   - Result: the social graph is visible to Apple and to motivated app users, strangers can spam any recipient tag, and "remove buddy" cannot be enforced in transport.
4. **Recommendation: Option C.** Build a small **blind relay** on the Cloudflare stack you already run. Use Durable Object mailboxes, deposit capabilities, and your existing App Attest for abuse control. Put the E2EE in the app with CryptoKit HPKE (iOS 17+), store identity keys in iCloud Keychain, and send APNs `mutable-content` pushes with a generic fallback alert that a Notification Service Extension decrypts.
   - Put invite secrets in the **URL fragment**, and make redemption server-side single-use and time-limited (Excalidraw and Bitwarden pattern).
   - Removal is enforced by revoking capabilities at the relay, plus rotating epoch keys for anything shared one-to-many.
   - Leave room for territory groups: an ordered log of encrypted CRDT ops per group in a Durable Object, with epoch keys, and MLS later if needed.
   - Sending APNs directly from a Worker is proven. iTerm2's open-source push relay does exactly this with a generic `mutable-content` fallback [S].

---

## 1. Verified CloudKit facts (priority 1)

### 1.1 `CKRecord.encryptedValues`

These quotes come from the Apple docs for [CKRecord.encryptedValues](https://developer.apple.com/documentation/cloudkit/ckrecord/encryptedvalues) [V]:

- "CloudKit doesn't allow encryption on fields that already exist in your app's schema, **or on records that you store in the public database**."
- "CloudKit doesn't support indexes on encrypted fields." You cannot use encrypted fields in `CKQuery` predicates or sort descriptors.
- `CKAsset` is "encrypted by default". `Reference` "isn't encrypted so it remains available for server-side use."
- "CloudKit encrypts the fields' values on-device before saving them to iCloud, and decrypts the values only after fetching them from the server. **When you enable Advanced Data Protection**, the encryption keys are available exclusively to the record's owner and, if the user shares the record, that share's participants."

Key custody under standard data protection:

- [Platform Security Guide: iCloud encryption](https://support.apple.com/guide/security/icloud-encryption-sec3cac31735/web), published 2024-05-07 [V]:
  - A private database uses "a key hierarchy, rooted in an asymmetric key called a CloudKit Service key… all record keys are generated on the user's trusted device and wrapped to the appropriate key hierarchy."
  - Service keys come in two kinds. **End-to-end encrypted** keys are used only by the Apple services listed in 102651. **Available-after-authentication** keys, for services "such as Photos and iCloud Drive", are "stored in iCloud Hardware Security Modules in Apple data centers, and can be accessed by some Apple services."
- [Platform Security Guide: Advanced Data Protection](https://support.apple.com/guide/security/advanced-data-protection-for-icloud-sec973254c5f/web) [V]:
  - ADP deletes the available-after-authentication service keys from the HSMs.
  - "Advanced Data Protection also automatically protects CloudKit fields that third-party developers choose to mark as encrypted, and all CloudKit assets."
- [iCloud data security overview (102651)](https://support.apple.com/en-us/102651), 2026-01-05 [V]: "When you turn on Advanced Data Protection, third-party app data stored in iCloud Backup and CloudKit encrypted fields and assets are end-to-end encrypted."
- Conclusion: **without ADP, `encryptedValues` is encryption at rest with keys Apple can use.** It is not E2EE.

The WWDC21 wording is looser. [WWDC21 "What's new in CloudKit" (10086)](https://developer.apple.com/videos/play/wwdc2021/10086/) [V] said the feature "uses key material that is stored in the iCloud Keychain… compatible with CloudKit's sharing functionality, ensuring that only the users on the CKShare can decrypt." That talk predates ADP, which shipped in December 2022. The later, more specific documentation above supersedes it. Reconciling the two is my inference.

ADP availability:

- ADP is opt-in. It needs two-factor authentication, a passcode, and every device on iOS 16.2 or later [V].
- It "can no longer" be offered to new UK users [V]. See [support.apple.com/122234](https://support.apple.com/en-us/122234), dated 2025-09-22.
- Secondary sources report a second Apple legal challenge in August 2026 [S/U].
- Apple has not published an ADP adoption rate [U].

### 1.2 CKShare and shared zones

These come from [CKShare](https://developer.apple.com/documentation/cloudkit/ckshare), [Shared records](https://developer.apple.com/documentation/cloudkit/shared-records), and [CKShare.Participant](https://developer.apple.com/documentation/cloudkit/ckshare/participant) [V].

**Model and limits**

- Shareable records live in a **custom zone in the owner's private database**.
- You can share a whole zone with `CKShare(recordZoneID:)` on iOS 15+, or share a `parent` hierarchy.
- After a participant accepts, CloudKit creates a zone in the participant's shared database. That zone "provides a view into the owner's private database."
- "A record can take part in only a single share."
- "CloudKit limits the number of participants in a share to **100**, and each participant must have an active iCloud account."

**Private shares**

- The owner adds participants through `CKFetchShareParticipantsOperation` with a `LookupInfo`. A `LookupInfo` can be built from an "email address, phone number, **or user record ID**" [V] ([LookupInfo](https://developer.apple.com/documentation/cloudkit/ckuseridentity/lookupinfo-swift.class)).
- "A participant can't accept a private share unless the owner adds them first." On acceptance, CloudKit checks that the account "must match their participant details."
- The user-discoverability APIs were deprecated in iOS 17 as "No longer supported" [V]. `CKFetchShareParticipantsOperation` is not deprecated [V].
- Whether a lookup by user record ID alone works without discoverability in 2026 is **[U]**. It needs a spike.

**Link (public) shares**

- If `publicPermission` is "more permissive than none", "any user with the share's URL [can] join." Those users get the role `publicUser` [V].
- [removeParticipant(\_:)](<https://developer.apple.com/documentation/cloudkit/ckshare/removeparticipant(_:)>) [V]: "To modify the list of participants, a share's `publicPermission` must be `none`. You can't mix and match public and private users in the same share."
- Setting the permission back to `none` "removes all participants." **You cannot evict one buddy from a link share without evicting everyone.**

**Leaving and removal**

- A participant leaves by deleting the share from their shared database.
- The owner can call `removeParticipant`, or delete the share or root record.
- Whether CloudKit rotates keys cryptographically on removal is **not documented [U]**.

**E2EE of shared data** ([102651](https://support.apple.com/en-us/102651) [V])

- "With standard data protection, iCloud content that you share with other people is not end-to-end encrypted."
- ADP keeps shared content E2EE "as long as all participants have Advanced Data Protection enabled."
- Sharing "with 'anyone with the link'" does not support ADP: "encryption keys for the shared content are securely uploaded to Apple data centers."
- The Platform Security Guide's ADP page repeats this. With ADP everywhere, "Apple servers are used only to establish sharing but don't have access to the encryption keys." Anyone-with-a-link shares make "content available to Apple servers under standard data protection" [V].

**How participants get keys**

- Apple does not document the mechanism.
- On shared Notes, Apple says: "Shared notes still use the CloudKit encrypted data type… Metadata, such as the creation and modification dates, aren't encrypted. **CloudKit manages the process** by which participants can encrypt and decrypt each other's data" [V] ([Notes security](https://support.apple.com/guide/security/secure-features-in-the-notes-app-sec1782bcab1/web), 2024-12-19).
- WWDC21: "Behind the scenes, CloudKit establishes cryptographic access to the shared data for participants" [V].

**Participant identity visibility**

- Apple states: "To initiate sharing or collaboration, the names and Apple Accounts of participants are sent to Apple servers, and a title and representative thumbnail of the shared item may be used to show a preview" [V] (102651).
- `CKShare.Participant.userIdentity` carries `nameComponents` and `lookupInfo`. Exactly which fields each participant can see about the others is **[U]**.
- The share's `title` and `thumbnailImageData` system fields are stored under standard protection [V]. They must not contain sensitive data.

**Subscriptions and sync** [V]

- [CKDatabaseSubscription](https://developer.apple.com/documentation/cloudkit/ckdatabasesubscription) works only in the private and shared databases.
- [CKQuerySubscription](https://developer.apple.com/documentation/cloudkit/ckquerysubscription) works only in the public and private databases.
- [CKRecordZoneSubscription](https://developer.apple.com/documentation/cloudkit/ckrecordzonesubscription) works only in the private database.
- Apple warns: "Because the system coalesces notifications, don't rely on them for specific changes."
- [CKSyncEngine](https://developer.apple.com/documentation/cloudkit/cksyncengine-5sie5) needs iOS 17+ and supports the private and shared databases. Apple says "Don't use CKSyncEngine to sync your app's public database." Batches are limited to 250 records.

**Storage quota** [V]

- Private database data "counts toward the user's iCloud storage quota."
- The shared-database page says data "counts toward your app's iCloud storage quota." That wording is odd because the data lives in the owner's private database. I would assume the owner's quota [U].

### 1.3 CloudKit public database security model

**Encryption.** The Platform Security Guide says: "Public databases are globally shared, typically used for generic assets, **and aren't encrypted**" [V]. You cannot use `encryptedValues` there (see §1.1).

**Who can read** [V]

- [publicCloudDatabase](https://developer.apple.com/documentation/cloudkit/ckcontainer/publicclouddatabase): "available regardless of whether the user's device has an iCloud account. The contents of the public database are readable by all users of the app, and users have write access to the records… they create… you can assign roles to users and restrict access."
- [CKDatabase](https://developer.apple.com/documentation/cloudkit/ckdatabase): writing "requires an iCloud account… so it can identify the authors of any changes."

**Roles and permissions**

- [Designing with CloudKit](https://developer.apple.com/icloud/cloudkit/designing/) [V] describes role-based access control on the public database with three roles:
  - **World** means all users, authenticated or not.
  - **Authenticated** means users signed into iCloud.
  - **Creator** means the author of the record.
- Permissions are read, write, and create. They are assigned **per record type**.
- Defaults [S] ([rambo.codes, 2021](https://www.rambo.codes/posts/2021-12-06-using-cloudkit-for-content-hosting-and-feature-flags); [mjtsai, 2026-06-05](https://mjtsai.com/blog/2026/06/05/permissions-in-the-cloudkit-public-database/)):
  - World can read every record type, "even if they don't have an iCloud account".
  - Authenticated users "can create records of any type".
  - Creator can write their own records.
  - Custom roles can be assigned to specific user record IDs through the console.

**What this means for a mailbox pattern** (inferred from the facts above)

- Any signed-in user of any build of your app, including a modified one, can create a `FriendEvent` for any `recipient`.
- Reads are either World or Authenticated. Roles cannot express "only the recipient may read."
- Only the creator, or a role with write access, can delete. The recipient cannot delete spam or old events addressed to them.

**Metadata exposure**

- The CloudKit Web Services record dictionary includes `created` and `modified` fields. Each is `{timestamp, userRecordName, deviceID}` [V] ([Web Services reference, archived](https://developer.apple.com/library/archive/documentation/DataManagement/Conceptual/CloudKitWebServicesReference/Types.html)).
- The native `CKRecord.creatorUserRecordID` exposes the author's container-scoped user ID [V].
- Combine that with the plan's plaintext `recipient` and `senderHint` fingerprints and the world-readable `FriendIdentity` records, which map each fingerprint to its creator. Anyone who can query the database can rebuild the pseudonymous social graph.
- Apple can go further and map every node to an Apple Account, because subscriptions are stored per user with the recipient predicate.

**Quotas**

- Apple now only says "up to 1PB of storage for your app's public data" [V] ([CloudKit](https://developer.apple.com/icloud/cloudkit/)). Public-database data "counts toward your app's iCloud storage quota" [V].
- Apple stopped publishing the older per-user and requests-per-second tables around 2022. Limits now scale with active users and appear in the CloudKit Console under Telemetry → Usage [S] ([forum thread 715649](https://developer.apple.com/forums/thread/715649)).
- The plan's "50 MB/user/app counted against A's iCloud quota" is **not supported**. Public data counts against the developer's container quota, not the user's.

**Push payloads**

- [NotificationInfo.desiredKeys](https://developer.apple.com/documentation/cloudkit/cksubscription/notificationinfo-swift.class/desiredkeys) [V] allows at most 3 keys. The only allowed types are NSString, NSNumber, CLLocation, NSDate, and Reference. Strings over 100 characters "may" be truncated. **Ciphertext bytes cannot ride inside a CloudKit push.** The NSE must fetch the record.
- If `alertBody`, `soundName`, and `shouldBadge` are all unset, the push is sent at low priority and shows nothing [V].

---

## 2. Push-notification facts that apply to every option

**Notification Service Extension**

- An NSE runs only for **alert** pushes with `mutable-content: 1`. "You can't modify silent notifications" [V] ([UNNotificationServiceExtension](https://developer.apple.com/documentation/usernotifications/unnotificationserviceextension)).
- It has roughly 30 seconds. If it runs out, "the system displays the original contents" [V] ([Modifying content](https://developer.apple.com/documentation/usernotifications/modifying-content-in-newly-delivered-notifications)).
- Apple's own example for this API is "decrypt an encrypted data block."
- To **suppress** a push entirely, you need `com.apple.developer.usernotifications.filtering`. You must apply to Apple for it [V] ([docs](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.usernotifications.filtering)).
- Without that entitlement, every buddy push must display something, so the fallback alert text must be generic.

**Payload and delivery limits** [V]

- The APNs payload limit is **4 KB**. VoIP pushes allow 5 KB ([Generating a remote notification](https://developer.apple.com/documentation/usernotifications/generating-a-remote-notification)).
- Background pushes are low priority and throttled: "don't try to send more than two or three per hour" ([Background updates](https://developer.apple.com/documentation/usernotifications/pushing-background-updates-to-your-app)).
- Plan and calendar sync should therefore not depend on silent pushes. Fetch on foreground and background refresh instead.

**How others do it**

- **iMessage** [V] ([How iMessage sends and receives](https://support.apple.com/guide/security/how-imessage-sends-and-receives-messages-sec70e68c949/web)):
  - Messages are encrypted once per receiving device and "dispatched to the APNs for delivery."
  - Timestamp and APNs routing metadata are not encrypted.
  - Payloads over 4 or 16 KB are encrypted with a random AES-256 key and uploaded to iCloud. The key, URI, and hash travel inside the E2EE message.
  - Messages are stored for up to 30 days.
- **Signal-iOS** ships a `SignalNSE` target [V] ([repo](https://github.com/signalapp/Signal-iOS/tree/main/SignalNSE)). Its pushes are wake-ups; content is fetched and decrypted on the device [U detail].
- **iTerm2 PushRelay** is a Cloudflare Worker that calls `https://api.push.apple.com/3/device/<token>` with the global `fetch` [S] ([worker.js](https://github.com/gnachman/iTerm2/blob/master/Companion/PushRelay/src/worker.js)). Its code comments say:
  - "APNs requires HTTP/2. On Cloudflare the global `fetch` speaks it natively."
  - The "payload carries NO real content: just mutable-content + a generic fallback."
  - This is exactly the pattern recommended here. It shows APNs from Workers is feasible.

**CryptoKit availability** [V]

- `HPKE`: iOS 17.0+ ([docs](https://developer.apple.com/documentation/cryptokit/hpke)).
- X-Wing (ML-KEM-768 + X25519) HPKE suite, ML-KEM, and ML-DSA: iOS 26+ ([PQ guide page](https://support.apple.com/guide/security/quantum-secure-cryptography-apple-devices-secc7c82e533/web), 2026-01-28).
- `Curve25519.KeyAgreement`: iOS 13+.
- The app currently targets **iOS 16.4**, and the widget target is 17.0 (repo `ios/*.xcodeproj`). Buddies should require iOS 17, or fall back to X25519 + HKDF + ChaChaPoly by hand on 16.x.

**iCloud Keychain** [V]

- Third-party items sync only if the app sets `kSecAttrSynchronizable` ("by default, keychain items added by third-party apps don't sync").
- Synced items "can't be decrypted by any other devices or by Apple" ([Secure keychain syncing](https://support.apple.com/guide/security/secure-keychain-syncing-sec0a319b35f/web)).
- Since iOS 14, synchronizable items can include cryptographic keys. `…ThisDeviceOnly` accessibility is incompatible with syncing ([kSecAttrSynchronizable](https://developer.apple.com/documentation/security/ksecattrsynchronizable)).
- Syncing requires the user to have iCloud Keychain turned on [S].

---

## 3. Comparison of systems

| System                                 | Identity                                            | How a new member gets keys                                                                                                 | Multi-device                                                   | Removal and rotation                                                                               | Server sees                                                                                                        | Push                                         | Maturity and fit                                                                |
| -------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- | ------------------------------------------------------------------------------- |
| **Excalidraw**                         | None. The link is the capability.                   | 128-bit AES-GCM key in the URL **fragment**: `#room=<id>,<key>` [V]                                                        | n/a                                                            | None. You have to start a new room.                                                                | Room id, IP, timing, ciphertext                                                                                    | None                                         | Production. Good for one-time handoff; not usable as a long-term group key.     |
| **Bitwarden Send**                     | Sender account; the recipient needs none            | 128-bit secret in the fragment → HKDF → AES-256. The password is a server-side gate only [V].                              | n/a                                                            | Expiry, deletion, max access count [U for the latter two]                                          | Send id, ciphertext, access events                                                                                 | None                                         | Production. Separates server-enforced access from fragment-key confidentiality. |
| **1Password Psst!**                    | Sender account                                      | Link. Default expiry 7 days; can be one-view; can be limited to emails verified by one-time code [V]. Key-in-fragment [U]. | n/a                                                            | Expiry or one view. It is a snapshot copy [V].                                                     | Recipient emails, view counts, IPs [V]                                                                             | None                                         | Production. Good expiry and verification UX.                                    |
| **Proton Calendar**                    | Proton address keys                                 | Proton users receive the calendar key; the link option has the server decrypt [V]                                          | Account keys                                                   | [U]                                                                                                | **Event times and recurrence (signed, not encrypted)**. Title, description, location, attendees are encrypted [V]. | [U]                                          | Production. Shows calendar E2EE usually leaks times.                            |
| **Signal**                             | Account ACI plus devices                            | Pairwise sessions (X3DH/PQXDH). Group master key sent pairwise. **Group link carries the join secret** [V].                | Linked devices [U detail]                                      | Sender keys reset when membership changes [U]. Blocking rotates the profile key [V].               | Encrypted group state; sealed sender hides the sender [V]                                                          | Wake-up plus NSE fetch [V target / U detail] | Gold standard. Too heavy to rebuild alone.                                      |
| **WhatsApp**                           | Primary device plus companions                      | Pairwise sessions distribute Sender Keys [V]                                                                               | **Primary signs the device list**; companions linked by QR [V] | "Whenever a group member leaves, all group participants clear their Sender Key and start over" [V] | Group membership, fan-out metadata                                                                                 | [U]                                          | Production. Copy signed device lists and sender-key reset.                      |
| **iMessage**                           | Apple Identity Service directory of per-device keys | Directory lookup [V]                                                                                                       | Encrypt once per device [V]                                    | New keys on device changes [U]                                                                     | Routing metadata, timestamps [V]                                                                                   | Message rides inside the APNs push [V]       | Apple-only. Copy the big-attachment pattern.                                    |
| **MLS (RFC 9420)**                     | Credentials plus Authentication Service             | KeyPackages (pre-keys) plus Welcome                                                                                        | Each device is a leaf                                          | Commit produces a new epoch: forward secrecy and post-compromise security                          | Delivery Service orders commits                                                                                    | App-defined                                  | Libraries are mature (see §4.7). Overkill for pairs.                            |
| **Keyhive / BeeKEM**                   | Capability-based                                    | Concurrent TreeKEM variant                                                                                                 | Per device                                                     | Revocation by capability                                                                           | Encrypted CRDT sync                                                                                                | n/a                                          | **"Pre-alpha… DO NOT use… in production"** [V]                                  |
| **Jazz** (2026 main branch)            | Accounts                                            | "Invite codes are bearer capabilities" redeemed on the server [V]                                                          | [U]                                                            | Server row policies [V]                                                                            | Appears to evaluate rows on the server [V/U]                                                                       | [U]                                          | In flux. Do not depend on it for E2EE.                                          |
| **CloudKit CKShare + encryptedValues** | Apple Account                                       | Hidden inside CloudKit; E2EE only if all participants use ADP [V]                                                          | Excellent                                                      | Apple's ACL removes the participant; rotation undocumented [U]                                     | Participant names and Apple Accounts, titles, dates; content unless everyone has ADP [V]                           | Database subscription                        | Production. **Fails the E2EE requirement alone.**                               |
| **CloudKit public DB**                 | Container user record ID                            | App-layer only                                                                                                             | App-layer                                                      | None in transport                                                                                  | Everything outside the app-layer ciphertext, visible to all app users [V]                                          | Query subscription; NSE must fetch [V]       | Wrong tool for per-recipient mail.                                              |
| tldraw sync / Figma                    | Accounts                                            | n/a (not E2EE)                                                                                                             | n/a                                                            | n/a                                                                                                | Plaintext; server-authoritative                                                                                    | n/a                                          | [U] Architecture reference only: one Durable Object per room.                   |

---

## 4. Per-system notes

### 4.1 Excalidraw [V, source code on `master`]

**Link format and cipher**

- The collaboration link regex is `/^#room=([a-zA-Z0-9_-]+),([a-zA-Z0-9_-]+)$/`. Both the room ID and the room key live in the fragment ([excalidraw-app/data/index.ts](https://github.com/excalidraw/excalidraw/blob/master/excalidraw-app/data/index.ts)).
- The key is AES-GCM with `ENCRYPTION_KEY_BITS = 128` ([packages/common/src/constants.ts](https://github.com/excalidraw/excalidraw/blob/master/packages/common/src/constants.ts)). It is serialized as the JWK `k` value.
- Each message gets a fresh 12-byte random IV ([packages/excalidraw/data/encryption.ts](https://github.com/excalidraw/excalidraw/blob/master/packages/excalidraw/data/encryption.ts)).

**Storage and share links**

- Room persistence goes to Firestore as `{ciphertext, iv}`. Files go to Firebase Storage, encrypted ([firebase.ts](https://github.com/excalidraw/excalidraw/blob/master/excalidraw-app/data/firebase.ts)).
- Export links use `url.hash = json=<id>,<key>`. The source comment reads: "We need to store the key (and less importantly the id) as hash instead…"
- The relay is a Socket.IO room server that only sees ciphertext broadcasts [U; not fetched].

**Limitations**

- The capability is bearer-only and never expires.
- There is no member list and no revocation. Rotating means making a new room.
- The server sees room IDs, IPs, sizes, and timing.

**Lesson.** A fragment-carried symmetric key is the simplest E2EE handoff. Use it for **one-time invites**, not as the long-lived buddy or group key.

### 4.2 Bitwarden Send [V] ([help: Send encryption](https://bitwarden.com/help/send-encryption/))

**Encryption and link**

- "A new 128-bit secret key is generated… Using HKDF-SHA256, a 512-bit encryption key is derived… used to AES-256 encrypt the send, including its file/text data and metadata."
- The link format is `https://vault.bitwarden.com/#/send/<send_id>/<encryption_key>`.
- "The anchor/fragment/hash is not sent to the server." This matches [RFC 3986 §3.5](https://www.rfc-editor.org/rfc/rfc3986#section-3.5).

**Access controls**

- "Any password used to protect a Send is not involved in the encryption… Passwords are purely an authentication method."
- Senders can require email verification for designated recipients.
- Senders can send the key over a separate channel.

**Lesson.** Pair a **fragment key** for confidentiality with **server-enforced** expiry, single use, and optional verification for access control.

### 4.3 1Password "Psst!" [V] ([blog](https://blog.1password.com/psst-item-sharing/), [support](https://support.1password.com/share-items/))

- Link expiry defaults to 7 days. Options are 30 days, 14 days, 1 day, 1 hour, or "after a single person views it."
- Access is either "anyone who has the link" or "only the people whose email addresses I enter." The latter requires "a one-time verification code" sent by email.
- The recipient gets a **snapshot copy**.
- The sharer can see recipients' emails, view counts, and "the IP addresses of the recipients who viewed the item." That is server-visible metadata.
- The key-in-fragment construction is described in the 1Password white paper [U; not fetched].

**Lesson.** Expiry, one-view, and recipient verification are standard UX. Be honest about the metadata this creates.

### 4.4 Proton Calendar [V]

**Which fields are encrypted.** Proton's open-source WebClients code lists the fields ([constants.ts](https://github.com/ProtonMail/WebClients/blob/main/packages/shared/lib/calendar/constants.ts)):

- `SHARED_SIGNED_FIELDS` include `uid, dtstamp, dtstart, dtend, recurrence-id, rrule…`. These are signed but readable by the server.
- `SHARED_ENCRYPTED_FIELDS` include `created, description, summary, location…`.
- `ATTENDEES_ENCRYPTED_FIELDS` is `['uid','attendee']`.
- `CALENDAR_ENCRYPTED_FIELDS` is `['uid','dtstamp','comment']`.
- **So the server sees event times and recurrence.** Reading these constant names as "server-readable" is my interpretation of the naming.

**Sharing** ([Share via link](https://proton.me/support/share-calendar-via-link))

- Sharing with Proton users: "you share the calendar encryption key with individual Proton users."
- Sharing by link: "A URL is generated that contains the key required to decrypt the calendar. When the URL is used, Proton Mail has access to this key to decrypt the calendar."
- So Proton's link sharing uses server-side decryption, like Apple's "anyone with the link." It is not the Excalidraw fragment model.

**Not verified:** member removal and rotation, and iOS push handling.

**Lesson.** Buddies has no CalDAV interoperability constraint, so it can encrypt **whole plan objects, including times**. Keep that advantage.

### 4.5 Signal [V blog text; dates U]

**Sealed sender** ([blog, 2018](https://signal.org/blog/sealed-sender/))

- The sender identity lives inside the encrypted envelope, backed by a short-lived "sender certificate."
- To stop abuse, "clients derive a 96-bit delivery token from their profile key and register it with the service. The service requires clients to prove knowledge of the delivery token… to transmit 'sealed sender' messages."
- "Blocking a user who has access to a profile key will trigger a profile key rotation."

**Private Group System** ([blog, 2019](https://signal.org/blog/signal-private-group-system/))

- Group state is encrypted under a shared group key and stored on the server.
- Anonymous credentials (zkgroup) let the server enforce access control without seeing membership.

**Group links** ([blog](https://signal.org/blog/group-links/))

- "The information needed to join the group is embedded in the link itself and only a group's members can access the link, not Signal."
- Admins can require approval and can reset the link.
- The link encodes the group master key plus an invite password in the fragment [U detail].

**Lessons for Buddies**

- Deposit capabilities, like delivery tokens, prevent spam without revealing the sender.
- Rotate a one-to-many key (the profile-key analog) when someone is removed or blocked.
- Links carry a secret together with a server-checked password.

### 4.6 WhatsApp [V] ([Security Whitepaper v9, updated 2026-02-25](https://www.whatsapp.com/security/WhatsApp-Security-Whitepaper.pdf))

**Multi-device**

- The primary device links companions by QR code. An HMAC key travels in the QR.
- The primary signs an "Account Signature" and a "Signed Device List" with the prefix `0x0602`, and re-signs the list whenever a device is removed.

**Groups**

- Sender Keys are distributed to "each member device of the group, using the pairwise encrypted sessions."
- The server fans out a single ciphertext. The hash ratchet provides forward secrecy.
- "**Whenever a group member leaves, all group participants clear their Sender Key and start over.**"

**Not covered by v9.** Version 9 has no text on invite links or key transparency (zero keyword hits) [V absence]. The Auditable Key Directory rollout in 2023 is [S/U].

### 4.7 MLS [V for library metadata]

**Protocol.** [RFC 9420](https://www.rfc-editor.org/rfc/rfc9420) (2023) uses TreeKEM epochs:

- KeyPackages act as pre-keys, and a Welcome message brings a new member in.
- A Commit that adds or removes members moves the group to a new epoch. That gives forward secrecy and post-compromise security.
- A Delivery Service must **order Commits** per group.

**Library status** (checked 2026-09)

- **OpenMLS** v0.9.0, released 2026-08-25.
- **Wire core-crypto** v10.5.3, released 2026-09-23. It is Rust with Swift bindings and runs Wire in production [U for production use].
- **ts-mls** 1.6.4 on npm, published 2026-08-28. It is pure TypeScript.
- **AWS mls-rs** includes `mls-rs-uniffi` 0.13.0 ("An UniFFI-compatible implementation of Messaging Layer Security") and **`mls-rs-crypto-cryptokit` 0.11.0 ("CryptoKit based CryptoProvider for mls-rs")**. It has no GitHub releases, so you would track crates.io and git.

**iOS and React Native options today**

- Build `mls-rs` + UniFFI + the CryptoKit provider into an XCFramework and wrap it in an Expo module. This is feasible [U effort].
- Or run ts-mls under Hermes. That needs WebCrypto or noble polyfills [U].

**Where the Delivery Service would live.** A Durable Object per group is a natural fit because it processes requests one at a time.

**Verdict.** MLS is not worth it for pairs. Keep it as an upgrade path for territory groups.

### 4.8 Keyhive / BeeKEM [V] ([repo README](https://github.com/inkandswitch/keyhive))

- The README says it opens "the pre-alpha code" and that "`beekem`: BeeKEM, a concurrent TreeKEM variant for continuous group key agreement."
- It warns: "**DO NOT use this release in production applications**… The code has not had a security audit."
- **Lesson.** Useful ideas for multi-writer CRDT groups: capabilities, and key agreement that tolerates concurrent changes. It is not a dependency to take on.

### 4.9 Jazz [V repo contents; interpretation U]

**What main looks like now.** In September 2026, `garden-co/jazz` main has docs for tables and **server-evaluated row policies** such as `allowRead`, `allowInsert`, and `allowDelete`, plus session claims:

- [permissions.mdx](https://github.com/garden-co/jazz/blob/main/docs/content/docs/auth/permissions.mdx)
- [group-permissions.mdx](https://github.com/garden-co/jazz/blob/main/docs/content/docs/recipes/access-control/group-permissions.mdx), which defines reader, writer, and admin roles through a members table.

**Invites.** The invite example says: "Invite codes are bearer capabilities. They never sync back down to a client," and they are redeemed through a server route ([invite-snippets.ts](https://github.com/garden-co/jazz/blob/main/examples/docs/todo-server-ts/src/invite-snippets.ts)).

**The classic model is not on main.** Classic Jazz (cojson) worked like this [U, background knowledge]:

- Group read keys were sealed to each member's sealer key.
- `createInviteLink` put an invite secret in the URL fragment.
- `removeMember` rotated the read key and revealed it only to remaining members.

**Lesson.** The classic pattern is exactly what Buddies needs for plan and territory keys. Implement it yourself rather than depending on a framework in flux.

### 4.10 Not re-verified this session [U]

- **Automerge:** sync servers relay plaintext and there is no built-in E2EE. People add E2EE with protocols such as secsync.
- **Evolu:** E2EE SQLite with a relay and an owner mnemonic. Multi-user sharing is limited.
- **tldraw sync:** one Cloudflare Durable Object per room, server-authoritative, snapshots in R2.
- **Figma multiplayer (2019 blog):** server-authoritative, last-writer-wins per property, no OT.
- **Architecture lesson from all four:** "one Durable Object per room" is the canonical Cloudflare pattern. E2EE turns that Durable Object into an **ordered log of ciphertext**, and clients do the merging.

---

## 5. Patterns that fit a 2–6 person, iOS-only, solo-developer app with no accounts

1. **Keep confidentiality and access control separate.**
   - A fragment secret or HPKE provides confidentiality.
   - Server-side capabilities, expiry, single use, and App Attest provide access control and abuse prevention.
   - Examples: Bitwarden, Signal delivery tokens, 1Password.
2. **Invites carry the key in the fragment and are redeemed once on the server.** Put nothing secret in the URL path. Link-preview fetches and web fallbacks send the path to your server; the fragment never leaves the device (RFC 3986 §3.5).
3. **Use per-device keys under a user identity key that signs the device list.**
   - This is WhatsApp's model; iMessage uses a similar per-device directory.
   - Sync the user identity key through iCloud Keychain, which is E2EE by default, not iCloud Drive, which is not.
4. **Share one-to-many content with epoch keys.**
   - Plans and award feeds use a per-user "broadcast key", like Signal's profile key.
   - On removal, rotate the key and send it only to the remaining buddies (WhatsApp sender-key reset).
5. **Send one-to-one content only to the recipient's devices.** Appointment invites containing householder data should be encrypted to the invited buddy's devices only and should expire.
6. **Push: generic alert, `mutable-content`, NSE decrypts.** Keep the ciphertext under 4 KB inside the push, or fetch it. Apply for the filtering entitlement so control messages can be silent.
7. **The server is a dumb ordered log.** A Durable Object per mailbox now, and per group later. Clients merge CRDT ops; the server never needs plaintext.
8. **Minimize metadata. For this population it matters.**
   - Jehovah's Witnesses have been banned as "extremist" in Russia since 2017 and face criminal prosecution [S] ([Wikipedia](https://en.wikipedia.org/wiki/Persecution_of_Jehovah%27s_Witnesses_in_Russia)).
   - Who ministers with whom, plus follow-up visits to householders, is sensitive even without content.
   - Prefer designs where no single provider holds a social graph tied to real identities.

---

## 6. Candidate designs

| Criterion                              | **A: CloudKit public DB bus (existing plan)**                                                                                                                                        | **B: CKShare + encryptedValues**                                                                   | **C: Cloudflare blind relay + app-layer E2EE**                                                                                                                                   | **D1: CKShare as transport + app-layer E2EE**                                                 |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Content E2EE                           | App-layer AEAD, **but keys sit in iCloud Drive, which Apple can reach without ADP** → not E2EE against Apple for most users. Fixable by moving keys to iCloud Keychain.              | **No**, unless every participant has ADP. Never for link shares. [V]                               | **Yes.** Keys only on devices and in iCloud Keychain.                                                                                                                            | Yes, from the app layer.                                                                      |
| Metadata                               | **Worst.** Social graph among pseudonyms visible to any app user; Apple can map it to Apple Accounts. Records live forever unless the sender deletes them.                           | Apple sees participants' names and Apple Accounts, titles, and dates [V]. Other users see nothing. | Operator and Cloudflare see mailbox IDs, IPs, timing, sizes, App Attest key IDs, and APNs tokens. No names or graph unless deliberately logged. APNs sees push timing.           | Apple sees participants' real Apple identities and the sharing graph.                         |
| Remove a buddy: crypto                 | Static-static ECDH key never rotates; no forward secrecy or post-compromise security.                                                                                                | Undocumented [U].                                                                                  | Delete pair keys; rotate the broadcast epoch key; later, a new group epoch.                                                                                                      | Rotate the app-layer epoch keys.                                                              |
| Remove a buddy: transport              | **Not enforceable.** Anyone can keep writing to your tag, and you cannot delete their records.                                                                                       | Enforced by Apple's ACL for private shares. Link shares cannot evict one person [V].               | **Enforced.** Revoke the ex-buddy's deposit capability; their deposits are rejected.                                                                                             | Enforced by Apple for private shares.                                                         |
| Multi-device                           | Synced keys, after moving them to the keychain.                                                                                                                                      | Excellent, through the Apple account.                                                              | Per-device HPKE keys plus a signed device list; identity key in iCloud Keychain.                                                                                                 | Excellent.                                                                                    |
| Push privacy                           | Query-subscription alert with generic text; NSE must fetch because desiredKeys cannot carry bytes [V].                                                                               | Database subscription; coalesced [V].                                                              | **Best.** Worker sends a `mutable-content` alert with ciphertext ≤4 KB and a generic fallback; NSE decrypts locally; no fetch needed.                                            | Database subscription plus NSE fetch.                                                         |
| Abuse resistance                       | **Poor.** Any signed-in user can write to any `recipient`; spam also consumes your public quota.                                                                                     | Strong. Only participants can write.                                                               | Strong. App Attest, deposit capabilities, per-key rate limits, mailbox quotas.                                                                                                   | Strong.                                                                                       |
| Path to ≤10-person multi-writer groups | Append-only op records per writer, but world-readable ciphertext and membership edges.                                                                                               | Natural multi-writer with CKSyncEngine, but owner-centric and not E2EE.                            | Durable Object per group as an ordered encrypted CRDT log, epoch keys, and MLS later.                                                                                            | Owner-centric zone, app-layer encrypted CRDT ops, CKSyncEngine.                               |
| Solo-dev complexity                    | Medium. Schema deploys, public-DB quirks, NSE plus CloudKit fetch, no CKSyncEngine.                                                                                                  | Medium to high. Sharing edge cases and participant lookup friction.                                | Medium to high. About 600–1,000 lines of Worker code, a Swift crypto module, and an NSE, but no Apple-account coupling, and you already run App Attest, Durable Objects, and KV. | High. You keep both CloudKit's complexity and your own crypto.                                |
| **Verdict**                            | **Reject as designed.** Salvageable only with keychain keys, rotating opaque tags, no FriendIdentity records, and client-side filtering. Still leaks the graph and cannot stop spam. | **Reject.** Fails the hard E2EE requirement.                                                       | **Recommend.**                                                                                                                                                                   | Fallback only if you forbid running a server. It hands Apple a graph tied to real identities. |

### Why C, and answers to the old plan's objections to "own backend"

- **"Introduces user-account identity."** You already have per-install identity through App Attest and the `AppAttestIdentity` Durable Object in ww-proxy. Buddies needs no accounts. Mailboxes and capabilities are random identifiers.
- **"APNs certificate management."** Token-based `.p8` authentication does not expire yearly [U]. A Worker can call APNs over HTTP/2 [S].
- **"Subpoena target."** A blind relay with short retention and no logs holds only ciphertext and routing data. That is less than Apple holds under A, B, or D1.
- **Cost.** At this scale (thousands of users, tens of messages per user per month), Durable Object request and storage charges should be single-digit dollars per month on Workers Paid [U; pricing not re-verified].

---

## 7. Recommended cryptographic design (Option C)

**Primitives.** Everything uses CryptoKit through one Expo native module shared with the NSE: Ed25519, X25519, HKDF-SHA256, ChaChaPoly, HPKE `Curve25519_SHA256_ChachaPoly` (iOS 17+), and an optional X-Wing suite on iOS 26+.

### 7.1 Key hierarchy

**User identity key (UIK)**

- Ed25519, one per user.
- Stored in **iCloud Keychain**: `kSecAttrSynchronizable = true`, `kSecAttrAccessibleAfterFirstUnlock`, in a keychain access group shared with the NSE.
- It signs device lists, invite and accept transcripts, and control messages.
- **Safety code:** SHA-256 over both UIK public keys, sorted, shown as words or a QR code for optional in-person verification.
- **No iCloud Keychain:** Buddies works on a single device, or new devices link through an in-app QR flow like WhatsApp companions.

**Device keys (DK)**

- One X25519 HPKE recipient key per device, stored `…AfterFirstUnlockThisDeviceOnly` so the NSE can decrypt after first unlock.
- Also a device auth key for relay administration.
- Rotate the DK about monthly and publish the new one. Old keys are deleted after a grace period. This bounds exposure if a device key is compromised: a prekey-style forward-secrecy window.

**Signed device list**

- Contents: `{userFp, devices:[{deviceId, dkPub, mailboxId}], version}`, signed by the UIK.
- Sent to every buddy inside E2EE control messages. Buddies reject lists whose version goes backwards.

**Broadcast epoch key (BK_e)**

- A 32-byte random key per user and epoch. It encrypts the user's "plan snapshot" and activity feed blobs, which are one-to-many content.
- Sent to each buddy's devices through pairwise envelopes.
- **Rotated whenever a buddy is removed.** This is the Signal profile-key and WhatsApp sender-key-reset pattern.

**Pair capabilities**

- Each direction of each buddy pair gets a random 128-bit **deposit token**, registered in the recipient's device mailboxes.
- Tokens are handed over only inside E2EE messages. Revoking one token revokes that buddy.

### 7.2 Invite handoff

1. A creates `inviteId` (128 bits) and `S` (256-bit secret). A derives `K_inv = HKDF(S, "ww-buddy-invite-v1")`.
2. A sends the relay `{inviteId, verifier = HKDF(S,"verifier"), expiresAt ≤ 72h, singleUse, sealed = AEAD_K_inv(A.UIK_pub, A.deviceList, A.displayName, A.replyDepositToken)}`. The request is gated by App Attest and rate-limited.
3. The link is `https://ww-proxy.leviwilkerson.com/b/<inviteId>#<base64url(S)>`. The secret is in the fragment only. The web fallback page must not echo or log the fragment.
4. B opens the link. The app fetches `sealed` by `inviteId`, decrypts it, and shows "Add ⟨name⟩ as a buddy?" with A's safety code.
5. B accepts. B HPKE-seals `{B.UIK_pub, B.deviceList, B.displayName, B.depositToken_for_A, BK_current}` to A's devices, and signs it with B's UIK.
6. B presents `HMAC(verifier, transcript)` to redeem the invite. The relay checks it, marks the invite consumed, and deposits the sealed accept in A's mailbox.
7. A's device verifies the signature and the proof of possession, then **asks A to confirm**. This keeps consent mutual, and the prompt shows B's display name and safety code.
8. On confirmation, A sends its own `depositToken_for_B` and `BK_current`.

Threats covered and not covered:

- If the link leaks before B uses it, an attacker could redeem it. Mitigations: short expiry, single use, A's explicit confirmation, and optional in-person safety-code comparison.
- The relay sees only `inviteId`, sizes, and timing.

### 7.3 Envelope, format v1

The outer layer is visible to the relay. Everything inside is encrypted.

```
Outer (relay-visible):
  v=1 | mailboxId | depositToken | paddedSize (512B/1K/2K/4K buckets)

Body (per recipient device):
  hpke_enc (32B) | AEAD_HPKE(info="ww-buddies-v1"|deviceId, aad=outerHeader, plaintext=Inner)

Inner:
  { kind: event | planSnapshot | apptInvite | control | groupOp,
    senderUserFp, senderDeviceId, sentAt, msgId (random 128-bit),
    body: (small JSON)  OR  { blobUrl, blobKey, blobSha256 },   // iMessage-attachment pattern
    sig: Ed25519(UIK, H(kind|senderFp|recipientDeviceId|sentAt|msgId|body)) }
```

Receiver checks:

- Verify `sig` against the stored UIK and device list.
- Drop duplicate `msgId`s. Drop messages whose `sentAt` is outside the allowed window.
- Drop messages from buddies who are not active.

The sender's identity exists **only inside** the ciphertext. That makes this sealed-sender-lite: the relay authorizes the deposit by token, not by who sent it.

### 7.4 Relay (Durable Objects)

**One Durable Object per device mailbox**

- Holds `{apnsToken, deviceAuthPub, depositTokens[], queue}`.
- Accepts a deposit only if the App Attest assertion checks out and the deposit token is on the list.
- Rate limits and quotas apply per attested key and per token.
- Messages are deleted on acknowledgment, or by an alarm after 30 days at most.
- Nothing is logged except error counts.

**Pushes**

- An APNs alert with `mutable-content: 1`.
- A localized generic fallback such as "New buddy activity", which follows the no-magic-word copy rule.
- `apns-collapse-id` set per mailbox.
- The envelope itself when it is ≤ ~3 KB after base64; otherwise a fetch hint.

**NSE**

1. Load the DK from the shared keychain group.
2. Decrypt and verify.
3. Rewrite the title and body.
4. Write the result to the App Group for the main app.
5. On any failure, keep the generic text.
6. With the filtering entitlement, suppress control, plan, and removed-buddy messages.

**Blobs** such as plan snapshots and future territory snapshots

- A content-addressed encrypted blob in the Durable Object or R2.
- Encrypted with `BK_e`, or a group epoch key, through a random per-blob key.
- Fetched when the app comes to the foreground or runs background refresh.

### 7.5 Ending a buddy relationship (either side)

1. Send a signed `control:end` message. This is best effort.
2. **Revoke the ex-buddy's deposit token** in all your device mailboxes. Revocation is enforced from then on.
3. Delete the pair state and the ex-buddy's cached plans and appointment invites.
4. **Rotate `BK`** and send the new key to the remaining buddies. The ex-buddy cannot read future plan snapshots.

The ex-buddy keeps whatever they already decrypted. Signal, WhatsApp, and 1Password have the same property. Say so in the UI.

### 7.6 Appointment invites (third-party data)

- Minimal fields only.
- Encrypted solely to the invited buddy's devices.
- `expiresAt` equals the appointment date plus N days, after which both sides delete it.
- Nothing is imported into the buddy's contacts without an explicit action.
- The relay sees nothing beyond a message landing in a mailbox.

### 7.7 Future territory groups (<10 people, multi-writer)

**Storage and ordering**

- A **Durable Object per group** holds the member capability list and an append-only, server-ordered log of `groupOp` ciphertexts, plus periodic encrypted snapshots.
- Clients merge through a CRDT: an LWW map per contact, or Automerge or Yjs later [U].

**Keys**

- Group epoch key `GK_e`. Any admin rotates it on add or remove.
- The new key is sealed to each remaining member device through the pairwise envelopes.
- Removal also revokes the member's capability at the Durable Object.

**Upgrade path.** Move to MLS (mls-rs + UniFFI + CryptoKit provider, or ts-mls) if groups grow or post-compromise security per message becomes a requirement. The Durable Object already provides the Commit ordering MLS needs.

### 7.8 Fixes to carry over even if Option A is kept

1. Move private keys from the iCloud Drive payload to iCloud Keychain.
2. Replace the plaintext `recipient` and `senderHint` fingerprints with rotating per-pair tags, such as `HMAC(pairKey, epochDay)`.
3. Drop the world-readable `FriendIdentity` records.
4. Add ephemeral or HPKE keys instead of a static session key.
5. Put invite data in the fragment and sign invites.
6. Correct the quota claim: public data counts against the developer's quota.
7. Accept that the NSE must fetch, because CloudKit pushes cannot carry bytes.
8. Accept that removal cannot be enforced server-side.
9. **Separate issue:** the existing `/c/<payload>` contact-share links put householder data in the URL **path** (`/tmp/ww-api/src/contactLink.ts`). Paths reach Cloudflare whenever a link preview or web fallback is fetched, and prod observability has `logs.persist = true` in `wrangler.toml`. That data may be logged [U]. Consider moving it to the fragment.

---

## 8. Unverified claims and open spikes

**CloudKit**

- Whether CloudKit rotates share keys when a participant is removed.
- Exactly which participant identity fields other participants can see.
- Whether `LookupInfo(userRecordID:)` works for private shares without the deprecated discoverability permission.
- Whether the shared-database quota is charged to the owner.
- ADP adoption rate. Status of Apple's August 2026 UK challenge (secondary only).

**Keychain.** Syncing requires the user's iCloud Keychain toggle to be on [S]. Whether the NSE can read `AfterFirstUnlock` items in a shared access group is standard practice but not re-verified [U].

**Cloudflare and APNs**

- Durable Object pricing and limits were not re-verified.
- APNs over HTTP/2 from Workers is supported by strong secondary evidence (iTerm2 source comment), not Cloudflare documentation.
- `.p8` token keys not expiring [U].

**Other systems**

- Signal: link contents, sender-key rotation details, and blog dates.
- WhatsApp: invite links being server-issued codes, and key transparency (AKD, 2023).
- 1Password: the key-in-fragment construction.
- Bitwarden: max access count and deletion-date features were not in the page I fetched.
- Proton: rotation when a member is removed, and iOS push handling.
- Jazz: whether E2EE still exists in the 2026 architecture.
- Wire: that core-crypto runs Wire in production.
- MLS: the effort to build mls-rs for iOS.
- Automerge, Evolu, secsync, p2panda, tldraw, and Figma details (§4.10).

**Skipped entirely:** Tuta calendar, Apple Fitness/Activity sharing, Find My, Health sharing, iCloud Keychain shared password groups, Magic Wormhole.
