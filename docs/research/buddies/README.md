# Buddies research inputs

Raw research behind [`../../buddies-recommendations.md`](../../buddies-recommendations.md), produced 2026-09-23. Each report marks its own unverified claims. Where reports disagree, the recommendations doc records the decision and why.

| Report                                                             | Scope                                                                                                                                                                                                   |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [01-invite-ux-market.md](./01-invite-ux-market.md)                 | Invite, consent, management, and ending patterns across Figma, Excalidraw, Google Docs/Calendar, Apple Fitness, Find My, Safety Check, iCloud collaboration, Signal, Bitwarden Send, 1Password, Day One |
| [02-e2ee-architecture-market.md](./02-e2ee-architecture-market.md) | How E2EE products distribute keys, handle removal and push; CloudKit `encryptedValues` / CKShare / public-DB facts; MLS, Jazz, Keyhive status                                                           |
| [03-architecture-and-cost.md](./03-architecture-and-cost.md)       | Option comparison, data model, usage-optimized sync, APNs-from-Workers evidence, cost model, repo + ww-proxy integration, phases                                                                        |
| [04-auth-abuse-privacy.md](./04-auth-abuse-privacy.md)             | Identity, invite protocol, relay authorization, revocation, abuse limits, coercive control, householder data (GDPR Art. 9), App Store guidelines, key recovery                                          |
| [05-feature-ux.md](./05-feature-ux.md)                             | Calendar overlay (#288), Follow-up invitations, notification matrix, award catalog, IA, anti-features, MVP order                                                                                        |

Known errata:

- 04 says the app has no `aps-environment` entitlement. The generated dev entitlements already include `aps-environment = development` (injected by the `expo-notifications` config plugin); production is unverified.
- Usage numbers in 03 are assumptions — the PostHog pull was blocked because `posthog-cli` isn't logged in.
