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
- [`navigation/`](/src/app/navigation) — `RootStack`, `HomeTabStack`, `DrawerNavigator`, `ToolsScreen`.
- [`widgets/`](/src/app/widgets) — iOS widget snapshot composition (appointments, calendar, contacts, report, sync).
- [`sync/`](/src/app/sync) — iCloud sync orchestration (payload, merge, image sync, sync components).
- [`deep-links/`](/src/app/deep-links) — `DeepLinkListeners`.

### Feature tier — [`src/features/`](/src/features)

One folder per domain. Each feature contains the subset of `screens/ components/ hooks/ lib/ stores/ types/ constants/` it actually needs.

- [`contacts/`](/src/features/contacts) — **People the user is ministering to.** CRUD for contact records (name, address, geocoded pin, custom fields, personal notes), the contacts list with sort/filter/search, the contact-detail screen, "dismiss" (no longer interested) and recover-dismissed flows, address autocomplete + map pinning, share-link import (`SharedGoodNewsListener`, `contactImport`, `contactShareLink`), and a debug `JsonViewer`. _Contains: screens, components, hooks, lib, stores._
- [`conversations/`](/src/features/conversations) — **A single interaction the user had with a contact** (return visit, Bible study, etc.). Add/edit conversation form, reschedule flow, and the "Approaching" (upcoming follow-ups) + "Missed" (overdue) lists surfaced on Home. Also owns `storeReview` (App Store review nudge triggered on a satisfying conversation). _Contains: screens, components, lib._
- [`home/`](/src/features/home) — **The Home tab — the app's landing surface.** Pure orchestrator: it imports and arranges UI from `service-reports` (timer, monthly summary, week strip, upgrade sheet), `conversations` (approaching + missed lists), `profile` (profile card, contribution-graph heatmap), `milestones` (year milestone card), `supporter` (supporter nudge), `settings` (backup reminder), `onboarding` (home checklist), and `updates` ("did you know?" tip). Owns no UI components or libs of its own. Page-level orchestrator; classified as `app` so it can pull from every feature. _Contains: screens._
- [`map/`](/src/features/map) — **The Map tab.** Renders contacts as map markers (colored by staleness), a swipable carousel of contact cards, the map-onboarding sheet, the color-key legend, and share-address. _Contains: screens, components, lib, types._
- [`milestones/`](/src/features/milestones) — **Milestone celebration UX** — the animated full-screen "you hit X hours!" reveal, its queue (`milestoneReveal` store), the recovery icon to re-trigger a missed reveal, and the milestone showcase screen. **Distinct from `progress`:** `milestones` is the _celebration moment_; `progress` is the always-visible _dashboard_ that shows where the user is on the ladder. _Contains: screens, components, stores._
- [`onboarding/`](/src/features/onboarding) — **First-launch flow.** Welcome → publisher type → goal → key-feature showcase → notification permission → optional iCloud restore. Runs once. **Distinct from `updates`:** `updates` is the post-upgrade "what's new" surface and OTA flow that fires every release. Page-level orchestrator; classified as `app`. _Contains: components._
- [`plans/`](/src/features/plans) — **Forward-looking schedule: what the user _intends_ to do.** Day plans (one-off "I'll do 2h on Tuesday") and recurring plans ("every Saturday morning"), the Schedule tab calendar overlay of planned vs. actual, and the per-day plan editor. **Distinct from `service-reports`:** plans are intent; service-reports are the logged actuals. The Schedule tab visually composes both. Page-level orchestrator; classified as `app`. _Contains: screens, components._
- [`profile/`](/src/features/profile) — **The user's identity and activity-stats surface.** `ProfileCard` (avatar, name, publisher type, tenure badge), the tap-through `ProfileDetailOverlay` (stats sheet with streaks, totals, days logged), `ContributionGraph` (GitHub-style heatmap of daily minutes), `TiltableCard` (the shader-overlay card chrome the profile card uses), the `profileStats` lib (streak/contribution math), and the `useDailyMinutes` hook (cached day→minutes flatten). Consumed by `home`, `settings/preferences`, and `onboarding`. _Contains: components, hooks, lib._
- [`progress/`](/src/features/progress) — **Backward-looking dashboard: how the user is doing against their goals across time windows.** ProgressScreen with three tabs (Month / Year / All-Time), the lifetime-hours card, year-by-year breakdown, `AddEarlierYearSheet` (backfill totals for past service years), and `MilestoneAdjustSheet` (override the next milestone target). **Distinct from `service-reports`** (raw time-entry CRUD) **and `milestones`** (celebration animations) — `progress` is the read-only summary view. Page-level orchestrator; classified as `app`. _Contains: screens, components._
- [`service-reports/`](/src/features/service-reports) — **The core time-tracking domain.** Logging hours, credit hours, bible studies, and categories; the running stopwatch + timer UI; the monthly report view + share/export; rollover (carrying fractional minutes forward to the next month); the "service year catch-up" backfill flow; the ahead/behind-schedule indicator; calendars, day rows, and the month summary cards. **This is the data layer that `home`, `plans`, and `progress` all read from**, plus the editing surfaces that own writes to it. _Contains: screens, components, hooks, lib, stores._
- [`settings/`](/src/features/settings) — **The Settings drawer and every preference surface, plus the backup/export domain.** Top-level `SettingsScreen` (drawer), `MoreScreen` (overflow menu), `ImportAndExportScreen` (backup/restore JSON), the `BackupReminder` banner (shown on Home when local export is overdue), and the nested `preferences/` screens (publisher type, goals, theme, notifications, app icon, hemisphere, locale, …). Composes preferences from every other feature. Page-level orchestrator; classified as `app`. _Contains: screens, components, hooks, lib._
- [`supporter/`](/src/features/supporter) — **Premium "supporter" purchase flow** via RevenueCat. Paywall, thank-you, donation-info (how the supporter purchase translates to a donation), previous donations, share-app button, and the supporter-nudge card (with its `isSupporterNudgeEligible` predicate in `lib/supporterNudge`). Stores supporter entitlement state. _Contains: screens, components, lib, stores._
- [`updates/`](/src/features/updates) — **Post-upgrade surfaces.** Expo OTA update flow (`UpdateScreen` + `lib/updates`), the "What's New" sheet/screen built from `constants/releaseNotes`, the FAQ screen built from `constants/faqs`, and the rotating "Did you know?" tips. Fires every release. **Distinct from `onboarding`** (one-time first-launch). Page-level orchestrator; classified as `app`. _Contains: screens, components, lib, constants._

### Shared tier

Cross-feature primitives and infra. Anything in here is importable by every tier.

- [`components/`](/src/components) — UI primitives used by 2+ features.
- [`lib/`](/src/lib) — shared helpers consumed by the data layer (preferences/widgets/sync) or by multiple features.
- [`hooks/`](/src/hooks) — shared custom React hooks.
- [`stores/`](/src/stores) — MMKV-backed Zustand stores read across features (`contactsStore`, `conversationStore`, `serviceReport`, `preferences`, `timeCache`, `mmkv`, …).
- [`types/`](/src/types) — shared TypeScript types (domain models referenced by stores, sync payloads, widget snapshots).
- [`constants/`](/src/constants) — values that are constant throughout the app.
- [`providers/`](/src/providers) — [React Providers](https://react.dev/reference/react/createContext#provider) for the contexts.
- [`contexts/`](/src/contexts) — internal [React Contexts](https://react.dev/learn/passing-data-deeply-with-context).
- [`assets/`](/src/assets) — local assets (images, icons, [lottie](https://lottiefiles.com/) animations).
- [`locales/`](/src/locales) — translation files per locale; `en-US` is the source of truth.
- [`shaders/`](/src/shaders) — GL shader stack used by `features/profile/` (ProfileCard + TiltableCard) and `stores/preferences`.
- [`vendor/`](/src/vendor) — vendored third-party code.

### Other

- [`src/__tests__/`](/src/__tests__) — tests. Classified as `app` so they can pull from any feature.
- [`src/scripts/`](/src/scripts) — local CLI scripts for various CI/CD functions (e.g. `translate.ts`).
- [`src/index.js`](/src/index.js) — runtime entry that registers `App.tsx`.

## Path alias

Imports use the `@/*` TypeScript path alias mapped to `src/*` (see `tsconfig.json`). Prefer `@/features/...` / `@/app/...` / `@/components/...` over relative paths.
