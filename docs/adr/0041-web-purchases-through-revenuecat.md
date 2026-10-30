---
status: proposed
---

# Web purchases through RevenueCat

## Context

The web app (ADR 0037) shouldn't stop anyone from becoming a Supporter or
leaving a Tip. In the native apps, the App Store and Google Play are the
merchants of record and handle tax. RevenueCat keeps Supporter status in step
across platforms (ADRs 0014 and 0029).

## Decision

### 1. RevenueCat Billing for everything sold on the web

Supporter subscriptions and Tips are sold on the web at the same prices as in
the stores, unlocking the same entitlements.

### 2. Hosted checkout

Checkout uses RevenueCat's Web Purchase Links, so Stripe's scripts never run
on the app's origin, where decrypted data lives. Those links carry the
RevenueCat customer id in the URL, so:

- the return page strips it before analytics or session replay can see it;
- the app sends no referrer.

### 3. We are the merchant of record, so no sales where tax applies from the first sale

RevenueCat Billing runs on our own Stripe account; RevenueCat isn't the
seller. EU and UK VAT apply from the first sale, and we aren't registering for
either yet. So the web doesn't sell to buyers there:

- The web paywall checks the visitor's country, as Cloudflare sees it, and
  points EU and UK visitors to the app stores instead.
- Stripe blocks EU and UK card and billing countries.

Countries that tax digital sales from the first sale are blocked the same
way, and all of Canada until the web can see provinces (Manitoba and
Saskatchewan tax from the first sale). Countries with a registration threshold
stay open; we review sales against those thresholds and register or block
before reaching one.

### 4. The same customer everywhere

The web logs in to RevenueCat as the account's customer, using the id kept in
the encrypted sync data (ADR 0040 §7). A web purchase shows on the User's
phones right away, and a phone purchase shows on the web.

### 5. Supporter status on the web

The web reads RevenueCat's customer info, with ww-api's answer as a fallback.

### 6. Email

Checkout asks for an email for the receipt. It stays in our Stripe and
RevenueCat accounts, linked to the purchase, and never reaches WitnessWork's
servers or the app. The privacy policy says so.

## Considered options

- **Stripe Managed Payments.** Stripe would be the merchant of record, but it
  needs RevenueCat's Stripe Billing engine instead of RevenueCat Billing. We
  chose RevenueCat Billing.
- **Paddle.** It would be the merchant of record, but its rules exclude
  donations, which puts Tips at risk.
- **Embedded checkout.** Stripe's scripts would run next to decrypted data.
- **Selling in the EU and UK.** That needs VAT registration from the first
  sale.

## Consequences

- Users in the EU, the UK, the other first-sale countries and Canada support
  WitnessWork through the app stores for now.
- We owe sales tax only where we reach a country's threshold, and nothing
  where tax applies from the first sale, because we don't sell there on the
  web.
- RevenueCat's dashboard holds web products next to the store products. Its
  hosted portal handles subscription changes and cancelling for web
  purchases. Refunds go through support, from the dashboard.
- The contract is [`web-purchases.md`](../web-purchases.md).
