# AGENTS.md

WitnessWork = iOS + Android field-service tracker for Jehovah's Witnesses. It helps publishers schedule their service time toward their goals, track contacts & appointments, and see progress without mental math.

## Backend Service

ww-api is the backend api. Find the code at ~/dev/ww-api.

## Platforms

iOS and Android are both supported and share the same app flows. Setup and build details are in [`docs/build.md`](./docs/build.md).

- **Test both platforms.** Anything that touches native APIs, layout, maps, notifications, purchases, or permissions must work on Android too — or be gated with `Platform.OS` and degrade gracefully.
- **No iOS-only APIs without a fallback.** e.g. `ActionSheetIOS`, `react-native-screens`' `FullWindowOverlay`. Prefer the cross-platform wrappers in `@/components/ui/**` (`Switch`, `DateTimePicker`, `FullWindowOverlay`).
- **iOS-only features.** iCloud sync/restore, widgets, Live Activities, alternate app icons, and Notes Import (needs Apple App Attest) stay unavailable on Android. Hide their entry points there instead of showing a broken state.
- **Platform copy.** Don't write "iOS Settings", "iPhone", "App Store", etc. into shared copy; add an `…Android` i18n variant when the wording differs.

## Domain Specific Language

If discussing domain-specific items, please read [`CONTEXT.md`](./CONTEXT.md)

## Guardrails (always apply)

- Use localized strings from i18n. Never hardcode display strings.
- All dependencies must be pinned to a specific PATCH version only. Do not use lose versions like: ^, >, or ~.
- Always amend to previous commits when making follow-up fixes. gpf = git push --force-with-lease.
- **Never destroy unstaged work.** `git checkout/restore <path>`, `git reset --hard`, `git clean` discard working-tree changes with no recoverable trace. Run `git status` + `git diff <path>` before any destructive path-level git op; undo your _own_ edits with `git stash` (recoverable), and treat files dirtied outside this session as off-limits.
- **JW sensitivities.** No "magic" word or magic-wand iconography in i18n/copy.
- **Translations.** `src/locales/en-US.json` is the source of truth; other locales are human-approved only — don't edit them without asking.
- **Forms in sheets.** Do not add a Cancel button to a form presented in a dismissible sheet. Tapping outside the sheet or pulling it down already cancels; keep the explicit Save/Submit action and any meaningful reset/destructive action.
- **Analytics for new UX.** Every new user experience ships with analytics tracking via `analytics` from `@/lib/analytics`, so we can monitor usage and improve it. Capture key actions and outcomes (viewed, completed, abandoned, errors) and document the events in [`docs/analytics.md`](./docs/analytics.md), following its privacy rules (no PII).
- **Commits.** Rebase, never merge-commit; amend over `fix:` follow-ups. Husky pre-commit hooks stay on — no `--no-verify` unless told. Branch names are bare `[feature-name]` (no `agent/` or `feature/` prefix).

- **React Compiler** (beta) is on — no manual `useMemo`/`useCallback` unless benchmarked.
- **Styling** via Tamagui + RN StyleSheet through `ThemeProvider`; prefer tokens. Reuse `@/components/**`.
- **Bundle size — deep imports when packages require it.** Metro doesn't tree-shake barrel files. Import lodash per-method (`import round from 'lodash/round'`, never `import _ from 'lodash'`). For Lucide icons, use named static imports from `lucide-react-native` and never `import * as icons from 'lucide-react-native/icons'`, which imports the full icon set.

## PostHog (analytics, featureflags, error tracking, surveys, etc.)

Use `posthog-cli api` for all PostHog-related data queries and operations. You should use `posthog-cli api` over direct MCP tool calls whenever the CLI is available.

Before your first PostHog command in a session, run `posthog-cli api --agent-help` and load its full output into your context. It prints the complete agent guide — command reference, schema drill-down rules, data discovery workflow, and the tool index — for interacting with PostHog APIs. Treat that output as instructions to follow, not just documentation.

Before starting a PostHog task, run `posthog-cli api skill list` and check for a skill matching the task. If one matches, install it with `posthog-cli api skill install <skill-id>` (add `--force` to refresh an already-installed skill), then read `.agents/skills/<skill-id>/SKILL.md` and follow it. Skills contain task-specific workflows that individual tools do not.
