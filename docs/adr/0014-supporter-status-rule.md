---
status: accepted
---

# Supporter status: an active subscription or a Lifetime grant, never a Tip

## Context

Two places decide who is a **Supporter**. The app uses `supporterSinceDate` (`src/lib/supporterSince.ts`, read through `useIsSupporter`) for gating and recognition. ww-api uses `isSupporter()` (`src/revenuecat.ts`) to pick the Notes Import allowance. The two had drifted apart.

The server looked up a single entitlement named by `REVENUECAT_ENTITLEMENT_ID` (`Supporter`) and treated any non-expiring copy of it as a Supporter. The RevenueCat project has no entitlement with that name:

- Monthly and annual subscriptions, on both stores, unlock `Monthly Donator`.
- Tips unlock `One Time Donator`.
- Gifted access is the promotional `Lifetime Supporter` entitlement.

So no one passed the server check. Keying on a name was also unsafe for Tips. RevenueCat reports a non-subscription entitlement as non-expiring, so a Tip product attached to the checked entitlement would have made a Tip-giver a permanent Supporter. ADR 0002 rules that out.

## Decision

A User is a Supporter when at least one active RevenueCat entitlement is either:

1. **Backed by an active subscription.** The product behind the entitlement is a current subscription. This covers monthly or annual plans from either store and promotional grants from the RevenueCat dashboard, whatever the entitlement and duration.
2. **`Lifetime Supporter`.** This hand-given promotional grant qualifies even without a backing product.

An entitlement unlocked by a non-subscription purchase (a Tip or any other one-time product) never counts, whatever it is called. No other entitlement name matters. "Active" means a missing or future expiry, as RevenueCat reports it.

|                                  | App (`CustomerInfo`)                                                        | Server (REST v1 `GET /subscribers/{id}`)                                                           |
| -------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Active entitlement               | in `entitlements.active`                                                    | in `subscriber.entitlements`, `expires_date` null or future                                        |
| Backed by an active subscription | product in `activeSubscriptions` (Google Play lists `productId:basePlanId`) | `product_identifier` is a key of `subscriber.subscriptions` whose `expires_date` is null or future |
| Promotional grant                | `rc_promo_<entitlement>_<duration>`, treated as a subscription              | `rc_promo_*` key in `subscriptions`, `store: "promotional"`                                        |
| Tip                              | `nonSubscriptionTransactions`                                               | `subscriber.non_subscriptions`                                                                     |

Both checks fail closed. On the server, an unknown subscriber or any RevenueCat error means "not a Supporter", so the free meter applies.

Any change to this rule updates both implementations and their matching tests (`src/__tests__/supporterSince.test.ts` here, `src/revenuecat.test.ts` in ww-api) together.

## Considered options

- **Point the server at `Monthly Donator`.** Rejected. It keeps the rule tied to a dashboard name, so renaming or adding an entitlement would quietly split the app and server again. It would also ignore promotional grants of other entitlements, which the app counts.
- **Model gifted access as its own status.** Not needed. A `Lifetime Supporter` gets everything a paying Supporter gets.

## Consequences

- ww-api now gives paying Supporters and `Lifetime Supporter` grants the Supporter Notes Import allowance. Before this, the server matched no one.
- `entitlementId` on `isSupporter()`, ww-api's `config.entitlementId` and `REVENUECAT_ENTITLEMENT_ID` are deprecated and ignored. Remove them once no caller passes them.
- RevenueCat dashboard changes (new products, renamed entitlements) need no code change, provided subscription products stay subscriptions and Tips stay one-time products.
