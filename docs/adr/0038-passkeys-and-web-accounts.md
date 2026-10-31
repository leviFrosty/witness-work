---
status: proposed
---

# Passkeys, and accounts on the web

## Context

The server account (ADRs 0024, 0026, 0027) has no sign-in today:

- A phone creates the account key and keeps it in iCloud Keychain or Block
  Store.
- It opens sessions with App Attest or Play Integrity plus the account key's
  signature.
- A new device gets the key through iCloud Keychain, a QR handoff, or the
  recovery key.

The web app (ADR 0037) is a full client, and Users can start there. A browser
can't attest, and it has no keychain that follows the User. We want a sign-in
that:

- works on every platform;
- needs no email or password;
- changes nothing for existing Users until they choose it.

## Decision

### 1. Passkeys are credentials on the existing account

A passkey is another way into the same server account, not a second identity.
It does two jobs:

- **Signs in.** An assertion verified by ww-api stands in for attestation when
  a browser opens a session (§5).
- **Unlocks.** When the passkey supports the WebAuthn PRF extension, ww-api
  stores the account key sealed under a key derived from the passkey's PRF
  output (a _wrap_). Signing in with that passkey on a new device then
  delivers the account key, with no other device involved. The server never
  sees the PRF output or the account key.

The account key stays the User's one secret (ADR 0026); passkeys deliver it.
The server account stays the source of truth for who the User is. Passkeys
become the main way to sign in on every platform.

### 2. Libraries

- **Server:** `@simplewebauthn/server` in ww-api.
- **Web:** `@simplewebauthn/browser`.
- **Native:** our own `modules/passkeys`, wrapping iOS's passkey API (PRF from
  iOS 18) and Android's Credential Manager.

### 3. Relying party and name

- **RP ID:** `app.witnesswork.app`, so no other page on the domain can request
  these passkeys or their PRF output. Development uses
  `app-dev.witnesswork.app`. The beta (`beta.app.witnesswork.app`) uses the
  production RP ID.
- **The domain is permanent** once the first passkey exists.
- **Associated domains:**
  - iOS: `webcredentials:app.witnesswork.app`.
  - Android: Digital Asset Links with `get_login_creds`, served from the same
    host.
  - ww-api accepts the Android app's `android:apk-key-hash:` origins.
- **Name:** `WitnessWork 7K4Q`, used for both `user.name` and
  `user.displayName`.
  - The four characters derive from the passkey user handle: 32 random bytes
    per account, created once.
  - Settings → Account shows the same tag, so two people sharing a password
    manager can tell their passkeys apart.
  - `rp.name` is "WitnessWork".
  - The name is set on the device and frozen at creation, since renaming
    works only in some password managers.
- **User verification** is always required.

### 4. PRF wraps

- **Salt:** one fixed, versioned salt (`ww-account/v1/passkey-prf`), evaluated
  with `eval`, so discoverable credentials work without choosing the account
  first.
- **The wrap:** the account key sealed with XChaCha20-Poly1305 under
  HKDF(PRF output). A credential may hold more than one wrap, because the same
  synced passkey has been reported to return different PRF output on
  different devices.
- **Check before trusting:** after unwrapping, the device confirms the key
  derives the account's public key.
- **Confirming PRF:** after creating a passkey, the app runs a sign-in
  ceremony to confirm PRF works, since some platforms return PRF output only
  then.
- **Sign-in only:** a passkey without PRF is kept for signing in. Settings →
  Account labels each passkey "Can unlock your account" or "Sign-in only".
- **When a passkey signs in but can't unlock,** the device unlocks another way
  (§6), then saves a wrap for this passkey's output so it works next time.

### 5. Sessions without attestation

ADR 0027's "no integrity, no account" still holds for phones. Browsers get an
exception:

- **Opening a web session** takes a short-lived ticket plus the account key's
  signature, as phone sessions are signed today. The ticket comes from a
  passkey assertion, an approval from a signed-in device (§7), or, for a
  recovery key entered in the browser, a Turnstile check. The session's
  platform is `web`.
- **Accounts can be created on the web.** Sign-up is protected by Cloudflare
  Turnstile, verified in the Worker before registration starts. There are
  also per-IP and per-network caps, and a kill switch.
- **Same features:** web accounts get every feature, at the same limits as
  everyone else.
- **Phones keep attesting.** A phone that signs in with a passkey still opens
  its own attested session.

### 6. Signing in

Every sign-in screen, on the web and on a new phone, offers, in this order:

1. Sign in with a passkey.
2. Use my phone (QR).
3. Use a recovery key.

A passkey that unlocks is enough on its own; no other device is asked to
approve. The QR and recovery-key options stay permanently as fallbacks.

### 7. Approving a browser from a phone

- **The browser shows a QR code:** a channel id, a one-time public key, and a
  secret in the fragment. The code changes about every 60 seconds and works
  once.
- **The phone scans it inside the app only:** from Settings → Account → Sign
  In on a Computer. The QR's URL isn't an app link, and the Sign In with QR
  Code scanner only points to that screen.
- **The phone confirms before sending:**
  - It shows the browser and system name, roughly where the browser is, and
    the six-digit code.
  - It warns, without blocking, when the browser seems far from the phone.
  - It asks YES or NO, then Face ID or the passcode.
  - Only then does it send the account key, sealed to the browser.
- **It reuses** the handoff relay and its confirmation screens (ADR 0026 and
  the handoff owner check).

A signed-in browser can also set up another device the existing way: it shows
the Set Up Another Device QR for a new phone to scan.

### 8. On the web

- **Sign-up:**
  1. Turnstile.
  2. The browser creates the account key.
  3. It creates a passkey and confirms PRF.
  4. It saves the wrap and opens the session.
  5. It shows the recovery key, which the User can download, print or copy.

  Continuing requires "I've saved my recovery key".

- **Staying signed in:**
  - The account key and the session are kept in IndexedDB, with the key
    wrapped by a non-extractable WebCrypto key.
  - The web opens straight to the User's data until they sign out.
  - There's no "Is this your computer?" question and no idle lock by default.
- **Session lifetime:** a web session renews while it's used, with no
  absolute limit. It ends after 180 days without use, or on sign-out.
- **Session cap:** browsers have their own limit of 3 sessions per account,
  separate from the phones' 10.
- **Sync slot:** a signed-out browser's Cloud Sync slot is kept for 30 days.
- **App Lock** is available on the web, off by default, and unlocks with the
  passkey.
- **Sensitive actions** ask for a fresh check: Face ID on phones, a passkey
  tap on the web that ww-api verifies. They are:
  - showing the recovery key;
  - setting up or approving a device, and adding or removing a passkey;
  - changing the account key;
  - deleting data.

  One shared account utility does this on both platforms. ww-api refuses the
  server-side ones (adding or removing a passkey, deleting backups, changing
  the account key) from a web session without a recent check, so someone at
  an unlocked browser can't skip it.

### 9. Phones

- **New installs** offer "Save a passkey" in onboarding, with Not Now, once an
  account exists. A new install's account only appears when onboarding ends, so
  finishing onboarding earns the gentle prompt below instead; the onboarding step
  reaches accounts that already exist (a restore, a QR sign-in, an invite).
- **Existing Users:**
  - They see a Passkeys section in Settings → Account.
  - They get one gentle prompt after turning on sync or backup, or setting up
    another device. It backs off for 30 days and is never forced.
  - Without a passkey, everything works as it does today.
- **New sign-ins:** each one, phone or browser, is recorded in the activity
  log (ADR 0028) and shown in the other devices' notifications trays. The
  tray notices aren't built yet; they're a follow-up.
- **Signed-in devices:** the list includes browsers.

### 10. Web plumbing in ww-api

- **CORS:**
  - Allowed origins: an exact allow-list of the app's origins.
  - Allowed and exposed headers: the lists in
    [`passkeys-protocol.md`](../passkeys-protocol.md#cors).
  - Preflight requests aren't rate limited.
- **Live sockets:** a browser can't set headers on a WebSocket, so it offers a
  short-lived socket ticket as a subprotocol (`ticket.<ticket>`, next to
  `ww.v1`), minted with its access token. The access token itself never goes
  in the subprotocol, since request logs record it. The Worker checks the
  Origin allow-list and the ticket before the Durable Object sees the socket,
  and echoes `ww.v1` back.

### 11. The old sign-in method goes away

Requests signed the pre-session way (ADR 0027 §6) are refused once the web
launches. The fallback that turned them back on when a KV read failed is
removed. App versions before 1.45.0, the first that opens sessions, lose
Buddies and Notes Import until they update.

## Considered options

- **better-auth.** It wants to own users and sessions: it requires an email
  and a name, and has its own session model without our rotation, reuse
  detection or caps. Its passkeys work only in browsers. It would duplicate
  ADR 0027 and break "the server account is the source of truth".
- **Passkeys as a separate identity with an email.** Against the no-PII design
  and the server account as the source of truth.
- **Keeping only a derived key in the browser.** It would make the web a
  second-class device. We chose a full web client.
- **A phone approval for every new browser.** It blocks Android Users who use
  only the web.
- **A "shared computer" default, or an idle lock.** Rejected for UX. Users
  sign out when they want to, and App Lock is opt-in.
- **Cookies for web sessions.** They'd add a second way to identify the User,
  and every subdomain would send them. Tokens in IndexedDB match the rest of
  the design, since the key lives there too.
- **Passkeys only, with no QR or recovery key.** PRF isn't reliable on every
  platform yet.

## Consequences

- Users can start on the web or on a phone, and move between them with a
  passkey.
- Accounts created on the web aren't backed by device integrity. Turnstile,
  the caps and the kill switch are the controls.
- **A stolen, unlocked computer gives away the account key.** Signing it out
  stops its access to the server. Changing the account key (ADR 0039) makes
  the copied key useless.
- The passkey domain can never change.
- **Testing:** passkey flows run in browsers with a virtual authenticator that
  supports PRF, and on iOS and Android devices.
