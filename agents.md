# AGENTS.md

WitnessWork = iOS-only field-service tracker for Jehovah's Witnesses (Expo + React Native). It helps publishers schedule their service time toward their goals, track contacts & appointments, and see progress without mental math. Domain glossary in `CONTEXT.md` — read it before discussing Publisher, Service Report, Plan, Assistant, Supporter, Tenure, etc.

## ww-api / backend API

ww-api is the backend api providing functionality to this app. Find the code at ~/dev/ww-api.
It's a project deployed to Cloudflare workers. Read the documentation within that repository for up to date information before making assumptions. There are two environments: dev and production.

## Guardrails (always apply)

- **Never destroy unstaged work.** `git checkout/restore <path>`, `git reset --hard`, `git clean` discard working-tree changes with no recoverable trace. Run `git status` + `git diff <path>` before any destructive path-level git op; undo your _own_ edits with `git stash` (recoverable), and treat files dirtied outside this session as off-limits.
- **JW sensitivities.** No "magic" word or magic-wand iconography in i18n/copy.
- **Translations.** `src/locales/en-US.json` is the source of truth; other locales are human-approved only — don't edit them without asking.
- **Commits.** Rebase, never merge-commit; amend over `fix:` follow-ups. Husky pre-commit hooks stay on — no `--no-verify` unless told. Branch names are bare `[feature-name]` (no `agent/` or `feature/` prefix).

## Orientation

```bash
pnpm run ios          # diff build + run — fastest dev loop
pnpm run testFinal && pnpm run lint && pnpm run typecheck   # after large changes
pnpm run lint         # after ANY import / file-tree change (boundaries are lint-enforced, not type-checked)
```

- **Imports** use the `@/*` alias (= `src/*`); prefer `@/features/...` over relative paths.
- **Three tiers, lint-enforced:** `src/app/` (entry, nav, widgets, sync) → `src/features/<domain>/` → shared (`src/components|lib|hooks|stores|...`).
- **React Compiler** (beta) is on — no manual `useMemo`/`useCallback` unless benchmarked.
- **Styling** via Tamagui + RN StyleSheet through `ThemeProvider`; prefer tokens. Reuse `@/components/**` — no one-off badges.
- **Bundle size — deep imports when packages require it.** Metro doesn't tree-shake barrel files. Import lodash per-method (`import round from 'lodash/round'`, never `import _ from 'lodash'`). For Lucide icons, use named static imports from `lucide-react-native` and never `import * as icons from 'lucide-react-native/icons'`, which imports the full icon set.
- `clean` nukes `ios/ .expo/ .tamagui/ .cache/ node_modules/` — destructive.

Reference docs: `CONTEXT.md`, `docs/adr/`, `docs/project-structure.md`, `docs/architecture-features.md`.
