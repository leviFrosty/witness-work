# Notes-import identity and request authentication

## Context

Notes Import calls a paid LLM through our own proxy (`ww-proxy`). We need to (a) meter free usage at 5 Import Credits per non-Supporter, (b) keep that meter working across an app reinstall, and (c) stop someone from calling the proxy directly (curl) with a spoofed identity to mint unlimited free LLM calls. We explicitly do **not** want to collect an email or force Apple/Google sign-in.

## Decision

Two layers, because no single primitive does both jobs:

- **Identity** — generate a UUIDv4 once and store it in the iOS **Keychain** (`...AfterFirstUnlockThisDeviceOnly`, non-synchronizing). It survives a normal delete/reinstall, and we reuse it as the RevenueCat custom App User ID so usage correlates with entitlement status. The proxy keeps the free-usage counter server-side in Cloudflare KV keyed by this UUID; Supporter status (unlimited) is verified server-side against the RevenueCat REST API.
- **Request authentication** — gate every proxy call with Apple **App Attest**. The Secure-Enclave assertion cryptographically proves the request came from a genuine, unmodified instance of our app on a real Apple device. This — not the UUID — is the security boundary.

## Considered options

- **Trust the client-asserted UUID alone.** Rejected: trivially reset by clearing Keychain or bypassed entirely by hitting the proxy directly.
- **RevenueCat anonymous ID as identity.** Rejected: regenerates on every reinstall and is fully spoofable.
- **Add DeviceCheck** (2 wipe-proof bits) as a backstop. Rejected for now: only a factory reset (or a modified build / jailbreak) defeats Keychain + App Attest, and that's far more effort than a 5-import promo is worth. Revisit if abuse appears.

## Consequences

- App Attest and the Keychain UUID both re-key on a full device wipe / uninstall-all-vendor-apps, so a factory reset genuinely resets the free count. Accepted.
- App Attest is real-device only — the simulator/dev loop needs a debug-signed bypass path.
- App Attest requires a native module (no first-party Expo support) and a config plugin; the app already prebuilds, so this is acceptable.
- A future Share Extension surface will need App Attest available inside the extension target (separate provisioning) — to be validated when that ships.
