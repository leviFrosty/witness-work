# Supporter Nudge Plan

A single low-frequency Home-screen card that thanks long-tenure, high-engagement users and surfaces the supporter path. Absorbs and supersedes two `todo.md` notes:

- "Add a donation nudge reminder for users who have 'high' app usage."
- "Add contextual donation card after monthly report submission."

Read alongside `docs/supporter-plan.md`, whose principles (supporter-not-premium, soft education never direct paywall, "the app is free and always will be") govern this design.

## Goal

Gratitude / moment-of-value surfacing, with discoverability-style dismiss discipline. Not a conversion funnel.

- Thank-you first, ask last.
- One card, one surface, low cadence, respectful of user autonomy.
- Audience (Jehovah's Witnesses) is tone-sensitive to anything that reads as commerce or pressure — design leans warm, humble, and collective.

## Eligibility

All of the following must be true. Evaluated reactively — the card renders whenever the predicate passes.

| Gate                                   | Requirement                                                                                                        |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Not a supporter                        | `useIsSupporter().isSupporter === false` (respects `devSupporterOverride`)                                         |
| Not already opted out via donate heart | `hideDonateHeart === false`                                                                                        |
| Not explicitly opted out of this nudge | `hideSupporterNudge === false`                                                                                     |
| Tenure floor                           | `installedOn` ≥ 180 days ago                                                                                       |
| Engagement floor (any one)             | ≥ 6 distinct months with a service report **or** ≥ 50 total hours logged **or** ≥ 20 contacts + ≥ 10 conversations |
| Cooldown                               | `supporterNudgeDismissedAt === null` **or** ≥ 365 days since `supporterNudgeDismissedAt`                           |

Dev override (`devSupporterNudgeForceShow`) bypasses tenure, engagement, and cooldown gates under `__DEV__`, but still respects `!isSupporter`.

## Surface

Inline Home card, same pattern as `BackupReminder` (`src/components/BackupReminder.tsx`). Rendered in Home feed **below** `BackupReminder` and above the service report section. No modals, no toasts, no push notifications.

Visual identity: amber/gold supporter palette (`theme.colors.supporter` / `supporterTranslucent`), per `docs/supporter-plan.md:18`. Rounded container, not full-bleed.

## Behavior

- Eligibility is a pure function of reactive store state. No explicit "on monthly-report submission" hook is needed — submitting a report updates `useServiceReport`, which flows through the predicate; the card appears naturally on next Home render.
- Tapping "Learn more" navigates to `DonationInfoScreen` (soft letter, FAQ, supporter benefits) and stamps `supporterNudgeDismissedAt`. Never navigates directly to `PaywallScreen` — matches the "no direct paywall" principle.
- Tapping "Not right now" stamps `supporterNudgeDismissedAt` and hides the card.
- Both interactions stamp the same timestamp; no distinction between dismiss and CTA for cooldown purposes. Rationale: a user who engaged with the ask and declined shouldn't be re-asked sooner than a user who silently dismissed.

## Copy (en-US)

| Key                      | String                                                                                                                        |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `supporterNudge_title`   | Thank you for using WitnessWork                                                                                               |
| `supporterNudge_body`    | The app is, and always will be, free. If WitnessWork has been helpful to you in your ministry, supporters help keep it going. |
| `supporterNudge_cta`     | Learn more                                                                                                                    |
| `supporterNudge_dismiss` | Not right now                                                                                                                 |
| `hideSupporterNudge`     | Hide supporter reminders                                                                                                      |

Auto-translation via `pnpm run translate` will produce uneven results for "ministry" and "supporters" in several locales. The word "ministry" in particular carries specific religious meaning for this audience; a manual pass across at least the following locales is required before shipping:

- sw-KE (Swahili)
- ja-JP (Japanese)
- ko-KR (Korean)
- bem-ZM (Bemba)
- zh-CN / zh-TW (Chinese)
- rw-RW (Kinyarwanda)

## State

Added to `PREFERENCE_DEFAULTS` in `src/stores/preferences.ts`:

```ts
supporterNudgeDismissedAt: null as number | null,  // epoch ms, syncable
hideSupporterNudge: false,                         // syncable
devSupporterNudgeForceShow: false,                 // non-syncable, __DEV__ only
```

`supporterNudgeDismissedAt` and `hideSupporterNudge` sync across devices via the existing iCloud sync pipeline. They represent user intent and should follow the user. `devSupporterNudgeForceShow` is local dev bookkeeping and is added to `NON_SYNCABLE_PREFERENCE_KEYS`, matching the `devSupporterOverride` convention at `src/stores/preferences.ts:250`.

## Files touched

| File                                                                         | Purpose                                                                                  |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `src/stores/preferences.ts`                                                  | Add 3 fields; add `devSupporterNudgeForceShow` to `NON_SYNCABLE_PREFERENCE_KEYS`         |
| `src/lib/supporterNudge.ts` _(new)_                                          | Pure `isSupporterNudgeEligible(...)` function; unit-testable without React               |
| `src/components/SupporterNudgeCard.tsx` _(new)_                              | The card UI — amber palette, two buttons, no X icon                                      |
| `src/screens/HomeScreen.tsx`                                                 | Import hook + render `SupporterNudgeCard` conditionally above the service report section |
| `src/screens/settings/preferences/sections/HomeScreenPreferencesSection.tsx` | "Hide supporter reminders" switch next to `hideDonateHeart`                              |
| `src/screens/ToolsScreen.tsx`                                                | Dev "Force-show supporter nudge" toggle + "Reset nudge dismissal" button                 |
| `src/locales/en-US.json`                                                     | 5 new keys                                                                               |
| `src/locales/*.json`                                                         | Auto-translated via `pnpm run translate`; manual pass for "ministry"                     |

## Dev affordances

Added to the existing dev tools screen (`src/screens/ToolsScreen.tsx`):

1. **Force-show supporter nudge** — a switch bound to `devSupporterNudgeForceShow`. Only honored inside `__DEV__` bundles (production reads the flag but ignores it, same pattern as `devSupporterOverride`).
2. **Reset nudge dismissal** — a button that sets `supporterNudgeDismissedAt: null`. Lets the dev re-test the dismiss/cooldown flow without clock manipulation.

## What this design deliberately omits

- **Personalized stats in copy** (e.g., "Thank you for 6 months of tracking") — feels surveillance-y for a privacy-forward app; also triples i18n complexity across 18 locales with minimal emotional gain.
- **Show-count decay** (stop asking after N declines) — the Settings toggle already provides a clean opt-out; not worth the extra state path.
- **Push notifications** — wrong surface for this audience; would erode trust.
- **A/B testing / feature flag** — no backend, no need.
- **Modal or toast UI** — pattern-matches to paywalls and would feel commercial.
- **External ko-fi link** — the existing `todo.md` note about Apple TOS migration is a separate, larger decision that affects the whole donation path, not just this nudge. When that migration happens, `DonationInfoScreen` absorbs the change and this card inherits it automatically.
- **Explicit "on submit" hook** — reactive store state makes it unnecessary.

## Migration

No migration code needed. Existing users get the defaults (`supporterNudgeDismissedAt: null`, `hideSupporterNudge: false`), and the first time they qualify across the eligibility predicate the card renders naturally. `WhatsNewSheet` is unaffected — it's a modal-at-launch surface and doesn't collide with the Home feed.

## Open questions (out of scope for this PR)

- When/whether to migrate the donation path from RevenueCat IAP to ko-fi external linking — tracked separately in `todo.md`.
- Whether to add a second surface (e.g., post-goal-hit toast) after measuring v1 reception.
