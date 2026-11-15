---
status: accepted
supersedes: [0040]
---

# Cloud Sync photo storage follows the plan

> Supersedes only ADR 0040 §6's storage limit. Everything else in ADR 0040
> still holds: sync itself stays free for everyone.

## Context

ADR 0040 gave every account 2 GB of Cloud Sync photo storage. Storage on
ww-api's R2 is the only running cost of sync, and it grows with every account,
while most accounts store far less: a note photo is about 400 KB and a contact
photo less. Supporters fund that cost, but got nothing more for it here.

## Decision

- **Free accounts get 200 MB** (200,000,000 bytes), about 1,000 note photos.
- **Supporters get 5 GB** (5,000,000,000 bytes). It's a Supporter benefit, on
  the paywall's comparison chart as "Cloud Sync photo storage".
- **The server decides.** ww-api reads the account's Supporter status (ADR 0029) for every photo route and answers the matching `usage.limit`. The app
  shows that limit and never enforces one of its own. When the status can't be
  read (RevenueCat or the database is down), the server uses the Supporter
  limit, so an outage never tells a Supporter their storage is full.
- **Lowering the limit deletes nothing.** An account already past 200 MB keeps
  every photo it has; only new uploads wait for room, as at any full limit.
- **Almost full is 90%.** Past it, a free account sees an upsell card at the
  top of Settings and in Settings → Sync, after the one iOS shows when
  iCloud runs low: what's used, a capacity bar, and one button to the paywall.
  A ✕ hides the Settings card until storage turns full, or until usage drops
  under 90% and climbs back; the card in Settings → Sync stays.
- **Optimize Photo Storage.** Past 90% (and while it's on), Settings → Sync
  offers a switch that saves new photos smaller: note photos at 1280 px and
  JPEG quality 0.6 instead of 2048 px and 0.8, contact and profile photos at
  768 px and 0.7. It syncs with the other preferences and changes only photos
  added after it's turned on.
- **Becoming a Supporter resumes uploads.** A larger limit counts as room, the
  same as deleting photos does.

## Considered options

- **Keep 2 GB for everyone.** Leaves the largest cost of sync unfunded and
  gives Supporters nothing for it.
- **Re-compress photos already synced when Optimize is turned on.** Photo
  names are immutable per revision, so it means a new revision of every photo
  and rewriting every record that names one, on every device. Deferred; the
  switch covers new photos, which is what fills an account that's nearly full.

## Consequences

- Accounts over 200 MB that aren't Supporters stop syncing new photos until
  they delete some, optimize, or support. Older app versions already handle a
  full account, so the change ships from the server alone.
- The daily upload cap is 10 GiB, twice the Supporter limit, so a Supporter's
  first sync fits in a day.
