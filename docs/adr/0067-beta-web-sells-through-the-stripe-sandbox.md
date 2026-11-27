---
status: accepted
supersedes: [0014]
---

# Beta web sells through the Stripe sandbox

## Context

The web sells Supporter subscriptions and Tips through RevenueCat Billing
(ADR 0041). The first setup gave Beta web the production config, on live
Stripe, like the Beta phone apps. ADR 0014 let a RevenueCat Billing sandbox
subscription count only in development builds and on the development worker,
so a sandbox config on Beta would have sold nothing that counted.

On the phones, a TestFlight or Play test purchase is free: the stores run it in
their own sandbox. On Beta web, live Stripe charged a real card. Testers had to
pay, and we had to refund every test purchase.

## Decision

1. **Beta web uses a sandbox config.** It sells through
   `WitnessWork Web (Sandbox)`, a RevenueCat Billing config on a Stripe
   sandbox, in the WitnessWork project that the Beta phones and the Beta
   worker already use. Production web keeps `WitnessWork Web` on live Stripe.
2. **One rule names the mode.** `webBillingFor(variant)`
   (`src/lib/webBilling.ts`) is `sandbox` for development and Beta builds and
   `live` for production. A sandbox build keeps only `sandbox/…` Web Purchase
   Links and counts sandbox web purchases toward Supporter status. A live build
   keeps only live links and ignores sandbox web purchases.
3. **The Beta worker counts them too.** `REVENUECAT_COUNT_WEB_SANDBOX = "true"`
   is set in `[env.beta.vars]` and `[env.dev.vars]`, and never in top-level
   `[vars]`. Tests in ww-api fail if production sets it.
4. **The web build checks the values.** `scripts/web.mjs` warns when a Beta
   build has no sandbox key and links. It stops a production build that has a
   sandbox key or a sandbox link.
5. **Beta's checkout returns to Beta.** The sandbox config's success redirects
   go to `https://beta.app.witnesswork.app/supporter/thank-you`. Beta no
   longer adds the `beta` return key. Production still forwards a return that
   carries the `beta` key, so a checkout started on Beta before this change
   still returns to Beta.

## Considered options

- **Keep Beta on live Stripe and refund every test purchase.** This tests
  real payments before production, but testers pay with real cards and every
  test needs a refund.
- **A separate RevenueCat project for Beta.** This keeps sandbox data apart,
  but the Beta phones and the Beta worker use the WitnessWork project. A web
  purchase must reach them, so the config has to be in that project.

## Consequences

- Testers buy on Beta web with Stripe test cards, and their purchases make
  them Supporters on Beta, on the Beta phones, and on the Beta worker.
- Production ignores sandbox web purchases, in the app and on its worker, as
  before.
- No live web payment happens before production. The first live check is one
  real purchase on `app.witnesswork.app`, refunded from the RevenueCat
  dashboard.
- The sandbox config's Stripe sandbox must stay claimed. A claimable sandbox
  that is not claimed in time expires, and Beta web stops selling.
- The production web app's `beta` return key now only serves checkouts that
  started on Beta before this change. Remove it when no such checkout can
  still return.
