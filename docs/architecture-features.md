# Feature-folder architecture

This codebase is organised into **shared / feature / app** tiers, enforced at lint time by `eslint-plugin-boundaries`. The model mirrors [cool-ice](https://github.com/levifrosty/cool-ice) — a single-repo adaptation, without the Turborepo monorepo split.

## Tiers

```
src/
  app/                 ← app tier (navigation + cross-cutting infra)
    App.tsx
    navigation/        RootStack, HomeTabStack, DrawerNavigator, ToolsScreen
    widgets/           iOS widget snapshot composition
    sync/              iCloud sync orchestration (+ components/)
    deep-links/        DeepLinkListeners

  features/            ← feature tier (one folder per domain)
    contacts/        screens/ components/ hooks/ lib/ stores/
    conversations/   screens/ components/ lib/
    home/            screens/ components/ lib/         (treated as app — page-level orchestrator)
    map/             screens/ components/ lib/ types/
    milestones/      screens/ components/ stores/
    onboarding/      components/                        (treated as app — uses app/sync infra)
    plans/           screens/ components/               (treated as app — composes plans + service-reports)
    progress/        screens/ components/               (treated as app — composes reports + milestones)
    service-reports/ screens/ components/ hooks/ lib/ stores/
    settings/        screens/ components/ hooks/ lib/   (treated as app — composes every other feature)
    supporter/       screens/ components/ stores/
    updates/         screens/ components/ lib/ constants/  (treated as app — links into settings, etc.)

    Each feature contains:
      screens/        navigation entry points
      components/     feature-specific UI
      (lib/, hooks/, stores/, types/, constants/ — added when needed)

  components/  lib/  hooks/  stores/  types/  constants/   ← shared tier
  providers/   contexts/   assets/   locales/   shaders/   vendor/
  __tests__/                                                ← treated as `app` so tests can pull from features
```

## Boundaries rules (`.eslintrc.json`)

```
shared    ← shared only
feature   ← shared + same-feature
app       ← shared + any feature + app + neverImport (transitional)
```

Cool-ice's strict rule is `app ← shared + feature only`. The transitional `app + neverImport` allow exists during the migration; it can be tightened to mirror cool-ice exactly once the remaining shared→feature dependencies are resolved.

### Pattern matching order (first-match-wins)

1. `app` — includes `src/app/**`, plus `features/{home,settings,updates,onboarding,plans,progress}/**` (page-level orchestrators), plus `src/__tests__/**` (tests need to reach features)
2. `feature` — `src/features/*/**` (captures `featureName`)
3. `shared` — `src/{components,lib,hooks,stores,types,constants,providers,contexts,assets,locales,shaders,vendor}/**`
4. `neverImport` — `src/*` (top-level root files)

## Why some features are classified as `app`

`home`, `settings`, `progress`, `plans`, `updates`, `onboarding` are page-level orchestrators that genuinely span multiple domains:

- HomeScreen composes timer (service-reports) + monthly summary + recent contacts + supporter banner + …
- Settings displays preferences from every feature
- ProgressScreen composes service reports + milestones
- ScheduleScreen composes plans + service-report calendars
- WhatsNew/UpdateScreen flow into Settings
- Onboarding's iCloud restore step consumes `app/sync`

In cool-ice, these would be top-level pages in `src/app/`. We keep them under `src/features/` for navigation hygiene but mark them as `app` in boundaries so they can pull from any feature plus app-tier infrastructure.

## Why some "obvious feature" code stays in shared

The boundaries plugin surfaced real coupling that wasn't visible before:

- **Cross-feature data stores** (`stores/contactsStore`, `stores/conversationStore`, `stores/serviceReport`, `stores/preferences`, `stores/timeCache`, `stores/mmkv`) — read by `app/widgets` and `app/sync` plus every feature. Moving them into a feature would require those widgets/sync writers to do cross-feature imports. The per-feature stores that did move (`celebrationQueue`, `milestoneReveal`, `contactsSearchStore`, `supporter`) only had a single feature or app-tier consumer.
- **Pure domain helpers** (`lib/contacts`, `lib/conversations`, `lib/serviceReport`, `lib/milestones`, `lib/profileStats`, `lib/contactsFilters`, `lib/contactsSort`, `lib/notifications`, …) — consumed by the data layer (preferences/widgets/sync) or by multiple features. The persisted-state types in `contactsFilters` / `contactsSort` keep the impl pinned to shared.
- **Cross-feature UI primitives** (`SupporterBadge`, `IsSupporter`, `DayPlanRow`, `RecurringPlanRow`, `YearMilestoneCard`, `MilestoneProgressBar`, `ContactAvatarCropEditor`, `ProfileCard`, `ProfileDetailOverlay`, `TabBar`, `GlassCard`, `PublisherTypeSelector`, `PublisherCheckBoxCard`, `StalenessColorKey`, `SwipeMonthNavigator`, `WeekStripTeaser`, `DefaultNavigationSelector`, `SupporterBenefits`, `DismissableCard`, `CardWithTitle`) — used by 2+ features. They earn a place in `shared/components/` because they have many callers.
- **Domain types** (`types/contact`, `types/customField`, `types/conversation`, `types/serviceReport`, `types/publisher`, `types/avatar`, `types/here`, `types/markerColors`, `types/textInput`, `types/theme`, `types/rootStack`, `types/homeStack`) — referenced by preferences, sync payloads, widget snapshots, and many features.
- **Shader stack** (`shaders/*`) — used by `ProfileCard` + `TiltableCard` (shared components) + `preferences`, so it sits in shared.

This is the principled "shared model, feature UI" split for this codebase. A purer per-feature data isolation would require splitting each feature's read of the global store into per-feature snapshot contributors with an app-level composer — a follow-up worth doing if cross-feature coupling continues to grow.

## What's still in flight

| Tier                                     | Status                                                                                                          |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| ESLint boundaries config                 | ✅ in place                                                                                                     |
| App tier (`src/app/`)                    | ✅ navigation, widgets, sync, deep-links moved                                                                  |
| `features/*/screens/`                    | ✅ every screen migrated                                                                                        |
| `features/*/components/`                 | ✅ single-feature components migrated; only multi-feature primitives remain shared                              |
| `features/*/lib/`                        | ✅ single-feature lib migrated (contacts, conversations, home, map, service-reports, settings, updates)         |
| `features/*/hooks/`                      | ✅ single-feature hooks migrated (contacts, service-reports, settings)                                          |
| `features/*/stores/`                     | ✅ single-feature stores migrated (contacts, milestones, service-reports, supporter)                            |
| `features/*/types/`                      | ✅ single-feature types migrated (map)                                                                          |
| `features/*/constants/`                  | ✅ single-feature constants migrated (updates)                                                                  |
| Strict `app←shared+feature` (no app→app) | ❌ transitional rule still allows app→app and neverImport→neverImport while a few legacy import patterns settle |

## Following the pattern

When adding new code:

- **Feature-specific** (only used by one feature): go in `src/features/<feature>/{screens,components,lib,hooks,stores,types}/`
- **Cross-feature / shared primitive**: goes in `src/{components,lib,hooks,stores,types}/`
- **App-level infrastructure** (boots in `App.tsx`, reads multiple features): goes in `src/app/<area>/`

If your feature needs to import from another feature, that's a signal — either:

- The dependency belongs in `shared/` (lift it up), or
- The consumer is actually a page-level orchestrator and should be reclassified to `app` (and added to the app-pattern in `.eslintrc.json`)

## ESLint deps added

- `eslint-plugin-boundaries@^4.2.2`
- `eslint-plugin-import@^2.29.1`
- `eslint-import-resolver-typescript@^3.6.3`

All compatible with the existing ESLint 8.51 setup — no engine upgrade required.

## Commits in this refactor

1. `chore(eslint): install boundaries plugin + scaffold features/app dirs`
2. `refactor(app): move navigation, widgets, sync into src/app/`
3. `refactor(features): extract contacts UI into src/features/contacts/`
4. `refactor(features): migrate all remaining screens into feature folders`
5. `refactor(features): migrate onboarding to src/features/onboarding/`
6. `chore(eslint): drop legacy src/screens & src/stacks patterns`
7. `refactor(features): extract conversations + milestones components`
8. `refactor(features): migrate per-feature components into feature folders`
9. `refactor(features): pull obvious single-feature lib/hooks/stores into feature folders` (settings/lib/appIcon + hooks/useLocale; updates/lib + constants; map/lib/mapCarousel; conversations/lib/storeReview; home/lib/supporterNudge; contacts/hooks; service-reports/hooks + stores/celebrationQueue; milestones/stores/milestoneReveal)
10. `refactor(features): migrate contact/map/supporter lib + stores into feature folders` (contacts/lib/{customFieldsMigration,contactsSearch,contactShareLink,contactImport}, contacts/stores/contactsSearchStore, contacts/components/SharedGoodNewsListener, settings/lib/hemisphere, map/types/map, supporter/stores/supporter)
11. `refactor(features): pull rollover, updates lib, and drop dead timeScreen constant`
12. `refactor(features): pull single-feature components into feature folders` (PinLocation, MapWarningLocationSharingDisabled, ConversationRow → contacts; CategorySegmentBar, CategoriesSection, CreditBadge, CreditInfoSheet, StudiesCard → service-reports; AddEarlierYearSheet, LifetimeHoursCard, MilestoneAdjustSheet → progress; BackupReminder → home; AnnualGoalSelector → settings; ShareAppButton → supporter; ShareAddressSheet → map)
13. `refactor(features): migrate 4 more single-feature shared components` (CalendarKey → plans; ContributionGraph → home; AheadOrBehindOfSchedule → service-reports; JsonViewer → contacts)
