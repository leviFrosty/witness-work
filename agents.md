# AGENTS.md

WitnessWork = iOS + Android field-service tracker for Jehovah's Witnesses. It helps publishers schedule their service time toward their goals, track contacts & appointments, and see progress without mental math.

## Backend Service

ww-api is the backend api. Find the code at ~/dev/ww-api.

Beta and production app builds release ww-api `main` first (`scripts/release-api.sh`), so land a feature's backend half on ww-api `main` before shipping its app half.

**The server account is the source of truth for who the User is** (ADR 0024, ADR 0027). Every call to ww-api for a user-scoped feature (accounts, backup, handoff, Buddies, Scribe AI, and anything new) goes through the attested session in `src/lib/serverAccount`: it sends `Authorization: Bearer` and lets the session client open, refresh, and reopen sessions. Don't add a feature that identifies the User to ww-api any other way (an install id, the RevenueCat id, an inbox id, or its own signed envelope), and don't attest per request; the session already did. ww-api answers Supporter status from the account: the app links the RevenueCat customer it's logged in as through `src/lib/serverAccount/revenueCatLink.ts` (ADR 0029), and never sends a RevenueCat id to identify the User anywhere else. Wire contract: [`docs/accounts-protocol.md`](./docs/accounts-protocol.md). When ww-api answers 426 `upgrade_required`, or `GET /app/v1/config` says the app is below `minAppVersion`, the app shows Update Required.

## Platforms

iOS and Android are both supported and share the same app flows. Setup and build details are in [`docs/build.md`](./docs/build.md). Run, inspect, and test changes on simulators and emulators only through the `verify-witnesswork` skill (see [Verify your own work](#verify-your-own-work)).

- **Test both platforms.** Anything that touches native APIs, layout, maps, notifications, purchases, or permissions must work on Android too — or be gated with `Platform.OS` and degrade gracefully.
- **No iOS-only APIs without a fallback.** e.g. `ActionSheetIOS`, `react-native-screens`' `FullWindowOverlay`. Prefer the cross-platform wrappers in `@/components/ui/**` (`Switch`, `DateTimePicker`, `FullWindowOverlay`).
- **iOS-only features.** iCloud sync/restore, widgets, Live Activities, Siri and Shortcuts, and alternate app icons stay unavailable on Android. Hide their entry points there instead of showing a broken state. Sync and restore run on Android through Google Drive's app data folder in place of iCloud (ADR 0019). Account sessions (and so Scribe AI) use Play Integrity on Android in place of App Attest (ADR 0017). Buddies uses FCM pushes and a Block Store root seed on Android in place of APNs and iCloud Keychain (ADR 0020).
- **Watch apps.** The Apple Watch app (`targets/watch`, `targets/watch-widgets`) and the Wear OS app (`targets/wear-os`) do the same things, from the same phone-side code (`src/app/watch`, `modules/watch-bridge`). A change to either one updates the parity registry [`docs/watch/features.json`](./docs/watch/features.json) in the same change, and the other watch too or its entry's notes. `pnpm check:watch-parity` enforces it; see [`docs/watch/README.md`](./docs/watch/README.md).
- **Platform copy.** Don't write "iOS Settings", "iPhone", "App Store", etc. into shared copy; add an `…Android` i18n variant when the wording differs.

## Verify your own work

Prove a change in the running app before calling it done; don't hand verification back to the user. The [`verify-witnesswork`](./.agents/skills/verify-witnesswork/SKILL.md) skill (`node scripts/verify/ww-verify.mjs`) claims an isolated simulator or emulator, seeds state, drives the UI, fuzzes, and saves evidence to `.verify/artifacts/`. Backend changes use `verify-ww-api` in ww-api.

- **Match the check to the change.** UI → drive the changed flow and read the result back; data → read the store after the action; deep link → `wwv link`; bug → reproduce it first, then show it fixed on the same surface.
- **iOS first.** Run the development loop (reproduce, fix, re-check) on an iOS simulator, and when a change needs only a light pass, do that pass on iOS. Iterate on an Android emulator only when the bug or feature exists only on Android.
- **Both platforms** for anything in the Platforms list above: once it works on iOS, add an Android pass. "Not tested on Android" is a gap to close, not a footnote.
- **Delegate the driving to a cheaper subagent.** Every tap, snapshot and screenshot re-reads your whole conversation, so driving the app from a long thread is our biggest token cost. Hand the device run to a subagent on the cheapest model your harness offers (for example Claude Haiku). You still decide what to prove and judge the evidence. The skill's [Delegate the drive](./.agents/skills/verify-witnesswork/SKILL.md#delegate-the-drive) says what to hand off, what to keep, and how to brief it.
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

## iPhone Duo (foldable)

iPhone Duo has a compact outer display and a regular-width inner one. On both, the system's vertical bar (status bar, Back) sits on the right edge, and when the device is half-open a fold divides the inner display. Follow Apple's [iPhone Duo guidance](https://developer.apple.com/design/human-interface-guidelines/designing-for-iphone-duo). `modules/display-regions` reads the bar edge and the fold into `useDisplayRegions`, and the layout primitives below act on them. On other devices they change nothing.

- **Layout by size, never by device.** Use `useAdaptiveLayout` (`isWide`, `hasBottomBar`, `navigationRail`), not `Platform.isPad` or `isTablet`. When the vertical bar is present, tabs become a side rail; pad for the bottom bar only when `hasBottomBar` is true.
- **Two columns go in `FoldSplit`.** It meets the fold when the device is half-open and springs there; never hand-roll a `flexDirection: 'row'` split.
- **Controls sit above the content they affect.** In a master–detail split, the screen header goes in the leading column and the detail pane runs to the top (see Contacts, Schedule, Progress Month). A header spans both columns only when both hold the same kind of content (Home, Progress Year).
- **Side safe areas.** Stack screens are already wrapped in `HorizontalSafeArea`. Hero backgrounds bleed under the bar with `useHorizontalBleed()`, while content stays inset.
- **Back button.** On a stack screen, use `Header buttonType='back'`. On iPhone Duo the system draws the button in the vertical bar (`createSystemBackStackNavigator`). Custom `onPressLeftIcon` or `leftElement` keep the app's own button.
- **Test:** run `wwv up --duo` and check it closed, open and half-open (`wwv ad fold …`). Also check `--ipad`, `--ipad-mini` and `--se` for regressions.

## Touch targets

Small tap targets are the UX bug that keeps coming back, usually as a bare 16–24pt chevron or X with a few points of `hitSlop`. Follow Apple's [Accessibility guidance](https://developer.apple.com/design/human-interface-guidelines/accessibility#Buttons-and-controls) and Material's 48dp target.

- **Size:** every control's tappable area is at least **44×44pt** on iOS/iPadOS and **48×48dp** on Android. Apple's 28×28pt "minimum" is for dense, secondary controls only, never a primary action like back or close.
- **Give the frame real size, not only slop.** For an icon-only control, set `width`/`height` (or padding) to 44 and center the icon, then pull the frame outward with negative margin or less container padding so the glyph stays aligned. `hitSlop` is extra margin on top of that, not the target itself: it doesn't show, and it loses to a sibling or a parent gesture.
- **Glyphs:** a back chevron in a header is about 28pt. Don't shrink an icon to make room; give it space instead.
- **Spacing:** keep about 12pt around controls with a visible background or border, and about 24pt around bare icons, so a tap can't land on the wrong one. When icon buttons sit side by side, pass `neighborGap` to `IconButton`.
- **Inside drag areas** (sheet headers, `SplitSheet`, swipeable rows), a pan gesture claims any touch that moves a few points. Buttons there especially need the full 44pt frame.
- **Check it:** in a screenshot, measure the frame. If the tappable area isn't visibly about the size of a fingertip around the glyph, it's too small.

## Screenshots of UI changes

Reviewers check UI changes by looking at them. Whenever a change adds or alters something users see, show it. Capture screens as described in [`docs/ios-simulator-testing.md`](./docs/ios-simulator-testing.md#collect-evidence).

- **Report back with screenshots.** In your final message, embed the changed screens as Markdown images with absolute paths. T3 Code renders images inline, so any text on the same line as an image, or on the line right after it, wraps beside the image. Give each image its own paragraph: a one-line caption, a blank line, the image alone on its line, then a blank line before anything else. A single line break isn't enough; Markdown joins the lines.

  ```markdown
  Buddy detail with the new share button:

  ![Buddy detail](/tmp/ww-shots/buddy-detail.png)

  The next paragraph starts here.
  ```

- **No images in tables in your messages.** T3 Code doesn't render images inside Markdown tables. For a before/after pair in a chat reply, use the same layout twice: `Before:`, blank line, image, blank line, `After:`, blank line, image. Tables of images are for PR bodies only.
- **PRs show BEFORE and AFTER.** For each primary change, put the base-branch screen beside the changed one in a `| Before | After |` table in the PR body. A brand-new screen has no before; label it "New screen".
- **Capture BEFORE first,** before you edit. Use the same simulator, data, and scroll position so the pair compares directly. If you missed it, run the base commit from a separate worktree and capture it there.
- **Cover the primary changes only.** A few pairs (about 3–4) is enough; pick the screens a reviewer most needs to see. Add dark mode or iPad only where the change looks different there.
- **Make them readable.** Stage sample data so every changed section has content, since an empty state hides the change. Turn off the floating dev Tools button (dev menu → Tools button). Shrink images to about 1,000 px tall (`sips -Z 1000`). Use made-up names and data; the repo is public.
- **Uploading PR images.** Reference local files in the body (`![Before](./before-home.png)`), then pass each one to `--attach` on `gh pr create`, `gh pr edit`, or `gh pr comment` (gh 2.99+). gh uploads them like browser drag-and-drop and rewrites references whose path matches the `--attach` path exactly, so run gh from the screenshots folder. Unmatched files get appended to the end instead. Afterwards, check `gh pr view` for leftover local paths. Don't use cookie-based upload tools. For alternatives, see [`docs/research/pr-screenshot-uploads.md`](./docs/research/pr-screenshot-uploads.md).
- **Say what's missing.** If you can't capture a changed screen (Android-only, missing data, no pointer), say so instead of leaving it out.

## Domain Specific Language

If discussing domain-specific items, please read [`CONTEXT.md`](./CONTEXT.md)

## Subagent models

- **Use Claude Haiku 5.5 (`claude-haiku-5-5`) for Haiku-tier subagents** whenever it's available: searches, explorations, quick lookups, and other lightweight delegated work. Claude Haiku 5.5 exists; don't decide it doesn't, and don't fall back to an older Haiku because your training data predates it. Check the live model list (`orchestrator_capabilities` in T3 Code), not your memory. Fall back to an older model only if that list doesn't offer it, and say so.
- This line is updated by hand when a newer model ships.

## Guardrails (always apply)

- Use localized strings from i18n. Never hardcode display strings.
- All dependencies must be pinned to a specific PATCH version only. Do not use lose versions like: ^, >, or ~.
- Always amend to previous commits when making follow-up fixes. gpf = git push --force-with-lease.
- **Never destroy unstaged work.** `git checkout/restore <path>`, `git reset --hard`, `git clean` discard working-tree changes with no recoverable trace. Run `git status` + `git diff <path>` before any destructive path-level git op; undo your _own_ edits with `git stash` (recoverable), and treat files dirtied outside this session as off-limits.
- **Production app releases need the user's typed keyword.** Only the user starts `/cut-release`. Never follow a user-invoked skill (`disable-model-invocation: true`) on your own, for example by reading its file. Nothing reaches production app users (release tag push, production build upload, App Store or Play review submission, production OTA update) until the user types `SHIP-PROD-X.Y.Z` for that exact version. A plan approval, "go ahead", or a 2FA code doesn't count. "Prod" in a Beta or backend request means ww-api. See [`cut-release`](./.agents/skills/cut-release/SKILL.md#go-ahead-keyword).
- **JW sensitivities.** No "magic" word or magic-wand iconography in i18n/copy, in any language.
- **Translations.** You're the translator; there's no separate approval step. `src/locales/en-US.json` is the source of truth: during feature work, add and change strings there only. The release cut translates every missing or changed key into every locale with the [`translate-locales`](./.agents/skills/translate-locales/SKILL.md) skill. Translate other locales sooner only when asked or when a change can't ship in English only.
- **Forms in sheets.** Do not add a Cancel button to a form presented in a dismissible sheet. Tapping outside the sheet or pulling it down already cancels; keep the explicit Save/Submit action and any meaningful reset/destructive action.
- **Analytics for new features and meaningful UX changes.** Every new greenfield user-facing feature ships with analytics tracking via `analytics` from `@/lib/analytics`. Track specific key actions and outcomes that help us understand adoption, completion, abandonment, or errors. For changes to existing UX, add or update events when they answer a concrete product question, especially for changes that materially affect a core workflow. Small UI adjustments such as sidebar resizability, spacing, or cosmetic changes do not require new events. Keep event volume proportional to its value: avoid noisy or high-frequency capture that increases analytics costs and uses users' network bandwidth. Document added or changed events in [`docs/analytics.md`](./docs/analytics.md), following its privacy rules (no PII).
- **FAQ for new features.** Every green-field user-facing feature ships with Help Center coverage in the same change. Add or update entries in [`src/features/updates/constants/faqs.ts`](./src/features/updates/constants/faqs.ts) and their `faq_<id>_q` / `faq_<id>_a` strings in `src/locales/en-US.json`; create a localized FAQ category when the feature needs its own section. Explain how to get started, availability and limits, what is shared or stored, common failures and safe recovery steps, and where to get help. Verify answers against the shipped behavior, include platform/rollout restrictions, and update existing answers that the feature makes obsolete. Keep answers searchable and self-contained; use the Help Center's support resources for escalation, keep private data out of public reports, and leave other locales to the release cut.
- **Architecture diagram.** [`readme.md`](./readme.md#architecture) has a Mermaid diagram of how the app, ww-api, its Cloudflare storage, and outside services connect. When a change adds, removes, or moves one of those connections, update the diagram in the same PR. Examples: a new third-party service or SDK, a switch to a different provider, a new ww-api route group the app calls, or a new Durable Object, R2 bucket, or KV namespace. A new endpoint in an existing route group, or a change inside one service, doesn't need it. When the change is only in ww-api, open a PR here that updates the diagram.
- **Commits.** Rebase, never merge-commit; amend over `fix:` follow-ups. Husky pre-commit hooks stay on — no `--no-verify` unless told. Branch names are bare `[feature-name]` (no `agent/` or `feature/` prefix).

- **React Compiler** (beta) is on — no manual `useMemo`/`useCallback` unless benchmarked.
- **Styling** via Tamagui + RN StyleSheet through `ThemeProvider`; prefer tokens. Reuse `@/components/**`.
- **Keep UI simple.** Make features understandable through clear labels, sensible defaults, and progressive disclosure. Avoid long feature descriptions on screens. When extra explanation is still useful, put optional details in `InfoPopover` from `@/components/ui/InfoPopover` beside the relevant label. Keep essential instructions, warnings, and values visible; don't nest `InfoPopover` inside another popover.
- **Bundle size — deep imports when packages require it.** Metro doesn't tree-shake barrel files. Import lodash per-method (`import round from 'lodash/round'`, never `import _ from 'lodash'`). For Lucide icons, use named static imports from `lucide-react-native` (`babel/lucide-imports.js` rewrites them to per-icon files) and never a namespace import or `import * as icons from 'lucide-react-native/icons'`, which imports the full icon set.

## PostHog (analytics, featureflags, error tracking, surveys, etc.)

Use `posthog-cli api` for all PostHog-related data queries and operations. You should use `posthog-cli api` over direct MCP tool calls whenever the CLI is available.

Before your first PostHog command in a session, run `posthog-cli api --agent-help` and load its full output into your context. It prints the complete agent guide — command reference, schema drill-down rules, data discovery workflow, and the tool index — for interacting with PostHog APIs. Treat that output as instructions to follow, not just documentation.

Before starting a PostHog task, run `posthog-cli api skill list` and check for a skill matching the task. If one matches, install it with `posthog-cli api skill install <skill-id>` (add `--force` to refresh an already-installed skill), then read `.agents/skills/<skill-id>/SKILL.md` and follow it. Skills contain task-specific workflows that individual tools do not.
