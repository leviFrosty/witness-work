# AGENTS.md

WitnessWork is a field service assistant app for Jehovah's Witnesses. This is an iOS project only, this app is not made to support Android. The goal of the app is to encourage and assist users in scheduling their service-time to hit their publisher goals, keep track of contacts & appointments, and minimize the amount of mental overhead in calculating their progress and what's up-next.

## Jehovah's Witness sensitivities

Do not use the word "magic" or magic-wands in i18n or iconography

## NEVER REVERT OR DESTROY UNSTAGED WORK DESTRUCTIVELY, UNDER ANY CIRCUMSTANCES

`git checkout <path>`, `git restore <path>`, `git reset --hard`, and `git clean` discard working-tree changes with **no recoverable trace** — not in reflog, not in fsck, not in stash. If files show `M` in `git status` and you need to undo your own modifications, the only safe sequence is:

1. `git stash push -- <paths>` first (captures both your changes and the user's into a recoverable stash)
2. Then make your fix
3. Then `git stash pop` if you need any of it back, or `git stash drop` if not

Before running any destructive git path-level command, **always** check `git status` and `git diff <path>` first. If the working tree is dirty with changes you didn't make this session, treat that file as off-limits to destructive operations — re-edit instead. Reverting paths with foreign unstaged changes is the same as `rm` on that work.

This rule has no exceptions, including "I just made this mess and need to undo it." Your own bad edit is recoverable via Edit; the user's hours of unstaged work are not.

## Project Overview

**WitnessWork** — mobile app for Jehovah's Witnesses to manage field service activities, via Expo.

## Tech Stack

- **Framework**: React Native 0.76.9 + Expo SDK 52
- **Language**: TypeScript (~5.3.3)
- **UI**: Tamagui, FontAwesome, `@shopify/flash-list`
- **Navigation**: React Navigation v6 (native-stack + bottom-tabs + drawer)
- **State**: Zustand w/ persistence
- **Storage**: MMKV (migrated from AsyncStorage)
- **Maps**: `react-native-maps` + Google Maps
- **i18n**: `i18n-js` + Crowdin (16+ languages)
- **Testing**: Vitest + `@testing-library/react-native`
- **Payments**: `react-native-purchases` (RevenueCat)
- **Errors**: Sentry
- **Build**: EAS
- **Compiler**: React Compiler enabled (beta)

## Key Commands

```bash
# Dev
pnpm install
pnpm run dev               # expo start --ios (APP_VARIANT=development)
pnpm run ios               # expo run:ios (diff build + run, most common)
nvm use                    # match node version

# Build (local EAS)
pnpm run build
pnpm run build-production
pnpm run prebuild          # expo prebuild --clean

# Quality (MUST run after large changes)
pnpm run testFinal && pnpm run lint
pnpm run typecheck         # tsc
pnpm run format            # prettier
pnpm run deps              # madge circular deps check

# Translation
pnpm run translate         # bun run src/scripts/translate.ts

# Install built artifact
eas build:run -p ios --path [path].tar.gz
```

## Conventions

### ⚠️ Rendering time

**Always** use `src/lib/minutes.ts` to render time. Don't manually parse hours/minutes. Use existing helpers.

### After large changes

**Always** run:

```bash
pnpm run testFinal && pnpm run lint && pnpm run typecheck
```

### Translations

Source of truth = `src/locales/en-US.json`. Add new keys there first. Do not try to edit other locales without asking for human approval.

### Styling

Tamagui + RN StyleSheet. Theme via `ThemeProvider`. Prefer theme tokens over hardcoded colors.

### iOS 26 Liquid Glass — use `expo-glass-effect`, never fake it

The app targets iOS 26's Liquid Glass material. `expo-glass-effect` is **already installed** — use `GlassView` from it for any nav/control/modal-layer surface that needs the material.

```tsx
import { GlassView } from 'expo-glass-effect'
;<GlassView glassEffectStyle='regular' style={shape}>
  {children}
</GlassView>
```

- **Auto-fallback**: `GlassView` renders as a plain `View` on iOS < 26 — no manual `isLiquidGlassAvailable()` gating needed for render. For free-floating elements that would visually disappear without the material (tab bar, chips, full-screen loaders), keep a `BlurView` underneath unconditionally as the visible-surface fallback.
- **`GlassContainer`** merges adjacent glass surfaces — use when grouping pills/toolbar items.
- **Do not hand-build glass** with `BlurView` + opacity overlays + custom borders. That replicas the system effect badly and conflicts with the real material when it activates. The legacy `GlassCard.tsx` is a known example slated for deletion.
- **Where glass belongs** (Apple HIG): nav bars, tab bars, sheets/popovers/modals, primary CTAs, search bars, floating overlays. **Where it doesn't**: content cards, list rows, badges, form inputs, static visualizations.
- Full inventory & rollout plan: `docs/liquid-glass-adoption-plan.md`. Reference impl: `src/components/TabBar.tsx`.

### React Compiler

Enabled (beta). Avoid manual `useMemo`/`useCallback` unless benchmarked need. ESLint rule `react-compiler` active.

### Imports

TypeScript path aliases per `tsconfig.json`. Check existing files for convention before adding new imports.

## Git

- Main dev branch: `development`
- Husky pre-commit hooks active — don't skip with `--no-verify` unless explicitly told
- Version bumps via `pnpm run version:bump`

## Pull request descriptions

Size the description to the change. The goal is fast review — not to demonstrate effort. A one-line PR with a one-line description is a feature, not a gap.

### Title

The PR title is the TL;DR of the change. Treat it as the single sentence a reviewer should be able to read in the PR list and understand what shipped. Conventional Commits prefix (`feat:`, `fix:`, `chore:`, `refactor:`, `docs:`, etc.), imperative mood, no trailing period, under ~70 chars. If the title fully captures the change, the body can be empty or a single line.

### Size the description to the diff

- **Trivial / obvious** (rename, typo, one-line fix, dep bump, copy tweak): one line is enough. If the title already says it, the body can repeat or extend the title and stop. Don't pad with empty sections.
- **Small but non-obvious** (subtle bug fix, behavior change, tricky edge case, perf nudge): lean into **Why** and the tradeoffs you considered. The diff already shows _what_ changed — the description's job is _why this way and not the obvious alternative_.
- **Large / multi-file**: optimize for human scanability. Point the reviewer at the 1–3 highest-impact files first (link them with `path/to/file.ts:42`), then summarize the rest in bullets. Prefer bullets and file references over paragraphs. A wall of prose loses the reviewer faster than the diff itself would.

When in doubt, write less. The reviewer can always ask.

### Sections (and when each is required)

- **Why** — **required** unless the title is self-evident (`chore: bump version to X`, `fix: typo in onboarding copy`). State the problem, user/business reason, or bug being fixed. One or two sentences is usually enough.
- **How** — **optional**. Only include when the approach is non-obvious or you rejected a tempting alternative. Name the tradeoff. Don't restate the diff.
- **Risks** — **required for** migrations, data changes, schema/storage changes (MMKV keys, persisted Zustand shapes), shared infra, anything that touches publisher capability resolution, anything affecting widget snapshots, or any behavior change visible to users. Otherwise optional. Cover: what could break, blast radius, rollback story.
- **Tests required** — **required only when HITL action exists**. List _only_ human-in-the-loop items: manual QA on device, migrations to run, RevenueCat sandbox checks, App Store Connect steps, feature flag flips, staged rollouts, translation review. **Do not list** anything already verified by CI or pre-commit hooks — no `✅ typecheck passed`, no `✅ tests pass`, no `✅ lint clean`. That's redundant noise; CI is the source of truth for those. If there's no HITL step, omit the section entirely.

### Anti-patterns

- Don't paraphrase the diff line-by-line in a "Summary" section.
- Don't include green-checkmark lists for things CI verifies (`✅ typecheck`, `✅ lint`, `✅ tests`).
- Don't add empty/placeholder sections (`## Risks\nNone.`) — omit the section instead.
- Don't bury the lead. The most important sentence comes first.
- Don't write "this PR..." in every bullet. Just say what changed.

## Quirks / Gotchas

- iOS — use `pnpm run ios` for diff build + run (fastest)
- `clean` script nukes `ios/`, `.expo/`, `.tamagui/`, `.cache/`, `node_modules/` — destructive
- App version bumps land in their own commits (see recent: `chore: bump version to X`)
- React Compiler beta — watch for compiler-related lint warnings

## Publisher types (core domain)

The `Publisher` role is the single biggest driver of app behavior — it decides the entry mode (checkbox vs hours), monthly/annual goals, credit cap, milestone ladder, tenure display, and which Home/Progress sections render at all. Treat it as a first-class domain concept.

### The six roles

Defined in [src/constants/publisher.ts](src/constants/publisher.ts) as a `const` tuple; `Publisher` is `(typeof publishers)[number]` in [src/types/publisher.ts](src/types/publisher.ts).

| Role               | Default monthly goal (h)      | Entry mode | Annual goal default | Base credit cap | Tracks start date | Default milestone ladder |
| ------------------ | ----------------------------- | ---------- | ------------------- | --------------- | ----------------- | ------------------------ |
| `publisher`        | 0                             | checkbox   | no                  | 55h             | no                | —                        |
| `regularAuxiliary` | 30                            | hours      | no                  | 55h             | yes               | —                        |
| `regularPioneer`   | 50                            | hours      | yes                 | 55h             | yes               | 30, 50, 100, 200, 350    |
| `circuitOverseer`  | 50                            | hours      | yes                 | unlimited       | yes               | 100, 200, 300, 400, 500  |
| `specialPioneer`   | 100                           | hours      | no                  | unlimited       | yes               | —                        |
| `custom`           | user-defined (defaults to 50) | hours      | yes                 | 55h             | no                | —                        |

Defaults come from [src/stores/preferences.ts:47-54](src/stores/preferences.ts:47) (`publisherHours`), [src/lib/publisherCapabilities.ts:65-70](src/lib/publisherCapabilities.ts:65) (base credit cap), [src/lib/publisherCapabilities.ts:98-117](src/lib/publisherCapabilities.ts:98) (annual goal default), [src/lib/publisherCapabilities.ts:42-46](src/lib/publisherCapabilities.ts:42) (pioneer + start-date predicates), and [src/lib/milestones.ts:13-20](src/lib/milestones.ts:13) (`DEFAULT_MILESTONES_BY_PUBLISHER`).

### What each role means in practice

- **`publisher`** — Regular publisher with no hour goal. UI flips to a "did I share the Good News this month?" checkbox flow (`entryMode === 'checkbox'`). The Home timer, Year tab, milestone card, annual-goal selector, and rollover prompt all hide. The widget switches to its `PublisherState` state machine (`unreported` / `reportedToday` / `reportedThisMonth`) — see [src/lib/widgets/buildReport.ts:26-34](src/lib/widgets/buildReport.ts:26).
- **`regularAuxiliary`** — Time-tracking role (30h/month) with a tenure start date but no annual-goal default. Falls under the standard 55h credit cap.
- **`regularPioneer`** — The most common "full" role: monthly hours, annual goal on by default, standard 55h credit cap, default milestone ladder topping out at 350.
- **`circuitOverseer`** — Like a regular pioneer but with **no credit cap** (unlimited credit time) and a higher milestone ladder (up to 500).
- **`specialPioneer`** — Higher monthly goal (100h), no credit cap, but annual goal is **off** by default. Has a tenure start date.
- **`custom`** — Escape hatch. The user types their own monthly hour requirement inline via [src/components/PublisherTypeSelector.tsx:54-99](src/components/PublisherTypeSelector.tsx:54). Annual goal is on by default but milestones default to empty (user enters arbitrary hours, so the app can't pre-pick a meaningful ladder). Standard credit cap applies.

### The single seam: `derivePublisherCapabilities`

[src/lib/publisherCapabilities.ts](src/lib/publisherCapabilities.ts) is the **only** place role behavior is encoded. It produces a `PublisherCapabilities` object with everything callers need:

```ts
{
  type, name, displayName, hasName,
  entryMode: 'checkbox' | 'hours',
  creditCapMinutes: number | null,    // null = unlimited
  hasUnlimitedCreditDefault: boolean, // base role behavior, ignoring overrides
  monthlyGoalHours, annualGoalHours,
  hasAnnualGoal, isPioneer, tracksPioneerStartDate,
  showsTimer, showsYearTabs,
  milestones: number[],
}
```

- **React code uses [`usePublisher()`](src/hooks/usePublisher.ts) hook** — it wires up the preferences store and adds a localized `displayName` fallback.
- **Pure/non-React callers** (widget snapshot builders, `adjustedMinutesForSpecificMonth`, onboarding step gates) call `derivePublisherCapabilities` or the small helpers directly: `getEntryMode`, `isPioneer`, `tracksPioneerStartDate`, `effectiveHasAnnualGoal`, `creditCapMinutesFor`.

### Rules for future features

1. **Never branch on the publisher string in feature code.** If you find yourself writing `if (publisher === 'specialPioneer')`, stop — add the capability flag to `PublisherCapabilities` and read from `usePublisher()` instead. Existing flags (`entryMode`, `hasAnnualGoal`, `isPioneer`, `tracksPioneerStartDate`, `showsTimer`, `showsYearTabs`, `creditCapMinutes`, `hasUnlimitedCreditDefault`) cover most cases — extend the type if a new one is needed.
2. **Capability flags compose with user overrides.** `hasAnnualGoal` already folds in `userSpecifiedHasAnnualGoal` (`'default' | true | false`); `creditCapMinutes` already folds in `overrideCreditLimit` + `customCreditLimitHours` (0 means unlimited); `milestones` already folds in `milestoneOverrides`. Read the resolved value, don't re-derive it.
3. **Gate UI on capability flags, not on the role.** Examples in the wild: [HomeScreen.tsx:80](src/screens/HomeScreen.tsx:80) gates the timer on `showsTimer` and the legacy-reports upgrade on `hasAnnualGoal`; [HomeTabStack.tsx:153](src/stacks/HomeTabStack.tsx:153) hides the Year tab on `showsYearTabs`; [QuickActionSheet.tsx:80](src/components/QuickActionSheet.tsx:80) hides the timer action; [PublisherPreferencesSection.tsx:104](src/screens/settings/preferences/sections/PublisherPreferencesSection.tsx:104) gates the start-date row on `tracksPioneerStartDate`; [ServiceReportSection.tsx:81](src/components/ServiceReportSection.tsx:81) switches checkbox vs hours rendering on `entryMode`.
4. **`publisher` (the role) is the no-goal path — handle it explicitly.** Anything that assumes hours will break in checkbox mode. Always check `entryMode` (or `hasAnnualGoal` / `showsTimer` / `showsYearTabs`) before reaching into hours-mode code paths.
5. **Custom is the "open hours, no ladder" role.** Don't hardcode milestone defaults for it; respect `milestoneOverrides`. Its goal is whatever the user typed into `publisherHours.custom` and can be 0.
6. **Credit cap is per-role with a user override.** The 55h cap (`monthCreditMaxMinutes` in [src/constants/serviceReports.ts](src/constants/serviceReports.ts)) is the default for everyone _except_ `specialPioneer` and `circuitOverseer` (unlimited). Use `creditCapMinutesFor()` from `publisherCapabilities` — never re-implement the override math, never inline the 55h constant in feature code.
7. **Milestone ladder rules.** Defaults are in [src/lib/milestones.ts:13](src/lib/milestones.ts:13). The final rung (`annualGoalHours`) is **appended at read time** by `getEffectiveMilestones`, never stored. Roles with `hasAnnualGoal === false` get an empty ladder.
8. **Start-date semantics.** The preference field is named `pioneerStartDate` for historical reasons, but it stores the start date for **any** role where `tracksPioneerStartDate === true` (regular/special pioneer, circuit overseer, regular auxiliary). Label/title/badge i18n keys come from `getStartDateLabels(publisher)` in [src/constants/publisher.ts:23](src/constants/publisher.ts:23).
9. **Adding a new role** requires touching all of: the tuple in `src/constants/publisher.ts`, `publisherHours` defaults in `src/stores/preferences.ts`, the `roleDefaultHasAnnualGoal` switch and `baseCreditCapMinutes` in `src/lib/publisherCapabilities.ts`, `DEFAULT_MILESTONES_BY_PUBLISHER` in `src/lib/milestones.ts`, the selector list in `src/components/PublisherTypeSelector.tsx`, `getStartDateLabels` if it has a tenure date, and i18n strings (start with `src/locales/en-US.json`). TypeScript's exhaustiveness checks on the switch statements will flag most of these.

## Components

Reuse existing components where available instead of creating new ones @src/components/\*\*

- Never create one-off badges

## Agent skills

### Issue tracker

GitHub issues at [`leviFrosty/witness-work`](https://github.com/leviFrosty/witness-work) via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default canonical labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout: `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
