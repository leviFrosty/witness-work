# Shared account id over iCloud (multi-device Supporter, no sign-in)

## Context

A Supporter who installs WitnessWork on a second device (same Apple ID) does
not get Supporter status there. Every device identifies to RevenueCat with its
own Keychain install id (ADR 0007), so each device is a separate RevenueCat
customer. Because these are _identified_ (not anonymous) app user ids,
RevenueCat's restore flow applies the project's Restore Behavior — the default
"Transfer to new App User ID" would let devices _steal_ the entitlement from
each other, and the losing device's `SupporterSyncLapseGate` would shut off
iCloud sync. We want simultaneous multi-device Supporter status, automatic
lapse propagation, and — non-negotiable — no account, email, or phone number.

## Decision

Introduce an **account id**: the single identity all of one person's devices
present to RevenueCat. It defaults to the device's install id and is agreed
on through a small **account file** (`witness-work-account.json`) in the
existing iCloud ubiquity container — same Apple ID ⇒ same container ⇒ same
account. `AccountProvider` reconciles on launch, foreground, entitlement
changes, and remote-change events, via a pure decision function
(`decideAccountAction`):

- **No file** → claim it with this device's id.
- **File is ours, entitled flag agrees** → nothing.
- **File is ours, flag disagrees** → another device purchased or lapsed:
  re-fetch CustomerInfo (this is what makes purchase _and lapse_ propagate
  near-real-time), then correct the file only if it was the stale side.
- **Foreign claim, we're not entitled** → adopt: `Purchases.logIn(theirs)`,
  persist device-locally (MMKV — never through the supporter-gated data
  sync). The adopting device becomes the same RevenueCat customer and is a
  Supporter seconds later, with no user action.
- **Foreign claim, we're entitled** → claim over it if it's un-entitled (the
  entitlement holder always wins — this migrates existing production
  supporters automatically, whichever device claims first); leave it alone if
  it also says entitled (two independent grants — both devices stay
  Supporters under their own ids; no write ping-pong).

The account file shares the `witness-work*.json` namespace deliberately: it's
the only namespace the bridge writes and the only pattern its metadata query
watches, so remote edits fire the existing `onRemoteChange` event. The sync
engine skips it via `isAccountFilename` everywhere it parses payloads, and
`overwriteRemoteWithLocal` re-claims it after `deleteAll`. iCloud conflict
duplicates (`witness-work-account 2.json`) are absorbed newest-wins and
canonicalized.

When iCloud is unusable (signed out, or iCloud Drive off for the app), the
fallback is the App Store receipt: Restore Purchases on the other device. The
thank-you screen surfaces that hint **only** when sharing is unavailable.
Keep the RevenueCat Restore Behavior at the default "Transfer to new App User
ID" — "Transfer if there are no active subscriptions" would _block_ this
legitimate fallback, since the user's other device holds an active
subscription.

## Considered options

- **RevenueCat anonymous ids + restore aliasing** (RC's first-party
  no-account path). Rejected in ADR 0007 already: anonymous ids regenerate on
  reinstall and can't be metered; also still needs a manual restore tap.
- **"Share between App User IDs" (legacy) restore behavior.** Aliases on
  restore instead of transferring. Rejected: project-wide one-way door
  (cannot be re-enabled once switched away), deprecated by RevenueCat, still
  requires the user to find the restore button.
- **User-visible "copy account id" + server-side share registry.** Rejected:
  turns the app user id into a bearer credential users are encouraged to
  share, and requires new backend state plus revocation plumbing that iCloud
  scoping gives us for free.
- **iCloud key-value store (`NSUbiquitousKeyValueStore`)** instead of the
  container — survives iCloud Drive being disabled. Deferred: needs new
  native surface + entitlement; the container path needs zero native changes.
  Worth revisiting if the restore-hint cohort turns out to be large.

## Consequences

- Existing production supporters converge with no intervention: the entitled
  device claims (or overwrites a non-entitled claim), the others adopt.
- A device can client-side `logIn` as any known account id — a uuid is an
  identifier, not a secret (same stance as ADR 0007). We never display it,
  and the container file isn't document-scope public.
- **Notes-Import still uses the per-device install id.** ww-api pins each
  uuid to the ONE App Attest keyId that first claimed it (first-writer-wins,
  ADR 0007), so an adopted account id would lock the second device out at
  re-attest. Until ww-api verifies Supporter against an account id bound into
  the signed assertion, a Supporter's _second_ device is metered as a free
  user by the proxy. Follow-up lives in ww-api.
- The dev "Reset purchases" tool clears the adopted id, else reconcile would
  immediately re-adopt it.
- Free Notes-Import credits remain per-device for adopted devices (see
  above); once ww-api understands account ids they become per-person.
