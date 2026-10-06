# AGENTS.md

WitnessWork = iOS + Android field-service tracker for Jehovah's Witnesses. It helps publishers schedule their service time toward their goals, track contacts & appointments, and see progress without mental math.

## Backend Service

ww-api is the backend api. Find the code at ~/dev/ww-api.

Beta and production app builds release ww-api `main` first (`scripts/release-api.sh`), so land a feature's backend half on ww-api `main` before shipping its app half.

## Platforms

iOS and Android are both supported and share the same app flows. Setup and build details are in [`docs/build.md`](./docs/build.md). Run, inspect, and test changes on simulators and emulators only through the `verify-witnesswork` skill (see [Verify your own work](#verify-your-own-work)).

- **Test both platforms.** Anything that touches native APIs, layout, maps, notifications, purchases, or permissions must work on Android too — or be gated with `Platform.OS` and degrade gracefully.
- **No iOS-only APIs without a fallback.** e.g. `ActionSheetIOS`, `react-native-screens`' `FullWindowOverlay`. Prefer the cross-platform wrappers in `@/components/ui/**` (`Switch`, `DateTimePicker`, `FullWindowOverlay`).
- **iOS-only features.** iCloud sync/restore, widgets, Live Activities, the Apple Watch app, and alternate app icons stay unavailable on Android. Hide their entry points there instead of showing a broken state. Notes Import uses Play Integrity on Android in place of App Attest (ADR 0017).
- **Platform copy.** Don't write "iOS Settings", "iPhone", "App Store", etc. into shared copy; add an `…Android` i18n variant when the wording differs.

## Verify your own work

Prove a change in the running app before calling it done; don't hand verification back to the user. The [`verify-witnesswork`](./.agents/skills/verify-witnesswork/SKILL.md) skill (`node scripts/verify/ww-verify.mjs`) claims an isolated simulator or emulator, seeds state, drives the UI, fuzzes, and saves evidence to `.verify/artifacts/`. Backend changes use `verify-ww-api` in ww-api.

- **Match the check to the change.** UI → drive the changed flow and read the result back; data → read the store after the action; deep link → `wwv link`; bug → reproduce it first, then show it fixed on the same surface.
- **Both platforms** for anything in the Platforms list above. "Not tested on Android" is a gap to close, not a footnote.
- **Report evidence:** devices, commands, artifact paths, and what stayed unverified (see the skill's Limits) and why.

## Pointer hover (iPad trackpad, mouse, Pencil)

iPad users can hover with a trackpad, mouse, or Apple Pencil; iPhone can't, and an Android mouse gets hover callbacks but no system effects. The primitives below do nothing where hover isn't supported, so don't gate them yourself. Apply them where people would naturally hover. Follow Apple's [pointer guidance](https://developer.apple.com/design/human-interface-guidelines/pointing-devices).

- **Already covered:** `Button` picks a pointer effect automatically. Small clear controls highlight, small opaque ones lift, and large surfaces tint. Set `pointerEffect='none'` only when a parent already handles hover. `ContextMenu` content with `onPress` tints on hover; set `hoverRadius` to match its shape, or `pointerEffect='highlight'` for small cells.
- **Custom pressables** (raw `Pressable`, gesture-driven controls): wrap them in `PointerHover`. Use `effect` for small controls, and `onHoverChange` plus `HoverTint` for rows and cards. Never scale rows or cards.
- **Icon-only controls** whose meaning isn't obvious get a `PointerTooltip` with the control's name. Leave it out when the label is already visible, and never put instructions in it.
- **Charts and other scrubbed data:** if a value appears on press-and-drag, show the same readout when the pointer hovers there (`Gesture.Hover` `onUpdate`).
- **Resize and drag handles:** use `PointerStyleView` from `modules/pointer-style` to show directional arrows next to the pointer.
- **Don't:**
  - add decorative effects to non-interactive content;
  - make hover the only way to reach information or an action (touch has no hover);
  - build hover-only UI that behaves differently from touch.
- **Test:** with a real pointer on an iPad simulator. See [`docs/ipad-pointer-testing.md`](./docs/ipad-pointer-testing.md). Unit tests can't show whether hover actually works.

## Screenshots of UI changes

Reviewers check UI changes by looking at them. Whenever a change adds or alters something users see, show it. Capture screens as described in [`docs/ios-simulator-testing.md`](./docs/ios-simulator-testing.md#collect-evidence).

- **Report back with screenshots.** In your final message, embed the changed screens as Markdown images with absolute paths, e.g. `![Buddy detail](/tmp/ww-shots/buddy-detail.png)`. T3 Code shows them inline. Add one line saying what each shows.
- **PRs show BEFORE and AFTER.** For each primary change, put the base-branch screen beside the changed one in a `| Before | After |` table. A brand-new screen has no before; label it "New screen".
- **Capture BEFORE first,** before you edit. Use the same simulator, data, and scroll position so the pair compares directly. If you missed it, run the base commit from a separate worktree and capture it there.
- **Cover the primary changes only.** A few pairs (about 3–4) is enough; pick the screens a reviewer most needs to see. Add dark mode or iPad only where the change looks different there.
- **Make them readable.** Stage sample data so every changed section has content, since an empty state hides the change. Turn off the floating dev Tools button (dev menu → Tools button). Shrink images to about 1,000 px tall (`sips -Z 1000`). Use made-up names and data; the repo is public.
- **Uploading PR images.** Reference local files in the body (`![Before](./before-home.png)`), then pass each one to `--attach` on `gh pr create`, `gh pr edit`, or `gh pr comment` (gh 2.99+). gh uploads them like browser drag-and-drop and rewrites references whose path matches the `--attach` path exactly, so run gh from the screenshots folder. Unmatched files get appended to the end instead. Afterwards, check `gh pr view` for leftover local paths. Don't use cookie-based upload tools. For alternatives, see [`docs/research/pr-screenshot-uploads.md`](./docs/research/pr-screenshot-uploads.md).
- **Say what's missing.** If you can't capture a changed screen (Android-only, missing data, no pointer), say so instead of leaving it out.

## Domain Specific Language

If discussing domain-specific items, please read [`CONTEXT.md`](./CONTEXT.md)

## Guardrails (always apply)

- Use localized strings from i18n. Never hardcode display strings.
- All dependencies must be pinned to a specific PATCH version only. Do not use lose versions like: ^, >, or ~.
- Always amend to previous commits when making follow-up fixes. gpf = git push --force-with-lease.
- **Never destroy unstaged work.** `git checkout/restore <path>`, `git reset --hard`, `git clean` discard working-tree changes with no recoverable trace. Run `git status` + `git diff <path>` before any destructive path-level git op; undo your _own_ edits with `git stash` (recoverable), and treat files dirtied outside this session as off-limits.
- **Clean up large artifacts.** Disk space is limited. Once a task no longer needs them, delete the large artifacts it created: local build outputs (`build-*` archives, `.ipa`/`.aab`/`.apk`, `android/app/build`, this app's `~/Library/Developer/Xcode/DerivedData/WitnessWorkDev-*`), simulator screenshots/recordings, temp exports, and `node_modules` in worktrees you're done with. Keep anything still awaiting upload, verification, or review, and anything you didn't create. Don't wipe shared caches (pnpm store, CocoaPods, Gradle, Metro) unless asked.
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
