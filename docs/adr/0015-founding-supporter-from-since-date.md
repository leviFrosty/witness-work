---
status: accepted
---

# Founding Supporter is derived from the Supporter `since` date

Supersedes the Founding Supporter half of ADR 0001.

A **Founding Supporter** is a current **Supporter** whose `since` date (`supporterSinceDate`: the earliest original purchase date among the active entitlements that qualify under ADR 0014) is before `FOUNDING_SUPPORTER_CUTOFF`, the start of 2026-05-21 UTC. That is the day the 1.38.2 version (The Milestone Update, which launched the Supporter tier) was created in App Store Connect, so it falls before the tier could have been live. Founding means "supported before Supporter perks existed". The predicate is `isFoundingSupporter(since)` in `src/lib/foundingSupporter.ts`; it shows on the profile tenure line, the profile overlay stat, and the Settings Supporter card. The `SupporterBadge` chip stays unchanged because it marks Supporter-gated features, not the user.

ADR 0001 keyed recognition off a device-local `seenFoundingSupporterReveal` flag set when the Founding reveal was dismissed. That reveal never shipped, so no install ever set the flag. A device flag also never syncs and is lost on reinstall. Deriving recognition from RevenueCat makes it follow Supporter status across devices with nothing to store, and a past cutoff means it can't be bought now.

## Consequences

- **Lapse and resubscribe**: a lapsed Founding Supporter has no `since`, so the recognition is hidden along with all Supporter UI. It returns on resubscription only if the store still reports the original purchase date. For App Store subscriptions that is the expected behavior within the same Apple ID and subscription group; a new Apple ID or store yields a new date and no Founding recognition. This matches the "Supporter for N days" tenure line, which reads the same date.
- **Promotional and Lifetime grants** count by their grant date, like any qualifying entitlement. A Founding subscriber who is gifted Lifetime and then lets the subscription lapse moves to the grant date and loses Founding, as their tenure line already does.
- **Tips** never count, because ADR 0014's rule already excludes them from `since`.
- `seenFoundingSupporterReveal` is dropped by the preferences persist migration v8 → v9.

## Considered alternatives

- **Keep the flag and ship a reveal**: rejected. It can't recognize anyone retroactively, is per-device, and doesn't survive a reinstall.
- **Cutoff at the release that ships the badge**: rejected. It would include anyone who joined after perks existed, and the line would be arbitrary.
- **Sticky "ever founding" from expired entitlements** (`entitlements.all`): rejected for now. It would survive gift-then-lapse and store re-issues, but it needs a second tip-exclusion rule without `activeSubscriptions` and would disagree with the tenure line.
