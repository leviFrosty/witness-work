# 04 — WitnessWork Buddies: identity, invite protocol, relay authorization, abuse prevention, privacy

Status: research and design proposal, 2026-09-23. Scope: authentication, invite links, server authorization, abuse and safety controls, third-party (householder) data, key storage and recovery. Transport details (relay vs CloudKit, sync schema, UI) belong to sibling docs; this doc covers what those designs must satisfy for security.

**This is not legal advice.** Legal and regulatory items below are risk flags for the product owner to take to qualified counsel.

Tags used: **[V]** means verified this session against a primary source or code (URL or path given). **[UNVERIFIED]** means from prior knowledge or a source that could not be retrieved. Section 13 lists every unverified claim.

---

## 0. Executive summary

1. **Identity.** Use one **per-person Buddies identity** (Ed25519 signing key and X25519 DH key) stored in **iCloud Keychain** (`kSecAttrSynchronizable`), plus a random per-person **relay root secret**. Do not use the iCloud Drive payload the prior plan proposed. Under standard data protection, iCloud Drive keys are held by Apple, and iCloud Sync is Supporter-gated. iCloud Keychain is end-to-end encrypted by default [V]. Keep Buddies identifiers **unlinked** from the install UUID, the account id, and the RevenueCat id. Each device gets a separate random Buddies device credential with its own App Attest key.
2. **No Sign in with Apple** is needed. Guideline 4.8 only applies when a third-party or social login is used [V]. The relay holds only a **pseudonymous relay account** (a public key, push tokens, and counters). To remove any ambiguity under 5.1.1(v), ship an in-app **"Delete my Buddies data"** that meets Apple's account-deletion bar [V].
3. **Invite link.** Use `https://ww-proxy.leviwilkerson.com/b#1<22-char secret>`. The secret lives **only in the fragment** and the path carries **no id**. The link is single-use, expires by default after **72 h** (max 7 days), and points to a relay-held blob encrypted under a key derived from the fragment (the Bitwarden Send and Excalidraw pattern [V]). The claimant proves knowledge of the secret to the relay (hashed claim secret) and to the inviter (HMAC tag), in the style of Keybase Seitan [UNVERIFIED]. The inviter then gives **explicit one-tap confirmation** after seeing the claimant's name and a **6-digit safety code** built with **commit–reveal**, so a 6-digit code resists grinding. An in-app QR scan in person counts as "verified in person".
4. **Relay authorization.** Reuse the existing App Attest v2 lifecycle **only for "front-door" operations**: device enrollment, account creation, invite create/fetch/claim. Steady-state traffic is authorized by **Ed25519-signed requests**:
   - a per-direction, per-relationship **writer key** derived from the shared root key, and
   - an **owner key** derived from the owner's private relay root secret, which a buddy cannot derive.

   Revocation is a mailbox delete. After that, the ex-buddy's writes return 410 and **no push can be triggered**. The relay stores **no plaintext social graph at rest**, though traffic metadata can still reveal edges (see §6.6).

5. **Pre-existing leak found and confirmed.** Contact-share links put the whole contact (including visit notes) gzip+base64url-encoded **in the URL path**. iMessage builds link previews **on the sender's device** [V], and the fallback page is designed for that. So ww-proxy does receive the path, and Sentry is configured with `tracesSampleRate: 1.0` and `sendDefaultPii: true`. The SDK records `url.full` and path-based transaction names [V], so every hit ships the payload to Sentry. The prior plan's claim that "ww-proxy never sees the link payload" is **false**. Fix this independently of Buddies (§1.3).
6. **Safety defaults.**
   - Share **coarse** plans only: day and day-part, no location, no notes, no hours.
   - No presence, read receipts, or live location.
   - Visible "shared with" indicators and a reminder every 30 days.
   - **One-tap "Stop sharing with everyone"**.
   - Connections end **quietly**, with no push to the other party.
   - After ending, a 30-day re-invite cooldown; block is indefinite.
   - Concrete limits are in §8.1.
7. **Householder data.** Follow-up invitations carry special-category-adjacent data (religious interest). Share the **minimum**: first name, location, time, and an optional short topic. It **auto-expires 24 h after the visit**, is revocable, and has no forward or export actions in the UI. Add in-app guidance. GDPR Art. 9 [V] and CJEU C-25/17 [holdings UNVERIFIED verbatim] make this a real risk area for EU users.

---

## 1. Grounding: what the codebase does today

### 1.1 Identity and auth building blocks (read in code)

| Layer           | Where                                                    | Properties                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Install UUID    | `modules/keychain-uuid/ios/KeychainUuidModule.swift`     | UUIDv4. Keychain `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`, `kSecAttrSynchronizable = false`. Survives reinstall and never syncs (ADR 0007).                                                                                                                                                                                                                                                                                                                                       |
| Account id      | `src/lib/account.ts`, `src/lib/accountFile.ts`, ADR 0011 | Per Apple ID, agreed through `witness-work-account.json` in the iCloud ubiquity container. Used as the RevenueCat App User ID and the Notes Import meter id. Documented as "an identifier, not a secret".                                                                                                                                                                                                                                                                                   |
| App Attest key  | `modules/app-attest`, `ww-api/src/appAttest/*`           | Secure Enclave key per device. v2 protocol: server-issued challenge (TTL 300 s, `protocol.ts`), then assertion over domain-separated client data `witnesswork.app-attest\|2\|assert\|<purpose>\|<operationId>\|<challenge>\|<uuid>\|<accountId>\|<contentHash>\|<requestHash>`. One SQLite Durable Object per install UUID (`identityDO.ts`) holds the active key, monotonic `signCount`, operation replay receipts, ≤32 active challenges, and a recovery-token verifier for key rotation. |
| Recovery token  | `KeychainUuidModule.swift`                               | 256-bit, `WhenUnlockedThisDeviceOnly`. Lets a reinstalled app rebind a new App Attest key to the same UUID (`#decideBind` → `rotated`).                                                                                                                                                                                                                                                                                                                                                     |
| Rate limit      | `ww-api/wrangler.toml`, `src/index.ts`                   | One `RATE_LIMITER` binding, 60 requests per 60 s, keyed by `CF-Connecting-IP`, on `/geocode`, `/autocomplete`, `/notes-import*`, `/admin/*`.                                                                                                                                                                                                                                                                                                                                                |
| Supporter check | `ww-api/src/revenuecat.ts`                               | Server-side RevenueCat REST lookup by the account id. Fails closed.                                                                                                                                                                                                                                                                                                                                                                                                                         |

Other facts that matter for Buddies:

- **No remote push exists today.** `src/lib/notifications.ts` only requests permission. `app.config.ts` has no `aps-environment` and no Notification Service Extension target (only `targets/widgets`). An App Group already exists.
- **iOS deployment target is 16.4** (`ios/*.pbxproj`). CryptoKit HPKE needs iOS 17 [UNVERIFIED]. CryptoKit post-quantum (ML-KEM) arrived with iOS 26 [V: Apple Platform Security, "Quantum-secure cryptography"].
- **`ITSAppUsesNonExemptEncryption: false`** is set in `app.config.ts`. Adding E2EE of user content means the export-compliance answers need a fresh look [UNVERIFIED requirements; not legal advice].
- **The app ships `ru-RU`, `uk-UA`, `zh-CN`, `zh-TW`, and `vi-VN` locales.** Jehovah's Witnesses were banned in Russia by a 2017 Supreme Court ruling. The ECtHR (_Taganrog LRO and Others v. Russia_, 7 June 2022) found that ban unlawful and noted "indications of a policy of intolerance", and more than 330 Witnesses have spent time in prison since 2017 [V: jw.org news summary of the judgment, https://www.jw.org/en/news/region/russia/European-Court-Issues-Landmark-Judgment-Against-Russia-for-Persecuting-Jehovahs-Witnesses/]. **State adversaries are therefore in scope**: membership inference from the social graph, whereabouts from schedules, and device seizure.
- **Marketing copy** in `src/locales/en-US.json` says "Your Data Never Leaves Your Device … Nothing is sent to us or stored on our servers" (`privacyOnDeviceDesc`) and "Private Contact Sharing … secure and smart links". Buddies (and arguably Notes Import already) makes the first claim untrue as written. Revise it, for example to "Only encrypted data that we cannot read passes through our servers".

### 1.2 Problems in the prior plan (`docs/friend-sharing-plan.md`)

| Prior-plan element                                                       | Problem                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Recommendation                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Keypair stored in the **iCloud Drive payload**                           | Under standard data protection, iCloud Drive keys are held by Apple. Only 15 categories, "including Health and passwords in iCloud Keychain", are E2EE by default [V: https://support.apple.com/en-us/102651]. iCloud Sync is also **Supporter-gated** (CONTEXT.md), so non-Supporters' second devices would never receive the identity.                                                                                                                                                                                             | Store the identity in iCloud Keychain. It is E2EE, and "these servers are cryptographically prevented from accessing any of the user's keychain data" [V: https://support.apple.com/guide/security/icloud-encryption-sec3cac31735/web]. |
| CloudKit **public DB** `FriendEvent`, writable by any authenticated user | CloudKit public-DB permissions are role-based **per record type**, with roles World, Authenticated, and Creator [V: https://developer.apple.com/icloud/cloudkit/designing/]. Nothing can restrict _who_ creates a record addressed to a recipient. A removed buddy, or anyone who reads the world-readable `FriendIdentity` fingerprint, can keep creating records that match the recipient's subscription, which **triggers pushes**. The plan's NSE fallback then shows "New activity from a friend", so the spam becomes visible. | Use server-enforced per-relationship capabilities (§6), or `CKShare` zones where participant removal is enforced. Evaluate the latter in the transport doc.                                                                             |
| "ww-proxy never sees the link payload (it's path-based)"                 | False (§1.3). Only the **fragment** stays client-side.                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Put secrets in the fragment only.                                                                                                                                                                                                       |
| Unsigned invites; `inviteId` "only prevents replay"                      | Nothing binds the invite parameters. Anyone holding the link can claim it. Any MITM check must happen out of band.                                                                                                                                                                                                                                                                                                                                                                                                                   | Use signed, encrypted invite blobs, possession proofs, inviter confirmation, and a commit–reveal safety code (§5).                                                                                                                      |
| "Abuse moderation out of scope; mitigation = unfriend"                   | Guideline 1.2 obligations may apply (§8.3). Coercive control is not addressed at all.                                                                                                                                                                                                                                                                                                                                                                                                                                                | See §8.                                                                                                                                                                                                                                 |

### 1.3 Pre-existing issue: the contact-share link leaks full contact data to the server and to Sentry

- **What the path carries.** `src/features/contacts/lib/contactShareLink.ts` builds `https://ww-proxy.leviwilkerson.com/c/<gzip+base64url(JSON)>`. Per its field policies, the JSON includes: name, phone, email, gender, address, coordinate, custom fields, and **up to 50 visits with `note`, `followUp.topic`, `isBibleStudy`, and `notAtHome`**. gzip+base64url is encoding, not encryption.
- **Who fetches the path.**
  - **iMessage generates link previews on the sender's device.** Mysk classifies iMessage under "Approach 1" (sender-generated) [V: https://www.mysk.blog/2020/10/25/link-previews/]. `ww-api/src/contactLink.ts` deliberately keeps the fallback page "self-contained … so iMessage's rich-link sniffer can render a fast preview". In practice, **every iMessage share sends the full path to ww-proxy** from the sender's IP.
  - Recipients without the app hit the same page in Safari.
  - Server-side unfurlers fetch it from their own servers. Mysk lists Discord, Facebook Messenger, Google Hangouts, Instagram, LINE, LinkedIn, Slack, Twitter, and Zoom: "the app will first send the link to an external server and ask it to generate a preview" [V].
- **What the server does with it.**
  - The Worker **echoes the payload** into `og:url` and into a `witnesswork://import-contact/<payload>` custom-scheme link. Any app can register a custom scheme.
  - `ww-api/src/sentry.ts` sets `tracesSampleRate: 1.0, sendDefaultPii: true`. `@sentry/cloudflare` 8.55 sets span attribute `url.full: request.url` and names spans `${request.method} ${stripUrlQueryAndFragment(pathname)}`. Query and fragment are stripped; **the path is kept** [V: https://github.com/getsentry/sentry-javascript/blob/8.55.0/packages/cloudflare/src/request.ts]. So Sentry, a third party, receives full contact payloads plus client IPs.
  - `wrangler.toml` sets `[observability] logs.persist = true`. Whether Workers Logs store the request URL is [UNVERIFIED], but likely.
- **Fix.**
  1. Emit new links as `/c#<payload>`, or better, encrypt the payload under a key held in the fragment. Keep `/c/:payload` for old links, but stop echoing the payload into HTML.
  2. Scrub `url.full` and transaction names in Sentry (`beforeSendTransaction` / `beforeSend`), drop `sendDefaultPii`, and sample `/c/*` at 0.
  3. Review retention and purge existing Sentry and Workers Logs data.
  4. Remove the custom-scheme link that carries the payload.

  The same logging rules apply to every Buddies route (§6.6).

---

## 2. Assets, adversaries, assumptions

**Assets**

- **A1 Plans:** future whereabouts and routine.
- **A2 Householder data:** a third party's name, address, appointment time, and conversation topic. This reveals religious interest.
- **A3 Activity and awards:** hours and progress. These can be used to pressure or judge.
- **A4 Social graph:** who is connected to whom. Where JW are banned, this lets someone infer membership.
- **A5 Keys and identity.**
- **A6 Push channel:** the user's attention.

**Adversaries**

- **M1** Ex-buddy or harasser.
- **M2** Coercive controller (spouse, parent, or someone with religious authority) with physical access to the phone and knowledge of its passcode.
- **M3** Holder of a leaked or forwarded link.
- **M4** Relay operator or its processors (Cloudflare, Sentry, a push provider). They may be honest-but-curious, breached, or legally compelled.
- **M5** State adversary with network position, legal compulsion, or the ability to seize devices.
- **M6** Automated abuser (curl, modified client, jailbroken device).
- **M7** Malicious buddy who stalks, scrapes, or screenshots.

**Assumptions**

- iOS and the Secure Enclave are trustworthy.
- Apple ID security (2FA, escrow) is the user's responsibility.
- **E2EE property:** no server-side party can read content.
- **Metadata:** minimized, **not** hidden.

---

## 3. Threat model

| #   | Threat                                                                     | Mitigation                                                                                                                                                                                                                                                           | Residual risk                                                                                                                                                                |
| --- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1  | Leaked or forwarded invite claimed by the wrong person (M3)                | Single-use link with 72 h default expiry. Inviter confirms explicitly after seeing the claimant's display name and a safety code. The intended invitee sees "already used" and tells the inviter, who rejects the claim. Pending invites can be cancelled.           | An impostor who types the intended invitee's name gets through unless codes are compared. Until the inviter notices, exposure is limited to what the inviter's side shares.  |
| T2  | Channel MITM swaps the link (M5 controlling SMS or a non-E2EE messenger)   | Commit–reveal 6-digit safety code, so grinding fails (§5.5). In-person QR is marked "verified". Copy recommends iMessage, AirDrop, or in person.                                                                                                                     | Users rarely compare codes [research numbers UNVERIFIED]. The protection is opt-in in practice.                                                                              |
| T3  | Relay, Cloudflare, or a compelled party reads content (M4, M5)             | E2EE. Keys exist only on devices and in iCloud Keychain. The invite secret is only in the fragment. Invite blobs are encrypted under a fragment-derived key.                                                                                                         | Metadata: IPs, timing, push tokens, sizes.                                                                                                                                   |
| T4  | Relay forges a claim or inserts itself into pairing                        | The relay never learns the secret. The claim carries an HMAC tag keyed from the secret and signatures by identity keys. The inviter verifies both.                                                                                                                   | Relay can deny service only.                                                                                                                                                 |
| T5  | Social graph disclosed from relay storage (breach or subpoena)             | Opaque per-direction mailbox ids derived from the root key. Writer identity is never stored, only a writer public key. No identity keys or names server-side. Invite records are transient. Ids travel in POST bodies, never paths. Logging and Sentry are scrubbed. | Transient invite records co-locate two account ids for ≤7 days. Each account's own mailboxes and push tokens are linked. Real-time traffic analysis can reveal edges (§6.6). |
| T6  | Removed buddy keeps writing or pushing (M1)                                | The owner deletes the mailbox, so the writer key is gone and writes return 410. Owner credentials cannot be derived from the root key. Pushes fire only on authorized writes.                                                                                        | None at the relay. Harassment through iMessage or phone stays outside the app; iOS blocking handles it.                                                                      |
| T7  | Current buddy spams pushes                                                 | Per-mailbox push budget with coalescing (§8.1). Per-buddy mute. End or block.                                                                                                                                                                                        | Up to the budget.                                                                                                                                                            |
| T8  | Invite spam or harassment loops (M1)                                       | No in-app request inbox, no search, no discovery: invites arrive only through external channels. Declining is silent. 30-day cooldown after ending; block list keyed by identity key.                                                                                | A harasser can create a new identity (reinstall). The UI then labels them "new person, never connected".                                                                     |
| T9  | Coercive control: forced connection to monitor (M2)                        | Minimal defaults (no location, hours, or presence). Visible indicators. Reminders every 30 days. One-tap stop-all. Quiet end. Every shared category is opt-in (§8.2).                                                                                                | An abuser with the passcode can accept or re-enable on the victim's device. The app cannot detect coercion.                                                                  |
| T10 | Stalking the householder or user via follow-up invites (M7)                | Explicit share per follow-up. Minimal fields. Expires 24 h after the visit. Revocable. No forward or export in the UI. No householder name or address on the lock screen. Guidance copy.                                                                             | Screenshots and memory. The buddy is a known person who was confirmed.                                                                                                       |
| T11 | Routine inference from plan overlays                                       | Day-part granularity, no locations, no notes, 14-day window, per-buddy toggles, pause.                                                                                                                                                                               | Patterns become visible over weeks.                                                                                                                                          |
| T12 | Malicious payloads: bidi or homoglyph display names, oversized data, links | Strict schema. Size caps. NFKC normalization, stripping bidi and zero-width characters. No URLs rendered. Identity-change alerts.                                                                                                                                    | Look-alike names are still possible; mitigated by "new person" labels and the safety code.                                                                                   |
| T13 | Automation from curl, modified clients, or sybil accounts (M6)             | App Attest on front-door operations. Durable Object counters. Caps on device-credential and account creation.                                                                                                                                                        | A jailbroken device hooking a genuine app. Factory reset resets device counters (same stance as ADR 0007).                                                                   |
| T14 | Unlocked or stolen device                                                  | iOS passcode. Optional app lock [existing? UNVERIFIED]. Any of the user's other devices can end relationships.                                                                                                                                                       | Local data is fully readable to someone holding the unlocked device.                                                                                                         |
| T15 | Apple ID and keychain-escrow compromise                                    | Apple's protections (2FA, escrow limits [UNVERIFIED details]). A "Buddies active on N devices" indicator based on push registrations.                                                                                                                                | Full identity takeover is possible.                                                                                                                                          |
| T16 | Identity loss (no iCloud Keychain, no backup)                              | "Reconnect" flow. Old mailboxes expire when inactive. Buddies see a "new identity" warning.                                                                                                                                                                          | Friction.                                                                                                                                                                    |
| T17 | Shared data persists after a connection ends                               | The receiving client deletes on end and on expiry, and removes delivered notifications.                                                                                                                                                                              | Screenshots, device backups, jailbroken clients.                                                                                                                             |
| T18 | Contact-link path leak (existing)                                          | §1.3                                                                                                                                                                                                                                                                 | Historic logs until purged.                                                                                                                                                  |
| T19 | Processors (Cloudflare, Sentry, APNs or a push gateway)                    | Minimize, scrub, publish a transparency statement.                                                                                                                                                                                                                   | IP and timing exposure.                                                                                                                                                      |
| T20 | Legal: sharing special-category householder data                           | Minimization, time-boxing, consent prompts, documentation (§9).                                                                                                                                                                                                      | Legal uncertainty. **Not legal advice.**                                                                                                                                     |
| T21 | Minors, and adults tracking minors' whereabouts                            | No free text, no discovery, coarse plans. Age policy is an open question.                                                                                                                                                                                            | Adult–minor schedule sharing.                                                                                                                                                |
| T22 | Device seizure in hostile jurisdictions (M5)                               | Short retention, auto-expiry, stop-all. Nicknames suggested as display names. Nothing plaintext on the relay.                                                                                                                                                        | Local forensics. The app's presence may itself be incriminating.                                                                                                             |

---

## 4. Identity model (Q1)

### 4.1 Layers and how they relate

| Identifier or key                                                                                                   | Scope        | Storage                                                                               | Seen by relay?                           | Linked to others at the relay?                                                                                    |
| ------------------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Install UUID                                                                                                        | device       | Keychain ThisDeviceOnly                                                               | Notes Import only                        | RevenueCat, Notes Import (existing)                                                                               |
| Account id                                                                                                          | Apple ID     | iCloud ubiquity container file                                                        | Notes Import, RevenueCat                 | yes (existing)                                                                                                    |
| RevenueCat App User ID                                                                                              | = account id | RevenueCat                                                                            | Notes Import checks                      | yes (existing)                                                                                                    |
| **Buddies device credential** `D` (random 128-bit) + a **separate** App Attest key                                  | device       | Keychain ThisDeviceOnly, plus its own recovery token                                  | yes (front-door ops)                     | **No.** Never sent together with the install UUID or account id, and kept in a separate Durable Object namespace. |
| **Buddies identity** `IK` (Ed25519) + `DK` (X25519)                                                                 | person       | iCloud Keychain, synchronizable, `AfterFirstUnlock`, access group shared with the NSE | **Never** (it is inside encrypted blobs) | n/a                                                                                                               |
| **Relay root secret** `RS` (256-bit) → account key `AK = Ed25519(seed=HKDF(RS,"account"))`, `accountId = H(AK.pub)` | person       | iCloud Keychain                                                                       | `AK.pub` and `accountId`                 | Linked only to that account's own mailboxes and push tokens                                                       |
| **Relationship root** `K_root`                                                                                      | pair         | iCloud Keychain (one item per buddy, holding the buddy's IK/DK, name, and status)     | never                                    | n/a                                                                                                               |
| APNs device token                                                                                                   | device       | registered to the relay account                                                       | yes                                      | account ↔ tokens                                                                                                 |

**Why a separate App Attest key and device id for Buddies?** App Attest allows multiple keys per app per device [UNVERIFIED]. If Buddies traffic is keyed by the install UUID, a compelled chain becomes possible: relay → install UUID → RevenueCat customer → App Store transaction → Apple ID. Given M5, that link should never exist. The cost is one extra attestation per install, which is rate-limited by Apple [UNVERIFIED].

### 4.2 Per-person keys vs per-device keys

- **Recommended: per-person identity synced through iCloud Keychain.** All of a person's devices act as one buddy, and there is no device-linking ceremony, which matters for older users. The prior plan's intent is preserved, but the storage moves from iCloud Drive (not E2EE, Supporter-gated) to iCloud Keychain. Every synced item must be explicitly marked with `kSecAttrSynchronizable` [V: "every item that will sync needs to be explicitly marked with the kSecAttrSynchronizable attribute", https://support.apple.com/guide/security/secure-keychain-syncing-sec0a319b35f/web]. The NSE needs a shared keychain access group and `AfterFirstUnlock` accessibility, because `ThisDeviceOnly` classes do not sync [UNVERIFIED].
- **Rejected for v1: per-device keys plus a signed device list** (the Signal/WhatsApp companion model). It enables per-device revocation, but adds fan-out encryption, device-list distribution, and a QR linking flow. A compromised device already exposes all plaintext, so the extra security is marginal here. **Revisit for group territory work**, where MLS (RFC 9420) [UNVERIFIED] would give membership changes and post-compromise security.
- **The Secure Enclave cannot hold the identity.** It supports P-256 only and its keys can't sync [UNVERIFIED this session]. It stays in use for App Attest, and optionally for a per-device request-signing key.
- **First-enable race.** Generate the identity lazily at the first invite or accept, after checking the keychain. If two identities appear, the older `createdAt` wins. The losing identity sends each buddy a key-change message signed by the old key, and buddies show "safety code changed".

### 4.3 Minimal server-side identity for a relay

1. **Device credential**: `D` plus an App Attest key. The Durable Object holds only App Attest state and abuse counters (accounts created, invites created). It has no links to accounts or mailboxes.
2. **Relay account**: `accountId` and `AK.pub`. The Durable Object holds push tokens, counters (active relationships, pending invites, push budget), and the list of mailboxes the account owns (needed for exact caps and for delete-all). It is created lazily at the first invite or accept.
3. **Mailboxes**: one per direction per relationship. Each holds `ownerAccountId`, `writerPub`, the ciphertext queue, and TTLs.
4. **Invites**: transient. Each holds the encrypted blob, expiry, `H(claimSecret)`, status, inviter and claimant account ids, and claim/confirm ciphertexts. Deleted on completion or expiry; a hash-only tombstone is kept for 7 days.

No person-level link to the install UUID, account id, or RevenueCat exists. If Buddies is ever **server-side** Supporter-gated, that link comes back. Keep any gating client-side (open question).

### 4.4 Sign in with Apple: avoidable

Guideline 4.8 applies to "Apps that use a third-party or social login service … to set up or authenticate the user's primary account" [V: https://developer.apple.com/app-store/review/guidelines/]. Buddies uses no login, so 4.8 does not apply. Adding Sign in with Apple would create an account (triggering 5.1.1(v) deletion and REST token revocation: "Apps that support Sign in with Apple should use the Sign in with Apple REST API to revoke user tokens" [V]). It would also contradict the app's no-account positioning. **Recommendation: don't add it.**

### 4.5 Guideline 5.1.1(v): account deletion

- **Text [V].** "If your app doesn't include significant account-based features, let people use it without a login. If your app supports account creation, you must also offer account deletion within the app."
- **Apple's support page [V: https://developer.apple.com/support/offering-account-deletion-in-your-app/].**
  - "Deleting an account removes the account from the developer's records, along with any data associated with the account that the developer isn't legally required to maintain."
  - "only offering to temporarily deactivate or disable an account is insufficient."
  - "Apps not operating in highly regulated industries should not require people to make a phone call, send an email, or go through other support flows."
  - If deletion takes time, "Inform the user how long it will take … and provide a confirmation when the deletion has been completed."
- **Assessment.** A pseudonymous relay record with no credentials or sign-up is ambiguous as an "account" [interpretation, UNVERIFIED how App Review treats it].
- **Recommendation.** Ship **Settings → Buddies → "Delete my Buddies data"** anyway. It:
  1. ends all relationships (owner delete plus writer close on every mailbox),
  2. deletes the relay account, pending invites, and push tokens,
  3. deletes local keys and cached shared data,
  4. confirms completion in-app.

  This also serves as the Safety-Check-style "stop all" and GDPR Art. 17 erasure.

---

## 5. Invite-link protocol (Q2)

### 5.1 Prior art (inspiration and verification status)

| System                | Secret location                                                                                                                                                              | Expiry                                                                                                                      | Approval                             | Notes                                            |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------ |
| Bitwarden Send        | Key in fragment: `https://vault.bitwarden.com/#/send_id/encryption_key`; "The anchor/fragment/hash is not sent to the server" [V: Bitwarden help, "Send encryption"]         | 7 days default, 31 max [UNVERIFIED]                                                                                         | none                                 | Server stores ciphertext only.                   |
| Excalidraw collab     | `#room=<roomId>,<key>` (`RE_COLLAB_LINK`) [V: excalidraw `excalidraw-app/data/index.ts`]                                                                                     | none                                                                                                                        | none                                 | Key stays in fragment; server relays ciphertext. |
| Signal group links    | `signal.group/#…`; fragment carries group master key + invite password [UNVERIFIED]                                                                                          | none; admin can reset                                                                                                       | optional admin approval [UNVERIFIED] | Closest analogue to confirm-then-join.           |
| WhatsApp group links  | code in **path** (`chat.whatsapp.com/<code>`) [UNVERIFIED]                                                                                                                   | none; resettable                                                                                                            | optional approval [UNVERIFIED]       | Server sees the code.                            |
| Apple Fitness sharing | n/a (Apple-ID addressed)                                                                                                                                                     | none documented; "Invite Again" / "unsend" [V: https://support.apple.com/guide/iphone/share-your-activity-iph0b826155d/ios] | invitee accepts                      |                                                  |
| Life360 circle codes  | short code [UNVERIFIED]                                                                                                                                                      | time-limited [UNVERIFIED]                                                                                                   | none                                 | Low entropy.                                     |
| Keybase Seitan        | short token; server stores invite encrypted under a token-derived key; invitee proves possession; admin client adds member; v2 derives a keypair from the token [UNVERIFIED] | [UNVERIFIED]                                                                                                                | admin client completes               | Model for possession proof + inviter completion. |
| Magic Wormhole        | short code (number plus words), SPAKE2 via mailbox server, one guess per code, single-use [UNVERIFIED]                                                                       | session-bound                                                                                                               | both online                          | PAKE model for spoken codes.                     |

### 5.2 Link format and routing

- **Link:** `https://ww-proxy.leviwilkerson.com/b#1<base64url(s)>`, where `1` is the version and `s` is 16 random bytes (22 characters). The whole link is about 58 characters. It is QR-friendly and easy to share.
- **No invite id in the path.** Any request that reaches the server (Safari fallback, preview fetchers, logs, Sentry) sees only `/b`. The server can't link a hit to an invite, and nothing in the path is worth logging.
- **AASA:** add a component matching path `/b`. Test whether fragment matching needs an explicit `"#"` key [UNVERIFIED syntax]. The app reads the fragment from the universal-link URL (confirm `webpageURL` preserves it [UNVERIFIED]; test on device).
- **Fallback page `/b`:**
  - Static and identical for every invite: "Install WitnessWork, then tap the invite link again."
  - Headers: `Cache-Control: no-store`, `Referrer-Policy: no-referrer`.
  - No JavaScript (and never code that reads `location.hash`), no third-party assets.
  - **No custom-scheme link carrying the secret**, because another app could register `witnesswork://`.
  - Open Graph tags are generic ("An invitation to WitnessWork Buddies"). The server never knows who invited whom.
- **Link previews.** The iMessage sender's device fetches `/b` (no fragment), so there is no leak to the relay. Server-side unfurlers (Slack, Messenger, etc.) receive the **whole link as message content** on their servers [V: Mysk]. The copy therefore recommends iMessage, AirDrop, or in-person QR. Single-use, expiry, and confirmation bound the damage from other channels.
- **Unknown senders.** iOS may disable links in messages from unknown senders [UNVERIFIED]. Fallback: "reply to the message first" or use the in-person QR.

### 5.3 Key derivations

All derivations are HKDF-SHA256 with the label `ww-buddies/<purpose>/v1`, and `H` is SHA-256.

```
inviteId    = KDF(s, "invite-id")[0..16]      // relay lookup key (never the secret)
K_inv       = KDF(s, "invite-enc")             // encrypts invite blob at relay
claimSecret = KDF(s, "relay-claim")            // relay stores H(claimSecret) only
K_tag       = KDF(s, "claim-tag")              // claimant → inviter possession proof
```

### 5.4 Step-by-step protocol (sketch)

Actors: inviter **A**, invitee **B**, relay **R**. "AppAttest(p)" means the existing v2 challenge→assertion flow with purpose `p` and `requestHash = H(canonical body)`. "Sig_AK" means an Ed25519 request signature by the relay-account key (§6.3).

**P0. Lazy enrollment** (first Buddies action on a device)

1. Create `D`, and bind an App Attest key under a **separate DO namespace**.
2. Load or create `IK`, `DK`, and `RS` in iCloud Keychain.
3. Create the relay account: `POST /buddies/v1/account {AK.pub, pushToken}` with `AppAttest(buddies-account)` and `Sig_AK`. R checks the per-device account-creation budget.

**P1. A creates an invite** (client checks: active + pending < 5 and pending < 3)

1. Generate `s`, ephemeral `E_A` (X25519), and SAS nonce `n_A`. Compute commitment `c_A = H("sas-commit" ‖ n_A)`.
2. Build the payload:
   ```
   P = {v:1, inviteId, expiresAt, IK_A.pub, DK_A.pub, E_A.pub, c_A, displayName_A(≤30), offers:{plans:"dayPart"|"off", followUps:bool, milestones:bool}}
   σ_A = Sign(IK_A, "invite" ‖ H(P))
   blob = AEAD(K_inv, P ‖ σ_A, aad = inviteId ‖ expiresAt)
   ```
3. Save the pending invite `{s, E_A.priv, n_A, expiresAt}` in iCloud Keychain, so any of A's devices can finish it.
4. `A→R POST /buddies/v1/invite/create {inviteId, expiresAt, blob, H(claimSecret)}` with `AppAttest(buddies-invite-create)` and `Sig_AK`.
5. R's account DO checks the caps. R stores `Invite{status: open, failedClaims: 0}`.

**P2. Share.** Use the share sheet (the copy suggests iMessage or AirDrop) or show a QR code for an in-person scan.

**P3. B opens the link.**

- App installed: the universal link opens the app with the fragment.
- App not installed: the static page asks B to install and tap again.

**P4. B fetches and verifies**

1. Derive `inviteId` and `K_inv` from `s`.
2. `POST /buddies/v1/invite/fetch {inviteId}` with `AppAttest(buddies-invite-fetch)`. R returns the blob, or "used" / "expired".
3. Decrypt, verify `σ_A` against `IK_A`, and check expiry.
4. Check B's own cap, block list, and cooldown for `IK_A`.

**P5. Accept screen on B**

- Headline: "Levi invited you to be Buddies."
- A plain-language list of exactly what each side will share.
- "Only accept invites from people you know. You can stop at any time."
- Buttons: **Accept** and **Not now**. "Not now" sends nothing, so there is no decline signal.

**P6. B claims**

1. Generate ephemeral `E_B` and nonce `n_B`.
2. Compute the shared root:
   ```
   K_root = KDF(ikm = DH(E_A,E_B) ‖ DH(DK_A,E_B) ‖ DH(E_A,DK_B), salt = s,
                info = "root" ‖ H(transcript))
   ```
   This gives forward secrecy and static authentication. **Use an audited Noise implementation or HPKE auth mode rather than hand-rolling**, and get a crypto review.
3. Build the claim:
   ```
   CM = {IK_B.pub, DK_B.pub, E_B.pub, n_B, displayName_B, offers_B}
   σ_B = Sign(IK_B, "claim" ‖ inviteId ‖ H(P) ‖ H(CM))
   τ = HMAC(K_tag, inviteId ‖ H(CM))
   claimBlob = E_B.pub ‖ AEAD(KDF(DH(E_B,DK_A), "claim-enc"), CM ‖ σ_B ‖ τ)
   ```
4. `B→R POST /buddies/v1/invite/claim {inviteId, claimSecret, claimBlob}` with `AppAttest(buddies-invite-claim)` and `Sig_AK_B`.
5. The Invite DO runs this **atomically**:
   - If status ≠ open → 409 "already used".
   - If `H(claimSecret)` is wrong → increment `failedClaims`. At 5 failures, burn the invite.
   - Otherwise: set status = claimed, store the claim blob and B's account id (transiently), and increment B's pending count.
   - Push A: "Someone accepted your invite" (generic).

**P7. A reviews** (from the NSE or in the foreground)

1. Fetch the claim with `Sig_AK_A`. Decrypt it.
2. Verify `σ_B` and **`τ`**. `τ` proves the claimant knew `s`, so a relay cannot have forged the claim.
3. Compute `K_root` and the SAS code (§5.5).
4. Show the screen:
   - "Bob accepted your invite 4 minutes ago. Is this the person you invited?"
   - Bob's name, and a **"Never connected before" / "Previously connected"** label based on `IK_B`.
   - The code **482 913**, with the prompt "If you're together or on the phone, check Bob sees the same code."
   - Buttons: **Confirm** and **This isn't who I invited**. The second burns the invite; B later sees "not confirmed".

**P8. A confirms**

1. Build the confirmation: `confirmBlob = AEAD(KDF(K_root,"confirm"), n_A ‖ Sign(IK_A, "confirm" ‖ H(transcript) ‖ n_A))`.
2. Create A's inbox: `mb_BA = KDF(K_root,"mbox/B->A")[0..16]` with `writerPub = Ed25519(seed=KDF(K_root,"writer/B->A")).pub`, via `POST /mailbox/create` with `Sig_AK_A`. R checks active < 5.
3. `POST /invite/confirm {inviteId, confirmBlob}` with `Sig_AK_A`. R pushes B (generic).
4. A deletes `s`, `E_A.priv`, and `n_A`.

**P9. B completes**

1. Fetch the confirmation. Check `H(n_A) = c_A` and verify the signature. Compute the SAS code.
2. Create `mb_AB` in the same way.
3. Send an encrypted "hello" into `mb_BA`.
4. Call `POST /invite/complete`. R deletes the invite record and keeps a hash tombstone for 7 days.

**P10. Active**

- Both sides show "You're now Buddies. Sharing: …" and the code under Buddy details.
- A local reminder is scheduled for 3 days later (§8.2).
- Data starts flowing only now.

**Cancel, expiry, and failure paths**

- A can cancel any pending invite: `POST /invite/cancel` with `Sig_AK`.
- Unclaimed or unconfirmed invites die at `expiresAt`. The hard maximum is 7 days from creation.
- A mailbox that was never activated is deleted by the relay after 7 days.

### 5.5 Safety code (MITM resistance) and whether people will use it

- **Code:** `SAS = (first 32 bits of H("sas" ‖ transcript ‖ n_A ‖ n_B)) mod 10^6`, shown as "482 913".
- **Why commit–reveal is needed.** A takes part without knowing `n_B`, and B commits `n_B` before A reveals `n_A`. A channel MITM running two sessions must fix its own nonces before learning `n_A`. Its chance of matching is therefore about 10⁻⁶ per attempt. Without commit–reveal, the MITM could choose its key after seeing both real keys and grind about 2²⁰ keys until a 6-digit hash matches, which takes seconds. This follows the standard short-authenticated-string design (Vaudenay; ZRTP; Bluetooth numeric comparison) [UNVERIFIED citations].
- **Who can't MITM.** The relay cannot, because it never sees `s`. Only an adversary who can **modify** the invite message in transit can.
- **Usability.** Studies suggest few users verify safety numbers [UNVERIFIED figures]. Don't depend on it.
  - **In-person pairing** with the in-app QR scanner is labelled "Verified in person" automatically, with a one-tap "codes match".
  - Remote verification is optional and lives in Buddy details, for example "Check codes on a call".
  - Avoid scary "unverified" badges for older users.
  - On any identity-key change, show "Bob's safety code changed" and require a tap to continue.

### 5.6 Leaked or forwarded links

1. **First valid claim wins.** Nobody can claim a second time.
2. The intended invitee sees: "This invite was already accepted by someone else. Ask Levi for a new one."
3. The inviter sees the claimant's name and "never connected" status before any data flows, and can reject.
4. Expiry bounds the window. Cancelling a pending invite kills a leaked link.

**Residual:** a leaked-link holder who guesses the invitee's name.

### 5.7 Rate limits and caps for invites (defaults)

| Control                            | Default                                                                 | Enforced by                                                     |
| ---------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------- |
| Invite TTL                         | 72 h default; options 24 h, 72 h, 7 d; hard max 7 d                     | client + Invite DO                                              |
| Pending outbound invites           | ≤ 3 per person                                                          | client + account DO                                             |
| Active + pending (both directions) | ≤ 5 per person                                                          | client + account DO (at create, claim, confirm, mailbox create) |
| Invite creation                    | ≤ 5 per 24 h, ≤ 15 per 30 d, per account **and** per device credential  | account DO + device DO                                          |
| Invite fetch                       | ≤ 20 per hour per device; coarse IP limiter 60/min (existing binding)   | device DO + `RATE_LIMITER`                                      |
| Claim attempts                     | invite burned after 5 bad claim secrets; ≤ 10 claims per day per device | Invite DO + device DO                                           |
| Relay accounts                     | ≤ 2 created per device credential per 30 d                              | device DO                                                       |
| Re-accept after ending             | client cooldown of 30 d for the same `IK`, unless the ender starts it   | client                                                          |

**Max-5 enforcement.** The client computes the cap from the keychain-synced buddy list. The relay account DO is authoritative across devices. An honest limitation: one person can create multiple identities by wiping the device, bounded by the device-credential limits. Workers' rate-limit binding is not suitable for exact caps [semantics UNVERIFIED]; use Durable Objects, which are single-threaded per id [UNVERIFIED].

### 5.8 PAKE (SPAKE2 or CPace)

Not needed for links: 128-bit secrets already resist the relay, and PAKE cannot help against someone who holds the link. PAKE is valuable for a later **"pair by reading a code over the phone"** mode, where a short code gives one online guess per attempt, as in Magic Wormhole. SPAKE2 is RFC 9382 and CPace is a CFRG draft [status UNVERIFIED]. CryptoKit has no PAKE [UNVERIFIED], so this is deferred.

### 5.9 Input hardening

- Strict version and length checks on the fragment.
- Display names: NFKC normalization, strip bidi and zero-width characters, ≤ 30 characters.
- Payloads are schema-validated and size-capped.
- No clickable URLs in shared content.
- Never read the clipboard automatically. Offer "Paste invite" only as a user action.

---

## 6. Relay request authentication and authorization (Q3)

### 6.1 Credential matrix

| Operation                                                         | App Attest                   | Signature                   | Notes                                                                  |
| ----------------------------------------------------------------- | ---------------------------- | --------------------------- | ---------------------------------------------------------------------- |
| Device enroll (bind/rotate)                                       | attest (existing v2)         | —                           | separate DO namespace, keyed by `D`                                    |
| Account create                                                    | assertion `buddies-account`  | `AK`                        | device account-creation budget                                         |
| Invite create / fetch / claim                                     | assertion `buddies-invite-*` | `AK` (create, claim)        | limits in §5.7                                                         |
| Invite confirm / cancel / status                                  | —                            | `AK` of inviter or claimant | status check for B uses `claimSecret` + `AK_B`                         |
| Mailbox create / delete                                           | —                            | `AK` of owner               | cap on active mailboxes                                                |
| Mailbox read / ack (NSE-safe)                                     | —                            | `AK` of owner               | no App Attest in the NSE                                               |
| Mailbox write                                                     | —                            | per-relationship writer key | push budget                                                            |
| Mailbox close (writer revokes itself and purges its own messages) | —                            | writer key                  | used when ending                                                       |
| Push-token register / unregister                                  | —                            | `AK`                        |                                                                        |
| Account delete (everything)                                       | —                            | `AK`                        | also closes mailboxes the account writes to (client supplies the list) |

### 6.2 App Attest reuse, cost, and latency

- **What to reuse.** The existing lifecycle (`appAttestLifecycle`, `AppAttestIdentity` DO) and protocol already bind purpose, operation id, and a request hash. Add purposes to `AppAttestAssertionPurpose`. Bind the same class under a **new DO binding** (for example `BUDDIES_DEVICE`) so data stays separated and can be deleted separately.
- **Cost of each protected operation.** One extra round trip for the server challenge. On-device Secure Enclave signing; `generateAssertion` is believed to need no Apple round trip [UNVERIFIED]. One ECDSA P-256 verify, plus a DO SQLite transaction (counter update and operation receipt).
- **Measure before deciding.** The client already records per-step timings (`NotesImportAuthDebugStep.ms`), and ww-api exposes `/notes-import/verify`.
- **Recommendation: App Attest for front-door operations only.** These are roughly tens of calls per user per month, so the cost is negligible. Putting it on every read and write would add a round trip and a DO transaction per message. It would also **tie all traffic to a device id**, the metadata linkage we are trying to avoid. The NSE would also need App Attest in an extension [UNVERIFIED support].
- **Alternative if needed:** attest once, then mint a short-lived session (about 1 h) bound to a Secure Enclave request-signing key.

### 6.3 Steady-state request signatures and replay protection

- **Signature:** `sig = Ed25519(key, "ww-buddies/req/v1" ‖ method ‖ route ‖ H(body) ‖ ts ‖ nonce)`, with the fields in the JSON body.
- **Replay:** reject if `|now − ts| > 300 s`. Keep a nonce cache for 600 s in the target DO. Message ids are unique per mailbox, and the receiver dedups by id.
- **Keys:** owner `AK` from `RS` (private to the person); writer keys from `K_root` (per direction).
- **Why signatures rather than bearer tokens.** A leaked log line carrying a signature cannot be replayed after the window, and the relay stores only public keys. Macaroons or Biscuit tokens are **not needed** for 1:1 mailboxes, where a DO holds the policy. Reconsider them for delegated, time-boxed group access later.
- **Verify on the platform:** Workers WebCrypto Ed25519 support [UNVERIFIED]. If it's missing, use P-256 ECDSA, which is verified to work in this codebase.

### 6.4 Mailboxes and revocation (removed buddy can't write or push)

- **Direction.** `mb_AB` is B's inbox for messages from A. B owns it, and A holds the writer key.
- **Ending the connection.** Either side:
  1. deletes its own inbox as owner (queued ciphertext wiped; writer key dropped; tombstone kept for 30 d so writes return **410**), and
  2. closes the other inbox as writer (its own messages purged; its writer key revoked).

  Both directions die at the relay immediately, even if the other device is offline.

- **Pushes fire only when an authorized writer writes to a live mailbox, within budget.** After a delete, the ex-buddy has no capability.
  - Owner credentials can't be derived from `K_root`, so an ex-buddy can't re-register push tokens or read the owner's inbox.
  - Buddies never learn each other's `accountId`, so an ex-buddy has no handle on the other person at all.
- **Invite records.** Single-use. A new connection needs a new invite and the invitee's own acceptance.

### 6.5 Push design

- **Payload:** a localized generic alert through `loc-key` (for example "New update from a buddy"), plus `mutable-content: 1`, an opaque `thread-id` per mailbox, and a message id. The NSE fetches the message, decrypts it, and renders it from a localized template. **No plaintext or householder data ever goes in APNs.**
- **Lock screen.** Don't show householder names or addresses even after decryption. Use "Levi invited you to a return visit Tue 10:00", with details in-app.
- **Throttling.** Apple: "The number of background notifications allowed by the system depends on current conditions, but don't try to send more than two or three per hour" [V: Apple, "Pushing background updates to your app"]. Keep background pushes within that; use alert pushes for user-facing events.
- **Payload size.** 4 KB for non-VoIP [partially V: VoIP 5 KB confirmed; the 4 KB text was truncated].
- **Feasibility.** APNs requires HTTP/2 [UNVERIFIED], and whether Workers' outbound `fetch` supports HTTP/2 is [UNVERIFIED]. **Spike this early.** The fallback is a small HTTP/2 push sender, or a third-party push provider, which becomes another processor that sees tokens and timing.
- **NSE suppression.** Silencing a notification requires Apple's filtering entitlement [UNVERIFIED], so server-side budgets are the real control.

### 6.6 Metadata minimization: what's realistic

| Data                                    | At rest                                                                                                                              | In transit or logs                                                                                                           |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Content                                 | ciphertext only                                                                                                                      | ciphertext                                                                                                                   |
| Who is connected to whom                | **not stored** (mailboxes hold a writer public key, not the writer's account); the invite DO co-locates two account ids for ≤ 7 days | the writer's IP and timing; the push to the recipient's token after a write reveals an edge to anyone observing in real time |
| Person ↔ own mailboxes and push tokens | stored (needed for caps, fan-out, delete-all)                                                                                        |                                                                                                                              |
| Identity keys, names                    | never                                                                                                                                | never                                                                                                                        |

**Rules**

- Put ids in POST bodies, never paths.
- Don't `console.log` ids or bodies.
- Sentry: `sendDefaultPii: false`, scrub `url.full`, low or zero sampling on `/buddies/*`, no request bodies or headers.
- Keep Workers Logs retention short [UNVERIFIED defaults].
- Publish a transparency note: "We can see when encrypted messages pass through our servers and from which IP addresses; we cannot read them."

Hiding the graph from an operator who is actively logging would need sealed-sender-style anonymous credentials plus IP anonymity. That is **out of scope; state it honestly.**

### 6.7 Rate-limit keys

- Only use a key **after** it has been authenticated:
  - `dev:<D>` (after assertion)
  - `acct:<accountId>` (after the signature is verified)
  - `mbox:<mailboxId>`
  - `inv:<inviteId>`
- `ip:<CF-Connecting-IP>` stays the coarse outer limiter through the existing binding.
- Exact business caps live in DOs.
- Add a KV kill switch `buddies:enabled` for invites and pushes, mirroring `notes-import:enabled`.

---

## 7. Ending a connection (Q4)

- **Who and how.** Either party, at any time, from Buddy details or "Stop sharing with everyone". It works offline: the action is queued, local data is removed immediately, and the relay calls run on reconnect.
- **Relay.** Owner delete plus writer close (§6.4). Takes effect immediately; queued ciphertext is gone.
- **Keys.** Delete `K_root`, writer keys, and the buddy record from iCloud Keychain. The deletion syncs to the user's other devices. `IK` is not rotated, because it is per person and not per relationship.
- **Local data on the ender's side.** Delete the buddy's plans overlay, shared follow-ups, and events. Remove delivered notifications for that buddy (`removeDeliveredNotifications` by the ids tracked per buddy thread).
- **Local data on the other side.** An honest client deletes everything on the next 410 or "ended" signal, and removes delivered notifications.
- **What cannot be guaranteed.**
  - Screenshots, photos, memory.
  - Device backups made earlier.
  - Jailbroken or modified clients. App Attest keeps them off the relay but not away from their local cache.
- **Auto-expiry, independent of ending (client-enforced):**
  - Plans overlay: rolling 14 days; past days purged daily.
  - Shared follow-ups: 24 h after the appointment (hard max 30 d from sharing).
  - Events: 30 days.
  - Relay message TTL: 30 days.
  - Mailboxes whose owner has not read for 60 days: deleted.
- **Notify or silent.** **Silent by default.** No push goes to the other party. On their next app open they see a neutral line: "You and Levi are no longer Buddies." Pushing a notice could provoke a controller at a dangerous moment (§8.2).
- **Re-invite cooldown.** For 30 days the ender's app shows invites from that `IK` behind an interstitial: "You ended your connection with Levi on Sep 3. Connect again?" The default choice is "Not now". Ending doesn't limit the ender's own ability to re-invite.
- **Block** is one action ("End and block"). The `IK` fingerprint joins a keychain-synced block list, and invites from it are rejected without showing details. No server-side block is needed: nobody can message you without a capability you issued. Harassment over iMessage is blocked through iOS.

---

## 8. Abuse and safety (Q5)

### 8.1 Concrete default limits

| Surface                     | Default                                                                                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Buddies per person          | ≤ 5 active; ≤ 3 pending invites; active + pending ≤ 5                                                                                                  |
| Invite TTL                  | 72 h (options 24 h / 7 d max); single-use; 5 bad claims burns it                                                                                       |
| Invite creation             | ≤ 5/day, ≤ 15/30 d per account and per device                                                                                                          |
| Mailbox writes              | ≤ 60/h, ≤ 500/day per mailbox; message ≤ 32 KB; ≤ 1 MB stored per mailbox; TTL 30 d; plan snapshot uses a replace-in-place slot                        |
| Alert pushes                | ≤ 1 per 10 min per mailbox (coalesce), ≤ 10/day per mailbox, ≤ 30/day per recipient account; background pushes ≤ 2–3/h per device (Apple guidance [V]) |
| Shared follow-ups           | ≤ 10 active per buddy; expire 24 h after the appointment                                                                                               |
| Plans overlay               | today + 14 days; day-part only (morning/afternoon/evening) + duration rounded to 30 min; no category, notes, or location by default                    |
| Events                      | opt-in per type; no hour totals by default; 30-day retention                                                                                           |
| Reminders                   | local notifications at 3 days after a new connection, then every 30 days while sharing ("You're sharing your plans with Levi and Anna — Review")       |
| Cooldown / block            | 30 d after ending / indefinite                                                                                                                         |
| Device and account creation | ≤ 2 relay accounts per device credential per 30 d; App Attest bind limits per device (existing)                                                        |
| Kill switch                 | KV `buddies:enabled` (invites, pushes)                                                                                                                 |

### 8.2 Coercive-control mitigations

This covers a controlling spouse, parent, or elder who pressures someone to connect so they can monitor schedules (whereabouts) and activity.

1. **Minimal by default.**
   - Plans are shared at day-part granularity only.
   - Never share location, "last seen", online presence, read receipts, or hour totals, unless the user explicitly opts in per category.
   - Don't emit negative events such as "missed plan" or "no hours this week".
2. **Visible indicators.**
   - A persistent "Shared with 2 buddies" chip on the Plans screen.
   - A "Visible to Levi, Anna" line in the plan editor.
   - A Buddies section in Settings that lists exactly what flows to whom.
3. **Periodic reminders** (local, so no server): at 3 days, then every 30 days, with a one-tap "Review sharing". Whether users may lengthen the interval to 90 days is an open question; the recommendation is that they can't fully disable it while sharing is active.
4. **One-tap "Stop sharing with everyone"**, modelled on iOS Safety Check's emergency reset [Apple Personal Safety guide, UNVERIFIED this session]. It is reachable from Buddies and from Settings → Privacy. It quietly ends everything, deletes shared data, removes notifications, and optionally blocks. Tell users it may be noticeable to the other side.
5. **Quiet end**, no push to the other party (§7).
6. **Consent screens state exactly what is shared.** Acceptance happens on the invitee's own device. Copy frames Buddies as "for encouragement between friends — not for reporting or oversight".
7. **No roles.** No admin, elder, or group-overseer role, and no hierarchical visibility in v1.
8. **Limits of what the app can do.** An abuser with the passcode can accept on the victim's behalf; the app cannot detect coercion. Indicators, reminders, and easy exit are the realistic tools [consistent with published tech-abuse research, e.g. Freed et al. CHI 2018 and IBM's "coercive control resistant design" principles; UNVERIFIED quotes].
9. **Minors.** JW youth may be baptized publishers. Parent–child buddies are plausible and positive, but an adult non-parent seeing a minor's schedule is a safety concern. See the open questions on age policy. Also re-check the App Store age-rating questionnaire answers for any user-to-user features [UNVERIFIED current questionnaire].

### 8.3 Does Guideline 1.2 (UGC) apply?

- **Text [V].** "apps with user-generated content or social networking services must include: A method for filtering objectionable material from being posted to the app; A mechanism to report offensive content and timely responses to concerns; The ability to block abusive users from the service; Published contact information so users can easily reach you." It also bans "random or anonymous chat" (not applicable: Buddies has no discovery).
- **Assessment.** Buddies shares user-created content between users: display names, and any free-text topic or notes. A conservative reading is that 1.2 **may** apply. Precedent for small mutual-consent sharing apps is [UNVERIFIED].
- **Low-cost compliance** that also serves safety:
  1. **Filter.** Mostly structured fields. Free text only for the display name (≤ 30 characters) and an optional follow-up topic (≤ 80 characters), with a local word filter.
  2. **Report.** "Report a concern" sends a user-initiated report to support, containing only what the reporter chooses to include. Commit to a response time.
  3. **Block.** "End and block".
  4. **Contact.** A published support contact.
- **Limitation.** Because of E2EE and writer anonymity, the developer **cannot** identify or sanction the offender server-side. The remedy is the victim's block. Say this in the App Review notes.
- **Related guidelines [V]:**
  - **5.1.2(i):** "you may not use, transmit, or share someone's personal data without first obtaining their permission". Householder data is someone else's; see §9.
  - **5.1.2(viii):** "Apps that compile personal information from any source that is not directly from the user or without the user's explicit consent … are not permitted". The user enters the householder data, but flag the review risk for onward sharing.

---

## 9. Third-party (householder) data (Q6) — **not legal advice**

### 9.1 GDPR

- **Art. 9(1) [V: https://gdpr-info.eu/art-9-gdpr/].** "Processing of personal data revealing … religious or philosophical beliefs … shall be prohibited", subject to exceptions:
  - **9(2)(a)** explicit consent.
  - **9(2)(d)** a not-for-profit body with a religious aim, "on condition that the processing relates solely to the members or to former members of the body or to persons who have regular contact with it in connection with its purposes and that the personal data are not disclosed outside that body without the consent of the data subjects".
  - **9(2)(e)** data "manifestly made public by the data subject".
- **Why it matters here.** A follow-up topic or note ("interested in Bible study", "asked about the Trinity") can reveal religious or philosophical beliefs. Whether a householder counts as a person with "regular contact" with the body is an open legal question. Sharing between two publishers may stay inside the body, but a developer-operated relay is outside it; E2EE is what keeps the relay from receiving the content.
- **Other principles to design for:**
  - Art. 5(1)(c) data minimization and 5(1)(e) storage limitation.
  - Art. 25 data protection by design and default.
  - Art. 17 erasure.
  - Art. 35 impact assessment for special-category data.

  [article texts UNVERIFIED this session, except Art. 9]

### 9.2 CJEU C-25/17, _Tietosuojavaltuutettu (Jehovan todistajat)_, 10 July 2018, ECLI:EU:C:2018:551

The judgment text could not be retrieved this session (EUR-Lex and curia returned empty pages). The **holdings below are from prior knowledge and are UNVERIFIED verbatim**, including paragraph numbers:

1. Members' collection of personal data during door-to-door preaching, and later processing, is **not** a "purely personal or household activity". The activity reaches beyond the preacher's private sphere, so the household exemption doesn't apply.
2. A set of data collected door-to-door (names, addresses, other information about the persons contacted) is a **"filing system"** if it is structured by criteria, such as area, that make it easy to retrieve. Index cards or specific lists are not required.
3. The religious community can be a **joint controller** with members who preach, where it organizes, coordinates, and encourages the preaching. It does not need access to the data or written guidelines for that to be true.

The facts concerned notes that included religious beliefs and family circumstances. The case arose from a Finnish Data Protection Board decision (2013) [UNVERIFIED details].

**Implications (risk flags):**

- In the EU/EEA, publishers using WitnessWork are processing personal data, including potentially special-category data, under GDPR.
- Buddies' follow-up sharing is a **disclosure to another person**.
- WitnessWork's developer becomes a processor or controller of relay metadata (IPs, push tokens, account records) and of the ciphertext. Whether E2EE ciphertext is personal data _for the relay_ may depend on re-identification means (CJEU C-413/23 P _EDPS v SRB_, 4 Sep 2025 [UNVERIFIED]). **Metadata definitely is.**
- Update the privacy policy (`https://leviwilkerson.com/witness-work/privacy`) and the App Privacy labels; how Apple treats E2EE data in labels is [UNVERIFIED]. Disclose Cloudflare, Sentry, and any push provider as processors.

### 9.3 Jehovah's Witnesses' published guidance

The Organization's own data-protection policy and any guidance to publishers about house-to-house records could not be retrieved this session (a WOL search for the exact phrase returned nothing). **UNVERIFIED.** The product owner should review the Organization's published data-protection and privacy pages on jw.org, and any branch-specific direction, and align the in-app copy with them. Don't imply endorsement.

### 9.4 Minimization spec for follow-up invitations

- **Sent by default:** householder **first name or initials** (editable); **location** (address line 1 and city, **or** a map pin, not both); **date and time**; optional **topic** (≤ 80 characters, with an inline hint not to include personal beliefs or sensitive details); optional language.
- **Never sent:** surname (unless the user edits it in), phone, email, visit history, notes, the Bible Study flag, custom fields, gender, avatar.
- **Time-boxing.** The item expires 24 h after the appointment. The sharer can **revoke** it at any time. It is removed when the relationship ends.
- **Recipient UI.** No "Save to my contacts", share, or copy actions. A banner: "Shared by Levi for this visit · disappears after Tue". An explicit accept or decline for each follow-up invitation.
- **In-app guidance** (to be added to `src/locales/en-US.json`; other locales go through human approval):
  - "Only share what your buddy needs for this visit."
  - "This is personal information about someone else. It will disappear after the visit."
  - Optionally: "Consider letting the householder know a friend will join you."
- **Lock screen.** Never show the householder's name or address in a notification.

---

## 10. Key storage and recovery (Q7)

### 10.1 Storage decisions

| Secret                                                                        | Storage                                 | Accessibility                                                                      | Syncs                              | Why                                                |
| ----------------------------------------------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------- | -------------------------------------------------- |
| App Attest key (Buddies)                                                      | Secure Enclave via `DCAppAttestService` | —                                                                                  | no                                 | per-device integrity; non-exportable               |
| Buddies device id `D`, its recovery token                                     | Keychain                                | `AfterFirstUnlockThisDeviceOnly` / `WhenUnlockedThisDeviceOnly` (same as existing) | no                                 | rebinding after reinstall (existing pattern)       |
| `IK`, `DK`, `RS`                                                              | iCloud Keychain                         | `AfterFirstUnlock` (the NSE must read them while locked after first unlock)        | yes (`kSecAttrSynchronizable`) [V] | E2EE sync [V]; not gated                           |
| Per-buddy records (`K_root`, keys, name, status), block list, pending invites | iCloud Keychain, one item per buddy     | `AfterFirstUnlock`                                                                 | yes                                | small; E2EE; every device converges                |
| Cached shared data (plans overlay, follow-ups, events)                        | app storage (MMKV/SQLite), per device   | file protection                                                                    | no (rebuilt from the relay)        | not synced through the Supporter-gated iCloud Sync |

The Secure Enclave supports only P-256 and its keys can't sync [UNVERIFIED], so it can't hold the per-person identity. CryptoKit post-quantum (ML-KEM 768/1024) exists from iOS 26 [V]. Consider a hybrid KEM for pairing once the Buddies minimum OS allows it, because harvest-now-decrypt-later is plausible for M5.

### 10.2 Scenario matrix

| Scenario                                                                     | Identity                                                                                                                                   | Device credential / App Attest                                  | User experience                                                                                                                             | Re-pair?    |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| Delete and reinstall, same device                                            | kept (keychain items survive app deletion [UNVERIFIED]; synced items also re-sync)                                                         | `D` kept; App Attest re-keys and rebinds via the recovery token | silent; push token re-registered                                                                                                            | no          |
| New iPhone via iCloud backup or Quick Start, iCloud Keychain on              | restored through iCloud Keychain [V: sync mechanism]                                                                                       | new `D` and App Attest                                          | "Buddies restored"; new device's push token added                                                                                           | no          |
| New iPhone from an encrypted local backup, keychain sync off                 | non-ThisDeviceOnly items likely migrate [UNVERIFIED]                                                                                       | new `D`                                                         | probably restored                                                                                                                           | probably no |
| New iPhone with no keychain sync and no encrypted backup; or a factory reset | **lost**                                                                                                                                   | new                                                             | "Reconnect with your buddies": new invites; buddies see "new identity for Levi — check code"; old mailboxes expire after 60 d without reads | **yes**     |
| Second device (iPad), same Apple ID                                          | via iCloud Keychain                                                                                                                        | own `D` and App Attest                                          | automatic; if keychain sync is off: "Turn on iCloud Keychain to use Buddies on this device" (no second identity)                            | no          |
| iCloud sign-out                                                              | synced items may be removed from the device [UNVERIFIED]                                                                                   | unchanged                                                       | "Buddies unavailable — sign in to iCloud"; restored on sign-in                                                                              | no          |
| All devices lost                                                             | recoverable through iCloud Keychain recovery: "Secure iCloud Keychain recovery, Account Recovery Contacts, or an Account Recovery Key" [V] | new                                                             | restored after recovery                                                                                                                     | no          |
| Stolen unlocked device                                                       | exposed                                                                                                                                    | —                                                               | "Stop sharing with everyone" from another device; rotating the identity needs re-pairing                                                    | optional    |
| Apple ID and escrow compromise                                               | exposed                                                                                                                                    | —                                                               | "Buddies active on N devices" indicator; the remedy is a new identity                                                                       | yes         |

**Rotating the identity** (manual only in v1): generate a new `IK` and `DK`, send each buddy a transition message signed by the old key, and ask buddies to re-check the safety code. If the old key is suspected compromised, re-pair instead.

---

## 11. Group territory (future)

- Pairwise `K_root` mailboxes don't generalize to groups.
- Use MLS (RFC 9420) or sender keys with rekeying on member removal [UNVERIFIED].
- Group invite links in the Signal style (fragment secret plus admin approval).
- Territory maps are lists of householders' addresses: this is the **highest-sensitivity data in the product**. Apply the same minimization and expiry, and treat it as its own threat model.

---

## 12. Open questions for the product owner

1. Is Buddies free, or gated for Supporters? Server-side gating would link Buddies to RevenueCat and the account id; client-side gating avoids that.
2. Is requiring iCloud Keychain for multi-device Buddies acceptable?
3. Invite TTL default of 72 h (options 24 h / 7 d)? Explicit inviter confirmation (recommended) or auto-activation?
4. Where does the safety code appear: the accept flow, or only Buddy details? And the "verified in person" QR flow for v1?
5. Reminder cadence (30 d)? Can users lengthen or disable it?
6. What exactly does the plans overlay show (day-part vs exact times, categories)? Are hour totals ever shareable?
7. Which activity and award events, and are they per-type opt-in? No negative events?
8. Follow-up invitation fields and TTL? May a buddy save the householder as their own contact (a "transfer")?
9. Minimum age or minors policy, and the App Store age-rating answers.
10. **Regional policy.** Should Buddies be available, hidden, or come with warnings in countries where JW activity is banned (for example Russia, given the `ru-RU` locale)? Risk trade-off.
11. Notify the other party on end (recommendation: no, neutral in-app notice only)?
12. Acceptable to reduce Sentry and Workers Logs detail for Buddies and `/c/*` (less observability)?
13. Priority and scope of fixing the existing `/c/` path leak, including purging logs.
14. Push infrastructure: APNs directly from Workers (HTTP/2 feasibility), or a separate HTTP/2 sender or third-party provider?
15. Who re-runs the export-compliance answers (`ITSAppUsesNonExemptEncryption`), the App Privacy labels, the privacy policy, and the "nothing leaves your device" marketing copy?
16. Response-time commitment for "Report a concern" (Guideline 1.2), and the support contact to publish.
17. Minimum iOS for Buddies: 16.4 with manual X25519+HKDF+AEAD, 17 for HPKE, or 26 for post-quantum?
18. Should Buddies require a device passcode (keychain protection and physical-access risk)?

---

## 13. Sources and verification status

### Verified this session

- Apple, App Store Review Guidelines (1.2, 1.2.1, 4.8, 5.1.1(v), 5.1.2(i),(viii)): https://developer.apple.com/app-store/review/guidelines/ (no last-updated date shown on the page).
- Apple, Offering account deletion in your app: https://developer.apple.com/support/offering-account-deletion-in-your-app/
- GDPR Art. 9: https://gdpr-info.eu/art-9-gdpr/
- Mysk, "Link Previews" (2020): https://www.mysk.blog/2020/10/25/link-previews/
- Sentry Cloudflare SDK 8.55.0, `request.ts`: https://github.com/getsentry/sentry-javascript/blob/8.55.0/packages/cloudflare/src/request.ts
- Apple, iCloud data security overview: https://support.apple.com/en-us/102651
- Apple Platform Security, Secure keychain syncing: https://support.apple.com/guide/security/secure-keychain-syncing-sec0a319b35f/web
- Apple Platform Security, iCloud encryption: https://support.apple.com/guide/security/icloud-encryption-sec3cac31735/web
- Apple Platform Security, Quantum-secure cryptography: https://support.apple.com/guide/security/quantum-secure-cryptography-apple-devices-secc7c82e533/web
- Apple, Designing for CloudKit (RBAC roles): https://developer.apple.com/icloud/cloudkit/designing/
- Apple, Pushing background updates (2–3 per hour): https://developer.apple.com/documentation/usernotifications/pushing-background-updates-to-your-app (read from the shared research cache)
- Apple, Generating a remote notification (payload limits, partial): https://developer.apple.com/documentation/usernotifications/generating-a-remote-notification (read from the shared research cache)
- Bitwarden, Send encryption (key in fragment, "not sent to the server"): bitwarden.com help (read from the shared research cache)
- Excalidraw source (`#room=` key in fragment): https://github.com/excalidraw/excalidraw (read from the shared research cache)
- Apple, Share your activity (Fitness invites: re-invite and unsend): https://support.apple.com/guide/iphone/share-your-activity-iph0b826155d/ios
- jw.org news on the ECtHR _Taganrog_ judgment: https://www.jw.org/en/news/region/russia/European-Court-Issues-Landmark-Judgment-Against-Russia-for-Persecuting-Jehovahs-Witnesses/
- Codebase: the paths cited in §1 (witness-work and ww-api).

### Unverified claims (need checking before being relied on)

1. CJEU C-25/17: verbatim holdings, paragraph numbers, and the details of the 2013 Finnish Board decision.
2. Jehovah's Witnesses' official data-protection policy and guidance on house-to-house records.
3. CJEU C-413/23 P _EDPS v SRB_ (2025): holding on pseudonymised data.
4. Whether Workers Logs record request URLs, and their retention; the Workers Rate Limiting binding's semantics (per-location, approximate); Durable Object single-threaded consistency; Workers WebCrypto Ed25519 support; Workers outbound HTTP/2 (needed for APNs); that APNs requires HTTP/2.
5. App Attest: that assertions are generated locally with no Apple round trip; attestation rate limits and gradual-rollout advice; whether keys are lost on reinstall, restore, or migration; support in app extensions; multiple keys per app.
6. Keychain: that ThisDeviceOnly items never sync or migrate; that items persist after app deletion; what happens to synced items on iCloud sign-out; how encrypted local backups restore keychain items.
7. Secure Enclave supports P-256 only; any Secure Enclave post-quantum support in iOS 26; CryptoKit HPKE requires iOS 17.
8. Universal links: that `webpageURL` includes the fragment; AASA `"#"` component syntax; cases where a universal link opens Safari instead of the app.
9. iOS behavior for links from unknown senders in Messages; iMessage "tap to load preview".
10. NSE notification-filtering entitlement behavior.
11. The wording of RFC 3986 §3.5 (the principle that fragments are not sent to the server is independently confirmed by Bitwarden's documentation).
12. Prior-art details: Signal group-link internals and admin approval; research on how often people verify safety numbers; WhatsApp link format and approval; Life360 codes; Keybase Seitan; Magic Wormhole; Bitwarden Send's 7-day default and 31-day maximum; the status of SPAKE2 (RFC 9382) and CPace; MLS (RFC 9420).
13. Export-compliance requirements for E2EE; how App Privacy labels treat E2EE data; the App Store age-rating questionnaire.
14. Tech-abuse research quotes (Freed et al. 2018; IBM coercive-control principles, whose PDF was cached but not parsed); details of iOS Safety Check.
15. The 4 KB APNs payload limit for non-VoIP pushes (the source text was truncated).
16. The existence of an app-lock feature in WitnessWork.
