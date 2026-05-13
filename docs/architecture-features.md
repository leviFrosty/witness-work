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
    home/            screens/                           (treated as app — pure orchestrator, no own UI/lib)
    map/             screens/ components/ lib/ types/
    milestones/      screens/ components/ stores/
    onboarding/      components/                        (treated as app — uses app/sync infra)
    plans/           screens/ components/               (treated as app — composes plans + service-reports)
    profile/         components/ hooks/ lib/            (profile card, contribution graph, profile stats)
    progress/        screens/ components/               (treated as app — composes reports + milestones)
    service-reports/ screens/ components/ hooks/ lib/ stores/
    settings/        screens/ components/ hooks/ lib/   (treated as app — composes every other feature)
    supporter/       screens/ components/ lib/ stores/
    updates/         screens/ components/ lib/ constants/  (treated as app — links into settings, etc.)

    Each feature contains:
      screens/        navigation entry points
      components/     feature-specific UI
      (lib/, hooks/, stores/, types/, constants/ — added when needed)

  components/                                              ← shared tier
    ui/              atomic UI primitives (Button, MyText, Card, Badge, …)
                       + inputs/ layout/ swipeableActions/ subfolders
    <root>           composed cross-feature blocks that combine primitives
                       (CalendarDay, AvatarPickerPopover, IsSupporter, …)
  lib/  hooks/  stores/  types/  constants/
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

### Home is a pure orchestrator — do not put UI/lib in `features/home/`

The home tab is the strongest expression of "page-level orchestrator." Its job is to import and arrange UI authored by other features: timer (`service-reports`), approaching/missed conversations (`conversations`), the profile card and activity heatmap (`profile`), the monthly progress summary (`service-reports`), the supporter nudge (`supporter`), the backup reminder (`settings`), the year milestone (`milestones`), the "what's new" tip (`updates`), the onboarding checklist (`onboarding`).

**Do not add new components, hooks, or lib under `features/home/`.** If you find yourself reaching for `features/home/components/Foo.tsx`, ask: _which domain does `Foo` belong to?_ — and put it there instead. Common domains:

- A new home-screen card visualizing time data → `features/service-reports/components/` (or `features/profile/components/` if it's about identity/activity stats)
- A piece of supporter-nudge UI → `features/supporter/components/` (and any eligibility predicate → `features/supporter/lib/`)
- A piece of backup/export UI → `features/settings/components/`
- An onboarding-checklist piece → `features/onboarding/components/`

The test: **someone wanting to reuse `Foo` on a non-home screen should not have to import from `features/home/`.** That's a coupling smell that defeats the point of feature folders. Only `screens/HomeScreen.tsx` (and any future home-tab-specific screen) should live in `features/home/`.

## Why some "obvious feature" code stays in shared

The boundaries plugin surfaced real coupling that wasn't visible before:

- **Cross-feature data stores** (`stores/contactsStore`, `stores/conversationStore`, `stores/serviceReport`, `stores/preferences`, `stores/timeCache`, `stores/mmkv`) — read by `app/widgets` and `app/sync` plus every feature. Moving them into a feature would require those widgets/sync writers to do cross-feature imports. The per-feature stores that did move (`celebrationQueue`, `milestoneReveal`, `contactsSearchStore`, `supporter`) only had a single feature or app-tier consumer.
- **Pure domain helpers** (`lib/contacts`, `lib/conversations`, `lib/serviceReport`, `lib/milestones`, `lib/contactsFilters`, `lib/contactsSort`, `lib/notifications`, …) — consumed by the data layer (preferences/widgets/sync) or by multiple features. The persisted-state types in `contactsFilters` / `contactsSort` keep the impl pinned to shared.
- **Cross-feature UI primitives** — split into two tiers inside `shared/components/`:
  - `components/ui/` — atomic primitives with no domain awareness (`MyText`, `Button`, `IconButton`, `ActionButton`, `Card`, `Badge`, `Chip`, `Circle`, `Divider`, `Empty`, `Loader`, `Avatar`, `Copyeable`, `Accordion`, `SegmentedControl`, `SimpleProgressBar`, `AnchoredPopover`, `GlassCard`, `TabBar`, `Select`, `SelectWheel`, `TextInput`, `DateTimePicker`, plus the `inputs/`, `layout/`, and `swipeableActions/` subfolders). These earn shared status by having no single domain owner.
  - `components/<root>` — composed blocks that combine primitives AND are consumed by 2+ features, or are locked into shared by a shared-tier consumer chain (`SupporterBadge`, `IsSupporter`, `SupporterInfoSheet`, `SupporterBenefits`, `DayPlanRow`, `RecurringPlanRow`, `YearMilestoneCard`, `MilestoneProgressBar`, `ContactAvatarCropEditor`, `PublisherTypeSelector`, `StalenessColorKey`, `SwipeMonthNavigator`, `DefaultNavigationSelector`, `DismissableCard`, `CardWithTitle`, `AvatarPickerPopover`, `AvatarPickerContent`, `AccentColorPicker`, `CustomColorSwatch`, `ColorPickerSheet`, `CalendarDay`, `CalendarHeader`, `QuickActionSheet`).
- **Domain types** (`types/contact`, `types/customField`, `types/conversation`, `types/serviceReport`, `types/publisher`, `types/avatar`, `types/here`, `types/markerColors`, `types/textInput`, `types/theme`, `types/rootStack`, `types/homeStack`) — referenced by preferences, sync payloads, widget snapshots, and many features.
- **Shader stack** (`shaders/*`) — used by `ProfileCard` + `TiltableCard` (now both inside `features/profile/`) and by `stores/preferences` (shared). Stays in shared so the preferences store doesn't have to reach into a feature.

This is the principled "shared model, feature UI" split for this codebase. A purer per-feature data isolation would require splitting each feature's read of the global store into per-feature snapshot contributors with an app-level composer — a follow-up worth doing if cross-feature coupling continues to grow.

## What's still in flight

| Tier                                     | Status                                                                                                                |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| ESLint boundaries config                 | ✅ in place                                                                                                           |
| App tier (`src/app/`)                    | ✅ navigation, widgets, sync, deep-links moved                                                                        |
| `features/*/screens/`                    | ✅ every screen migrated                                                                                              |
| `features/*/components/`                 | ✅ single-feature components migrated; only multi-feature primitives remain shared                                    |
| `features/*/lib/`                        | ✅ single-feature lib migrated (contacts, conversations, map, profile, service-reports, settings, supporter, updates) |
| `features/*/hooks/`                      | ✅ single-feature hooks migrated (contacts, profile, service-reports, settings)                                       |
| `features/*/stores/`                     | ✅ single-feature stores migrated (contacts, milestones, service-reports, supporter)                                  |
| `features/*/types/`                      | ✅ single-feature types migrated (map)                                                                                |
| `features/*/constants/`                  | ✅ single-feature constants migrated (updates)                                                                        |
| `features/home/` is screens-only         | ✅ no UI components or libs live in home; it is purely an orchestrator                                                |
| Strict `app←shared+feature` (no app→app) | ❌ transitional rule still allows app→app and neverImport→neverImport while a few legacy import patterns settle       |

## Following the pattern

When adding new code:

- **Feature-specific** (only used by one feature): go in `src/features/<feature>/{screens,components,lib,hooks,stores,types}/`
- **Cross-feature / shared primitive**: goes in `src/{components,lib,hooks,stores,types}/`
- **App-level infrastructure** (boots in `App.tsx`, reads multiple features): goes in `src/app/<area>/`

If your feature needs to import from another feature, that's a signal — either:

- The dependency belongs in `shared/` (lift it up), or
- The dependency belongs in a **different feature** (the wrong feature folder claimed it), or
- The consumer is actually a page-level orchestrator and should be reclassified to `app` (and added to the app-pattern in `.eslintrc.json`)

### Naming the right feature for new code

Pick the feature by **domain**, not by **which screen will mount it first**. A component that happens to debut on the home tab is not a "home feature" component — it's whatever-it-actually-is. If you can't decide, answer:

> If I wanted to reuse this on a different screen, where would I expect to find it?

That answer is the feature folder. Examples from this refactor:

- The supporter-nudge eligibility predicate lived in `home/lib/` because the home screen consumed it. Wrong — its domain is supporter, not home. → moved to `supporter/lib/supporterNudge.ts`.
- The contribution-graph heatmap component lived in `home/components/`. Wrong — its domain is profile/activity stats, not home. → moved to `profile/components/ContributionGraph.tsx`.
- The backup reminder banner lived in `home/components/`. Wrong — its domain is backups, which is owned by settings (Import & Export). → moved to `settings/components/BackupReminder.tsx`.
- `WeekStripTeaser` lived in `shared/components/`. Wrong — it's a service-reports week summary, only consumed by app-tier orchestrators. → moved to `service-reports/components/WeekStripTeaser.tsx`.

### When a "shared" primitive is actually a feature primitive

Just because two app-tier orchestrators (home, settings, onboarding, …) both consume a component does **not** automatically make it a "cross-feature primitive" deserving a slot in `shared/components/`. App-tier code is allowed to reach into any feature. If a component has a clear domain owner, prefer the feature folder and let the app-tier consumers import it from there.

Use `shared/` only when:

- The component has no single domain owner (`Card`, `Button`, `IconButton`, layout primitives), **or**
- It's consumed by another **shared** module — since `shared → feature` is forbidden, the dependency forces it into `shared/`. (Example: `stores/preferences` reads `shaders/` types, which keeps the shader stack pinned to shared.)

### `components/ui/` vs `components/<root>` — which to pick

Inside `shared/components/`, decide between the two tiers by asking: **is this a primitive or a composition?**

- **`components/ui/`** — atomic. Single concept. No domain knowledge. Doesn't read feature stores. Takes props and renders. Examples: `Button`, `MyText`, `Card`, `Badge`, `Chip`, `Avatar`, `TextInput`, plus the `inputs/`, `layout/`, and `swipeableActions/` subfolders. If you can imagine the same component shipping in a generic React Native UI library, it belongs in `ui/`.
- **`components/<root>`** — composed. Combines multiple primitives and/or shared lib/state into a domain-aware block (still domain-agnostic enough to serve multiple features). Examples: `CalendarDay` (composes `Card` + `MyText` + plan/report data for two features), `IsSupporter` / `SupporterBadge` (supporter-status UI consumed across features), `AvatarPickerPopover` (composes `AnchoredPopover` + `Avatar` for the avatar-picker flow). These are the cross-feature **blocks**, not low-level pieces.

The two-tier rule helps prevent two common drifts:

1. **`ui/` getting domain-leaky** — if you find yourself reaching for `usePublisher()` or `stores/serviceReport` inside `ui/<X>`, the component isn't a primitive. It belongs at `components/<X>` or, more often, inside a feature.
2. **`components/<root>` getting cluttered with single-feature blocks** — if a composed block has exactly one feature consumer, move it to `features/<owner>/components/`. The shared-tier audit pulled `PublisherCheckBoxCard` (→ service-reports), `GoalProgressStats` (→ service-reports), `MonthlyRoutine` + `SinceBadge` (→ profile), `GenderIcon` (→ contacts), `InputRowButton` (→ settings), and `Archive` / `Dismiss` swipe actions (→ contacts) for exactly this reason.

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
14. `refactor(features): drain features/home and extract a profile feature` (ContributionGraph + ProfileCard + ProfileDetailOverlay + TiltableCard + lib/profileStats + hooks/useDailyMinutes → new `features/profile/`; `home/lib/supporterNudge` → `supporter/lib/`; `home/components/BackupReminder` → `settings/components/`; `components/WeekStripTeaser` → `service-reports/components/`. After this commit `features/home/` only contains `screens/HomeScreen.tsx`.)
15. `refactor(features): split components/ into ui/ primitives + composed blocks` (carve `src/components/` into `components/ui/` for atomic primitives — Button, MyText, IconButton, ActionButton, Card, Badge, Chip, Circle, Divider, Empty, Loader, Avatar, Copyeable, Accordion, SegmentedControl, SimpleProgressBar, AnchoredPopover, GlassCard, TabBar, Select, SelectWheel, TextInput, DateTimePicker, plus the `inputs/`, `layout/`, `swipeableActions/` subfolders — and `components/<root>` for composed cross-feature blocks.)
16. `refactor(features): pull single-feature components out of shared` (PublisherCheckBoxCard + GoalProgressStats → service-reports; MonthlyRoutine + SinceBadge → profile; GenderIcon → contacts; `inputs/InputRowButton` → settings/components/inputs/; `swipeableActions/Archive` + `Dismiss` → contacts/components/swipeableActions/.)
17. `refactor: delete dead code surfaced by the shared-tier audit` (components/HintCard, components/FullScreenLoader, lib/assistantRecommendation + test, lib/projectedTotal + test — all had zero or test-only callers.)
18. `refactor(features): move lib/linking → features/contacts/lib/` (deep-link / Universal Link handler for contact share URLs; only consumed by app/App.tsx + contacts share-import components.)
19. `docs(architecture-features): document the components/ui split and shared-tier audit`
