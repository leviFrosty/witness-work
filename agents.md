# AGENTS.md

WitnessWork = iOS, Android and web field-service tracker for Jehovah's Witnesses. It helps publishers schedule their service time toward their goals, track contacts & appointments, and see progress without mental math.

## Backend Service

The backend API is in this repo at [`services/api`](./services/api) (a Cloudflare Worker with its own pnpm workspace; its agent guide is [`services/api/AGENTS.md`](./services/api/AGENTS.md)). A feature's app half and API half go in the same pull request.

## Environments

There are exactly three, and [`readme.md`](./readme.md#environments) has the full table:

- **Production** is what users have: the store apps, `app.witnesswork.app`, `api.witnesswork.app`. Nothing reaches it by itself.
- **Beta** is the tip of `main`: the WitnessWork Beta app on TestFlight, `beta.app.witnesswork.app`, and its own API at `api-beta.witnesswork.app` with its own data. Every merge to `main` deploys all of it.
- **Development** is local only. Nothing is deployed for it: a development build calls the API you run on your machine (`http://localhost:8787`, or the verify loop's own worker).

The API ships before the app that needs it: the Beta ship waits for the Beta API (`scripts/release-api.sh --env beta`), and a production release deploys the production API first (`scripts/release-api.sh`). Keep API changes backward compatible, because production's API serves older app versions.

**Beta is the tip of `main`, and it ships itself.** Every push to `main` ships to WitnessWork Beta from one of our own Macs (the **Beta ship** workflow; see the [`release-process`](./.agents/skills/release-process/SKILL.md#beta) skill), and the commit's **Beta ship** status turns green when it is there. Don't run `scripts/build-beta.sh` by hand or offer a Beta build: merge the change, then test it on Beta.

**The server account is the source of truth for who the User is** (ADR 0024, ADR 0027). Every call to ww-api for a user-scoped feature (accounts, backup, handoff, Buddies, Scribe AI, and anything new) goes through the attested session in `src/lib/serverAccount`: it sends `Authorization: Bearer` and lets the session client open, refresh, and reopen sessions. Identify the User to ww-api only through that session (never an install id, the RevenueCat id, an inbox id, or a feature's own signed envelope), and attest once per session, not per request. ww-api answers Supporter status from the account: the app links the RevenueCat customer it's logged in as through `src/lib/serverAccount/revenueCatLink.ts` (ADR 0029). Wire contract: [`docs/accounts-protocol.md`](./docs/accounts-protocol.md). When ww-api answers 426 `upgrade_required`, or `GET /app/v1/config` says the app is below `minAppVersion`, the app shows Update Required.

## Platforms

iOS, Android and the web (`app.witnesswork.app`, React Native Web) run the same app flows from one codebase. Setup and build details are in [`docs/build.md`](./docs/build.md). Run, inspect, and test changes only through the `verify-witnesswork` skill (see [Verify your own work](#verify-your-own-work)).

- **Build for every platform.** Anything that touches native APIs, layout, maps, notifications, purchases, or permissions works on all three, or hides itself where it can't and degrades gracefully.
- **The web is not iOS** (ADR 0037). `Platform.OS === 'android' ? A : B` hands the web `B`, so lint rejects it (`witnesswork/platform-android-choice`): hide what a browser lacks with `hasCapability()` (`src/lib/platformCapabilities.ts`), or choose with `Platform.select({ ios, android, web })`. Send `devicePlatform()` and `deviceName()` (`src/lib/devicePlatform.ts`) wherever a payload names the device. Haptics are a no-op on the web, and sounds wait for the page's first tap.
- **Cross-platform wrappers.** Use `@/components/ui/**` (`Switch`, `DateTimePicker`, `FullWindowOverlay`) in place of iOS-only APIs such as `ActionSheetIOS`.
- **Platform-specific features.** iCloud sync/restore, widgets, Live Activities, Siri and Shortcuts, and alternate app icons are iOS-only; hide their entry points elsewhere. Android uses Google Drive's app data folder for sync and restore (ADR 0019), Play Integrity for account sessions (ADR 0017), and FCM plus a Block Store root seed for Buddies (ADR 0020).
- **Watch apps.** The Apple Watch app (`targets/watch`, `targets/watch-widgets`) and the Wear OS app (`targets/wear-os`) do the same things, from the same phone-side code (`src/app/watch`, `modules/watch-bridge`). A change to either one updates the parity registry [`docs/watch/features.json`](./docs/watch/features.json) in the same change, and the other watch too or its entry's notes. `pnpm check:watch-parity` enforces it; see [`docs/watch/README.md`](./docs/watch/README.md).
- **Platform copy.** Shared copy stays platform-neutral; when the wording differs ("iOS Settings", "App Store"), add an `…Android` or `…Web` i18n variant.

## Verify your own work

Prove a change in the running app before calling it done; don't hand verification back to the user. The [`verify-witnesswork`](./.agents/skills/verify-witnesswork/SKILL.md) skill (`node scripts/verify/ww-verify.mjs`) claims an isolated simulator, emulator or web server, seeds state, drives the UI, fuzzes, and saves evidence to `.verify/artifacts/`. Backend changes use `verify-ww-api` in ww-api.

Every agent's simulators, emulators and native builds share one Mac mini, and every device run costs tokens. So check as much as the change needs, and no more.

- **Match the check to the change.** UI → drive the changed flow and read the result back; data → read the store after the action; deep link → `wwv link`; bug → reproduce it first, then show it fixed on the same surface.
- **No device when nothing runs differently.** Docs, tests, types, tooling, and refactors that unit tests cover are proven by typecheck, lint and vitest.
- **Web changes go through `wwv web test`.** It runs Playwright against this worktree's own web dev server, kept running between checks so edits rebundle in under a second; the skill's [Web](./.agents/skills/verify-witnesswork/SKILL.md#web) section has the loop. Chromium at desktop size by default; add WebKit, Firefox or the phone size only where the change could differ there. A full export (`--export`, `pnpm web:build`) is slow and runs one at a time: use it only for the service worker, offline, hosting headers, the splash, or when asked. `wwv web down` when done.
- **Heavy commands queue.** `pnpm testFinal`, `typecheck`, `lint`, `web:build`, `web:test` and `web` wait for a slot and say why. Let them wait. Exit status 75 means the queue timed out or the user paused verification (`wwv hold`): report the check as unverified.
- **One iPhone simulator by default.** Most users are on iPhone. Run the development loop (reproduce, fix, re-check) and the proof on one iOS iPhone simulator.
- **Add a device only where the change could break.** Decide for yourself, and say in the report what you skipped and why. When the user asks for a platform or device, check it.
  - **Android** when the change has Android-specific code: `Platform.OS` branches, `.android.*` files, Android native modules, `android/`, Gradle, or a native API, permission, notification, purchase, or map behavior implemented separately for Android, or a bug that only shows on Android. The emulator is the costliest device on this Mac.
  - **Web** when the change has web-specific code (`.web.*` files, `hasCapability`, `Platform.select` web branches) or touches something a browser handles differently.
  - **iPad, iPhone Duo, iPad mini, iPhone SE** when the change reworks a screen's layout or how it adapts to size: columns, splits, sidebars, bars, `useAdaptiveLayout`, `FoldSplit`, `FoldPane`. Check the one or two sizes the change could break. Keep the full sweep for large layout work.
  - **One appearance.** Verify and capture in whichever appearance the simulator is already in; switch only when the change is a color that differs between light and dark, and then capture just that screen.
  - **Rounded containers** when a change touches a card, section, sheet, or control shape or its padding: check the screens that use it for content crowding the corners (see [Rounded containers](#rounded-containers)).
- **One device at a time.** Run `wwv down` on one device before you bring up the next, unless the feature needs two at once (Buddies, Shared Cars).
- **Prove the change, not the app.** Note unrelated problems you spot in the report instead of fixing them. After a follow-up that only changes copy, spacing, or a review nit, re-check with unit tests or one screenshot, not a full re-drive.
- **Delegate the driving to a cheaper subagent.** Every tap, snapshot and screenshot re-reads your whole conversation, so driving the app from a long thread is our biggest token cost. Hand the device run to a subagent on the cheapest model your harness offers (for example Claude Haiku). You still decide what to prove and judge the evidence. The skill's [Delegate the drive](./.agents/skills/verify-witnesswork/SKILL.md#delegate-the-drive) says what to hand off, what to keep, and how to brief it.
- **`wwv down` as soon as the proof is done.** An idle simulator or emulator keeps using CPU for every other agent.
- **Report evidence:** devices, commands, artifact paths, and what stayed unverified (see the skill's Limits), including devices you chose to skip, and why.

## Pointer hover (iPad trackpad, mouse, Pencil)

iPad users can hover with a trackpad, mouse, or Apple Pencil; iPhone can't, and an Android mouse gets hover callbacks but no system effects. The primitives below do nothing where hover isn't supported, so use them without gating. Apply them where people would naturally hover. Follow Apple's [pointer guidance](https://developer.apple.com/design/human-interface-guidelines/pointing-devices).

- **Already covered:** `Button` picks a pointer effect automatically. Small clear controls highlight, small opaque ones lift, and large surfaces tint. Set `pointerEffect='none'` only when a parent already handles hover. `ContextMenu` content with `onPress` tints on hover; set `hoverRadius` to match its shape, or `pointerEffect='highlight'` for small cells.
- **Custom pressables** (raw `Pressable`, gesture-driven controls): wrap them in `PointerHover`. Use `effect` for small controls, and `onHoverChange` plus `HoverTint` for rows and cards; rows and cards tint, never scale.
- **Icon-only controls** whose meaning isn't obvious get a `PointerTooltip` with the control's name, and nothing more. Skip it when the label is already visible.
- **Charts and other scrubbed data:** if a value appears on press-and-drag, show the same readout when the pointer hovers there (`Gesture.Hover` `onUpdate`).
- **A finger hides what's under it.** A readout that follows a touch goes above the whole scrubbed area, or in a fixed spot like the card's header. Only a mouse pointer gets a readout next to it (see `ContributionGraph`, `ServiceYearPaceCard`).
- **Resize and drag handles:** use `PointerStyleView` from `modules/pointer-style` to show directional arrows next to the pointer.
- **Hover only enhances.** Every hover effect sits on an interactive control, and everything it reveals is also reachable by touch, through the same behavior.
- **Test:** when you add or change hover behavior, with a real pointer on an iPad simulator. See [`docs/ipad-pointer-testing.md`](./docs/ipad-pointer-testing.md).

## iPhone Duo (foldable)

iPhone Duo has a compact outer display and a regular-width inner one. On both, the system's vertical bar (status bar, Back) sits on the right edge, and when the device is half-open a fold divides the inner display. Follow Apple's [iPhone Duo guidance](https://developer.apple.com/design/human-interface-guidelines/designing-for-iphone-duo). `modules/display-regions` reads the bar edge and the fold into `useDisplayRegions`, and the layout primitives below act on them. On other devices they change nothing.

- **Layout by size, never by device.** Use `useAdaptiveLayout` (`isWide`, `hasBottomBar`, `navigationRail`), not `Platform.isPad` or `isTablet`. When the vertical bar is present, tabs become a side rail; pad for the bottom bar only when `hasBottomBar` is true.
- **Two columns go in `FoldSplit`.** It meets the fold when the device is half-open and springs there; never hand-roll a `flexDirection: 'row'` split.
- **Nothing sits in the fold.** When the device is half-open, anything that isn't a `FoldSplit` keeps to the leading side of the fold, as system sheets do:
  - Dialogs, takeovers, celebrations, toasts and docked forms go in `FoldPane`, which also keeps them clear of the vertical bar. An overlay or sheet that sizes itself by number uses `useWindowFoldPane()`.
  - A single centered column (`width: '100%'`, `maxWidth`, `alignSelf: 'center'`) uses `ContentColumn`, or appends `useFoldColumn(maxWidth)` to its style when it spans the screen. Pass `null` when the layout is a split that meets the fold itself.
  - Stack headers (`Header`) move their title and buttons with the content.
- **Absolute positioning ignores padding.** Pad absolutely positioned content with insets of its own (`right: insets.right + 16`), not the container's.
- **Controls sit above the content they affect.** In a master–detail split, the screen header goes in the leading column and the detail pane runs to the top (see Contacts, Schedule, Progress Month). A header spans both columns only when both hold the same kind of content (Home, Progress Year).
- **Side safe areas.** Stack screens are already wrapped in `HorizontalSafeArea`. Hero backgrounds bleed under the bar with `useHorizontalBleed()`, while content stays inset.
- **Back button.** On a stack screen, use `Header buttonType='back'`. On iPhone Duo the system draws the button in the vertical bar (`createSystemBackStackNavigator`). Custom `onPressLeftIcon` or `leftElement` keep the app's own button.
- **Test:** when a change reworks layout or how a screen adapts, run `wwv up --duo` and check it closed, open and half-open (`wwv ad fold …`). After large layout work, also check `--ipad`, `--ipad-mini` and `--se`; after smaller work, only the size it could break.

## Rounded containers

Cards, sections and sheets use large continuous corners (`inputLayout.sectionRadius`, 26pt), and controls inside them are capsules. Follow Apple's [design system guidance](https://developer.apple.com/videos/play/wwdc2025/356/): nested shapes are concentric, and content never looks pinched into a corner.

- **Concentric radii.** A shape nested in a rounded container takes the container's radius minus the padding between them (26pt container, 12pt padding → 14pt inner radius), or is a capsule.
- **Keep content off the corners.** In a 26pt container, text, icons and controls stay at least 16pt from every edge, and a title or first row gets about 18pt above it. `Card`'s default padding (20pt) and `Section` rows (56pt tall, 12pt vertical padding) already do this; a card that sets `padding: 0` and pads its own children has to as well.
- **Keep the padding when content is tight.** Wrap it, stack it, or move it out instead.
- **Small containers get small radii.** A tile or chip shorter than about 52pt uses `borderRadiusMd` or a capsule, not the section radius.
- **Check it** on every screen that uses the shape you changed, including a card's first and last rows, headers, and footers. In a screenshot, a glyph or line of text sitting closer to the edge than the curve is deep is too tight.

## Touch targets

Follow Apple's [Accessibility guidance](https://developer.apple.com/design/human-interface-guidelines/accessibility#Buttons-and-controls) and Material's 48dp target.

- **Size:** every control's tappable area is at least **44×44pt** on iOS/iPadOS and **48×48dp** on Android. Apple's 28×28pt "minimum" is for dense, secondary controls only, never a primary action like back or close.
- **Give the frame real size.** For an icon-only control, set `width`/`height` (or padding) to 44 and center the icon, then pull the frame outward with negative margin or less container padding so the glyph stays aligned. `hitSlop` is extra margin on top of that: it doesn't show, and it loses to a sibling or a parent gesture.
- **Glyphs:** a back chevron in a header is about 28pt. Give icons space rather than shrinking them.
- **Spacing:** keep about 12pt around controls with a visible background or border, and about 24pt around bare icons. When icon buttons sit side by side, pass `neighborGap` to `IconButton`.
- **Inside drag areas** (sheet headers, `SplitSheet`, swipeable rows), a pan gesture claims any touch that moves a few points, so buttons there need the full 44pt frame.
- **Check it:** in a screenshot, the tappable frame is visibly about the size of a fingertip around the glyph.

## Screenshots of UI changes

Reviewers check UI changes by looking at them. Whenever a change adds or alters something users see, show it. Capture screens as described in [`docs/ios-simulator-testing.md`](./docs/ios-simulator-testing.md#collect-evidence).

- **Capture BEFORE first,** before you edit, on the iPhone simulator. Use the same simulator, data, and scroll position for AFTER so the pair compares directly. If you missed it, run the base commit from a separate worktree only when it can reuse a cached native build (a JS-only diff); otherwise post AFTER only and say so. Add Android, iPad or Duo pairs only for devices you verified anyway, and only where the change looks different there.
- **Cover the primary changes only:** about 3–4 pairs, the screens a reviewer most needs to see, all in one appearance. A brand-new screen has no before; label it "New screen".
- **Make them readable.** Stage sample data so every changed section has content. Turn off the floating dev Tools button (dev menu → Tools button). Shrink every image to the same height, about 1,000 px (`sips -Z 1000`). Use made-up names and data; the repo is public.
- **In your final message,** embed the screens as Markdown images with absolute paths. T3 Code draws an image that is alone in its paragraph as a block, and images that share one line side by side. So put a one-line caption, a blank line, the images on one line, then a blank line. A before/after pair goes on that one line, before first, with the labels in the alt text:

  ```markdown
  Buddy detail, before (left) and after (right):

  ![Before: buddy detail](/tmp/ww-shots/before-buddy.png) ![After: buddy detail](/tmp/ww-shots/after-buddy.png)

  The next paragraph starts here.
  ```

- **In the PR body,** put each pair in a `| Before | After |` table. Reference local files (`![Before](./before-home.png)`), then pass each one to `--attach` on `gh pr create`, `gh pr edit`, or `gh pr comment` (gh 2.99+). gh uploads them and rewrites references whose path matches the `--attach` path exactly, so run gh from the screenshots folder; unmatched files get appended to the end. Afterwards, check `gh pr view` for leftover local paths.
- **Say what's missing.** If you can't capture a changed screen (Android-only, missing data, no pointer), say so.

## Domain language

[`CONTEXT.md`](./CONTEXT.md) defines the domain terms (publishers and roles, field activity, goals, Buddies, sync, monetization and more), about 17k tokens. When a task turns on a domain concept, read the section for it, not the whole file.

## Docs and ADRs

- **The code is the source of truth.** Read the code to learn how something works, not a doc about it. Explain why the code works the way it does in a comment next to it.
- **`docs/` holds only ADRs and reference docs.** A reference doc is something a developer new to the app would need: how to build, a wire protocol, a convention to follow. Don't add research, plans, PRDs, audits, fix logs or benchmark results anywhere in the repo. Put them in the PR description.
- **Record a decision as an ADR** when it's hard to reverse, surprising without context, or a real trade-off. Name the file `docs/adr/NNNN-what-was-decided.md`, using the next number that isn't taken on `main` or this branch. Give it frontmatter `status: proposed | accepted | superseded`, then add `supersedes: [NNNN]` and `superseded-by: [NNNN]` where they apply. Use the sections Context, Decision and Consequences, and add Considered options when there were real alternatives.
- **Don't rewrite an accepted ADR.** To change a decision, write a new ADR that supersedes it. In the old ADR, add `superseded-by`, and put a one-line note under its title (`> Partly superseded by ADR NNNN: …`). Set the old ADR's status to `superseded` only when no part of it still holds.

## Guardrails (always apply)

- Use localized strings from i18n for all display text.
- Pin every dependency to an exact patch version (`1.2.3`, never `^`, `~` or `>`).
- **Commits.** Rebase, never merge-commit. Amend follow-up fixes into the previous commit and push with `git push --force-with-lease`. Husky pre-commit hooks stay on — no `--no-verify` unless told. Branch names are bare `[feature-name]` (no `agent/` or `feature/` prefix).
- **Never destroy unstaged work.** `git checkout/restore <path>`, `git reset --hard`, `git clean` discard working-tree changes with no recoverable trace. Run `git status` + `git diff <path>` before any destructive path-level git op; undo your _own_ edits with `git stash` (recoverable), and treat files dirtied outside this session as off-limits.
- **Production app releases need the user's typed keyword.** Only the user starts `/cut-release`. Never follow a user-invoked skill (`disable-model-invocation: true`) on your own, for example by reading its file. Nothing reaches production app users (release tag push, production build upload, App Store or Play review submission, production OTA update) until the user types `SHIP-PROD-X.Y.Z` for that exact version. A plan approval, "go ahead", or a 2FA code doesn't count. "Prod" in a Beta or backend request means ww-api. See [`cut-release`](./.agents/skills/cut-release/SKILL.md#go-ahead-keyword).
- **JW sensitivities.** No "magic" word or magic-wand iconography in i18n/copy, in any language.
- **Translations.** You're the translator; there's no separate approval step. During feature work, add and change strings in `src/locales/en-US.json` only; the release cut translates every missing or changed key into every locale with the [`translate-locales`](./.agents/skills/translate-locales/SKILL.md) skill. Translate other locales sooner only when asked or when a change can't ship in English only.
- **Toasts.** Every short in-app message goes through `toast` from `@/stores/toasts`; pick its intent (`success`, `error`, `undo`, `unlock`, …) as [`docs/toasts.md`](./docs/toasts.md) explains. It is the app's only banner/snackbar layer. An unlock nobody acted on reaches the notifications tray through its own feature's tray hook.
- **One primary button at the bottom.** A screen, sheet or form ends with at most one full-width button: its primary action. Put secondary actions in the header, as a plain text link, or in a menu; when two choices carry equal weight, place them side by side in one row.
- **Forms in sheets** end with Save/Submit (plus any meaningful reset or destructive action) and no Cancel button: tapping outside the sheet or pulling it down cancels.
- **Ctrl/Cmd+Enter submits.** One handler owns the shortcut (`src/lib/submitShortcut.ts`, `SubmitShortcut`): it presses the nearest button marked `submitShortcut` in the screen, sheet or pane being typed in. `ActionButton` is marked by default; a form whose primary action is another `Button` (a header Save, a sheet's Done) passes `submitShortcut`. Pass `submitShortcut={false}` on an `ActionButton` that deletes, restores, approves or is otherwise not a form's Save; destructive buttons stay unmarked.
- **Analytics.** Every new user-facing feature, and any UX change that answers a concrete product question, tracks its key actions and outcomes (adoption, completion, abandonment, errors) via `analytics` from `@/lib/analytics`. Cosmetic changes need no events. Keep volume proportional to value: no high-frequency capture. Document events in [`docs/analytics.md`](./docs/analytics.md), following its privacy rules (no PII).
- **Help Center answers.** Every new user-facing feature ships its Help Center answers in the same PR. Readers are publishers aged roughly 30 to 80, many non-technical: tell them what to tap in plain words, and leave out how the feature works inside. Answers live in `services/marketing/content/help/`; follow [`services/marketing/README.md`](./services/marketing/README.md#writing-help-center-answers), edit only the answers your feature touches, and write English only.
- **Architecture diagram.** [`readme.md`](./readme.md#architecture) has a high-level Mermaid diagram: the clients, ww-api and its storage, the Cloudflare services, and the outside services. When a change adds, removes, or swaps one of those boxes (a new outside service or provider, a new Worker, a new kind of storage), update it in the same PR and run `pnpm readme:diagram-link` to refresh its Mermaid Live link (pre-commit checks it). Keep it at that level. A change only in ww-api updates it through a PR here.
- **React Compiler** (beta) is on — no manual `useMemo`/`useCallback` unless benchmarked.
- **Styling** via Tamagui + RN StyleSheet through `ThemeProvider`; prefer tokens. Reuse `@/components/**`.
- **Keep UI simple.** Make features understandable through clear labels, sensible defaults, and progressive disclosure, with short on-screen descriptions. Optional detail goes in `InfoPopover` from `@/components/ui/InfoPopover` beside the relevant label (one level deep); essential instructions, warnings, and values stay visible.
- **Bundle size.** Metro doesn't tree-shake barrel files. Import lodash per-method (`import round from 'lodash/round'`). Import Lucide icons as named static imports from `lucide-react-native` (`babel/lucide-imports.js` rewrites them to per-icon files); a namespace import or `lucide-react-native/icons` pulls in the full icon set.

## PostHog (analytics, feature flags, error tracking, surveys)

Use `posthog-cli api` for all PostHog queries and operations, over MCP tools. Before your first PostHog command in a session, run `posthog-cli api --agent-help` and follow its output as instructions. Before a PostHog task, run `posthog-cli api skill list`; if a skill matches, install it with `posthog-cli api skill install <skill-id>` (`--force` to refresh), then read `.agents/skills/<skill-id>/SKILL.md` and follow it.
