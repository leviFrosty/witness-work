# WitnessWork Buddies — Recommendations

**Status:** proposed · research synthesis, 2026-09-23
**Starting points:** #265 (add Follow-ups to the phone's calendar), #288 (share a live schedule with a pioneer partner), #434 (collaborative territory — later, out of scope).
**Relationship to existing plans:** supersedes the transport, key-storage, and pairing sections of [`friend-sharing-plan.md`](./friend-sharing-plan.md) (see §9); keeps [`calendar-sync-plan.md`](./calendar-sync-plan.md) with small deltas (§6.2).
**Evidence:** five research reports in [`research/buddies/`](./research/buddies/README.md). Claims that rest on a single secondary source, or need a spike, are flagged in §11.

## TL;DR

| Area                          | Recommendation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Architecture**           | A **blind relay on ww-proxy**: one SQLite Durable Object inbox per User holding only ciphertext, random ids, public keys, and push tokens. E2EE happens in the app (CryptoKit). Keys derive from a **root seed synced through iCloud Keychain** (E2EE by default — unlike iCloud Drive). Schedules are **pulled** as small encrypted snapshots on foreground; **pushes** go Worker → APNs only for things a person must see, decrypted on-device by a Notification Service Extension. **Not CloudKit** — its sharing isn't E2EE without Advanced Data Protection, and its public DB leaks the buddy graph and can't stop spam. Est. **$0–9/month at up to 200k MAU**. |
| **2. Auth & abuse**           | **No accounts.** An invite is a **single-use capability link** whose secret lives after the `#` (never sent to any server), expiring in 7 days. The invitee accepts; the inviter **confirms with one tap** (automatic when paired in person by QR); an optional 6-digit safety code catches interception. App Attest gates the rare, abuse-sensitive calls (enroll, invite); everyday calls are **signed with derived keys**, so the relay holds no bearer secrets. Cap of **5** (pending invites count) enforced by app **and** relay. Removing a buddy is enforced **server-side**, not just hidden.                                                                |
| **3. Invite & management UX** | One **Buddies** screen (Settings drawer + profile overlay). Invite via share sheet (Messages recommended) or QR. A **pre-accept screen** that states what each side will see and what is never shared. Sharing is **mutual on accept**, then adjustable **per buddy** (sharing level, pause, mute, remove). Removal is immediate, silent, and final. **"Stop sharing with everyone"** — iOS Safety Check can't reach third-party apps.                                                                                                                                                                                                                                |
| **Features**                  | Ship **device calendar sync (#265)** first (on-device, zero server). Then **"Plan together" (#288)**: buddies' Plans faded in the month calendar + "I'll come too". Then **Follow-up invitations** (minimal householder data, auto-expiring). Then opt-in **activity** and **awards**. No leaderboards, competitions, hour comparisons, feeds, presence, or streak pressure.                                                                                                                                                                                                                                                                                          |
| **Fix now**                   | Contact share links put a householder's name, contact details, and **up to 50 visits with notes** into the URL **path**, which reaches ww-proxy's persisted logs and Sentry (full URL, PII on). Move the payload after the `#` (§8).                                                                                                                                                                                                                                                                                                                                                                                                                                  |

## 1. Principles

1. **Not social media.** Invite → accept → mutual. At most 5 buddies, pending invites included. Either person ends it instantly. No discovery, search, feeds, public profiles, or contact upload.
2. **E2EE by construction.** The relay never holds names, Plans, Contacts, or the buddy graph in plaintext. Keys never touch iCloud Drive.
3. **Least data, shortest life.** Share the minimum by default; everything shared expires.
4. **Encouragement, not comparison** (Gal. 6:4; Heb. 10:24, 25). Nothing ranks, compares, or shames; hours stay private unless a User deliberately shares them.
5. **Easy for any User.** No key management in the UI, plain-language "what's shared" everywhere, one tap for common actions, honest copy about limits.
6. **Cheap to run, light on the battery.** Pull on foreground, push only what a person must see, no silent pushes, no background polling.

## 2. What the market research says

| Product                        | Pattern observed                                                                                                                              | What Buddies takes                                                       |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **Excalidraw**                 | The collaboration key lives after `#` — "anything that's added after the # doesn't get sent to the server"; the server stores ciphertext only | Invite secret in the fragment; relay stores only ciphertext              |
| **Signal** group links         | The join secret is embedded in the fragment; "Reset link"; optional admin approval                                                            | Single-use, revocable links; inviter confirmation                        |
| **Bitwarden Send / 1Password** | Expiring, access-limited share links (7-day defaults)                                                                                         | Single use, 7-day expiry, stated on the invite sheet                     |
| **Apple Fitness**              | Invite → accept → both see each other; per-friend _Hide my activity / Mute / Remove_; hard cap                                                | Mutual on accept; the same three per-buddy controls plus a sharing level |
| **Find My**                    | Removing someone is immediate and un-notified, but Apple admits people "may notice"                                                           | Silent removal, honest copy                                              |
| **iOS Safety Check**           | Emergency reset, review by person or by data; cannot reach third-party apps                                                                   | Our own "Stop sharing with everyone"                                     |
| **Google Calendar / Day One**  | Per-person permission levels; cap and expiry stated on the invite sheet                                                                       | Sharing levels; "3 of 5 spots left · works once · expires Sep 30"        |
| **Figma / Google Docs**        | "Anyone with the link" multi-use access                                                                                                       | Deliberately **not** — every Buddy link is single-use                    |
| **tldraw / Figma multiplayer** | One server object per room; server-ordered edits                                                                                              | One Durable Object per inbox now; one per group for territory later      |
| **Link previews**              | iMessage fetches previews on the _sender's device_; Slack, Discord, Messenger fetch _server-side_ — all request the URL                       | Nothing identifying in a path; a generic preview                         |

Sources and the full product matrix: [01](./research/buddies/01-invite-ux-market.md), [02](./research/buddies/02-e2ee-architecture-market.md).

## 3. Architecture (usage-optimized)

### 3.1 Decision

```text
 User's device                        ww-proxy (Cloudflare Worker)                Buddy's device
┌────────────────────────────┐ signed  ┌──────────────────────────────────┐ APNs ┌─────────────────────────┐
│ features/buddies  (UI)     │ ──────▶ │ /buddies/v1/*   (Hono routes)    │ ───▶ │ Notification Service    │
│ app/buddies (sync, push)   │         │  • App Attest: enroll, invites   │      │ Extension: decrypts the │
│ modules/ww-crypto          │ ◀────── │  • signatures, rate limits       │      │ inline payload, rewrites│
│   CryptoKit + Keychain     │ cipher- │ BuddyInbox Durable Object × User │      │ the alert — no network  │
└─────────────┬──────────────┘  text   │  slots · cards · events ·        │      └─────────────────────────┘
              │ root seed               │  devices · roster (encrypted)    │
     iCloud Keychain (E2EE)             └──────────────────────────────────┘
```

Why this over the alternatives:

|                                    | A. CloudKit public DB (old plan)                                                             | B. CKShare + `encryptedValues`                                                         | **C. Relay on ww-proxy + Keychain seed**             |
| ---------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| E2EE by default                    | Only via our own crypto — and the old plan's keys sat in iCloud Drive, which Apple can read  | **No** — needs Advanced Data Protection on _every_ participant; link shares never E2EE | **Yes**                                              |
| What a server learns               | Records readable by every app user; creator ids + recipient fingerprints expose the graph    | Apple sees real identities; buddies see each other's iCloud name and email             | Random ids, public keys, push tokens, IPs and timing |
| Stop a removed buddy or a stranger | Can't — permissions are per record _type_, so anyone can address anyone (and trigger pushes) | Private shares only                                                                    | Per-buddy writer keys + App Attest + rate limits     |
| Push quality                       | NSE must fetch the record; push payload holds ≤ 3 short fields                               | Coalesced "something changed"                                                          | Encrypted event inline, decrypted offline            |
| iCloud account needed              | Yes                                                                                          | Yes, for both people                                                                   | **No**                                               |
| Territory later                    | Poor                                                                                         | Good shape, same E2EE problem                                                          | Group mailbox (§3.8)                                 |
| Our cost                           | $0, unpublished quotas                                                                       | $0 (users' iCloud storage)                                                             | ~$0–9/month (§3.6)                                   |

Key facts (checked on Apple's pages): `encryptedValues` and shared CloudKit data are end-to-end encrypted **only with Advanced Data Protection** — "with standard data protection, iCloud content that you share with other people is not end-to-end encrypted" ([Apple 102651](https://support.apple.com/en-us/102651), [encryptedValues](https://developer.apple.com/documentation/cloudkit/ckrecord/encryptedvalues)). Public databases "aren't encrypted", are readable by all users of the app, and use per-record-type roles ([Designing with CloudKit](https://developer.apple.com/icloud/cloudkit/designing/)). Synchronizable iCloud Keychain items can't be decrypted by Apple ([keychain syncing](https://support.apple.com/guide/security/secure-keychain-syncing-sec0a319b35f/web)).

### 3.2 Keys and crypto

- **Root seed** — 32 random bytes, created the first time a User turns on Buddies, stored as a _synchronizable_ Keychain item (`AfterFirstUnlock`) in an access group shared with the Notification Service Extension. Every other key derives from it with HKDF: identity keys (Ed25519 signing, X25519 agreement), inbox id, owner request key, roster key.
- **Pair keys** — X25519 between the two identities, mixed with the invite secret, yield per-direction _writer keys_ (request authentication) and _content keys_ (ChaCha20-Poly1305). Content is also signed by the sender's identity key inside the ciphertext.
- **Envelope** — `[version][suite][nonce][ciphertext]`, padded to size buckets. v1 uses primitives available since iOS 13, so Buddies works on the app's iOS 16.4 floor; the suite byte allows a later move to HPKE (iOS 17) or post-quantum X-Wing (iOS 26) without a migration.
- **Unlinkable by design** — Buddies uses its own random device id and its own App Attest key. It never sends the install UUID, the account id (ADR 0011), or the RevenueCat id, so a legal demand to the relay can't be chained to an Apple Account.
- **Native** — a new `modules/ww-crypto` (Swift/CryptoKit + Keychain). Keep it separate from `keychain-uuid`, which is deliberately this-device-only.

### 3.3 What lives where

| Object               | Where                                                                                          | Contents                                                                                                                                        | Lifetime                                                  |
| -------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Root seed            | iCloud Keychain                                                                                | 32 bytes                                                                                                                                        | Until "Delete my Buddies data"                            |
| Buddy (relationship) | Device store (MMKV, **excluded** from the iCloud Sync payload) + encrypted roster in own inbox | Local name, public keys, pair secret, sharing choices, color, mute, status                                                                      | Until removed                                             |
| **Buddy Card**       | Recipient's inbox, one slot per sender, overwritten                                            | Plans from today to +8 weeks at the chosen Sharing Level (Recurring Plans resolved by the sender, skips and overrides applied); opt-in activity | Replaced on change; wiped on removal                      |
| Event                | Recipient's inbox                                                                              | Follow-up invitation, reply, or change; invite accepted; shared celebration; encouragement                                                      | 30 days; Follow-up invitations until 24 h after the Visit |
| Invite               | Relay                                                                                          | Encrypted invite card, hash of the claim secret, expiry                                                                                         | ≤ 7 days; deleted on completion                           |
| Device               | Own inbox                                                                                      | APNs token, device public key                                                                                                                   | Until invalid or unregistered                             |

A Buddy Card is ~0.7–2 KB compressed (16 KB cap); events are 150–600 B; roughly 50 KB per User at rest. An inbox with no owner activity for 180 days is wiped.

### 3.4 Sync strategy (where the usage savings come from)

- **Snapshots, not change streams.** A Buddy Card is small, idempotent, heals after offline periods, and is safe across a User's own devices.
- **Publish only after local edits** — never because iCloud Sync merged something in. Debounce 30 s (max 5 min), flush on background, skip if unchanged, republish when the month turns. One Worker request fans out to each buddy's inbox.
- **Pull on foreground** when more than 10 min have passed or a push arrived. One request returns every card and event; the cursor lives on the device, so reads cost no server writes.
- **Push only what a person needs to see.** Never for schedule edits; **never silent pushes** (Apple advises two or three per hour, and drops them after a force-quit). The encrypted event rides inline (APNs allows 4 KB); collapse ids replace stale alerts; `apns-expiration` is the Visit time for invitations and 24 h for social events.
- **Dedup across devices** with deterministic event ids — a User with an iPhone and an iPad publishes one event and triggers one push.
- **Budget per Buddies User per day:** ~16 Worker requests, ~19 Durable Object requests, ~16 row writes, ~1.3 pushes.

### 3.5 Push: Worker → APNs

- APNs requires HTTP/2 ([Apple](https://developer.apple.com/documentation/usernotifications/sending-notification-requests-to-apns)). Cloudflare doesn't document outbound HTTP/2, but production Workers' `fetch()` uses it when possible ([workerd #5266](https://github.com/cloudflare/workerd/issues/5266), [#4841](https://github.com/cloudflare/workerd/issues/4841)), and several open-source Workers call APNs directly ([iTerm2 push relay](https://github.com/gnachman/iTerm2/blob/master/Companion/PushRelay/src/worker.js), [paje](https://github.com/jonesphillip/paje)). `wrangler dev` can't — test on `ww-proxy-dev`.
- Send from the Worker (billed on CPU), not the Durable Object (billed on wall-clock). Cache the ES256 provider token in KV and rotate it about every 45 min. Delete device tokens that return 410 or `BadDeviceToken`.
- **Fallback if the spike fails:** Expo Push Service (free; supports `mutableContent` and 4 KB payloads). It would see push tokens and ciphertext, so it becomes a listed processor. Avoid FCM (adds the Firebase SDK).
- **Notification Service Extension:** a new target via `@bacons/apple-targets`; it reads the root seed (shared Keychain group) and a roster snapshot (App Group). Its strings are generated from `src/locales/*.json` at build time so the i18n rule holds. The dev build already carries `aps-environment = development` via the `expo-notifications` plugin — confirm the production App ID.

### 3.6 Cost

Prices: Cloudflare [Workers](https://developers.cloudflare.com/workers/platform/pricing/) and [Durable Objects](https://developers.cloudflare.com/durable-objects/platform/pricing/) pricing pages (updated 2026-08). Assumptions are deliberately conservative because PostHog was unavailable: 25% of MAU adopt, 2 buddies each, 1.3 devices, 6 pulls per device per day, 2 card publishes per day, 0.5 events per day, +20% for retries.

| MAU  | Buddies users | Worker req/mo | DO req/mo | Rows written/mo | Storage | Added cost (within included usage) | Worst case (allowances used elsewhere) |
| ---- | ------------- | ------------- | --------- | --------------- | ------- | ---------------------------------- | -------------------------------------- |
| 1k   | 250           | 0.12 M        | 0.14 M    | 0.13 M          | 12.5 MB | **$0.00**                          | $0.21                                  |
| 10k  | 2,500         | 1.2 M         | 1.44 M    | 1.25 M          | 125 MB  | **$0.07**                          | $2.09                                  |
| 50k  | 12,500        | 6.0 M         | 7.2 M     | 6.25 M          | 0.63 GB | **$0.93**                          | $10.47                                 |
| 200k | 50,000        | 24 M          | 28.8 M    | 25 M            | 2.5 GB  | **$9.21**                          | $41.89                                 |

Stress case (200k MAU, everyone on Buddies with 5 buddies): ~$283–344/month, three-quarters of it row writes. Levers if it ever matters: skip fan-out to inboxes idle for 14 days, stretch the publish debounce to 15 min, send daily activity digests. Full math: [03 §6](./research/buddies/03-architecture-and-cost.md).

### 3.7 Where the code goes

**App (three tiers):**

- `src/features/buddies/` — Buddies screen, Buddy detail, invite sheet, accept and confirm screens, store, hooks.
- `src/lib/appAttest/` — **move the App Attest client out of `features/notes-import` first**; features can't import each other, and Buddies needs it with a new purpose.
- `src/lib/crypto/`, `src/lib/wwProxy/` — shared wrappers.
- `src/app/buddies/` — foreground pull, publish flush, push-token registration, notification-tap routing, NSE snapshot writer. The invite-link listener mounts in `DeepLinkListeners`.
- `features/plans` receives buddies' Plans as props for the calendar; `features/visits` opens a Follow-up invitation by **navigating to a route**, not by importing Buddies.
- `modules/ww-crypto`, `targets/notification-service`.

**ww-proxy:**

- `src/buddies/{route,inboxDO,apns,contracts}.ts`, routes under `/buddies/v1/*`. **Ids go in POST bodies, never URLs** — production persists logs at 100% sampling.
- `BUDDY_INBOX` binding + migration + a Buddies rate limiter — **repeated under `[env.dev]`**, per the repo's rule.
- Secrets `APNS_KEY_P8`, `APNS_KEY_ID`; KV `buddies:enabled` (kill switch) and `buddies:min-version`.
- Add `/b` to the AASA **one app version before the UI ships** (iOS caches AASA).

### 3.8 Room for territory collaboration (#434)

Territory needs multi-writer shared Contacts for fewer than 10 people. The path: a **group mailbox** Durable Object per group holding an ordered, encrypted change log; a group key re-issued on every membership change; signed changes; last-writer-wins per field with hybrid logical clocks (Yjs if richer merging is needed — Automerge and Loro need WebAssembly, which Hermes lacks). MLS via `mls-rs` (CryptoKit provider, Swift bindings) only if groups grow.

Reserve now: the envelope version byte, a generic mailbox API, signing keys from day one, and a `relationship.kind` field. Keep **roles out of Buddies** — #434's elder and servant roles belong to territory only.

## 4. Authentication and abuse prevention

### 4.1 Identity

- One identity per **person** (keys from the root seed), not per device. Per-device keys with signed device lists are more robust but add complexity older Users would feel — revisit for territory groups.
- The relay knows: a pseudonymous inbox (random id + owner public key), device push tokens, per-buddy **slots** holding writer public keys (not who holds them), and short-lived invite records. No names, Apple Account, install UUID, account id, or RevenueCat id.
- **No Sign in with Apple** — Guideline 4.8 only applies when an app offers third-party login.
- Buddies does **not** depend on Supporter status or iCloud Sync: multi-device comes from iCloud Keychain plus the encrypted roster.

### 4.2 Invite protocol

1. **A creates an invite.** The app makes a 128-bit secret `s` and derives an invite id, an encryption key, and a claim secret. It uploads — under App Attest — an encrypted invite card signed by A: A's public keys, display name, what A offers to share, a commitment for the safety code, and the expiry. The relay enforces caps and stores only a hash of the claim secret.
2. **The link is** `https://ww-proxy.leviwilkerson.com/b#1<s>` — no id in the path. The no-app fallback page is static: generic preview, no scripts, no custom-scheme link.
3. **B opens it.** The app fetches and decrypts the card, checks the signature, the expiry, B's cap, and B's block list, and shows the pre-accept screen. "Not now" sends nothing.
4. **B accepts.** B's app sends a claim encrypted to A (B's keys, name, nonce) plus proof of knowing `s`. The relay accepts the **first** valid claim atomically and burns the invite after 5 bad attempts. A gets a push.
5. **A confirms with one tap**, seeing B's name and a "first time connecting" label, with the 6-digit safety code available to compare. "This isn't who I invited" burns the invite. **Nothing is shared until A confirms.** A QR code scanned in person confirms automatically and marks the buddy "verified in person".
6. **Both sides** derive pair keys, register each other's writer key in their own inbox, and exchange a hello plus the first Buddy Card. The invite record is deleted.

The relay never sees `s`. A forwarded or leaked link yields at most a claim the inviter rejects. Because each side commits before revealing, a 6-digit code gives an interceptor about a one-in-a-million chance per attempt.

### 4.3 Request authentication

- **App Attest** (a Buddies-only key and device id) for the rare, abuse-sensitive calls: device enrollment, inbox creation, invite create, fetch, and claim.
- **Everything else is signed** with Ed25519 over method, route, body hash, timestamp (±300 s), and a nonce (cached 600 s). Writes are signed by the per-direction writer key; reads, acks, device registration, and deletes by the owner key, which a buddy can't derive. The relay stores only public keys — nothing replayable to leak.
- Rate limits key on inbox and slot, plus the attested device for enrollment and invites.

### 4.4 Ending and blocking

- Either side, one tap, works offline (queued). The remover deletes the buddy's slot in their own inbox (the relay answers 410 to further writes and pushes) and withdraws their own slot from the buddy's inbox. Both apps purge keys, cards, events, and delivered notifications; upcoming Shared Follow-ups are cancelled.
- **No push to the other person**; the buddy simply disappears on their next pull. The copy is honest: they may notice, and what they already saw can't be taken back.
- Cannot be guaranteed: screenshots, backups, modified clients — say so.
- A new invite from the same person shows a 30-day cooldown; **Block** is indefinite and rides in the encrypted roster.

### 4.5 Default limits

| Limit                              | Default                                                          |
| ---------------------------------- | ---------------------------------------------------------------- |
| Buddies, active + pending          | **5** (app and relay)                                            |
| Pending invites                    | 3                                                                |
| Invite creations                   | 5 per day, 15 per 30 days                                        |
| Invite validity                    | Single use, **7 days** (24 h and 72 h options)                   |
| Bad claims before an invite burns  | 5                                                                |
| Writes per slot                    | 60 per hour, 32 KB per message; 1 MB stored per inbox            |
| Visible pushes                     | Per slot: 1 per 10 min and 10 per day; per recipient: 30 per day |
| Active Shared Follow-ups per buddy | 10                                                               |
| Kill switch                        | KV `buddies:enabled` stops invites and pushes                    |

Seven days rather than the 72 h the security review proposed: many Users will install the app between receiving the link and opening it, and single use plus inviter confirmation make the longer window safe.

### 4.6 Coercive control and safety

A controlling spouse or parent could pressure someone into connecting, and a schedule reveals whereabouts. The app can't detect coercion, so it makes sharing **visible, reversible, and coarse**:

- A "Shared with Mom, Anna" chip on the calendar; an in-app review card 3 days after connecting, then every 90 days.
- **Pause** (1 week, 1 month, or until turned back on) shows the other side only "Not sharing right now"; **Stop sharing with everyone** lives in Privacy & safety; removal is silent.
- Never shared: location, presence, "last active", read receipts, or negative signals like "missed plan". No roles or admins.
- **Where the work is banned** (e.g. Russia since 2017; the app ships `ru-RU`): the relay never holds names or the graph, but a buddy list on a seized phone names fellow Witnesses. Display names are free-form (nicknames welcome) and local; regional availability and an app lock are open decisions (§10).

### 4.7 Householder data in Follow-up invitations

- **Sent:** date and time; first name or a nickname (editable); one location — address + map pin, or a "meeting point" text instead; an optional topic of at most 80 characters (hint: leave beliefs out).
- **Never sent:** surname, phone, email, custom fields, visit notes, visit history, the Bible Study flag. The buddy never receives the Contact.
- **Lifetime:** a pending invitation expires at the start time; an accepted one is wiped from both phones 24 h after the Visit; the owner can revoke anytime. No save, share, or copy on the buddy's side.
- **Why:** data revealing religious interest is GDPR Art. 9 special-category data, and the CJEU (C-25/17, _Jehovan todistajat_, 2018) held that notes taken during door-to-door preaching fall under data-protection law rather than the household exemption. Not legal advice — minimize, time-box, and explain in copy.

### 4.8 Compliance checklist

- **Guideline 1.2** (user-generated content): display names and topics are user text → "Report a concern", "Remove & block", a published contact, minimal free text.
- **Guideline 5.1.1(v)** (deletion): "Delete my Buddies data" wipes the inbox, slots, invites, and devices — not a deactivation.
- **Guideline 5.1.2**: the field-by-field preview is the consent story for sharing a householder's data.
- **Export compliance**: `ITSAppUsesNonExemptEncryption: false` must be revisited when E2EE ships.
- **Privacy copy**: `privacyOnDeviceDesc` says "Nothing is sent to us or stored on our servers" — reword before launch; update the privacy policy, App Privacy labels, and the processor list (Cloudflare, Sentry, Apple or Expo push).

### 4.9 Key recovery

| Situation                            | Result                                                        | Re-pair? |
| ------------------------------------ | ------------------------------------------------------------- | -------- |
| Reinstall, same phone                | Seed still in Keychain; device re-enrolls                     | No       |
| New phone with iCloud Keychain on    | Seed and roster restore automatically                         | No       |
| Second device with Keychain sync off | Buddies unavailable there ("link this device" QR comes later) | —        |
| Signed out of iCloud                 | Paused until signed back in                                   | No       |
| Factory reset without Keychain sync  | Identity lost; buddies see a changed safety code              | Yes      |
| Apple Account compromised            | Attacker can restore the seed; only fix is a new identity     | Yes      |

## 5. Invite and management UX

### 5.1 Where it lives

A dedicated **Buddies** screen, reached from a row in the Settings drawer (next to Publisher) and from the buddy avatars in the profile overlay, plus contextual entries: the calendar legend and empty state, and the Follow-up box. **No new tab.** Home shows buddy items only when something needs action in the next 24 h.

### 5.2 Inviting

1. **Invite sheet** (dismissible — no Cancel button): plain bullets on what's shared, the name the buddy will see (editable), the Sharing Level (default _Days and times_), "3 of 5 spots left", and "works once · expires Sep 30". Two actions: **Share link** (share sheet; Messages recommended) and **Show QR code** (in person).
2. **Invitee without the app:** a static page with the App Store button, "after installing, tap the invite link again", and a Copy link button. In the app, "I have an invite" offers a paste button (`UIPasteControl` — no clipboard prompt, no attribution SDK).
3. **Pre-accept screen:** "Maria invited you to be buddies" → _What Maria will see_ / _What you'll see_ / _Never shared_ / your display name / your Sharing Level / expiry → **Accept** or **Not now** (silent). Clear states for already-buddies, expired or used ("ask Maria for a new link"), cap reached, and your own link.
4. **Inviter confirmation:** a push says "Maria accepted" → confirm screen (name, first-time label, optional safety code) → **Confirm** or **This isn't who I invited**.

### 5.3 Managing

- **Buddies list** in the User's own order (never by activity). Pending invites show "waiting · expires in 3 days" with **Send again** and **Cancel**. The Invite button disables at 5 with a one-line reason.
- **Buddy detail:**
  - _What you share with Mom_: Plans Sharing Level, activity (later), **Pause**.
  - _What Mom shares with you_: show on calendar, color, private rename.
  - _Notifications_: mute celebrations. Logistics — Follow-up invitations and replies — stay on, and the toggle says so.
  - _Upcoming together_, _Verify safety code_, **Remove buddy** (with a Block option).
- **Privacy & safety:** a summary of who sees what, **Stop sharing with everyone**, **Delete my Buddies data**, and **Report a concern**.

## 6. Feature UX

### 6.1 Calendar sharing (#288)

- **Sharing Levels** per buddy and direction: _Off · Days only · Days and times_ (default) _· Days, times, and notes_. Covers Day Plans and resolved Recurring Plan instances from today to +8 weeks. Past days are never shared.
- **Never shared:** Category/Type, Assistant-sourced flags, Off Days and Meeting Days, Time Entries, hours, goals, Service Report figures, Follow-ups.
- **Rendering:** the day cell keeps its size; up to two small buddy-colored dots along the bottom edge ("+" for more); a fixed 5-color accessible palette with initials; VoiceOver reads "Mom and Anna plan to go out". The legend gets a Buddies row with per-buddy show/hide. The day sheet gains a faded, read-only Buddies section (avatar, time window, note if shared) with **I'll come too**. Never total or chart a buddy's time.
- **I'll come too** creates the User's _own_ prefilled Day Plan ("With Mom") and tells the buddy; if the buddy's Plan changes, the row offers **Match** or **Keep mine**. A "both planning" chip appears when days overlap.
- **The Assistant ignores buddies' Plans** in v1: it exists to close the User's own goal gap, using a buddy's data there is a use they never agreed to, and it would read as nudging. Plans created via "I'll come too" are the User's own and count normally.

### 6.2 Device calendar sync (#265) — deltas to `calendar-sync-plan.md`

- Add a title-privacy choice: _Name and address · First name only · Just "Follow-up"_. At minimum, warn when the target calendar is Google or shared, because those events leave the device unencrypted.
- Write only the User's own data. Never write buddies' Plans. Accepted Shared Follow-ups may sync and are deleted when they expire.
- Update the plan's paths to the three-tier layout (`src/app/calendar-sync/`, `features/settings/screens/CalendarSyncScreen.tsx`).

### 6.3 Invite a buddy to a Follow-up

1. **Entry:** "Invite a buddy" in the Follow-up box on Contact details and in that Visit's menu — upcoming Follow-ups only.
2. **Sheet:** pick one buddy → a **preview of exactly what they'll see** (§4.7 fields, with toggles) → Send.
3. **Owner's Follow-up box** shows _Invited · Coming · Can't make it · Expired_.
4. **Buddy's push:** "Levi invited you to a Follow-up · Sat 10:00" with **I'll come** / **Can't make it** — never the householder's name or address on the lock screen. Accepted items appear read-only as "Follow-up with Levi" in the schedule and on Home; the buddy sets their own reminder.
5. **Changes:** a same-day time change keeps the acceptance and shows "Changed"; a date change asks again; dismissing or deleting the Follow-up cancels it; logging the Visit completes it quietly; then the 24 h wipe.

### 6.4 Buddy activity and awards (later phases)

- **Activity sharing** (feature 6) is **opt-in per buddy, default Off**: _Days I went out_ (calendar marks, no numbers), with a separate **Include my hours** toggle (default off) for close partners who want it. No presence ("out now"), no inactivity nudges, no rankings.
- **Awards** (feature 5) are **keepsakes, not targets**: earned on-device, never revoked, no locked badge walls, breaks don't count against anyone, earnable in every Publisher role. Existing Milestones, the Annual Goal, and Achievement Tiers appear only as private keepsakes — no second celebration.
- **Catalog v1 (14):** First Day Out · Steady Weeks (4/12/26/52 weeks with time out) · Every Month (each month of a Service Year) · Month Well Planned · First Return Visit · Faithful Follow-through · Keeping at It (a conversation after 2+ Not at Homes) · Groundwork Laid · First Study This Service Year (always private) · Two by Two (went out with a buddy) · Service Anniversary · plus the Milestone, Annual Goal, and Achievement Tier keepsakes (always private). Rejected: shareable hour thresholds, "plans kept" (Plans are forecast, never completed — ADR 0003), daily streaks, "comeback".
- **Encourage:** a single tap in reply to a celebration a buddy _chose_ to share. Only the recipient sees who sent it; no counts, no free text, one per celebration, can be turned off.

### 6.5 Notifications

Only logistics interrupt in real time. Social events are passive or in-app. The app badge counts only things waiting on the User.

| Event                                                 | Default                 | Channel             | Interruption level                   |
| ----------------------------------------------------- | ----------------------- | ------------------- | ------------------------------------ |
| Buddy accepted your invite (confirm)                  | On                      | Push                | Active                               |
| Invite declined or expired                            | —                       | In-app only         | —                                    |
| Buddy ended the connection or paused                  | —                       | Silent              | —                                    |
| Invited to a Follow-up                                | On                      | Push with actions   | Active; Time Sensitive within 60 min |
| Buddy is coming / can't make it                       | On                      | Push                | Active / Passive                     |
| Follow-up changed (coalesced over 5 min) or cancelled | On                      | Push                | Active; Time Sensitive within 60 min |
| Buddy joining your Plan / a joined Plan changed       | On                      | Push                | Active                               |
| Both planning the same day                            | Off (chip always shown) | Evening-before push | Passive                              |
| Buddy shared a celebration                            | Off (in-app on)         | Push optional       | Passive                              |
| Encouragement received                                | On                      | Push                | Passive                              |
| Buddy's hours, Milestones, Tiers, "out now"           | Never                   | —                   | —                                    |

### 6.6 Anti-features

Buddies never gets: leaderboards or rankings · hour comparisons or charts · competitions · shared or daily streaks and "streak lost" copy · inactivity nudges · feeds, posts, comments, chat, emoji reactions · like or follower counts, public profiles, discovery, contact upload · presence, "last active", live location, read receipts · the word "group" (it collides with field service groups) · householder data outside a previewed, expiring invitation · AI processing of buddy data · "magic link" wording.

## 7. Roadmap

| Phase                         | Ships                                                                                                                                                                                         | Main risk                                                              |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| **0 · Spikes** (days)         | Worker → APNs on `ww-proxy-dev`; NSE decrypting with the synced seed while locked; `/b#…` delivered on cold start, after install, and from Messages; Ed25519 verification in Workers          | APNs fails → Expo Push; fragment lost → path secret with log scrubbing |
| **1 · Foundations**           | Fix `/c/` links (§8); device calendar sync (#265); move App Attest to `src/lib`; `ww-crypto`; AASA `/b`                                                                                       | Low                                                                    |
| **2 · Plan together**         | Seed, relay inbox, invite (link + QR), confirm, Buddies screen + detail, calendar overlay + I'll come too (#288), push + NSE, remove and block, stop-all, delete-my-data, kill switch, report | Keychain edge cases; APNs production setup                             |
| **3 · Follow-up invitations** | §6.3 end to end                                                                                                                                                                               | Householder data handling                                              |
| **4 · Activity + awards**     | Private award collection → opt-in sharing + Encourage → opt-in activity                                                                                                                       | Staying "not social media"                                             |
| **5 · Hardening**             | Device-link QR (no Keychain sync), key rotation, safety-code polish, limit tuning                                                                                                             | Ops load                                                               |
| **Later · Territory (#434)**  | Group mailboxes (§3.8)                                                                                                                                                                        | Multi-writer merge, roles                                              |

## 8. Fix now: contact share links leak householder data

- **What happens today:** `buildContactShareLink` (`src/features/contacts/lib/contactShareLink.ts`) encodes the Contact — name always; phone, email, address, coordinate, custom fields optionally — plus **up to 50 visits with notes and Follow-up topics** as gzip + base64url in the **path**: `/c/<payload>`, up to 4 KB. That's encoding, not encryption.
- **Where it goes:** iMessage fetches link previews from the _sender's_ device, and Slack, Discord, and Messenger fetch them server-side, so the full path reaches ww-proxy routinely. Production has `[observability] head_sampling_rate = 1` and `logs.persist = true`; ww-proxy's `src/sentry.ts` sets `tracesSampleRate: 1.0` and `sendDefaultPii: true` (Sentry's Cloudflare SDK records the full URL); the Worker echoes the payload into `og:url` and a `witnesswork://` link. Religious-interest notes about third parties are likely sitting in Cloudflare logs and Sentry traces.
- **Fix:** emit `/c#<payload>` and keep parsing the old form; make the fallback page read nothing from the path; set `sendDefaultPii: false` and scrub URLs in `beforeSend` / `beforeSendTransaction`; turn off invocation logs for `/c/*` (or entirely); purge existing logs and traces; update the AASA for the fragment form one version ahead; consider a field-by-field preview before sending, as Follow-up invitations will have.

## 9. Corrections to `friend-sharing-plan.md`

| The old plan says                                                                                       | Correction                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CloudKit public DB as the encrypted bus                                                                 | Public records are readable by every app user and writable by any signed-in user per record type — the graph leaks and removal can't be enforced. Use the relay. |
| Keys live in the iCloud Drive payload                                                                   | iCloud Drive isn't E2EE under standard protection, and iCloud Sync is Supporter-only. Use a synchronizable Keychain seed.                                        |
| CKShare rejected because "private isn't E2EE"                                                           | Right conclusion; the precise reason is that `encryptedValues` and shares are E2EE only with ADP on every participant.                                           |
| Public-DB records count against the user's iCloud quota                                                 | They count against the app's quota; Apple no longer publishes per-user limits.                                                                                   |
| "ww-proxy never sees the link payload"                                                                  | Only a `#fragment` stays on-device; paths reach the server through previews and fallback pages.                                                                  |
| Reciprocal two-link handshake                                                                           | One link, a relay-mediated claim, and a one-tap inviter confirmation.                                                                                            |
| UI suggests 25 friends; "friendly social pressure"; auto-published milestone and month-completed events | 5 buddies; encouragement; opt-in sharing with no numbers by default.                                                                                             |
| `src/screens/...` paths                                                                                 | Three-tier layout (`src/features/buddies`, `src/app/buddies`, `src/lib/*`).                                                                                      |

Once this document is accepted, mark `friend-sharing-plan.md` superseded.

## 10. Open decisions

Decided (2026-09-23):

- **Free** for everyone — not Supporter-gated, and never linked to RevenueCat ids.
- **No geographic constraints** — no region gating; the E2EE/metadata design is the protection.
- **Behind a feature flag** — PostHog `buddies` (UI visibility, fails closed) plus the relay kill switch `buddies:enabled`.
- **No separate minors policy** — the protections are structural (invite-only, mutual consent, no discovery, no chat, no location). Revisit only if chat, discovery, or account data is ever added; answer Apple's age-rating questions accurately at release.

Still open:

1. ~~Free or Supporter?~~ Decided: free.
2. **Default Plans Sharing Level:** _Days and times_ (recommended) vs _Off_ with a one-tap prompt after connecting.
3. **Invite expiry:** 7 days (recommended) vs 72 h.
4. **Inviter confirmation:** explicit one tap for links, automatic for in-person QR (recommended) vs auto-accept with "Not who you expected? Remove".
5. **Activity scope:** "Days I went out" plus a separate hours toggle, both opt-in (recommended) — or never share hours at all.
6. **Multi-device requires iCloud Keychain in v1** (device-link QR later) — acceptable?
7. ~~Countries where the work is banned~~ Decided: no geographic constraints. An app lock remains worth considering separately.
8. ~~Minors~~ Decided: no separate policy (see above).
9. **Review-reminder cadence:** 3 days, then every 90 days — can Users turn it off?
10. **Push path:** APNs direct vs Expo Push — decided by the Phase 0 spike.
11. **`/c/` fix timing:** recommend now, as its own PRs in both repos.

## 11. Spikes and unverified claims

- **Phase 0 spikes:** Worker → APNs over HTTP/2 in production; NSE reading the synchronizable Keychain item while locked; universal-link fragment delivery on cold start, after install, and from Messages; AASA fragment matching; Ed25519 in Workers WebCrypto.
- **Unverified:** CloudKit public-DB quotas (Apple publishes only "up to 1 PB"); how many Users have iCloud Keychain off; exactly which URL fields Workers Logs retain and for how long; the precise wording of C-25/17; whether a pseudonymous relay record counts as an "account" under 5.1.1(v).
- **Usage assumptions:** the PostHog pull was blocked (`posthog-cli` isn't logged in). Re-run sizing before Phase 2 — MAU, opens per day, Plans and Follow-ups per User, notification-permission rate.

## Appendix: proposed language (add to `CONTEXT.md` when implemented)

- **Buddy** — another User paired through a Buddy Invite; mutual; at most 5. _Avoid_: friend, follower, connection.
- **Buddy Invite** — a single-use, expiring link or QR code whose secret lives in the URL fragment.
- **Buddy Card** — the encrypted snapshot of Plans (and opt-in activity) a User shares with one Buddy; replaced, never appended.
- **Sharing Level** — the per-Buddy choice of what a Buddy Card contains.
- **Shared Follow-up** — a Follow-up a User invited a Buddy to; minimal householder fields; expires after the Visit. _Avoid_: shared contact.
- **Relay** — the part of ww-proxy that stores Buddies ciphertext. _Avoid_: account, server sync.
- **Award** — a personal keepsake earned on-device; private unless the User shares it.
- **Encourage** — a one-tap reply to a celebration a Buddy chose to share.
