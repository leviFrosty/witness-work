# Supporter Nudge Plan

A single low-frequency item in the notifications tray that thanks long-tenure, high-engagement users and surfaces the supporter path. Absorbs and supersedes two `todo.md` notes:

- "Add a donation nudge reminder for users who have 'high' app usage."
- "Add contextual donation card after monthly report submission."

The principles from `docs/supporter-plan.md` (supporter, not premium; "the app is free and always will be") still govern the tone. That doc is otherwise historical.

> **Updated to match the code.** This plan originally described a Home card with "Learn more" and "Not right now" buttons, where "Learn more" opened `DonationInfoScreen`. The nudge is now a notifications-tray item whose action goes straight to the Paywall, and `DonationInfoScreen` no longer exists. The eligibility rules and their rationale are unchanged.

## Goal

Gratitude / moment-of-value surfacing, with discoverability-style dismiss discipline. Not a conversion funnel.

- Thank-you first, ask last.
- One item, one surface, low cadence, respectful of user autonomy.
- Audience (Jehovah's Witnesses) is tone-sensitive to anything that reads as commerce or pressure — design leans warm, humble, and collective.

## Eligibility

All of the following must be true. Evaluated reactively — the item appears in the tray whenever the predicate passes. The predicate is `isSupporterNudgeEligible` in `src/features/supporter/lib/supporterNudge.ts`; thresholds live in `SUPPORTER_NUDGE_THRESHOLDS`.

| Gate                                   | Requirement                                                                                                        |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Not a supporter                        | `useIsSupporter().isSupporter === false` (respects `devSupporterOverride`)                                         |
| Not already opted out via donate heart | `hideDonateHeart === false`                                                                                        |
| Not explicitly opted out of this nudge | `hideSupporterNudge === false`                                                                                     |
| Tenure floor                           | `installedOn` ≥ 180 days ago                                                                                       |
| Engagement floor (any one)             | ≥ 6 distinct months with a service report **or** ≥ 50 total hours logged **or** ≥ 20 contacts + ≥ 10 conversations |
| Cooldown                               | `supporterNudgeDismissedAt === null` **or** ≥ 365 days since `supporterNudgeDismissedAt`                           |
| Intro grace                            | `supporterNudgeAvailableSince` is non-null **and** ≥ 45 days have elapsed since it was stamped                     |

The intro-grace gate exists to protect existing long-tenure users from being asked the moment they update to the nudge-introducing build — at the same time `WhatsNewSheet` and other new surfaces are landing. `useSupporterNotifications` stamps `supporterNudgeAvailableSince` the first time it runs with the value still `null`; the predicate treats null as "not yet eligible" so a single render never both stamps and shows.

A Supporter feedback survey invitation (ADR 0013) takes precedence: while one is available, the tray shows it instead of the nudge.

Dev override (`devSupporterNudgeForceShow`) bypasses tenure, engagement, cooldown, and intro-grace gates under `__DEV__`, but still respects `!isSupporter`, `hideDonateHeart`, and `hideSupporterNudge`.

## Surface

A `NotificationItem` built by `useSupporterNotifications` (`src/features/supporter/hooks/useSupporterNotifications.ts`) and listed by `NotificationsBell` (`src/app/notifications/NotificationsBell.tsx`) alongside the other tray items. It uses the heart icon and the `supporter` tone (amber/gold `theme.colors.supporter`). No modals, no toasts, no push notifications.

## Behavior

- Eligibility is a pure function of reactive store state. No explicit "on monthly-report submission" hook is needed — submitting a report updates `useServiceReport`, which flows through the predicate; the item appears on the next tray render.
- Tapping "Learn more" stamps `supporterNudgeDismissedAt` and opens the Paywall (`source: 'notifications_tray'`).
- Dismissing the item with the tray's own dismiss control stamps `supporterNudgeDismissedAt` and removes it.
- Both interactions stamp the same timestamp; no distinction between dismiss and CTA for cooldown purposes. Rationale: a user who engaged with the ask and declined shouldn't be re-asked sooner than a user who silently dismissed.
- The item id includes the last dismissal stamp, so the ask after each cooldown counts as a new tray item.
- Analytics: `supporter_nudge_viewed`, `supporter_nudge_clicked`, and `supporter_nudge_dismissed`, each with `source: 'notifications_tray'` (see `docs/analytics.md`).

## Copy (en-US)

| Key                    | String                                                                                                                        |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `supporterNudge_title` | Thank you for using WitnessWork                                                                                               |
| `supporterNudge_body`  | The app is, and always will be, free. If WitnessWork has been helpful to you in your ministry, supporters help keep it going. |
| `supporterNudge_cta`   | Learn more                                                                                                                    |
| `hideSupporterNudge`   | Hide supporter reminders                                                                                                      |

`src/locales/en-US.json` is the source of truth. Other locales are human-approved; the word "ministry" in particular carries specific religious meaning for this audience, so check it in each translation.

## State

In `PREFERENCE_DEFAULTS` in `src/stores/preferences.ts`:

```ts
supporterNudgeDismissedAt: null as number | null,     // epoch ms, syncable
hideSupporterNudge: false,                            // syncable
supporterNudgeAvailableSince: null as number | null,  // epoch ms, syncable
devSupporterNudgeForceShow: false,                    // non-syncable, __DEV__ only
```

`supporterNudgeDismissedAt`, `hideSupporterNudge`, and `supporterNudgeAvailableSince` sync across devices via the existing iCloud sync pipeline. They represent user intent / per-user timing and should follow the user. `devSupporterNudgeForceShow` is local dev bookkeeping and is listed in `NON_SYNCABLE_PREFERENCE_KEYS` (`src/lib/syncPreferencePolicy.ts`), matching the `devSupporterOverride` convention.

## Files

| File                                                                                     | Purpose                                                                     |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `src/stores/preferences.ts`                                                              | The nudge preferences above                                                 |
| `src/lib/syncPreferencePolicy.ts`                                                        | Keeps `devSupporterNudgeForceShow` device-local                             |
| `src/features/supporter/lib/supporterNudge.ts`                                           | Pure `isSupporterNudgeEligible(...)` predicate; unit-testable without React |
| `src/features/supporter/hooks/useSupporterNotifications.ts`                              | Stamps the intro grace and builds the tray item (or the survey invitation)  |
| `src/app/notifications/NotificationsBell.tsx`                                            | Lists the supporter items in the notifications tray                         |
| `src/features/settings/components/preferences-sections/HomeScreenPreferencesSection.tsx` | "Hide supporter reminders" switch next to `hideDonateHeart`                 |
| `src/app/navigation/ToolsScreen.tsx`                                                     | Dev "Force-show nudge" switch and "Reset nudge dismissal" button            |
| `src/__tests__/supporterNudge.test.ts`                                                   | Predicate tests                                                             |

## Dev affordances

In the dev tools screen (`src/app/navigation/ToolsScreen.tsx`), under "Home nudge":

1. **Force-show nudge** — a switch bound to `devSupporterNudgeForceShow`. Only honored inside `__DEV__` bundles (production reads the flag but ignores it, same pattern as `devSupporterOverride`).
2. **Reset nudge dismissal** — a button that sets `supporterNudgeDismissedAt: null`. Lets the dev re-test the dismiss/cooldown flow without clock manipulation.

## What this design deliberately omits

- **Personalized stats in copy** (e.g., "Thank you for 6 months of tracking") — feels surveillance-y for a privacy-forward app; also multiplies i18n complexity across every locale with minimal emotional gain.
- **Show-count decay** (stop asking after N declines) — the Settings toggle already provides a clean opt-out; not worth the extra state path.
- **Push notifications** — wrong surface for this audience; would erode trust.
- **A/B testing / feature flag** — not needed for a single low-cadence ask.
- **Modal or toast UI** — pattern-matches to paywalls and would feel commercial.
- **External ko-fi link** — the existing `todo.md` note about Apple TOS migration is a separate, larger decision that affects the whole donation path, not just this nudge. When that migration happens, the Paywall absorbs the change and this item inherits it automatically.
- **Explicit "on submit" hook** — reactive store state makes it unnecessary.

## Migration

No schema migration needed. Existing users get the defaults (`supporterNudgeDismissedAt: null`, `hideSupporterNudge: false`, `supporterNudgeAvailableSince: null`). The intro-grace gate is what handles the upgrade case: the first run of `useSupporterNotifications` after updating stamps `supporterNudgeAvailableSince` to "now," and the predicate then waits `introGraceDays` before the item can appear. Without this, an existing long-tenure / high-engagement user would see the nudge the moment they opened the build that ships it, alongside `WhatsNewSheet` and any other new surfaces.

## Open questions

- When/whether to migrate the donation path from RevenueCat IAP to ko-fi external linking — tracked separately in `todo.md`.
- Whether to add a second surface (e.g., post-goal-hit toast) after measuring v1 reception.
