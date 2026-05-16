# AGENTS.md

WitnessWork = iOS-only field-service tracker for Jehovah's Witnesses. Expo + RN. Domain glossary in `CONTEXT.md` — read before discussing Publisher, Service Report, Plan, Assistant, Supporter, Tenure, etc.

## NEVER destroy unstaged work

`git checkout <path>`, `git restore <path>`, `git reset --hard`, `git clean` discard working-tree changes with **no recoverable trace**. Before any destructive path-level git op: `git status` + `git diff <path>` first. If working tree dirty with changes not made this session, file off-limits — re-edit instead. To undo own mods: `git stash push -- <paths>` → fix → `stash pop` or `stash drop`. No exceptions.

## JW sensitivities

No "magic" word or magic-wand iconography in i18n/copy.

## Comitting & Merging

Do not merge commit. Use rebase. Amend commits where reasonable instead of adding fix: commits.

## Key commands

```bash
pnpm run ios               # diff build + run (fastest dev loop)
pnpm run testFinal && pnpm run lint && pnpm run typecheck   # after large changes
pnpm run lint              # after ANY import / file-tree change (see below)
pnpm run translate         # bun run src/scripts/translate.ts
```

`clean` script nukes `ios/ .expo/ .tamagui/ .cache/ node_modules/` — destructive.

## Conventions

- **Render time** → `src/lib/minutes.ts` helpers only. No manual hours/minutes parse.
- **Translations** → source of truth `src/locales/en-US.json`. Other locales human-approved only.
- **Imports** → `@/*` alias (= `src/*`). Prefer `@/features/...` over relative.
- **React Compiler enabled (beta)** → no manual `useMemo`/`useCallback` unless benchmarked. `react-compiler` ESLint rule active.
- **Styling** → Tamagui + RN StyleSheet, theme via `ThemeProvider`, prefer tokens over hardcoded colors.
- **Components** → reuse from `@/components/**`. No one-off badges.

### iOS 26 Liquid Glass — use `expo-glass-effect`, never fake it

```tsx
import { GlassView } from 'expo-glass-effect'
;<GlassView glassEffectStyle='regular' style={shape}>
  {children}
</GlassView>
```

Auto-falls-back to plain `View` on iOS < 26. For elements visually disappearing without material (tab bar, chips, full-screen loaders), keep `BlurView` underneath as unconditional fallback. `GlassContainer` merges adjacent surfaces. **No hand-built glass** (BlurView + opacity + borders) — conflicts with real material. Belongs on: nav, tabs, sheets, primary CTAs, search, floating overlays. Does NOT belong on: content cards, list rows, badges, inputs, static viz. Plan + inventory: `docs/liquid-glass-adoption-plan.md`. Reference: `src/components/TabBar.tsx`.

### Import / file-tree changes — run `pnpm run lint`

`eslint-plugin-boundaries` enforces tier rules. **TypeScript won't catch boundary violations — only ESLint will.** Run lint after: adding/moving file, changing any `import` line, renaming folder under `src/features/`, `src/app/`, `src/components/`.

## Project structure

Three tiers, lint-enforced:

- **`src/app/`** — entry, navigation, widgets, iCloud sync, deep links. Imports from any tier.
- **`src/features/<domain>/`** — domain folders (`contacts`, `service-reports`, `map`, `plans`, etc.). Holds whatever subset of `screens/ components/ hooks/ lib/ stores/ types/ constants/` needed. Imports from shared + self only.
- **Shared** — `src/components/` (`ui/` primitives + root composed), `src/lib/`, `src/hooks/`, `src/stores/`, `src/types/`, `src/constants/`, `src/providers/`, `src/contexts/`, `src/assets/`, `src/locales/`, `src/shaders/`, `src/vendor/`. Imports from shared only.

Page-level orchestrators (`home`, `settings`, `progress`, `plans`, `updates`, `onboarding`) classified as `app` so they compose across domains. `home` = pure orchestrator (no own components/hooks/lib).

Details: `docs/project-structure.md`, `docs/architecture-features.md`.

## Publisher (core domain)

Publisher role drives entry mode, goals, credit cap, milestone ladder, tenure display, which sections render. See `CONTEXT.md` for role semantics. This section = code-level rules.

### Defaults table

| Role               | Monthly (h) | Entry    | Annual goal | Credit cap | Tracks start | Milestone ladder        |
| ------------------ | ----------- | -------- | ----------- | ---------- | ------------ | ----------------------- |
| `publisher`        | 0           | checkbox | no          | 55h        | no           | —                       |
| `regularAuxiliary` | 30          | hours    | no          | 55h        | yes          | —                       |
| `regularPioneer`   | 50          | hours    | yes         | 55h        | yes          | 30, 50, 100, 200, 350   |
| `circuitOverseer`  | 50          | hours    | yes         | unlimited  | yes          | 100, 200, 300, 400, 500 |
| `specialPioneer`   | 100         | hours    | no          | unlimited  | yes          | —                       |
| `custom`           | user (50)   | hours    | yes         | 55h        | no           | —                       |

Sources: `src/constants/publisher.ts`, `src/stores/preferences.ts`, `src/lib/publisherCapabilities.ts`, `src/lib/milestones.ts`.

### Single seam: `derivePublisherCapabilities`

`src/lib/publisherCapabilities.ts` = **only** place role behavior encoded. React code reads via `usePublisher()` hook; pure callers use `derivePublisherCapabilities` or helpers (`getEntryMode`, `isInFullTimeService`, `tracksPioneerStartDate`, `effectiveHasAnnualGoal`, `creditCapMinutesFor`).

### Rules

1. **Never branch on publisher string.** `if (publisher === 'specialPioneer')` wrong — add/use capability flag (`entryMode`, `hasAnnualGoal`, `isInFullTimeService`, `tracksPioneerStartDate`, `showsTimer`, `showsYearTabs`, `creditCapMinutes`, `hasUnlimitedCreditDefault`).
2. **Capabilities fold in user overrides** (`userSpecifiedHasAnnualGoal`, `overrideCreditLimit`, `milestoneOverrides`). Read resolved value; don't re-derive.
3. **Gate UI on capabilities, not role.** E.g. timer on `showsTimer`, year tab on `showsYearTabs`, start-date row on `tracksPioneerStartDate`, entry mode on `entryMode`.
4. **`publisher` role = checkbox mode** — anything assuming hours breaks. Check `entryMode` / `hasAnnualGoal` / `showsTimer` first.
5. **Credit cap** → `creditCapMinutesFor()`. Never inline 55h (`monthCreditMaxMinutes`).
6. **Milestone final rung** (annual goal) appended at read time by `getEffectiveMilestones`, never stored.
7. **`pioneerStartDate` field** stores start date for any role where `tracksPioneerStartDate === true` (legacy name; labels via `getStartDateLabels`).
8. **Adding a role** = touch tuple in `src/constants/publisher.ts`, defaults in `src/stores/preferences.ts`, `baseCreditCapMinutes` + `roleDefaultHasAnnualGoal` in `src/lib/publisherCapabilities.ts`, `DEFAULT_MILESTONES_BY_PUBLISHER` in `src/lib/milestones.ts`, selector in `src/components/PublisherTypeSelector.tsx`, `getStartDateLabels` if tenure, i18n in `en-US.json`. TS exhaustiveness catches most.

## Git

- Main dev branch: `development`
- Branch names: `[feature-name]` — no `[agent]/` or `[feature]/` prefix
- Husky pre-commit hooks active — never `--no-verify` unless told
- Version bumps via `pnpm run version:bump`, land in own commits

## Pull request descriptions

Size to diff. Goal = fast review, not effort demo. One-line PR with one-line body = a feature.

- **Title** — Conventional Commits prefix (`feat:`/`fix:`/`chore:`/`refactor:`/`docs:`), imperative, no period, ~70 char max.
- **Trivial diff** (rename, typo, dep bump) → title alone fine.
- **Small non-obvious** → lead with **Why** + rejected alternatives.
- **Large / multi-file** → 1–3 highest-impact files first with `path:line` refs, then bullets.

**Required sections:**

- **Why** — unless title self-evident.
- **Risks** — for migrations, MMKV/persisted-Zustand shape changes, shared infra, publisher capability changes, widget snapshot changes, any user-visible behavior.
- **Tests required** — only HITL items (manual QA, sandbox, App Store steps, flag flips, translation review). Never list CI-verified things (typecheck/lint/tests).

**Anti-patterns:** paraphrasing diff line-by-line, green-checkmark CI lists, empty placeholder sections, "this PR..." in every bullet.

## Agent skills

- **Issues** → `gh` CLI on `leviFrosty/witness-work`. See `docs/agents/issue-tracker.md`.
- **Triage labels** → `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.
- **Domain docs** → `CONTEXT.md` + `docs/adr/`. See `docs/agents/domain.md`.
