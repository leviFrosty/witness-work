# Project Structure

For the tier rules (shared / feature / app) and how they're enforced by `eslint-plugin-boundaries`, see [`architecture-features.md`](architecture-features.md).

## Repo root

- [`.github`](/.github) Configuration files for Github actions.
- [`.husky`](/.husky) Configuration files for [husky](https://typicode.github.io/husky/), a git hooks library.
- [`.tamagui`](/.tamagui) Build cache for [tamagui](https://tamagui.dev/), the component library used in portions of the project.
- [`.vscode`](/.vscode) VSCode configuration files for extensions.
- [`docs`](/docs) Documentation and related assets for this repository.
- [`modules`](/modules) Local Expo modules.
- [`patches`](/patches) Patch files applied to dependencies via [`patch-package`](https://github.com/ds300/patch-package).
- [`plugins`](/plugins) Local Expo config plugins.
- [`scripts`](/scripts) Repo-level CLI scripts (see also `src/scripts/`).
- [`targets`](/targets) Native widget extension sources (iOS).
- [`eslint.config.mjs`](/eslint.config.mjs) ESLint 10 flat config — includes the boundaries plugin that enforces the shared/feature/app tiers.

## `src/`

Application source. Organised into the shared / feature / app tiers described in [`architecture-features.md`](architecture-features.md).

### App tier — [`src/app/`](/src/app)

App-level infrastructure that boots in `App.tsx` and may reach into any feature.

- [`App.tsx`](/src/app/App.tsx) — application entry point.
- [`navigation/`](/src/app/navigation) — `RootStack`, `HomeTabStack`, `HomeNavigator`, `ToolsScreen`.
- [`widgets/`](/src/app/widgets) — iOS widget snapshot composition (appointments, calendar, contacts, report, sync).
- [`sync/`](/src/app/sync) — iCloud sync orchestration (payload, merge, image sync, sync components).
- [`deep-links/`](/src/app/deep-links) — `DeepLinkListeners`.
- [`launch/`](/src/app/launch) — `LaunchSplash` (a pixel match of the native splash, shown while the app boots and while navigation resolves) and `launchState` (whether navigation's first screen is up yet).
- [`notifications/`](/src/app/notifications) — `NotificationsBell` (composes every feature's tray items into the Home header bell) and `NotificationHosts` (the sheet and survey tray actions open on Home).

### Feature tier — [`src/features/`](/src/features)

One folder per domain. Each feature contains the subset of `screens/ components/ hooks/ lib/ stores/ types/ constants/` it actually needs.

- [`contacts/`](/src/features/contacts) — **People the user is ministering to.** CRUD for contact records (name, address, geocoded pin, custom fields, personal notes), the contacts list with sort/filter/search, the contact-detail screen, "dismiss" (no longer interested) and recover-dismissed flows, address autocomplete + map pinning, contact sharing and import (`contactShareFormat` is the one field allow-list and import validation for links and `.witnesswork` files; `contactShareLink`, `contactImport`, `ContactImportListener`, `SharedGoodNewsListener`, `lib/linking` for deep-link / Universal Link routing), `GenderIcon`, the `Archive` + `Dismiss` swipe actions, and a debug `JsonViewer`. _Contains: screens, components, hooks, lib, stores._
- [`conversations/`](/src/features/conversations) — **A single interaction the user had with a contact** (return visit, Bible study, etc.). Add/edit conversation form, reschedule flow, and the "Approaching" (upcoming follow-ups) + "Missed" (overdue) lists surfaced on Home. Also owns `storeReview` (App Store review nudge triggered on a satisfying conversation). _Contains: screens, components, lib._
- [`home/`](/src/features/home) — **The Home tab — the app's landing surface.** Pure orchestrator: it imports and arranges UI from `service-reports` (timer, monthly summary, week strip, upgrade sheet), `visits` (today's/upcoming Follow-ups), `profile` (profile card, contribution-graph heatmap), `onboarding` (home checklist), and `updates` ("did you know?" tip). Time- and event-based notices (backup, last month's report, missed Follow-ups, supporter nudge, What's New) live in the notifications tray instead. Owns no UI components or libs of its own. Page-level orchestrator; classified as `app` so it can pull from every feature. _Contains: screens._
- [`map/`](/src/features/map) — **The Map tab.** Renders contacts as map markers (colored by staleness), a swipable carousel of contact cards, the map-onboarding sheet, the color-key legend, and share-address. _Contains: screens, components, lib, types._
- [`notifications/`](/src/features/notifications) — **The Home notifications tray.** Bell with unread badge, popover list, standard row, and the per-device store of dismissed/seen items. Items come from each feature's own `use…Notification(s)` hook (typed by `src/types/notifications.ts`) and are composed in `src/app/notifications`; the tray never imports another feature. _Contains: components, hooks, lib, stores._
- [`onboarding/`](/src/features/onboarding) — **First-launch flow.** Welcome → publisher type → goal → key-feature showcase → notification permission → optional iCloud restore. Runs once. The welcome (`components/welcome/`) picks up from the splash screen: it collapses into the app tile and unfolds an animated preview of the app (Skia aurora, feature cards, a rotating headline). **Distinct from `updates`:** `updates` is the post-upgrade "what's new" surface and OTA flow that fires every release. Page-level orchestrator; classified as `app`. _Contains: components, constants, hooks, lib._
- [`plans/`](/src/features/plans) — **Forward-looking schedule: what the user _intends_ to do.** Day plans (one-off "I'll do 2h on Tuesday") and recurring plans ("every Saturday morning"), the Schedule tab calendar overlay of planned vs. actual, and the per-day plan editor. **Distinct from `service-reports`:** plans are intent; service-reports are the logged actuals. The Schedule tab visually composes both. Page-level orchestrator; classified as `app`. _Contains: screens, components._
- [`profile/`](/src/features/profile) — **The user's identity and activity-stats surface.** `ProfileCard` (avatar, name, publisher type, tenure badge), the tap-through `ProfileDetailOverlay` (stats sheet with streaks, totals, days logged), `ContributionGraph` (GitHub-style heatmap of daily minutes), `MonthlyRoutine` (the per-month status pills), `SinceBadge` (tenure pill), the `profileStats` lib (streak/contribution math), and the `useDailyMinutes` hook (cached day→minutes flatten). Consumed by `home`, `settings/preferences`, and `onboarding`. _Contains: components, hooks, lib._
- [`milestones/`](/src/features/milestones) — **The Milestone Update (1.38.2) grand reveal, replay-only.** Its full-screen overlay, runtime visibility store (`milestoneReveal`), and magazine-style showcase screen. Launches show the current update reveal (`updates/components/reveal/`) instead; Developer Tools → Special updates replays both. _Contains: screens, components, stores._
- [`progress/`](/src/features/progress) — **Backward-looking dashboard: how the user is doing against their goals across time windows.** ProgressScreen with three tabs (Month / Year / All-Time), the lifetime-hours card, year-by-year breakdown, `AddEarlierYearSheet` (backfill totals for past service years), and `MilestoneAdjustSheet` (override the next milestone target). **Distinct from `service-reports`** (raw time-entry CRUD) — `progress` is the read-only summary view. Page-level orchestrator; classified as `app`. _Contains: screens, components._
- [`route-planning/`](/src/features/route-planning) — **Supporter "Plan today's route".** Collects today's open Follow-ups and Plans that have a map location (`lib/routeStops`), lets the user pick a start and remove stops, asks ww-api's `POST /route-planning/optimize` (HERE Waypoints Sequence, coordinates only) for the shortest driving order, and hands the route to the default navigation app (`lib/routeHandoff`: one Google Maps link, Apple Maps multi-stop on iOS 18.4+, otherwise one stop at a time). Its entry (`TodayRouteEntry`) sits in Schedule's day view behind `IsSupporter`. _Contains: screens, components, hooks, lib._
- [`service-reports/`](/src/features/service-reports) — **The core time-tracking domain.** Logging hours, credit hours, bible studies, and categories; the running stopwatch + timer UI; the monthly report view + share/export; rollover (carrying fractional minutes forward to the next month); the "service year catch-up" backfill flow; the ahead/behind-schedule indicator; calendars, day rows, and the month summary cards; `PublisherCheckBoxCard` (the checkbox-mode "did I share the Good News?" entry) and `GoalProgressStats` (monthly goal progress widget). **This is the data layer that `home`, `plans`, and `progress` all read from**, plus the editing surfaces that own writes to it. _Contains: screens, components, hooks, lib, stores._
- [`settings/`](/src/features/settings) — **The Settings drawer and every preference surface, plus the backup/export domain.** Top-level `SettingsScreen` (drawer), `MoreScreen` (overflow menu), `ImportAndExportScreen` (backup/restore JSON), the backup reminder tray item (`hooks/useBackupNotification`, `lib/backupReminder`), and the nested `preferences/` screens (publisher type, goals, theme, notifications, app icon, hemisphere, locale, …). Owns the settings-only `inputs/InputRowButton` row component. Composes preferences from every other feature. Page-level orchestrator; classified as `app`. _Contains: screens, components, hooks, lib._
- [`supporter/`](/src/features/supporter) — **Premium "supporter" purchase flow** via RevenueCat. Paywall, thank-you, donation-info (how the supporter purchase translates to a donation), previous donations, share-app button, and the supporter-nudge card (with its `isSupporterNudgeEligible` predicate in `lib/supporterNudge`). Stores supporter entitlement state. _Contains: screens, components, lib, stores._
- [`updates/`](/src/features/updates) — **Post-upgrade surfaces.** Expo OTA update flow (`UpdateScreen` + `lib/updates`), the "What's New" sheet/screen built from `constants/releaseNotes` (and its tray item), the update reveal for big releases (`components/reveal/` — the splash collapsing into the app tile, then a short tour of the release ending on sharing the app; gated by `constants/updateReveal`), the FAQ screen built from `constants/faqs`, and the rotating "Did you know?" tips. Fires every release. **Distinct from `onboarding`** (one-time first-launch). Page-level orchestrator; classified as `app`. _Contains: screens, components, lib, constants._

### Shared tier

Cross-feature primitives and infra. Anything in here is importable by every tier.

- [`components/`](/src/components) — split into two tiers:
  - [`components/ui/`](/src/components/ui) — atomic UI primitives with no domain awareness (`Button`, `MyText`, `IconButton`, `Card`, `Badge`, `Chip`, `Avatar`, `TextInput`, `DateTimePicker`, etc.) plus the `inputs/`, `layout/`, and `swipeableActions/` subfolders.
  - [`components/`](/src/components) (root) — composed cross-feature blocks that combine primitives and are consumed by 2+ features, or are locked into shared by a shared-tier consumer chain (`IsSupporter`, `SupporterBadge`, `AvatarPickerPopover`, `ColorPickerSheet`, `CalendarDay`, `DismissableCard`, `YearMilestoneCard`, `PublisherTypeSelector`, etc.). See [`architecture-features.md`](architecture-features.md#componentsui-vs-componentsroot--which-to-pick) for which tier to pick.
- [`lib/`](/src/lib) — shared helpers consumed by the data layer (preferences/widgets/sync) or by multiple features.
- [`hooks/`](/src/hooks) — shared custom React hooks.
- [`stores/`](/src/stores) — MMKV-backed Zustand stores read across features (`contactsStore`, `conversationStore`, `serviceReport`, `preferences`, `timeCache`, `mmkv`, …).
- [`types/`](/src/types) — shared TypeScript types (domain models referenced by stores, sync payloads, widget snapshots).
- [`constants/`](/src/constants) — values that are constant throughout the app.
- [`providers/`](/src/providers) — [React Providers](https://react.dev/reference/react/createContext#provider) for the contexts.
- [`contexts/`](/src/contexts) — internal [React Contexts](https://react.dev/learn/passing-data-deeply-with-context).
- [`assets/`](/src/assets) — local assets (images, icons, [lottie](https://lottiefiles.com/) animations).
- [`locales/`](/src/locales) — translation files per locale; `en-US` is the source of truth.
- [`vendor/`](/src/vendor) — vendored third-party code.

### Other

- [`src/__tests__/`](/src/__tests__) — tests. Classified as `app` so they can pull from any feature.
- [`src/scripts/`](/src/scripts) — local CLI scripts for various CI/CD functions (e.g. `translate.ts`).
- [`src/index.js`](/src/index.js) — runtime entry that registers `App.tsx`.

## Path alias

Imports use the `@/*` TypeScript path alias mapped to `src/*` (see `tsconfig.json`). Prefer `@/features/...` / `@/app/...` / `@/components/...` over relative paths.
