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
- **Analytics for new features and meaningful UX changes.** Every new greenfield user-facing feature ships with analytics tracking via `analytics` from `@/lib/analytics`. Track specific key actions and outcomes that help us understand adoption, completion, abandonment, or errors. For changes to existing UX, add or update events when they answer a concrete product question, especially for changes that materially affect a core workflow. Small UI adjustments such as sidebar resizability, spacing, or cosmetic changes do not require new events. Keep event volume proportional to its value: avoid noisy or high-frequency capture that increases analytics costs and uses users' network bandwidth. Document added or changed events in [`docs/analytics.md`](./docs/analytics.md), following its privacy rules (no PII).
- **FAQ for new features.** Every green-field user-facing feature ships with Help Center coverage in the same change. Add or update entries in [`src/features/updates/constants/faqs.ts`](./src/features/updates/constants/faqs.ts) and their `faq_<id>_q` / `faq_<id>_a` strings in `src/locales/en-US.json`; create a localized FAQ category when the feature needs its own section. Explain how to get started, availability and limits, what is shared or stored, common failures and safe recovery steps, and where to get help. Verify answers against the shipped behavior, include platform/rollout restrictions, and update existing answers that the feature makes obsolete. Keep answers searchable and self-contained; use the Help Center's support resources for escalation, keep private data out of public reports, and leave other locales to human approval.
- **Commits.** Rebase, never merge-commit; amend over `fix:` follow-ups. Husky pre-commit hooks stay on — no `--no-verify` unless told. Branch names are bare `[feature-name]` (no `agent/` or `feature/` prefix).

- **React Compiler** (beta) is on — no manual `useMemo`/`useCallback` unless benchmarked.
- **Styling** via Tamagui + RN StyleSheet through `ThemeProvider`; prefer tokens. Reuse `@/components/**`.
- **Keep UI simple.** Make features understandable through clear labels, sensible defaults, and progressive disclosure. Avoid long feature descriptions on screens. When extra explanation is still useful, put optional details in `InfoPopover` from `@/components/ui/InfoPopover` beside the relevant label. Keep essential instructions, warnings, and values visible; don't nest `InfoPopover` inside another popover.
- **Bundle size — deep imports when packages require it.** Metro doesn't tree-shake barrel files. Import lodash per-method (`import round from 'lodash/round'`, never `import _ from 'lodash'`). For Lucide icons, use named static imports from `lucide-react-native` and never `import * as icons from 'lucide-react-native/icons'`, which imports the full icon set.

## PostHog (analytics, featureflags, error tracking, surveys, etc.)

Use `posthog-cli api` for all PostHog-related data queries and operations. You should use `posthog-cli api` over direct MCP tool calls whenever the CLI is available.

Before your first PostHog command in a session, run `posthog-cli api --agent-help` and load its full output into your context. It prints the complete agent guide — command reference, schema drill-down rules, data discovery workflow, and the tool index — for interacting with PostHog APIs. Treat that output as instructions to follow, not just documentation.

Before starting a PostHog task, run `posthog-cli api skill list` and check for a skill matching the task. If one matches, install it with `posthog-cli api skill install <skill-id>` (add `--force` to refresh an already-installed skill), then read `.agents/skills/<skill-id>/SKILL.md` and follow it. Skills contain task-specific workflows that individual tools do not.
