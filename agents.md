# AGENTS.md

WitnessWork = iOS-only field-service tracker for Jehovah's Witnesses. It helps publishers schedule their service time toward their goals, track contacts & appointments, and see progress without mental math.

## Backend Service

ww-api is the backend api. Find the code at ~/dev/ww-api.

## Domain Specific Language

If discussing domain-specific items, please read [`CONTEXT.md`](./CONTEXT.md)

## Guardrails (always apply)

- Always amend to previous commits when making follow-up fixes. gpf = git push --force-with-lease.
- **Never destroy unstaged work.** `git checkout/restore <path>`, `git reset --hard`, `git clean` discard working-tree changes with no recoverable trace. Run `git status` + `git diff <path>` before any destructive path-level git op; undo your _own_ edits with `git stash` (recoverable), and treat files dirtied outside this session as off-limits.
- **JW sensitivities.** No "magic" word or magic-wand iconography in i18n/copy.
- **Translations.** `src/locales/en-US.json` is the source of truth; other locales are human-approved only — don't edit them without asking.
- **Forms in sheets.** Do not add a Cancel button to a form presented in a dismissible sheet. Tapping outside the sheet or pulling it down already cancels; keep the explicit Save/Submit action and any meaningful reset/destructive action.
- **Commits.** Rebase, never merge-commit; amend over `fix:` follow-ups. Husky pre-commit hooks stay on — no `--no-verify` unless told. Branch names are bare `[feature-name]` (no `agent/` or `feature/` prefix).

- **React Compiler** (beta) is on — no manual `useMemo`/`useCallback` unless benchmarked.
- **Styling** via Tamagui + RN StyleSheet through `ThemeProvider`; prefer tokens. Reuse `@/components/**`.
- **Bundle size — deep imports when packages require it.** Metro doesn't tree-shake barrel files. Import lodash per-method (`import round from 'lodash/round'`, never `import _ from 'lodash'`). For Lucide icons, use named static imports from `lucide-react-native` and never `import * as icons from 'lucide-react-native/icons'`, which imports the full icon set.
