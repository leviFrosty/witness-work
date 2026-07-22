---
name: project-architecture
description: WitnessWork's three-tier feature architecture (app / features / shared) and its lint-enforced import boundaries. Use when adding or moving files, changing import lines, renaming folders under src/, deciding where new code lives, or resolving an eslint-plugin-boundaries violation.
---

# Project structure & boundaries

Source lives in `src/`, organised into three tiers, enforced at lint time by `eslint-plugin-boundaries`:

- **`src/app/`** — app-tier infra: entry point, navigation, widgets, iCloud sync, deep links. May import from **any** tier.
- **`src/features/<domain>/`** — one folder per domain (`contacts`, `conversations`, `service-reports`, `map`, `milestones`, `supporter`, `profile`, `plans`, `progress`, `home`, `settings`, `updates`, `onboarding`, …). Each holds the subset of `screens/ components/ hooks/ lib/ stores/ types/ constants/` it actually needs. A feature may import from **shared and itself only**.
- **Shared tier** — `src/components/` (`ui/` primitives + root composed blocks), `src/lib/`, `src/hooks/`, `src/stores/`, `src/types/`, `src/constants/`, `src/providers/`, `src/contexts/`, `src/assets/`, `src/locales/`, `src/shaders/`, `src/vendor/`. Importable from anywhere; may only import from **shared**.

Page-level orchestrators (`home`, `settings`, `progress`, `plans`, `updates`, `onboarding`) are classified as `app` in the boundaries config so they can compose across domains. `home` is a **pure orchestrator** — don't add components/hooks/lib under `features/home/`; put domain UI in the owning feature and import it.

Imports use the `@/*` alias (= `src/*`). Prefer `@/features/...` / `@/app/...` / `@/components/...` over relative paths.

## Run `pnpm run lint` after import / file-tree changes

**TypeScript won't catch a boundary violation — only ESLint will.** Run `pnpm run lint` after:

- Adding or moving a file (the path determines its tier).
- Changing any `import` line (it may cross a tier boundary).
- Renaming a folder under `src/features/`, `src/app/`, or `src/components/`.

## Deeper docs

- `docs/project-structure.md` — full directory map, one-line summary of every feature folder.
- `docs/architecture-features.md` — tier rules, boundaries lint config, why some features are classified as `app`, and the `components/ui/` vs `components/` (root) decision.

## Screens and component file organization

When editing or creating new screens, prefer to keep "Screen" files, like HomeScreen.tsx, extremely high level. It should essentially be the page orchestrator, handling higher-level state, and importing lower level "blocks" or components that make up that given page. Those components should be created as _separate_ files and the primary screen page should import them. Do not add components and util functions directly onto a screen file, it pollutes the file and makes it hard to navigate.

Of course, there are exceptions to this rule, such as extremely simple screens with minimal nested components. But prefer this architecture in majority of cases.
