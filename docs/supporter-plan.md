# Supporter Plan

Plumbing for a "Supporter" concept: optional donations unlock extra customization and quality-of-life features. The app remains free for everyone. Donations are optional. iOS only (matches existing RevenueCat setup).

## Principles

- **Language**: "supporter", never "premium" / "pro" / "upgrade" / "unlock".
- **Non-upsetting UX ("show, don't gate")**: gated options stay visible in the UI, tagged with a small amber `Supporter` chip. Tapping a gated option as a non-supporter opens a soft **educational sheet** — never a direct paywall.
- **Graceful degradation**: if a subscription lapses, custom settings are preserved but not applied; defaults take over; data is never lost.
- **Tone**: "Support is optional. The app is, and will always be, free." / "Supporters help fund ongoing development." / "Little thank-yous for supporters."
- **Onboarding**: pure education, no direct paywall link. Paywall remains reachable from Settings > Support.

## Visual identity

Dedicated amber/gold theme for all supporter-gated surfaces. Contrasts clearly with the existing green primary accent; universal premium/valued signal; warm not cold.

- Light: `#D4A017`
- Dark: `#F4C23A`
- Also add a translucent variant (`#D4A01733` / `#F4C23A33`) for backgrounds

## iCloud sync as special callout

iCloud sync is the flagship supporter feature (implemented separately — see `docs/icloud-sync-plan.md`). In copy/layout it's treated differently from the cosmetic perks:

- **Onboarding screen**: iCloud sync gets a prominent hero slot with a subtle "Coming soon" label; other perks listed smaller below as "more personalization coming over time".
- **Info sheet**: same hierarchy — iCloud sync headlined, cosmetic perks as secondary list.

When iCloud sync lands, it becomes the first real caller of `SupporterGate`.

## What already exists (do not rebuild)

- RevenueCat integration: `src/providers/CustomerProvider.tsx` (iOS only)
- Supporter date derivation: `src/lib/supporterSince.ts` — `supporterSinceDate(customer)` (subscriptions only, not one-time donations)
- Profile supporter badge rendering: `ProfileCard`
- Paywall screens: `src/screens/PaywallScreen.tsx`, `PaywallThankYouScreen.tsx`, `DonationInfoScreen.tsx`
- Onboarding step array: `src/components/onboarding/Onboarding.tsx` (state-based navigation, not a nav stack)
- i18n: i18n-js, 18 locales. Auto-translate via `pnpm run translate`. Existing keys include `profileSupporterForDay`, `profileStatSupporter`.
- Preferences: Zustand + MMKV via `src/stores/preferences.ts`. Existing `homeScreenElements` object is a template for feature-gate shape.

## Scope (current PR)

| #   | File                                            | Purpose                                                                                  |
| --- | ----------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 1   | `src/constants/theme.ts`                        | Add `supporter` + `supporterTranslucent` colors to light/dark palettes                   |
| 2   | `src/hooks/useIsSupporter.ts`                   | Canonical `{ isSupporter, since }` hook — wraps `useCustomer()` + `supporterSinceDate()` |
| 3   | `src/components/SupporterBadge.tsx`             | Reusable amber chip with star icon                                                       |
| 4   | `src/components/SupporterGate.tsx`              | Wraps a row; intercepts non-supporter taps → `SupporterInfoSheet`                        |
| 5   | `src/components/SupporterInfoSheet.tsx`         | Soft educational sheet (reused by onboarding step and gate)                              |
| 6   | `src/components/onboarding/Supporter.tsx`       | New onboarding step — pure education, no paywall link                                    |
| 7   | `src/components/onboarding/Onboarding.tsx`      | Inject new step near the end                                                             |
| 8   | `src/screens/settings/sections/Support.tsx`     | "Supporter since [year]" card when supporter                                             |
| 9   | `src/stores/preferences.ts`                     | `customAccentColor: string \| null`                                                      |
| 10  | `src/contexts/theme.ts`                         | Apply `customAccentColor` only when `isSupporter`                                        |
| 11  | Settings > Preferences                          | Accent color picker row (gated via `SupporterGate`)                                      |
| 12  | `src/locales/en-US.json` + `pnpm run translate` | i18n for all new strings                                                                 |

## Supporter feature ideas (future work, not this PR)

### Cosmetic / low effort

- Custom home-screen greeting / profile card tagline
- Supporter-only accent palette presets (gold, amethyst, sunset)
- OLED-true-black dark theme variant
- Custom haptic intensity / patterns on timer stop, goal hit
- Seasonal confetti on goal completion
- Supporter-only home card themes / widget themes

### Utility / medium effort

- Pin contacts / favorite conversations
- Saved filters / saved searches
- Increased limits (tags, custom reminders, pinned contacts)
- Custom map pin colors
- Conversation note templates
- Export share-card with branded frame (screenshot for sharing monthly totals)
- Bulk edit / bulk delete contacts
- Encrypted backup export (password-protected zip)

### Heavier

- iCloud sync (see `docs/icloud-sync-plan.md`) — the flagship supporter feature
- Advanced annual analytics (trends, MoM, personal bests)
- Siri Shortcuts / App Intents for quick-add time
- Alternate app icons (needs `expo-alternate-app-icons` or similar)
- Custom notification sounds
- Beta access via TestFlight

## Decisions log

- **iOS only**: RevenueCat integration is iOS-only; Android support deferred.
- **Pure-education onboarding**: onboarding screen does not link to paywall. Reduces friction, keeps the "all features free" promise loud. Paywall is already reachable from Settings > Support.
- **One gated cosmetic this PR**: custom accent color picker. Everything else stacks on top in follow-ups.
- **Amber color**: chosen over purple/rose for the universal premium signal and clear contrast with green primary.
