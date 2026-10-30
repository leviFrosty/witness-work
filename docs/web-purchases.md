# Web purchases

How WitnessWork on the web sells Supporter subscriptions and Tips, and how
phones and the web agree on who is a Supporter. The decision is
[ADR 0041](./adr/0041-web-purchases-through-revenuecat.md). Who counts as a
Supporter is [ADR 0014](./adr/0014-supporter-status-rule.md). How ww-api learns
it is [ADR 0029](./adr/0029-supporter-status-on-the-server-account.md) and
[Supporter status](./accounts-protocol.md#supporter-status). Which RevenueCat
customer an account uses is [ADR 0040 §7](./adr/0040-sync-is-free-and-cloud-sync-carries-photos.md).

## How the web sells

The web sells through **RevenueCat Billing**, with our own Stripe account as
the payment gateway. We are the merchant of record. Checkout is RevenueCat's
hosted **Web Purchase Link** page on `pay.rev.cat`, so no RevenueCat or Stripe
script ever runs on the app's origin (ADR 0037 §5).

- **The SDK.** The web uses `react-native-purchases` in browser mode, as the
  phones use it natively. `CustomerProvider` configures it with
  `EXPO_PUBLIC_REVENUECAT_WEB_API_KEY` on the web. Prices come from
  `getOfferings()`, and status from `getCustomerInfo()`. Both are plain
  requests to RevenueCat's API (`api.revenuecat.com`), which the CSP's
  `connect-src` allows.
- **Never `purchasePackage` on the web.** In browser mode it renders Stripe's
  checkout inside the app. Buy opens the Web Purchase Link instead. The CSP's
  `script-src` doesn't allow Stripe, so a mistaken call fails without loading
  anything.
- **Store-only calls** throw "not supported on web platform", so the web never
  makes them:
  - `syncPurchases`;
  - `showManageSubscriptions`;
  - `invalidateCustomerInfoCache`;
  - `getProducts` and `getStorefront`;
  - `getPromotionalOffer` and `purchaseDiscountedProduct`, used for Supporter
    Pause;
  - the Customer Center.

  `restorePurchases` only returns the customer info, so the web offers no
  Restore Purchases: purchases follow the account.

### Products, entitlements and offerings

Every App Store product has a web twin in each RevenueCat Billing config:

| App Store product    | Web product              | Type                                | Offering / package           |
| -------------------- | ------------------------ | ----------------------------------- | ---------------------------- |
| `jwtime_<n>_1mo`     | `web_jwtime_<n>_1mo`     | Auto-renewing, 1 month              | `Monthly $x` / `$rc_monthly` |
| `jwtime_<n>_1yr`     | `web_jwtime_<n>_1yr`     | Auto-renewing, 1 year               | `Annual $x` / `$rc_annual`   |
| `jwtime_<n>_oneTime` | `web_jwtime_<n>_oneTime` | Consumable, so a User can tip again | `One Time $x` / `One Time`   |

Each offering holds one package, at the same USD price as its App Store
product. Like the stores, web products have no trial, introductory offer or
grace period.

- **Ids.** Web ids differ from store ids because RevenueCat's REST v1
  `subscriptions` map is keyed by product id, and ww-api reads it (ADR 0014).
- **Names.** Checkout and receipts show "WitnessWork Supporter (Monthly)",
  "WitnessWork Supporter (Annual)" and "WitnessWork Tip". Stripe accepts tips
  for a service provided, not donations, so web names never say donate or
  donation.
- **Entitlements.** Each web product is attached to the same entitlement as
  its App Store twin: subscriptions to `Monthly Donator`, Tips to
  `One Time Donator`. ADR 0014's rule covers them: a web subscription is in
  `activeSubscriptions` under its `web_` id, and a Tip is a non-subscription
  transaction.
- **Offerings.** Each web product is attached to the same package, in the same
  offering, as its App Store twin. So `getOfferings()` on the web has the same
  offerings and packages as on a phone, and the paywall code is shared.
- **Prices** are USD only for now. Outside the US and Canada, RevenueCat
  Billing prices include tax, like the stores' prices.
- **Changing the catalog.** A new store product needs its web twin, the same
  entitlement and the same package, in every RevenueCat Billing config.
  RevenueCat Billing can't edit a price: make a new product and swap it into
  the package.

### Configs and keys per environment

A Stripe sandbox needs its own RevenueCat Billing config, so there are two:

| Build                              | Config                      | Stripe                        | Key        |
| ---------------------------------- | --------------------------- | ----------------------------- | ---------- |
| Development (localhost, `app-dev`) | `WitnessWork Web (Sandbox)` | A Stripe sandbox, test cards  | `rcb_sb_…` |
| Beta and production                | `WitnessWork Web`           | Our Stripe account, live mode | `rcb_…`    |

- **Sandbox only in development.** Only development builds carry the sandbox
  key and links. A RevenueCat Billing sandbox subscription counts toward
  Supporter status only in development builds and on the development worker
  (ADR 0014). So Beta web uses the production config, like the Beta apps,
  whose App Store and Google Play test purchases still count.
- **Both configs hold the same products**, attached to the same entitlements
  and packages.

## Which RevenueCat customer the web uses

The web is the **account's** RevenueCat customer: the app user id kept in the
account's encrypted sync data (ADR 0040 §7, ADR 0041 §4). Every device that
unlocks the account is the same customer, so a web purchase shows on the
User's phones as soon as they refresh customer info, and a phone purchase
shows on the web.

- **Where the id comes from.** A web-only account creates the id, and a
  browser joining an account adopts the one in its sync data, under the same
  rule as phones (ADR 0040 §7, ADR 0011).
- **Buy waits for a settled id.** Buy is enabled only once the web has pulled
  the account's sync data and settled its RevenueCat id, so it buys as the
  customer the account's devices agree on. The id must also be one ww-api
  accepts (`toRevenueCatAppUserId`), never RevenueCat's anonymous
  `$RCAnonymousID:…`: Web Purchase Links need an identified customer.
- **The web links its customer to the account** (ADR 0029), as phones do, and
  again after every checkout return.
- **The id is never taken from a URL.** The return page's `app_user_id` is
  only removed. The web never logs in to RevenueCat with an id it was handed
  in a link. Otherwise a crafted link could make a User's purchases land on
  someone else's customer.
- **The id is never shown, logged or sent to analytics.** It reaches only
  RevenueCat (the SDK and the checkout URL) and ww-api.

## Links

Buy on a price opens:

```text
https://pay.rev.cat/<link>/<app user id>?package_id=<package id>&hide_back_button=true&skip_purchase_success=true
```

`<link>` is used as it is. The app user id and every query value are
URL-encoded; package ids can hold spaces (`One Time`).

- **One link per offering.** RevenueCat allows one Web Purchase Link per
  offering in a config, and it redirects to one URL. `<link>` comes from
  `EXPO_PUBLIC_REVENUECAT_WEB_PURCHASE_LINKS`, one line of JSON keyed by
  offering identifier:

  ```json
  { "Monthly $3.99": "<link>", "One Time $4.99": "<link>" }
  ```

  A sandbox link is `sandbox/<token>`. A price whose offering has no link gets
  no Buy button.

- **Where checkout returns.** Each config's links return to one host: the
  sandbox config to `app-dev.witnesswork.app`, the production config to
  `app.witnesswork.app`. A web app on any other origin adds
  `utm_content=<return key>` to the link, and RevenueCat passes `utm_*`
  parameters through to the redirect (see the return page).

- **Opening the link.** Buy builds the URL when it's pressed and opens it in
  the same tab with `location.assign`. The URL is never written into the page
  (no `href` or other attribute), so session replay and autocapture can't
  record it. The app's `Referrer-Policy: no-referrer` keeps the referrer out.
  The app's own state is already saved on the device, so leaving the page
  loses nothing.
- **Each link's settings in RevenueCat:**
  - package selection: the default page, which `package_id` skips;
  - success: redirect to the return page on the config's host, with the
    offering's `tier`;
  - returning customers: allowed to make another purchase, so a Donor can
    still subscribe and tip again.
- **Checkout** asks for the buyer's email for the receipt, and their full
  billing address (address collection is **Always**), so Stripe knows the
  billing country. Stripe and RevenueCat keep the email; the app never sees or
  stores it (ADR 0041 §6). Receipts and lifecycle emails come from RevenueCat
  under WitnessWork's name, and each one links to RevenueCat's customer
  portal.

## The return page

`/supporter/thank-you?tier=supporter|tip`. The link's success redirect sets
`tier`. RevenueCat appends `app_user_id` and any `utm_*` parameter the checkout
link had.

1. **The ids leave the address first.** The web entry removes `app_user_id`,
   and any other id RevenueCat may add (`redeem_url`), with
   `history.replaceState`. This runs before the app mounts and before
   analytics, session replay or error tracking start, so none of them sees the
   id. The removed `app_user_id` is kept in memory for step 4 only, and never
   saved.
   - **Analytics as a backstop.** The analytics client also drops these
     parameters from any URL it sends (`$current_url`, `$referrer`,
     `$initial_referrer`, and element `href`s), and keeps only the origin of a
     `pay.rev.cat` URL.
   - **What stays.** The checkout page's own entry in the browser's history
     holds the id in its path, and the app can't remove it. That's the
     known-id trade-off ADR 0029 §2 accepts.
2. **It forwards a checkout that started elsewhere.** When `utm_content` is a
   return key, the web entry replaces the page with the return page on that
   key's origin, carrying only `tier`, before the app mounts. The keys are a
   fixed list in the app, never an origin read from the URL:
   - `beta` → `https://beta.app.witnesswork.app`, in Beta and production
     builds;
   - `local` → `http://localhost:8081`, in development builds only. RevenueCat
     won't redirect to localhost itself.
3. **It checks the purchase.** It asks RevenueCat for the customer info again,
   bypassing any copy the SDK keeps, then forces the account link
   (`ensureRevenueCatLinked({ force: true })`). It shows the thank-you screen
   for the tier once customer info confirms it:
   - `supporter`: the User is a Supporter under ADR 0014;
   - `tip`: a non-subscription transaction from after checkout opened. Buy
     records only the time and the tier on the device; no id.

   Until then, it retries a few times and then says the purchase is still
   being confirmed, with Retry. It never suggests buying again.

4. **Another customer, or none.** The page never switches customers.
   - **Signed out or locked** (an installed web app whose checkout returned in
     the browser, which has its own storage): it says the purchase is
     complete, and to go back to WitnessWork to see it. The installed app
     refreshes customer info when the User returns to it.
   - **A different customer.** The removed `app_user_id` isn't the customer
     this browser is logged in as, because checkout started in another
     browser or under another account. It says the purchase is on the
     account that started checkout.
   - **A forwarded return** has no `app_user_id`, so it skips this check and
     confirms from customer info alone.

## No EU or UK sales

We're the merchant of record, and EU and UK VAT apply from the first sale, so
the web doesn't sell there (ADR 0041 §3). It checks twice: the paywall checks
the visitor's country, and Stripe checks the card and billing country.

- **The paywall.** Visitors whose country is in the list see a notice instead
  of web prices and Buy buttons. It points them to WitnessWork in the App
  Store and on Google Play, where the stores sell and handle tax. The benefits
  still show.
- **The country** is the visitor's country from Cloudflare (`loc=` in the
  app origin's `/cdn-cgi/trace`), read once per launch. Session replay's EU
  and UK opt-in uses the same signal (ADR 0043). On `localhost`, a development
  build can force a country to test the notice.
- **An unknown country** (no answer, Tor's `T1`, or Cloudflare's `XX`) gets
  the prices. Stripe's check still stands behind it.
- **Stripe** blocks payments whose card country or billing country is in the
  list. It uses a Radar country list and two block rules, on the Stripe
  account behind each RevenueCat Billing config. Custom Radar rules need
  Stripe's paid Radar plan on that account. Checkout always asks for the
  full billing address, so the billing country is known. A blocked checkout
  fails at payment, before any charge. Setup checks in the sandbox that the
  rules also stop a renewal, and a card changed in the customer portal.
- **The list** is one constant in the app, mirrored by the Radar list. Change
  both together. It holds:
  - the EU-27: `AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL
PT RO SK SI ES SE`;
  - the UK, `GB`;
  - `IM` and `MC`, which are inside the UK and French VAT areas;
  - the EU regions with their own codes, `AX GF GP MQ MF RE YT`. They're
    outside the EU VAT area, but blocking them keeps the rule simple.

  Jersey (`JE`) and Guernsey (`GG`) are outside the UK VAT area, and aren't
  in the list.

- **Other countries** that tax digital sales from the first sale are reviewed
  before production. The answer goes into the same list.

## Supporter status and managing on the web

- **Status.** `useIsSupporter` applies ADR 0014's rule to the web's customer
  info, exactly as on phones. A web subscription counts because it's in
  `activeSubscriptions`. ww-api's answer for the account is the fallback when
  RevenueCat can't be reached (ADR 0040 §7).
- **Manage** opens `customerInfo.managementURL` in a new tab:
  - for a web subscription, RevenueCat's customer portal (cancel, payment
    method, receipts);
  - for an App Store or Google Play subscription, that store's subscriptions
    page.

  A grant with nothing to manage (a promotional grant or `Lifetime Supporter`)
  has no `managementURL`, so Manage is hidden.

  Supporter Pause is a store feature and isn't offered for web subscriptions.

- **Refunds.** Buyers can't refund themselves in the portal. We refund from
  the RevenueCat dashboard when a User asks support. Refunding a
  subscription's latest payment, or a Tip, ends what it unlocked right away.

## What phones must never do

App Store rules (3.1.1(a), 3.1.3) and Google Play's Payments policy don't let
an app steer buyers to another way to pay. The phones honor web purchases,
which 3.1.3(b) allows because everything sold on the web is also sold in the
app. They never point to the web checkout:

- **No mention** of buying on the web, web prices or the web checkout in the
  iOS or Android app: not on the paywall, in Settings, in notifications or
  toasts, in the tray, or in shared copy. Web-only strings are never rendered
  on a phone.
- **No links or buttons** to `pay.rev.cat`, to the web paywall, or to
  RevenueCat's customer portal. Phones never deep-link to `/supporter/*` on
  the web app. To manage a subscription they open only their own store's
  subscriptions page, never `customerInfo.managementURL`, which can point at
  the customer portal.
- **Pages phones link to** (the website, the privacy policy, Help Center
  pages) carry no web Buy button and no web prices.
- **No price comparisons** between the web and the stores, and nothing in the
  store listings, What's New, or Updates notes about buying on the web.
- **A web subscription on a phone** shows as Supporter status only. The phone's
  Manage Subscription sheet lists only that phone's store's subscriptions
  (`manageableSubscription`), so it offers nothing for a web one.
- **Help Center answers about web purchases** are marked web-only, because
  the in-app Help Center runs on phones too. A web subscriber manages it from
  the web, or from the link in any RevenueCat receipt email.
- **Phones keep selling through the stores** and never through RevenueCat
  Billing.

Apple allows link-outs on the US storefront. We don't use that.

## Analytics

The paywall's existing events run on the web with `platform: 'web'`. The web
adds:

- the checkout opening, with the tier, billing, product and price;
- the return, with the tier, and whether customer info confirmed it, was still
  pending, or came back to another customer;
- the EU and UK notice being shown.

Events never carry the app user id, the link, or the buyer's email.
[`analytics.md`](./analytics.md) lists them under "Paywall and Supporter".

## Help Center

All of these are web-only (`platforms: [web]`):

- buying a subscription or Tip on the web;
- why EU and UK visitors buy in the app stores;
- managing or cancelling a web subscription, through the customer portal;
- refunds, through support;
- web purchases following the account to the User's phones.
