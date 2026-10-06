---
status: accepted
---

# Supporter Pause: offer a break before cancelling

## Context

Supporters who want to stop had no path in the app, only a line telling them to visit the App Store, which Android users saw too. We want to offer a pause of 1, 3, or 6 months before someone cancels, without pressure. Cancelling must stay one clear step away.

Neither store lets an app pause a subscription itself.

- **App Store.** There is no pause. The closest tool is a free **promotional offer**, signed with the In-App Purchase key that RevenueCat already holds. For the product someone already has, the free period starts at the next billing date. Access continues, and the subscription renews automatically at the same price. Apple's renewal-date extension is limited to service issues, at most 90 days and twice a year, so it isn't suitable.
- **Google Play.** Play has a real pause: no charge, no access, and automatic resumption. It is limited to 1–3 months and enabled app-wide in Play Console. The Play Developer API has no way to start one. Play's own cancel flow already offers it.
- **RevenueCat Customer Center** offers the same promotional offers behind a survey, but would add a native dependency and keep copy outside `en-US.json`. **Retention Messaging** (the App Store's cancel screen) is the only way to reach people who cancel from iOS Settings, and is a possible follow-up.

## Decision

Manage Subscription (Settings → Manage subscription, and the active card in the Paywall's Your donations) opens a sheet. The sheet offers a pause when one is available. Its footer always shows the store's own management screen ("Cancel or change subscription").

- **iOS: "Pause payments" for 1, 3, or 6 months** redeems a free promotional offer on the current product (`getPromotionalOffer`, then `purchaseDiscountedProduct`). Supporter features stay on throughout. The sheet shows when payments resume: the current expiration plus N months.
  - Offers are found in `product.discounts` by identifier `supporter_pause_<n>m_<productId>`. App Store Connect requires offer identifiers and names to be unique across the app.
  - An offer is used only when it is free and its duration matches its name. Products without offers show no pause, so a missing offer never looks broken.
- **Android: "Pause in Google Play"** (monthly plans only, because Google's docs disagree about annual plans) opens the subscription's Play page. The copy says Supporter features pause too and come back automatically.
- **Who can pause:** an active subscription from this device's store that is renewing, in a normal (non-trial) period, without a billing issue, and not Family Shared. If more than one subscription is renewing, no pause is offered.
- **iOS limit:** one pause per 12 months, counted from redemption. The redemption and resume dates are synced preferences (`supporterPauseStartedAt`, `supporterPauseResumesAt`), because all of a user's devices share one RevenueCat customer (ADR 0011). Apple sets no limit of its own.

`src/features/supporter/lib/supporterPause.ts` holds the rules. `useManageSubscription` and `ManageSubscriptionSheet` hold the store calls and UI.

## Store setup

- **App Store Connect:** each of the 31 subscriptions in the "Recurring Donation" group carries three free promotional offers (`ONE_MONTH`, `THREE_MONTHS`, `SIX_MONTHS`, one period each). They are available in all of the subscription's territories and were created with `asc subscriptions offers promotional create`. A new subscription product needs the same three offers, or it shows no pause.
- **RevenueCat:** the In-App Purchase key must stay configured so offers can be signed.
- **Play Console:** Subscription settings → Pause must stay enabled.

## Consequences

- An App Store pause gives up the skipped payments. That costs revenue only from Supporters who wouldn't have cancelled anyway, and the yearly limit caps it. Free promotional days don't count toward the App Store's year of paid service for its lower commission rate.
- The app enforces the iOS limit, not Apple. A reinstall without iCloud Sync resets it. That only costs pauses on a voluntary donation, so we accept it.
- A Google Play pause makes the subscription inactive, so the lapse survey (ADR 0013) can reach a paused user. `react-native-purchases` 10.4.0 doesn't expose `autoResumeDate`, so paused and lapsed users can't be told apart yet. The Paywall card shows "Inactive" during a Play pause.
- People who cancel from iOS Settings or the Play Store never see the sheet. Play's own flow already offers pause there, and on iOS that would take Retention Messaging.
