---
status: proposed
---

# Supporter status on the server account, kept by RevenueCat's webhook

## Context

ADR 0027 made the server account the source of truth for who a User is, and
said the RevenueCat identity would be linked to it in a later change. Until
now ww-api has learned Supporter status from ids the app sends:

- Notes Import's bearer requests carry an optional `revenueCatAppUserId`, and
  legacy requests an `accountId` or `uuid`.
- Route planning takes `accountId`, the RevenueCat app user id, with no
  session and no attestation.

Each request asks RevenueCat's REST API again, so a RevenueCat outage turns
off route planning for everyone, and any id the client names is taken at its
word.

The RevenueCat identity is ADR 0011's shared account id: a random UUID that
starts as the install id and is shared between one person's devices through a
file in their iCloud Drive (or Google Drive, ADR 0019). Old app versions run
on it, and so does every Supporter's client-side status (iCloud Sync, the
Supporter badge, the paywall).

## Decision

### 1. The RevenueCat identity stays; the account links to it

The app keeps logging in to RevenueCat with ADR 0011's shared id. After a
session opens, it tells ww-api which RevenueCat customer it's logged in as:
`POST /accounts/v1/revenuecat-customers` with `{ appUserId }`, on the
session's bearer token. ww-api reads that customer from RevenueCat with its
secret key, stores what RevenueCat says, and links the customer to the
token's account.

An account can link several customers (an iPhone and an Android phone that
joined by handoff but kept their own ids, or an account that moved by
recovery key). A customer can be linked to several accounts (two Android
phones sharing a Drive account file before a handoff joins them, or the
account a User had before Delete Buddies). The account is a Supporter when
any customer linked to it is.

Each side keeps at most 5 links. A sixth replaces the one linked least
recently, and every link the app repeats counts as recent, so an old account
or a phone the User no longer has ages out instead of blocking a new one.

The app links again whenever what it would send changes or the server's
answer might have: a new session, another account key, an adopted shared id,
a purchase, a restore, and otherwise at most once a day. Linking always
re-reads RevenueCat, so it doubles as "check my status now".

### 2. Why the link is genuine, and what it rests on

ww-api never takes Supporter status from the client: it stores only what
RevenueCat's REST API answers for the customer. The client's only claim is
"I'm logged in to RevenueCat as this customer".

RevenueCat's SDK trusts the app user id alone: anyone who knows a customer's
id can log in as it with the app's public key and see its entitlements. So
the id is the capability, on RevenueCat's side as much as ours, and ADR 0011
already treats it that way. A client can claim someone else's purchases only
by knowing their id, which is 122 random bits that the app never shows, logs,
or reports, and that travels only to RevenueCat and ww-api over TLS. Linking
additionally needs an attested session (one genuine device per account), and
the caps above keep a leaked id from being shared out to many accounts.

A proof of store ownership (Apple's signed StoreKit 2 transactions, Google's
purchase tokens) would close this, at the cost of verifying two stores'
signatures and receipts on the server, and it still couldn't cover
promotional grants such as `Lifetime Supporter`. It's deferred until there's
abuse to justify it.

### 3. The webhook keeps the stored status current

`POST /revenuecat/v1/webhook` receives RevenueCat's events.

- **Authentication.** RevenueCat sends the Authorization header value set on
  the integration. ww-api compares the whole header with
  `Bearer <REVENUECAT_WEBHOOK_AUTHORIZATION>` in constant time and answers 401
  otherwise. Each worker has its own secret.
- **The event names customers; RevenueCat says what they are.** The body is
  read only for the event's `id` and the customers it names (`app_user_id`,
  `original_app_user_id`, `aliases`, and a `TRANSFER`'s `transferred_from` and
  `transferred_to`). Each named customer ww-api already has a link for is read
  again from `GET /v1/subscribers/{id}`; customers nobody linked are ignored
  and not stored. RevenueCat recommends this pattern, and it makes event order
  irrelevant: a late `RENEWAL` after an `EXPIRATION` leads to the same read of
  the current state. A write only lands if no read that started later has
  already written.
- **Transfers and aliases** need nothing special: both sides of a transfer,
  and every alias, are named in the event and read again.
- **Idempotent by event id.** An event id is recorded once its reads are
  stored, and a repeat of a recorded id is answered 200 without reading
  anything. Ids are kept 30 days.
- **Failure means retry.** If RevenueCat's REST API or the database fails,
  the webhook answers 503, and RevenueCat retries five times over about 80
  minutes.
- The sandbox integration points at the development worker, the production
  integration at the production worker.

### 4. Storage

Three tables in the accounts database (`ACCOUNTS_DB`), by Drizzle migration:

- `revenuecat_customers`: the app user id, whether it's a Supporter, when
  that ends (the latest expiry among the entitlements that qualify, or none
  for a lifetime grant), and when RevenueCat was last read.
- `account_revenuecat_customers`: which accounts link which customers, and
  when each link was last made.
- `revenuecat_webhook_events`: event ids already handled, for 30 days.

The rule for who counts as a Supporter is still ADR 0014's, in the same
function, now also returning the expiry.

### 5. Answering, and when RevenueCat or the webhook is down

`isAccountSupporter(accountId)` reads the account's linked customers:

- A record read from RevenueCat within the last 24 hours is the answer,
  until its expiry. An ordinary lapse ends on time even if no webhook
  arrives.
- An older record is read from RevenueCat again before answering. This
  catches a webhook RevenueCat gave up on; a refund or revoked grant can go
  unseen for at most a day after RevenueCat stops retrying.
- No link: not a Supporter, with no call to RevenueCat.

When RevenueCat can't be read, the paid features fail closed as they do
today: route planning answers 503 `supporter_check_failed`, and Notes Import
counts the User as free. With the webhook down, a new purchase still reaches
the account, because the app links again after it; a lapse still lands at its
expiry.

### 6. Routes on the account's status

- **Notes Import**, bearer requests: Supporter status is the account's.
  `revenueCatAppUserId` is no longer sent and is ignored if it is (no app
  version that sends it was released).
- **Route planning** moves to the session: `Authorization: Bearer` with
  `{ start, stops }`, metered by the account, refusing a suspended account.
- **Legacy requests** on both routes keep asking RevenueCat about the id they
  send, exactly as before, while ww-api's `auth:legacy` switch is on, and get
  426 `upgrade_required` once it's off. App versions from before this change
  keep their Supporter status throughout.

### 7. Not in the activity log

Supporter start and end are billing state, not security events: the User
sees them in the store and on the paywall, and they say nothing about who can
use the account (ADR 0028 logs only that). Linking a customer adds Supporter
status to the linking account and takes nothing from any other, so it isn't
logged either.

Wire contract: [`docs/accounts-protocol.md`](../accounts-protocol.md)
(Supporter status).

## Considered options

- **Log in to RevenueCat as the server account id.** The server would read
  the customer named by the token's account and trust no client id at all.
  But moving an existing Supporter's purchases onto the new id takes a
  RevenueCat restore under "Transfer to new App User ID", which takes them
  away from the shared id. Their devices still on an older app version would
  lose Supporter status and stop syncing, against this change's ground rules.
  Promotional grants don't move with a restore, accounts exist only on
  devices that can attest, and two devices on different accounts would keep
  taking the subscription from each other, the problem ADR 0011 was written to
  avoid.
- **Trusting the event body.** Simpler, but webhooks arrive late and out of
  order, and each event type reports state differently. Reading the customer
  again gives one shape and the current answer.
- **Asking RevenueCat on every request,** as today. No storage, but every
  paid request waits on RevenueCat and fails when it's down, and the server
  still has to trust a client-sent id.
- **Linking by a subscriber attribute** the app sets on its RevenueCat
  customer. RevenueCat's public key can set any customer's attributes, so it
  proves no more than knowing the id, and two accounts sharing one customer
  would overwrite each other.
- **One account per customer, first link wins.** Stops a leaked id being
  linked a second time, but strands the legitimate cases above (two Android
  phones before a handoff, an account after Delete Buddies), and lets
  whoever links first lock the owner out.

## Consequences

- Route planning and Notes Import no longer wait on RevenueCat for each
  request, and route planning needs an attested session.
- ww-api stores the RevenueCat app user ids its accounts link, with their
  Supporter status and expiry. The privacy policy's account section has to
  say so. Ids nobody linked are never stored.
- The production webhook integration has to be pointed at the production
  worker after this release; until it is, status still updates through the
  daily re-read and the app's links.
- A leaked app user id can still be linked by another attested device, as it
  can already be used in RevenueCat's SDK. Store-signed proof stays open for
  later.
