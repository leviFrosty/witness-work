---
name: verify-witnesswork
description: Drive the real WitnessWork app on an iOS simulator or Android emulator (plus the local ww-api backend) to prove a change works, with captured evidence and no human in the loop. Use before claiming any UI, navigation, data, deep link, permission, or backend-integration change is done; when asked to verify, QA, smoke test, reproduce a bug, or fuzz the app; or when a task says "test on device/simulator/Android".
---

# Verify WitnessWork

`scripts/verify/ww-verify.mjs` claims a dedicated device, runs an isolated Metro, installs a dev build that matches this tree's native fingerprint, launches the app, and drives it. Inside the app, dev builds expose `globalThis.__WW_DEV__`, which seeds data, flips flags, navigates and reads state back over Hermes CDP. It never touches the user's own simulators, emulators or Metro on 8081. Every run also gets a local backend: `up` starts an isolated ww-api and points the bundle at it, so Buddies, Notes Import and other backend features work without the user's own ww-api running.

Alias it: `alias wwv="node scripts/verify/ww-verify.mjs"`. All commands run from the worktree root and print JSON or `ok`/`FAIL` lines.

## Delegate the drive

A device run is dozens of small steps, and each one re-reads the conversation of whoever runs it. From a long feature thread, that re-reading is most of what verification costs. So the agent that made the change plans the proof and judges it, and a subagent on the cheapest model available drives the device from a fresh context:

- Claude Code: the `Agent` tool with `model: "haiku"`.
- T3 Code: `delegate_task`, picking the smallest model `orchestrator_capabilities` lists.
- Other providers: their smallest model, through whatever subagent tool the harness has.

If you are that subagent, don't delegate again: follow your brief and the rules below, starting at [Launch](#launch).

Work in the same worktree, so the subagent uses this worktree's lease, Metro and artifacts. Run a single command yourself (one `wwv eval`, one `wwv link`); it costs less than writing a brief.

**Delegate** scripted proof: known screens and taps, store read-backs, screenshots for the report or PR, `wwv flow` and `wwv monkey` runs, and re-runs after a fix.

**Keep on your own model,** or hand to a subagent on a stronger one:

- Exploratory bug hunts, where nobody knows yet what to look for.
- Harness trouble: `up` or `doctor` keeps failing, or a step needs raw agent-device, `idb`, `adb` or `simctl`.
- Visual and UX judgment.

**The brief** has to stand alone, because the subagent sees nothing of your thread. Include:

1. The worktree path, and "read `.agents/skills/verify-witnesswork/SKILL.md` and the matching `features/` file first".
2. What changed, in a sentence or two, with the files.
3. The platforms and the exact `wwv up` line. Add `--accept-stale-native` only when you know the diff has no native change. Run that `up` and `wwv doctor` yourself before you hand off, because the subagent stops at a failing `doctor`.
4. Setup (`seed`, `flag`, `nav`), then the user path to drive, with labels or testIDs and the expected result of each step.
5. The exact `wwv eval` read-backs and the values you expect.
6. The screens to capture, with `wwv shot <name>`, plus dark mode or iPad where needed.
7. "Don't edit files, commit or change git state. Leave the device up."

**The subagent** follows the brief and doesn't improvise around the harness:

- If `doctor` fails twice, a target is still missing after a fresh `snapshot -i`, or a step would need anything outside `wwv`, it stops and reports `blocked` with the command and its output.
- It reports each step as pass, fail or blocked, with the settled diff or `wait text`, the read-back output verbatim, and the screenshot paths. It ends with the output of `wwv errors` and what it couldn't check.
- It describes what screens show and leaves judgment on how they look to you.

**After the report,** read the two to four screenshots that matter, all in one turn. If a step failed, fix the code, then send the same brief again with what changed. Take the drive back into your own thread only for a `blocked` harness problem. Run `wwv down` when you're done.

## Launch

```bash
wwv up --platform ios --seed pioneer         # iPhone; add --ipad (or --ipad-mini) for an iPad, --duo for iPhone Duo, --se for the smallest iPhone
wwv up --platform android --seed pioneer     # headless emulator, same Metro
```

What `up` does, in order:

1. Reaps expired leases and orphaned builds.
2. Resolves the native app before it leases anything. It computes the native fingerprint (`@expo/fingerprint`) and uses the matching build in `~/.ww-verify/builds`. Otherwise it waits for a build slot, then builds the dev client without a device: a clean dev prebuild, then `xcodebuild` (newest installed Xcode, DerivedData in `.verify/DerivedData`) or `gradlew :app:assembleDebug`. It caches the result and deletes `.verify/DerivedData` or `android/app/build` (`--keep-build-dirs` keeps them). A worktree waiting to build holds no device: if it held one, `up` hands it back first and leases again after the build.
3. Leases a `WW Verify iPhone N`, `WW Verify iPad N`, or `ww-verify-N` device, queueing if the pool is full (see [Concurrency and resources](#concurrency-and-resources)). It takes a warm device first (already booted, so no boot), preferring one that already runs this build (so no install).
4. Starts (or reuses) the local ww-api (see **The backend** below), then Metro on the port reserved with the lease, from 8090 to 8129.
5. Boots the device unless it's warm, then installs the cached build unless the device already runs exactly that binary.
6. Launches the app against this Metro and waits until `__WW_DEV__` answers.

If `up` fails or is interrupted, it hands back the lease it took and stops the Metro it started, then says what to do next.

It's ready when `up` prints its JSON summary. A first build for a new native fingerprint takes about 3 to 5 minutes on its own, longer when it queues for a build slot or memory, so run it in the background and keep working. JS-only changes reuse the cached binary and need only Metro; with a warm device that already runs it, `up` takes well under a minute. The fingerprint covers native inputs only (`fingerprint.config.js`): `modules/`, `patches/`, `plugins/`, `targets/`, native deps, and the resolved `app.config.ts`. New or changed strings in `en-US.json` don't count, except the permission strings `app.config.ts` copies into the native config.

- `--accept-stale-native` skips the build. Use it only when the diff has no native change (`modules/`, `patches/`, `plugins/`, `targets/`, native deps, `app.config.ts`), and report "native binary unverified".
- **The backend.** Before Metro, `up` runs ww-api's `scripts/verify/dev.mjs up`, an isolated `wrangler dev` on 8790-8799 with its own storage (never the user's 8787), and points the bundle at it through `WW_VERIFY_API_BASE_URL`. Its `api` output shows the URL and the ww-api commit. All worktrees share that one worker; it stops when the last lease using it is released or reaped.
  - By default it runs from `~/dev/ww-api-worktrees/ww-verify`, a detached worktree the harness owns. Whenever no worker is running from it, `up` moves it to the latest `origin/main` and reinstalls dependencies when the lockfile changed, so it never depends on the user's checkout. Don't edit files there. `WW_API_REPO` overrides the repo (default `~/dev/ww-api`).
  - When the app change needs an unmerged backend branch, set `WW_API_DIR=<that ww-api worktree>` on `up`. The harness runs that checkout as is.
  - `--api env` uses `.env`'s `EXPO_PUBLIC_API_BASE_URL` instead (the user's ww-api on 8787, or a deployed one), shared with the user and every other worktree. Use it only when the task is about that API.
- `--ipad` needs [AXe](https://github.com/cameroncooke/AXe) (`brew install cameroncooke/axe/axe`) to read the screen; see [iPad](#ipad). `doctor` checks for it.
- `up` ends by checking a screenshot for the native splash. If it still covers the app after `hide()`, `up` relaunches once, then fails.

## Doctor

```bash
wwv doctor            # exit 1 if anything is off
```

Checks: free disk, Metro served from this worktree, API `/health`, the device lease (held by this worktree and not expired), booted, app installed, native fingerprint match (the binary on the device must also hash the same as the cached build `up` installed), JS runtime reachable with zero captured errors, the bundle calling the run's API (`api-base`), and on iOS AXe plus a screen the splash doesn't cover (`ios:screen`). A `warn` line doesn't fail doctor: with `--api env`, the shared API being down is fine for UI-only checks. Run it before the first drive, after any surprising result, and before reporting. Don't drive an instance that fails doctor. Fix it, or `wwv down` then `wwv up`. A failing `api` check is a harness problem to fix, not a limit to report: rerun `wwv up` (it restarts an unhealthy worker), and read the worker's log at `<ww-api checkout>/.verify/wrangler.log`.

## Drive

**State.** Never tap through onboarding or hand-enter fixture data.

```bash
wwv seed pioneer            # fresh | onboarded | publisher | pioneer | busy | badges | stress
wwv flag buddies on         # buddies | notes-import; on | off | clear
wwv eval '__WW_DEV__.setSupporter(true)'
wwv nav "Contact Details" '{"id":"verify-contact-0"}'
wwv link 'witnesswork://add-time'   # real deep-link path; accepts the iOS "Open in" prompt
wwv eval '__WW_DEV__.state()'       # route, counts, role, badges, captured error count
wwv eval '__WW_DEV__.remount()'     # every screen mounts fresh on Home, dropping open sheets
wwv eval '__WW_DEV__.stores.preferences.getState().timeDisplayFormat'
wwv eval '__WW_DEV__.forgetNotesImportCredits()'   # Notes Import as before the first import
wwv eval '__WW_DEV__.stores.updateRequired.setState({ required: { source: "config", currentVersion: "1.44.1", minVersion: "9.0.0" } })'
```

`seed` clears the device's data first, then saves the scenario, so the seeded data (the builtin LDC Category included) is still there after a relaunch (`wwv up`). It keeps Notes Import's persisted Import Credits; `forgetNotesImportCredits()` drops them. Setting `updateRequired` shows Update Required on this device only (`required: null` lifts it); never put an `app:min-version` floor on the shared local API for that, since every worktree uses it.

Scenarios are built relative to today (`src/app/dev-harness/scenarios.ts`).

- `fresh`: a fresh install on onboarding.
- `onboarded`: a publisher with no data.
- `publisher`: a checkbox-mode publisher with 4 contacts and 3 months shared.
- `pioneer`: a regular pioneer with service-year hours, an LDC credit entry, 8 contacts (3 Bible studies, one overdue and one upcoming follow-up), and 3 upcoming plans.
- `busy`: `pioneer` with 160 contacts, for list and map performance.
- `badges`: `pioneer` plus a year and a bit of history (one contact visited monthly, sent reports, a weekly plan), which earns 14 badges.
- `stress`: a heavy pioneer account for profiling: 2,000 contacts with 8,000 visits over five years, five Service Years of hours and sent reports, and 300 Plans (20 of them Recurring, with skipped and moved dates).
- Every onboarded scenario files the badges its records reach as already seen history, so seeding never shows a badge celebration. `fresh` leaves that first pass for after onboarding, like a real install.
- Ids start with `verify-`, e.g. `verify-contact-0` is "Ada Reyes".

**UI.** Use agent-device through the run's session:

```bash
wwv ad snapshot -i                       # accessibility tree with @refs
wwv ad press @e12 --settle               # act, wait for quiet, print the diff
wwv ad fill @e7 "Ada" --settle
wwv ad press 'label="Contacts"' --settle
wwv ad wait text "Added Time"
wwv ad scroll down --settle
wwv ad react-native dismiss-overlay      # if a LogBox/RedBox overlay covers the app
```

- Prefer refs, then `label=`/`id=` selectors. Use coordinates only when the snapshot has no target.
- Every other `wwv ad` command reopens the app first, and that expires the last snapshot's refs. So act on a ref right after its `snapshot`, and take a fresh snapshot after any other command.
- Native disclosures (the Help Center's questions: a SwiftUI `DisclosureGroup` on iOS) list each question twice, as `[disclosuretriangle]` parent and child. That's how XCTest and AXe report every SwiftUI `DisclosureGroup`, Apple's string-label one included, not a second VoiceOver stop. `press 'label="…"'` then fails with `AMBIGUOUS_MATCH`; press the first ref, or use `find "<question>" click --first` (Maestro: `tapOn` with `index: 0`). The Help Center's search field is labelled "Search questions".
- Labels are en-US i18n strings (`src/locales/en-US.json`). Tabs are "Home", "Schedule", "Contacts", "Progress". The center "+" is "Quick Action".
- `wwv ad help workflow` has the full reference.

**Scripted flows.** Maestro-style YAML in `e2e/maestro/` runs on both platforms:

```bash
wwv flow                                 # every flow in e2e/maestro
wwv flow e2e/maestro/add-contact.yaml --platform android
```

- `scripts/verify/flows.mjs` interprets a Maestro subset through this run's agent-device session: `tapOn`, `longPressOn`, `assertVisible`, `assertNotVisible`, `extendedWaitUntil`, `inputText`, `eraseText`, `hideKeyboard`, `back`, `scroll`, `scrollUntilVisible`, `waitForAnimationToEnd`, `evalScript` and `runFlow` (inline `commands` with `when: { visible }` only). It doesn't use the Maestro CLI, because Maestro 2.4's iOS driver (and agent-device's own replay runner) can't see React Native views on iOS 27 simulators.
- Use `traits: button` (or `role: switch`) to target the control rather than its label. `editable: true` picks a row's text field over the row's label, which names the field too. `text: [A, B]` tries each label, for accessible names that differ by platform, such as Android appending a control's value ("Hours, 0"). `index: 0` taps the first element whose text contains the given text (agent-device's `find --first`), such as the same number on two wheels or a row whose name continues past it; which one is first is agent-device's choice, so assert something either match satisfies.
- `eraseText` clears the field the last `tapOn` landed on. `evalScript` runs its JS in the app and must return `true`; use it where a deep link would take the User mid-flow (a day computed from today). Write it as a `>-` block scalar, since a plain YAML value with `: ` in it parses as a map.
- `# seed: <scenario>` seeds before the flow. `# setup: <js>` lines then run in the app, to adjust what the scenario seeded (for example, clear a day it fills only on some weekdays). `# assert: <js>` lines must evaluate to `true` in the app afterwards, which is the read-back.
- A flow fails on a failed step, a captured JS error, or a false assert. A screenshot of the failure lands in the artifacts.
- Add a flow for any user path you change that a later agent should re-prove.

**Feature map.** [`features/README.md`](features/README.md) lists every mapped feature, with its entry points, drive recipe and proof. Read the matching file before verifying a feature. A proof that drives only one convenient entry point is incomplete when the map lists others.

## iPad

agent-device can't read the iPad layout: its XCTest capture times out on the sidebar shell and returns only the app node, so refs, selectors, `find` and `wait` find nothing. Its coordinate taps also miss once the app window is resized. So on iPad, `wwv ad` reads the screen with AXe and taps through AXe. The commands above work unchanged, and `wwv flow` and `wwv monkey` go the same way:

- `snapshot` lists `@aN` refs from AXe, warning when the splash covers the app. `press`, `fill` and `find … click` resolve `@aN`, `label=`/`id=`/`role=` selectors or text, then tap the center. A `fill` focuses the field with that tap and lets agent-device replace its text.
- **Resized windows.** AXe frames elements relative to the app window, so taps add the window's place on screen, which `wwv ad` reads from SpringBoard (`axe describe-ui --point 1,1`). Refs, selectors and `back` land in any window size. Raw `press <x> <y>` coordinates are screen points, as in a screenshot. Resize the window by dragging its bottom-right corner with `axe drag`. agent-device's `scroll` and `swipe` still miss in a resized window; scroll with `axe swipe` at screen coordinates.
- Don't send keys through AXe (`axe key`, `key-combo`, `type`): the simulator then treats them as a hardware keyboard and hides the software keyboard, and agent-device's `type` and `fill` fail with `TEXT_INPUT_NOT_FOCUSED` until the simulator reboots (`wwv down --shutdown`).
- A sheet leaves the screen under it in the tree, so a label can match twice. `wwv ad` hit-tests each match and taps the one in front.
- `wait text|absent|stable` poll AXe, and `back` presses the screen's "Go Back" (or "Back", "Close") control.
- `--settle` waits until nothing moves, including a dock riding the keyboard, then prints an AXe diff: `+` lines carry new refs, `-` lines what left the screen.
- `type` fills the field the last tap landed in, replacing its text, because agent-device can't find the focused field.
- `alert` and other XCTest queries can overrun and leave agent-device's runner busy for a few seconds. `wwv ad` waits and retries instead of failing the next tap.

iPhone keeps agent-device and falls back to AXe only when its tree comes back sparse or a selector misses.

## iPhone Duo

`wwv up --duo` leases a `WW Verify iPhone Duo N` simulator (needs Xcode 27.1 and the iOS 27.1 runtime). It boots closed, on the 466×678 pt outer display. `wwv ad fold open|half-open|closed` changes the pose; open puts the app in a 951×669 window on the inner display, and half-open folds it like a book, with the fold down the middle. Re-snapshot after every fold; refs and coordinates don't survive one.

- On this machine `fold` can fail with `fold-pose-dispatched-unverified`: the pose still changes, but devicectl can't read the hinge back. Read it from the app instead: `wwv eval '__WW_DEV__.displayRegions()'` returns what UIKit reports for the window, including the fold (`divisions[].active` is true while half-open), the vertical bar edge and the horizontal size class.
- agent-device's screenshot can capture the dark panel (an all-black PNG). Capture the lit one with `xcrun simctl io <udid> screenshot --display=<panel UUID>`; `xcrun simctl io <udid> enumerate` lists both panels (1398 px wide outer, 2007 px wide inner).

## Fuzz

```bash
wwv monkey --steps 150 --seed 4242 --scenario pioneer   # seeded random walk
pnpm vitest run src/__tests__/fuzz.parsers.test.ts      # property-based parsers
```

The monkey relaunches the app, seeds, then presses random enabled controls, types hostile text (RTL, emoji, 512 chars, format strings), scrolls, and goes back. It never touches delete, purchase, share, export, iCloud or developer controls. It fails on any captured JS error or an unresponsive app. It also fails as `stuck` when more than 25% of steps had to refocus or relaunch the app instead of acting. The summary reports `actions`, `refocused` and `realActionShare`. Its JSONL log, screenshot and a replay command land in the run's artifacts.

On a failure, rerun with the same seed to confirm. Then minimize by lowering `--steps` until it stops reproducing, and turn the path into a Maestro flow or a unit test before fixing. Property tests print a seed; rerun with `FC_SEED=<seed>`.

## Evidence

Everything lands in `.verify/artifacts/<run-id>/`, which is gitignored and survives `down`:

```bash
wwv shot add-time-saved            # PNG, resized to 1400 px; exits 1 if no image was saved
wwv errors                         # captured JS errors; exit 1 if any
wwv ad record start / wwv ad record stop   # video for motion and animation claims
```

On iOS the simulator writes captures itself, and it can't write to every volume (a worktree on an external drive fails with "Operation not permitted"). So `shot` and `ad record` capture to a temporary folder and copy the file into the artifacts; `ad record stop` prints where the video went. Don't call `simctl io` yourself to work around a failure.

Proof standards:

- Drive the real user path. `seed`, `nav` and `flag` set up state; they are never the proof of the feature under test.
- Capture the action and the resulting state: a settled diff or `wait text`, plus a screenshot. A screenshot alone isn't proof of an interaction.
- Read side effects back. After a save, `wwv eval` the store (for example `__WW_DEV__.stores.contacts.getState().contacts.find(c => c.name === "X")`), or reopen the record from a second screen.
- `wwv errors` must be empty at the end. The Metro log (`.verify/metro.log`) shows warnings and red boxes.
- Check both platforms for anything touching layout, native APIs, maps, notifications, purchases or permissions. On Android, iOS-only features (listed in `agents.md`) must have no entry point at all, not a broken one.
- Layout changes need an iPad too (`--ipad`): a sidebar appears from 1,000 pt wide, along with split views and the menu bar. Layouts with columns or bars also need iPhone Duo (`--duo`), closed, open and half-open, and the smallest screens: iPad mini in portrait (`--ipad-mini`, 744 pt: a bottom bar and one column) and iPhone SE (`--se`, 375 pt with no notch or home indicator).
- New surfaces need light and dark: `wwv ad settings appearance dark` (or `light`), then `wwv shot`.
- Run the regular checks too: `pnpm run typecheck`, `pnpm run lint` and `pnpm vitest run` (add `--maxWorkers=2` when memory is tight).
- Report what you verified, on which devices, the artifact paths, and what you couldn't verify and why.

## Concurrency and resources

Many worktrees share one Mac. All of them coordinate through `~/.ww-verify`.

- **Only through `wwv`.** Don't boot, build or serve by hand: no `pnpm run ios`/`android`, `simctl boot`, `emulator -avd`, T3 `device_open`, or Metro on 8081. Those skip the leases and the build cache, and collide with the user's devices and other worktrees. Never run `adb emu kill` or `gradlew --stop`, which hit every worktree's emulator or Gradle.
- **Iterate without a device.** Use typecheck, lint and vitest while you work. Take a device lease once, for the proof. Use Android only when the change is platform-sensitive.
- **Caps.** At most `WW_VERIFY_MAX_IOS` simulators and `WW_VERIFY_MAX_ANDROID` emulators are leased at once, and the pool never grows past the cap. Only `WW_VERIFY_MAX_BUILDS` native builds run at a time. A worktree waiting for a build slot stops waiting as soon as its fingerprint appears in the cache, and a cached artifact never waits.
- **Builds.** Always the development variant (`com.leviwilkerson.jwtimedev`); the harness refuses to cache or install anything else and never adds PostHog's symbol upload. A build never installs anything; `up` installs the cached artifact after it holds a lease. A failed build's `.verify/DerivedData` or `android/app/build` is deleted too. Android builds run without a Gradle or Kotlin daemon, so nothing stays resident afterwards.
- **Orphaned builds.** A build runs in its own process group, recorded with its slot. If its `up` dies (killed, crashed), the next `up` or `wwv gc` kills that group and deletes its build dirs; `wwv status` shows it as `orphaned` until then.
- **Waiting.** When every device is leased, `up` queues first-come and prints the holders and your place. Builds queue first-come too, and a device request waits behind an earlier build that is only short of memory, so builds aren't starved. `up` gives up after `--wait <minutes>` (default 30). Don't kill another worktree's lease; run `wwv status` (it lists who waits for what, and why) and wait, or work without a device.
- **Idle expiry.** Every command that touches the device refreshes the lease. A lease that is idle for `WW_VERIFY_LEASE_IDLE_MIN`, or whose worktree was deleted, gets reaped by the next `up` or `wwv gc`: the reaper hands the device to the warm pool (or shuts it down if the pool is full) and stops that worktree's Metro. After that, your commands fail with "no longer holds its lease"; run `wwv up` again.
- **Warm devices.** `down` keeps the device booted, unleased, for the next `up` while there are fewer than `WW_VERIFY_WARM` warm devices of that platform and the budget has room. Warm devices count toward the memory budget. A lease or build that needs the memory shuts the oldest ones down instead of waiting, and any warm device is shut down after `WW_VERIFY_WARM_HOURS`. `wwv status` lists them and the build each one runs. A warm device keeps the last worktree's app data, as a shut-down one always did, so seed state with `--seed` or `wwv seed`.
- **Minimum running devices.** `WW_VERIFY_WARM_MIN` (default 0) keeps that many devices per platform running, leased or warm: `down` and idle reaping always keep a device warm below it, and neither the hours limit nor a lease evicts below it. Only a native build may, because it can't fit otherwise. `wwv warm` boots devices back up to the minimum and installs the newest cached build on them. A machine that sets the minimum runs `wwv warm` from launchd every few minutes.
- **Memory budget.** A lease or build waits while the estimated total would exceed `WW_VERIFY_MEMORY_BUDGET_GB`; a request bigger than the whole budget fails at once. Emulators boot with 2 GB and 2 cores, and Metro runs with 2 workers.
- **Live memory.** On macOS, a boot or build also waits until the kernel's free-memory level (`kern.memorystatus_level`, shown by `wwv status`) is at least `WW_VERIFY_MIN_FREE_PCT` for a device or `WW_VERIFY_MIN_FREE_PCT_BUILD` for a build, and memory pressure is normal. It also waits `WW_VERIFY_SETTLE_SEC` after the previous boot or build, so that one shows up in the level first. This check covers what the budget can't see: other agents, typechecks, and devices or Gradle runs started outside `wwv`. A cold boot waits; taking a warm device boots nothing and skips the check. When memory is short, a lease or build shuts down one warm device and lets it settle before trying again. Device claims also give way to an earlier build that waits on live memory.
- **Always `wwv down` when done**, including after a failed `up`.

```bash
wwv status     # leases, device and build waiters with reasons, builds, Metros, memory (read-only)
wwv gc         # reap expired leases and orphaned builds now
wwv warm       # boot devices up to WW_VERIFY_WARM_MIN per platform (no-op at 0)
```

Defaults depend on the machine's RAM; env vars always win, and `wwv status` prints the effective policy and where each value came from (`env` or `auto`).

| Variable                                                       | ≤ 16 GB RAM           | Larger machines       |
| -------------------------------------------------------------- | --------------------- | --------------------- |
| `WW_VERIFY_MAX_IOS`, `WW_VERIFY_MAX_ANDROID`                   | 2, 2                  | 2, 2                  |
| `WW_VERIFY_MAX_BUILDS`                                         | 1                     | 1                     |
| `WW_VERIFY_LEASE_IDLE_MIN`                                     | 15                    | 30                    |
| `WW_VERIFY_WARM` (per platform), `WW_VERIFY_WARM_HOURS`        | 1, 12                 | 2, 12                 |
| `WW_VERIFY_WARM_MIN` (per platform)                            | 0                     | 0                     |
| `WW_VERIFY_KEEP_BUILDS` (cached builds per platform)           | 6                     | 6                     |
| `WW_VERIFY_MEMORY_BUDGET_GB`                                   | all of RAM            | 70% of RAM            |
| `WW_VERIFY_MIN_FREE_PCT`, `WW_VERIFY_MIN_FREE_PCT_BUILD`       | 25, 35                | 25, 35                |
| `WW_VERIFY_SETTLE_SEC`                                         | 60                    | 60                    |
| `WW_VERIFY_EST_{IOS,ANDROID,METRO,IOS_BUILD,ANDROID_BUILD}_GB` | 3.4, 3.2, 0.6, 6, 6.5 | 3.4, 3.2, 0.6, 6, 6.5 |
| `WW_VERIFY_METRO_WORKERS`, `WW_VERIFY_GRADLE_WORKERS`          | 2, 2                  | 2, 2                  |
| `WW_VERIFY_HOME`                                               | `~/.ww-verify`        | `~/.ww-verify`        |

The estimates are measured memory footprints on a 16 GB Mac Mini: a simulator about 3.4 GB and an emulator about 3.2 GB, each plus its worktree's Metro (0.5 to 0.6 GB); an iOS build peaks near 6 GB and an Android build near 6.5 GB. A footprint counts compressed memory at full size, though. Once it settles, an idle simulator running the app costs only about 1 GB of real memory, about 6 points of `kern.memorystatus_level`; booting and launching costs about 12 points for a minute. So a 16 GB machine budgets all 16 GB. That fits two iPhones and two emulators (about 15.6 GB with four Metros), or two devices plus a build, and the live check stops new boots and builds when real memory runs short. A build waits until the devices it needs room from are handed back; that can't deadlock, because a worktree waiting to build holds no device.

The budget covers only devices, Metros and builds. The rest of the 16 GB is spoken for: macOS and the simulator services take about 3.5 GB, T3 about 1 GB, the shared local ww-api about 0.45 GB, each agent CLI about 0.3 GB, and `tsgo` typechecks spike about 1.5 GB each. Keep typechecks of many worktrees from overlapping. The live check adapts to that load. If boots still push the machine into swap, raise `WW_VERIFY_MIN_FREE_PCT` rather than lowering the caps.

**Spotlight.** Spotlight skips hidden folders and folders ending in `.noindex`, so `.verify/` and `~/.ww-verify` are never indexed, and neither is DerivedData; a `.metadata_never_index` file does not stop it on current macOS. Keep worktrees under a hidden folder (such as `~/.t3/worktrees`), or add the worktrees folder in System Settings > Spotlight > Search Privacy, or `mds` indexes every new checkout.

## Cleanup

```bash
wwv down                    # close sessions, release devices (kept warm if the pool has room), stop Metro (and local API)
wwv down --shutdown         # shut the device down instead of keeping it warm
wwv down --keep-device      # keep it warm even past WW_VERIFY_WARM
```

`down` releases this worktree's leases (even if the device is already gone), only stops what this worktree started, and keeps `.verify/artifacts/`. Simulators and AVDs stay installed for reuse. Delete them only to reclaim disk: `xcrun simctl delete <udid>` or `avdmanager delete avd -n ww-verify-N`, plus stale builds in `~/.ww-verify/builds`.

## Recovering

Each of these was hit for real. Use the fix rather than working around it:

- **The splash covers the app after a JS reload.** On Xcode 27 dev builds, any reload (Metro `r`, dev menu Reload, `ad metro reload`) leaves the native splash over a running app. Never reload. Run `wwv up` instead: it is idempotent, relaunches through the dev-client link, waits until the app stops reloading, and hides the splash. If a splash still covers a running app, `wwv eval 'globalThis.expo.modules.ExpoSplashScreen.hide()'` clears it. For JS edits, Fast Refresh is fine.
- **Taps do nothing, but the route and the AXe tree look fine.** The splash can also come back over a running app without a reload. It swallows every tap while the JS and the accessibility tree carry on beneath it, so only a screenshot shows it. `doctor` (`ios:screen`) and an iPad snapshot check for it. Run `wwv up`.
- **A "Refreshing..." banner covers the header.** Metro pushes a hot update whenever a file it watches changes, and until the banner clears it swallows taps along the top of the screen. `.verify/` is excluded, so the banner should only appear while files under `src/` change. Wait for it to clear, then tap again.
- **The snapshot is empty or reports "circuit-disabled".** agent-device turned off its fast iOS accessibility reader for this app process, usually after a slow screen or another app came forward. Run `wwv up` to relaunch. On iPad this is expected, and `wwv ad snapshot` reads through AXe instead (see [iPad](#ipad)).
- **Taps land on the wrong control after `seed`.** Take `wwv ad snapshot -i` first, because refs and geometry go stale when the layout changes.
- **A LogBox banner or RedBox covers the tab bar.** `up` mutes LogBox (errors are still captured). Clear a leftover one with `wwv ad react-native dismiss-overlay`, then read it with `wwv errors`.
- **`nav` crashes a screen.** That screen needs params, for example `wwv nav "Contact Form" '{"edit":false}'`. Check `src/types/rootStack.ts`, or reach it through the UI.
- **Android shows "Location Accuracy" from Google.** This is a one-time consent per emulator, shown outside the app. Press "Turn on" from the screenshot coordinates (`adb -s <serial> shell input tap <x> <y>`). agent-device can't press it.
- **The Android emulator is locked.** The `ww-verify-N` AVDs keep a screen-lock PIN (`1111`; other agents rely on it, so leave it). `up` unlocks them on every run, cold boot included: it unlocks the storage with `locksettings verify`, then enters the PIN on the lock screen, retrying until both take. Don't unlock by hand. If `up` says the emulator rejected the PIN or is still locked, set `WW_VERIFY_ANDROID_PIN` to the AVD's PIN.
- **Android can't reach Metro, or `eval` says no JS runtime.** The harness reapplies `adb reverse` before driving. If it still fails, run `wwv up --platform android`.
- **Android dev builds need `EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY` and `GOOGLE_MAPS_ANDROID_API_KEY`.** They're read from the main checkout's `.env.local`; worktree files layer over it.
- **`up` failed with SimError 405 ("Shutting Down").** `down` now waits until the simulator is Shutdown, and `up` waits out a shutdown and retries the install once. If it still happens, run `wwv down`, then `wwv up`.
- **A manual fingerprint check doesn't match `up`.** `createFingerprintAsync('.')` hashes differently from the absolute path. Pass the absolute repo root, as the harness does: `createFingerprintAsync(process.cwd(), { platforms: ['ios'] })`.
- **`status` shows an `orphaned` build.** Its `up` died mid-build. Run `wwv gc` to kill the build's process group and free the slot; never kill builds by process name.

## Limits

These are not automatable here. Report them as unverified instead of guessing:

- iPad pointer hover; see `docs/ipad-pointer-testing.md`.
- App Attest on a real device.
- Real purchases; use `setSupporter` for supporter UI.
- iCloud sync across devices.
- Google's real account picker and consent screen for Google Drive Sync (needs a Google Account on the device and an OAuth client); sync itself runs against the fake Drive in [`features/cloud-sync.md`](features/cloud-sync.md).
- Widgets, Live Activities and the Watch app beyond screenshots.
- APNs push delivery. Android Buddies alerts (FCM) do work against a local relay that has the FCM key; see [`features/buddies.md`](features/buddies.md).
- Play Integrity.
- Visual taste calls.

For Buddies between two people, bring up a second device with `wwv up --platform android` alongside iOS. Then follow [`features/buddies.md`](features/buddies.md).

## Helpers

- `scripts/verify/ww-verify.mjs` is the CLI above (`wwv help`).
- `scripts/verify/monkey.mjs` is the monkey engine (`wwv monkey`).
- `scripts/verify/flows.mjs` is the flow interpreter (`wwv flow`).
- `scripts/perf/run.mjs` profiles a commit's Release build through the same build slots, leases and install records (see `docs/perf/README.md`). `wwv up` reinstalls the dev client over it.
- `src/app/dev-harness/` holds the dev-only in-app API, scenarios and reset. It is installed from `initializeApp` under `__DEV__` and is absent from release bundles.
- `e2e/maestro/` holds the shared flows.
- Backend: the `verify-ww-api` skill in the ww-api repo (`scripts/verify/dev.mjs`, `pnpm test:e2e`, `pnpm fuzz:buddies`).

Keep this skill honest with `/maintain-verification-skill` when features change.
