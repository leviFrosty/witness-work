---
name: verify-witnesswork
description: Drive the real WitnessWork app on an iOS simulator or Android emulator (plus the local ww-api backend) to prove a change works, with captured evidence and no human in the loop. Use before claiming any UI, navigation, data, deep link, permission, or backend-integration change is done; when asked to verify, QA, smoke test, reproduce a bug, or fuzz the app; or when a task says "test on device/simulator/Android".
---

# Verify WitnessWork

`scripts/verify/ww-verify.mjs` claims a dedicated device, runs an isolated Metro, installs a dev build that matches this tree's native fingerprint, launches the app, and drives it. Inside the app, dev builds expose `globalThis.__WW_DEV__`, which seeds data, flips flags, navigates and reads state back over Hermes CDP. Nothing here touches the user's own simulators, emulators, Metro on 8081, or ww-api on 8787.

Alias it: `alias wwv="node scripts/verify/ww-verify.mjs"`. All commands run from the worktree root and print JSON or `ok`/`FAIL` lines.

## Launch

```bash
wwv up --platform ios --seed pioneer         # iPhone; add --ipad for an iPad
wwv up --platform android --seed pioneer     # headless emulator, same Metro
wwv up --platform ios --api local            # also start an isolated ww-api
```

What `up` does: it claims a `WW Verify iPhone N`, `WW Verify iPad N`, or `ww-verify-N` device and locks it to this worktree (locks live in `~/.ww-verify/locks`). It starts Metro on the first free port from 8090 to 8099. It computes the native fingerprint (`@expo/fingerprint`) and installs a cached build from `~/.ww-verify/builds` if one matches. Otherwise it builds the dev client with the newest installed Xcode or Gradle. Then it launches the app against this Metro and waits until `__WW_DEV__` answers.

It's ready when `up` prints its JSON summary. A first build for a new native fingerprint takes 10 to 25 minutes, so run it in the background and keep working. JS-only changes reuse the cached binary and need only Metro.

- `--accept-stale-native` skips the build. Use it only when the diff has no native change (`modules/`, `patches/`, `plugins/`, `targets/`, native deps, `app.config.ts`), and report "native binary unverified".
- `--api local` runs `scripts/verify/dev.mjs up` from `$WW_API_DIR` (default `~/dev/ww-api`) and points the bundle at it through `WW_VERIFY_API_BASE_URL`. Without it, the app uses `.env`'s `EXPO_PUBLIC_API_BASE_URL`.

## Doctor

```bash
wwv doctor            # exit 1 if anything is off
```

Checks: free disk, Metro served from this worktree, API `/health`, device lock owner, booted, app installed, native fingerprint match, JS runtime reachable with zero captured errors, and the bundle calling the run's API (`api-base`). Run it before the first drive, after any surprising result, and before reporting. Don't drive an instance that fails doctor. Fix it, or `wwv down` then `wwv up`.

## Drive

**State.** Never tap through onboarding or hand-enter fixture data.

```bash
wwv seed pioneer            # fresh | onboarded | publisher | pioneer | busy
wwv flag buddies on         # buddies | notes-import; on | off | clear
wwv eval '__WW_DEV__.setSupporter(true)'
wwv nav "Contact Details" '{"id":"verify-contact-0"}'
wwv link 'witnesswork://add-time'   # real deep-link path; accepts the iOS "Open in" prompt
wwv eval '__WW_DEV__.state()'       # route, counts, role, captured error count
wwv eval '__WW_DEV__.stores.preferences.getState().timeDisplayFormat'
```

Scenarios are built relative to today (`src/app/dev-harness/scenarios.ts`).

- `fresh`: a fresh install on onboarding.
- `onboarded`: a publisher with no data.
- `publisher`: a checkbox-mode publisher with 4 contacts and 3 months shared.
- `pioneer`: a regular pioneer with service-year hours, an LDC credit entry, 8 contacts (3 Bible studies, one overdue and one upcoming follow-up), and 3 upcoming plans.
- `busy`: `pioneer` with 160 contacts, for list and map performance.
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
- Labels are en-US i18n strings (`src/locales/en-US.json`). Tabs are "Home", "Schedule", "Contacts", "Progress". The center "+" is "Quick Action".
- `wwv ad help workflow` has the full reference.

**Scripted flows.** Maestro-style YAML in `e2e/maestro/` runs on both platforms:

```bash
wwv flow                                 # every flow in e2e/maestro
wwv flow e2e/maestro/add-contact.yaml --platform android
```

- `scripts/verify/flows.mjs` interprets a Maestro subset through this run's agent-device session: `tapOn`, `assertVisible`, `assertNotVisible`, `extendedWaitUntil`, `inputText`, `hideKeyboard`, `back`, `scroll`, `scrollUntilVisible`, `waitForAnimationToEnd`. It doesn't use the Maestro CLI, because Maestro 2.4's iOS driver (and agent-device's own replay runner) can't see React Native views on iOS 27 simulators.
- Use `traits: button` to target the control rather than its label. `text: [A, B]` tries each label, for accessible names that differ by platform; Android often uses the placeholder, or appends the value ("Hours, 0").
- `# seed: <scenario>` seeds before the flow. `# assert: <js>` lines must evaluate to `true` in the app afterwards, which is the read-back.
- A flow fails on a failed step, a captured JS error, or a false assert. A screenshot of the failure lands in the artifacts.
- Add a flow for any user path you change that a later agent should re-prove.

**Feature map.** [`features/README.md`](features/README.md) lists every mapped feature, with its entry points, drive recipe and proof. Read the matching file before verifying a feature. A proof that drives only one convenient entry point is incomplete when the map lists others.

## Fuzz

```bash
wwv monkey --steps 150 --seed 4242 --scenario pioneer   # seeded random walk
pnpm vitest run src/__tests__/fuzz.parsers.test.ts      # property-based parsers
```

The monkey presses random enabled controls, types hostile text (RTL, emoji, 512 chars, format strings), scrolls, and goes back. It never touches delete, purchase, share, export, iCloud or developer controls. It fails on any captured JS error or an unresponsive app. Its JSONL log, screenshot and a replay command land in the run's artifacts.

On a failure, rerun with the same seed to confirm. Then minimize by lowering `--steps` until it stops reproducing, and turn the path into a Maestro flow or a unit test before fixing. Property tests print a seed; rerun with `FC_SEED=<seed>`.

## Evidence

Everything lands in `.verify/artifacts/<run-id>/`, which is gitignored and survives `down`:

```bash
wwv shot add-time-saved            # PNG, resized to 1400 px
wwv errors                         # captured JS errors; exit 1 if any
wwv ad record start / wwv ad record stop   # video for motion and animation claims
```

Proof standards:

- Drive the real user path. `seed`, `nav` and `flag` set up state; they are never the proof of the feature under test.
- Capture the action and the resulting state: a settled diff or `wait text`, plus a screenshot. A screenshot alone isn't proof of an interaction.
- Read side effects back. After a save, `wwv eval` the store (for example `__WW_DEV__.stores.contacts.getState().contacts.find(c => c.name === "X")`), or reopen the record from a second screen.
- `wwv errors` must be empty at the end. The Metro log (`.verify/metro.log`) shows warnings and red boxes.
- Check both platforms for anything touching layout, native APIs, maps, notifications, purchases or permissions. iPad-specific layouts need `--ipad`.
- Report what you verified, on which devices, the artifact paths, and what you couldn't verify and why.

## Cleanup

```bash
wwv down                    # close sessions, shut down claimed devices, stop Metro (and local API)
wwv down --keep-device      # keep the device booted for a follow-up task
```

`down` only stops what this worktree started and keeps `.verify/artifacts/`. Simulators and AVDs stay installed for reuse. Delete them only to reclaim disk: `xcrun simctl delete <udid>` or `avdmanager delete avd -n ww-verify-N`, plus stale builds in `~/.ww-verify/builds`.

## Recovering

Each of these was hit for real. Use the fix rather than working around it:

- **The splash covers the app after a JS reload.** On Xcode 27 dev builds, any reload (Metro `r`, dev menu Reload, `ad metro reload`) leaves the native splash over a running app. Never reload. Run `wwv up` instead: it is idempotent and cold-relaunches through the dev-client link. For JS edits, Fast Refresh is fine.
- **The snapshot is empty or reports "circuit-disabled".** agent-device turned off its fast iOS accessibility reader for this app process, usually after a slow screen or another app came forward. Run `wwv up` to relaunch.
- **Taps land on the wrong control after `seed`.** Take `wwv ad snapshot -i` first, because refs and geometry go stale when the layout changes.
- **A LogBox banner or RedBox covers the tab bar.** `up` mutes LogBox (errors are still captured). Clear a leftover one with `wwv ad react-native dismiss-overlay`, then read it with `wwv errors`.
- **`nav` crashes a screen.** That screen needs params, for example `wwv nav "Contact Form" '{"edit":false}'`. Check `src/types/rootStack.ts`, or reach it through the UI.
- **Android shows "Location Accuracy" from Google.** This is a one-time consent per emulator, shown outside the app. Press "Turn on" from the screenshot coordinates (`adb -s <serial> shell input tap <x> <y>`). agent-device can't press it.
- **Android can't reach Metro, or `eval` says no JS runtime.** The harness reapplies `adb reverse` before driving. If it still fails, run `wwv up --platform android`.
- **Android dev builds need `EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY` and `GOOGLE_MAPS_ANDROID_API_KEY`.** They're read from the main checkout's `.env.local`; worktree files layer over it.

## Limits

These are not automatable here. Report them as unverified instead of guessing:

- iPad pointer hover; see `docs/ios-simulator-testing.md`.
- App Attest on a real device.
- Real purchases; use `setSupporter` for supporter UI.
- iCloud sync across devices.
- Widgets, Live Activities and the Watch app beyond screenshots.
- Push delivery.
- Play Integrity.
- Visual taste calls.

For Buddies between two people, bring up a second device with `wwv up --platform android` alongside iOS. Then follow [`features/buddies.md`](features/buddies.md).

## Helpers

- `scripts/verify/ww-verify.mjs` is the CLI above (`wwv help`).
- `scripts/verify/monkey.mjs` is the monkey engine (`wwv monkey`).
- `scripts/verify/flows.mjs` is the flow interpreter (`wwv flow`).
- `src/app/dev-harness/` holds the dev-only in-app API, scenarios and reset. It is installed from `initializeApp` under `__DEV__` and is absent from release bundles.
- `e2e/maestro/` holds the shared flows.
- Backend: the `verify-ww-api` skill in the ww-api repo (`scripts/verify/dev.mjs`, `pnpm test:e2e`, `pnpm fuzz:buddies`).

Keep this skill honest with `/maintain-verification-skill` when features change.
