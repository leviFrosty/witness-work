---
status: proposed
---

# Sync is free, and Cloud Sync carries photos

## Context

Sync has been a Supporter benefit (ADR 0030 §6). The web app (ADR 0037) works
only with Cloud Sync, and Cloud Sync doesn't carry photos yet (ADR 0030 §9).
This ADR replaces those two sections of ADR 0030.

## Decision

### 1. All sync is free

Cloud Sync, iCloud sync and Google Drive sync are free for everyone, photos
included:

- `featureAccess` loses its sync gate, and the Supporter lapse gates for sync
  go away.
- ww-api's `sync:entitlement` becomes `everyone`.

Nothing sync-related is a Supporter benefit.

### 2. Defaults

- **New installs** start with Cloud Sync on, following ADR 0030 §3's
  never-chosen rule, now for everyone.
- **Existing installs** aren't switched. They get one notifications-tray alert
  offering Cloud Sync with one tap (§4).
- **Devices on iCloud or Drive** keep it.
- **An explicit off** stays off.

### 3. Supporters

No new perks yet. Supporters keep:

- Scribe AI's higher limits;
- accent colors and app icons;
- Route Planning;
- buddy color.

### 4. Messages

- **Non-Supporters, in the tray:** "Cloud Sync is now free. Keep your data in
  step across iPhone, Android and the web, end-to-end encrypted." Button: Turn
  On.
- **Supporters, in the tray:** a thank-you, not a pricing message: "Thank you
  for supporting WitnessWork. Your support built Cloud Sync and WitnessWork on
  the web." Button: Turn On Cloud Sync. It never says "free".
- **Public release notes and Updates:** lead with WitnessWork on the web and
  Cloud Sync across iPhone, Android and the web. Close with "Made possible by
  our Supporters". They never say "free".
- **Supporter benefit lists:** the paywall, store listing and Help Center no
  longer list sync.

### 5. When a browser needs Cloud Sync

If the account's devices aren't on Cloud Sync:

1. The web shows "Turn on Cloud Sync to use WitnessWork here", with Turn On
   and Sign Out.
2. Turn On sets an account flag on ww-api.
3. The next time a phone on the account opens, it switches to Cloud Sync,
   merging so nothing is lost (ADR 0030 §4), and shows a toast.

Meanwhile:

- The web says "Open WitnessWork on your phone to finish".
- If the account's phone is too old to know the flag, the web says "Update
  WitnessWork on your phone".

### 6. Photos over Cloud Sync

- **What travels:** the profile photo, Contact photos and photos in notes.
  Each goes as an encrypted blob under the account, with an immutable name per
  revision, referenced from the sync payload. Buddies' photo blobs are the
  model.
- **Originals are stored.**
- **Storage:** 2 GB per account. Settings → Account shows the usage.
- **At the limit:**
  - New photos stay on the device that added them, with a "Not synced:
    storage full" badge.
  - Photos already synced are untouched.
  - Settings → Account shows "Storage full".
  - Deleting photos frees space right away. Deleted photos' files are removed
    30 days later.
- **Older app versions** ignore photo references they don't know, and show
  initials as they do today.

### 7. One RevenueCat customer per account

The account's RevenueCat app user id travels inside the encrypted sync data.
So every device that unlocks the account, the web included, is the same
RevenueCat customer:

- A web-only account creates the id.
- A phone that signs in later adopts it, following ADR 0011's adoption rule.

`useIsSupporter` also accepts ww-api's answer (ADR 0029) as a fallback.
Purchases are in ADR 0041.

## Consequences

- **More data on ww-api's R2:** a snapshot for every new install, and up to
  2 GB of photos per account. Storage is the only cost.
- **Supporters:** the reason to support rests on funding development and the
  remaining perks. Messages to Supporters never say sync is free.
