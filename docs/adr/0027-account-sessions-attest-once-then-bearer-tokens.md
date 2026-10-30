---
status: proposed
---

# Account sessions: attest once, then bearer tokens

> Amended by [ADR 0038](./0038-passkeys-and-web-accounts.md): browsers open sessions with a passkey or a device approval instead of attestation, and the legacy sign-in method is turned off.

## Context

ADR 0024 gave each User an anonymous server account, and ADR 0026 hung
handoff and backup off it. Every account request is a self-signed envelope:
the account signing key signs the payload, and the server verifies it
against the `accountPub` inside that same payload. That proves the caller
holds a key. It doesn't prove the caller is WitnessWork on a real device, so
a script can mint accounts as fast as the per-IP limits allow, and rotating
IPs gets around those. ADR 0024 reserved App Attest and Play Integrity on
registration but never enforced them. ww-api's Buddies notes also list
attesting `inbox/register`, `invite/*`, and `blob/put` as required before a
production rollout.

The envelope also makes every route do its own authentication. Each one
parses `{ payload, signature }` (the legacy `{p, s}` from older builds),
checks `ts`, verifies a signature, and looks up the account,
and `backup/put` has to move the envelope into headers to keep the body for
the blob. Gating a new route on "has an account" means repeating all of that.

Each feature also has its own idea of who the User is. Notes Import meters
the RevenueCat app user id or the install id and attests every request,
Buddies knows inboxes and keys, and backup knows `accountPub`. Nothing on the
server can say "this User did these things", suspend them everywhere, or
keep their Supporter status in one place.

Attesting every request isn't an option. Play Integrity decodes cost a
Google round trip and come out of a 10,000-a-day quota, and App Attest
assertions need a challenge round trip of their own.

## Decision

### 1. The server account is the source of truth for who a User is

Every user-scoped server feature identifies the User by the server account's
`accountId`, taken from the session's access token. A feature doesn't invent
its own identity for authorization, metering, limits, or audit (an install
id, a RevenueCat id, an inbox id). Feature ids still exist (an inbox, a backup
slot), but each one belongs to an account.

The RevenueCat identity (ADR 0011) will be linked to the account, so ww-api
can keep Supporter status in step from RevenueCat's webhooks and answer it
from the account. That's its own change.

### 2. Attest once, when a session opens

A new route, `POST /accounts/v1/sessions` (signed as op `session/open`), is
the one place an account proves it's the app. It carries the account key's
self-signed envelope and an attestation bound to `accountPub`: an App Attest
assertion on iOS, or a Play Integrity standard-request token on Android. Both
use the challenge → assertion shape Notes Import already uses (ADR 0017),
under a new purpose, `account-session`, with the challenge from ww-api's
API-wide `POST /attestation/v1/challenge` (which replaces Notes Import's
own). Opening a session creates the account if it doesn't exist, which
replaces `account/register`.

**No integrity, no account.** WitnessWork is supported only from the App
Store and Google Play. A device that can't attest gets no account and no
fallback: the iOS simulator, iPhones where App Attest isn't supported,
Android outside Google Play, and Android that doesn't meet
`MEETS_DEVICE_INTEGRITY`. The development worker accepts the dev bypass
token in place of attestation. Production never does.

### 3. Short access tokens, rotating refresh tokens

Opening a session returns two tokens:

- **An access token**, a JWT signed with HMAC-SHA256 under a Worker secret
  (`kid` for rotation). It lasts 15 minutes. Its claims are the account
  (`sub`), the session (`sid`), the `platform`, and an issuer per environment,
  so a development token never passes on production. It's sent as
  `Authorization: Bearer` and kept in memory only.
- **A refresh token**, opaque and random. The server keeps only its hash, in
  a new `account_sessions` table in the accounts database. Each refresh
  (`POST /accounts/v1/sessions/refresh`) replaces it. A token reused after it was replaced revokes the session,
  except within 60 seconds of the replacement, which covers a lost response.
  The device keeps it in the platform keystore without syncing, so every
  device has its own session.

A session lasts 90 days from opening, and refreshing doesn't extend it.
After that the app opens a new one, attesting again, without asking the
User anything. An account keeps at most 10 sessions, and opening another
ends the oldest. `DELETE /accounts/v1/sessions/current` ends a session. The
app calls it on sign out, when it replaces the account key, and before
Delete Buddies.

Opening a session can carry a short label for the device, sealed with a key
derived from the account key, so the User's own devices can show which
devices hold sessions while the server can't read it.

### 4. Routes ask for a session through middleware

ww-api gates routes with one middleware, `requireAccount()`, which checks
the bearer token and hands the route the account and session. Routes that
refuse suspended accounts also check the status. Routes stop parsing
envelopes to find out who's calling.

| Route                                                                                                           | Authentication                                                      |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `GET /accounts/v1/account`; `handoff/open`, `status`, `send`, `cancel` (old phone); `backup/put`, `list`, `get` | Bearer token                                                        |
| `backup/delete`                                                                                                 | Bearer token **and** the account key's signature                    |
| `handoff/claim`, `receive`, `done`, `cancel` (new phone)                                                        | `claimToken`, unchanged: the new phone has no session yet           |
| Buddies `inbox/register`                                                                                        | Bearer token **and** the owner's signature, once, to bind the inbox |
| Buddies owner ops, the live socket                                                                              | Bearer token; the inbox checks it's the account it belongs to       |
| Buddies writer ops (`card/put`, `event/put`, `slot/leave`)                                                      | Bearer token **and** the slot's writer signature                    |
| Buddies `invite/fetch`, `invite/claim`, `blob/get`                                                              | Bearer token **and** the capability they carry today                |
| Notes Import (`kickoff`, the legacy run, `verify`, `transcribe`)                                                | Bearer token; metered by account                                    |
| Route planning                                                                                                  | Unchanged, for now                                                  |

- **Destructive ops keep a signature.** A token that leaks for 15 minutes
  shouldn't be able to delete backups, so `backup/delete` needs the account
  key's signature as well as the token. Later destructive ops follow suit.
- **Every Buddies request carries a session.** Buddies can't be used without
  an attested account, and per-account limits apply to all of it. Owner ops
  drop the owner signature: the inbox stores the account it belongs to and
  compares it with the token's. `inbox/register` keeps the owner signature
  because it's the one step that proves the account holds the inbox's key.
- **Writer ops keep the writer signature as the slot's capability.** A
  token says which account is writing, not which slot it may write to.
  Making the token the capability would mean storing which account holds
  each slot, a durable copy of the buddy graph. The relay sees the writing
  account in each request but stores nothing that ties it to the slot or to
  the inbox it wrote into.
- **Notes Import meters the account.** A session's attestation stands in for
  attesting each import, so imports stop spending a Play Integrity decode
  each. Allowances, the concurrency cap, and analytics key on `accountId`.
  Allowance used under an install or RevenueCat id doesn't carry over, so
  each User gets one fresh window. Supporter status still comes from the
  RevenueCat id the app sends until that id is linked to the account.

### 5. Suspension doesn't end sessions

A suspended account can still hand off and back up (ADR 0026), so it can
still open a session. A suspension reaches the routes that refuse it the way
it does today: the inbox's copy of the status for Buddies, and the status
check in `requireAccount` for anything else.

### 6. Backward compatibility, then one switch forces the update

Buddies and Notes Import are live in production, so ww-api goes first and
accepts both ways on every converted route: the bearer token, or the old
envelope or per-request attestation. App versions that open sessions
follow.

Turning the old way off is two KV writes, documented in ww-api's
`AGENTS.md`:

1. **The minimum app version**, KV `app:min-version`. Every app version from
   this change on reads it through `GET /app/v1/config` at launch and on
   returning to the foreground, and below it shows a blocking Update
   Required screen with a store link. It's the app-wide successor to Notes
   Import's own minimum version, which older app versions already honor.
2. **The legacy switch**, KV `auth:legacy` set to `off`. Every request
   authenticated the old way, on every converted route, is then refused with
   426 `upgrade_required`, and `account/register` with it. App versions from
   this change on show Update Required for it too.

App versions from before this change can't be forced, since they never read
either key. Raising Notes Import's minimum version at the same time disables
their composer with its existing update message. Their Buddies calls get
`upgrade_required`, which they show as their generic Buddies error. Accounts
registered before the switch keep their `accountId`; every call they make
after it comes through an attested session.

Wire contract: [`docs/accounts-protocol.md`](../accounts-protocol.md)
(Sessions, Updates and the legacy switch) and
[`docs/buddies-protocol.md`](../buddies-protocol.md) (Authentication).

## Considered options

- **Attest every request.** Strongest, but it costs a challenge round trip
  each time, and Play Integrity's quota and latency rule it out.
- **Opaque access tokens looked up on each request.** Revocation would be
  instant, but every request would read the accounts database. A 15-minute
  JWT does without the read, and suspension doesn't depend on revoking.
- **Asymmetric JWTs (EdDSA).** Only worth it if something besides ww-api
  verifies the tokens. Nothing does.
- **Signing the refresh with the account key instead of a refresh token.**
  Nothing new to store on the device, but every refresh would derive the
  signing key from the root seed. A refresh token in the keystore is the
  standard shape, and it keeps the seed out of the hot path.
- **Tokens without writer signatures on Buddies writer ops.** One scheme
  everywhere, but the relay would have to store which account holds each
  slot: the buddy graph.
- **Keeping owner signatures beside the token.** Defense in depth if the
  Worker were compromised, but every owner op would still build and sign an
  envelope, which is what this change sets out to remove.
- **Anonymous (blind-signed) tokens.** ADR 0026 already decided against
  them.
- **Carrying Notes Import allowance over from the old meters.** Fairer for
  the few Users mid-window, but it would trust a client-sent install or
  RevenueCat id one more time, and the free allowance is small.

## Consequences

- Making accounts in bulk needs one genuine device per account, and every
  account, Buddies, and Notes Import request comes through an attested
  session.
- Routes gate on an account with one middleware, and per-account rate limits
  become possible where today's limits are per IP.
- Devices that can't attest can't use anything built on accounts: Buddies,
  backup, Set Up Another Device, or Notes Import. The app has to say so
  plainly, using the stable `reason` the session refusal carries, and check
  whether a device can attest before it starts a handoff onto it.
- Development builds and emulators need the dev worker and its bypass token.
- The relay now sees which account sends each Buddies request, writer ops
  included. It stores the link between an account and its own inboxes, as
  before, and nothing that ties a writing account to the inbox it wrote into.
- When a session opens, the server sees an install's App Attest identity next
  to `accountPub`. The session row stores neither the install nor the key,
  only the account, the platform, the sealed device label, token hashes, and
  times.
- End-to-end encryption doesn't change. Tokens say who's calling. Content is
  still sealed under keys only the User's devices hold.
- The bearer token and the admin and dev bypass tokens are credentials ww-api
  must never log. Its Sentry setup drops the `Authorization`,
  `x-ww-admin-token`, and `x-ww-dev-bypass` headers from events.
