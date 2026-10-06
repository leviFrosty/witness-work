---
name: verify-witnesswork
description: Drive the real WitnessWork app on an iOS simulator or Android emulator (plus the local ww-api backend) to prove a change works, with captured evidence and no human in the loop. Use before claiming any UI, navigation, data, deep link, permission, or backend-integration change is done; when asked to verify, QA, smoke test, reproduce a bug, or fuzz the app; or when a task says "test on device/simulator/Android".
---

# Verify WitnessWork

`scripts/verify/ww-verify.mjs` claims a dedicated device, runs an isolated Metro, installs a dev build that matches this tree's native fingerprint, launches the app, and drives it. Inside the app, dev builds expose `globalThis.__WW_DEV__`, which seeds data, flips flags, navigates and reads state back over Hermes CDP. It never touches the user's own simulators, emulators or Metro on 8081. The app does talk to the user's API, though: without `--api local` it uses `.env`'s `EXPO_PUBLIC_API_BASE_URL`, which on a dev machine is usually their ww-api on 8787, so its reads and writes land in their local dev data.

Alias it: `alias wwv="node scripts/verify/ww-verify.mjs"`. All commands run from the worktree root and print JSON or `ok`/`FAIL` lines.

## Launch

```bash
wwv up --platform ios --seed pioneer         # iPhone; add --ipad for an iPad
wwv up --platform android --seed pioneer     # headless emulator, same Metro
wwv up --platform ios --api local            # also start an isolated ww-api
```

What `up` does, in order:

1. Reaps expired leases and orphaned builds.
2. Resolves the native app before it leases anything. It computes the native fingerprint (`@expo/fingerprint`) and uses the matching build in `~/.ww-verify/builds`. Otherwise it waits for a build slot, then builds the dev client without a device: a clean dev prebuild, then `xcodebuild` (newest installed Xcode, DerivedData in `.verify/DerivedData`) or `gradlew :app:assembleDebug`. It caches the result and deletes `.verify/DerivedData` or `android/app/build` (`--keep-build-dirs` keeps them). A worktree waiting to build holds no device: if it held one, `up` hands it back first and leases again after the build.
3. Leases a `WW Verify iPhone N`, `WW Verify iPad N`, or `ww-verify-N` device, queueing if the pool is full (see [Concurrency and resources](#concurrency-and-resources)).
4. Starts Metro on the port reserved with the lease, from 8090 to 8129.
5. Installs the cached build unless the device already runs exactly that binary.
6. Launches the app against this Metro and waits until `__WW_DEV__` answers.

If `up` fails or is interrupted, it hands back the lease it took and stops the Metro it started, then says what to do next.

It's ready when `up` prints its JSON summary. A first build for a new native fingerprint takes 10 to 25 minutes, so run it in the background and keep working. JS-only changes reuse the cached binary and need only Metro.

- `--accept-stale-native` skips the build. Use it only when the diff has no native change (`modules/`, `patches/`, `plugins/`, `targets/`, native deps, `app.config.ts`), and report "native binary unverified".
- `--api local` runs `scripts/verify/dev.mjs up` from `$WW_API_DIR` (default `~/dev/ww-api`), an isolated ww-api, and points the bundle at it through `WW_VERIFY_API_BASE_URL`. Use it whenever the change reads or writes backend data (Buddies, Notes Import, accounts) or when you need isolation. Without it, the app uses `.env`'s `EXPO_PUBLIC_API_BASE_URL` (see `wwv up`'s `api` output), shared with the user and every other worktree.

## Doctor

```bash
wwv doctor            # exit 1 if anything is off
```

Checks: free disk, Metro served from this worktree, API `/health`, the device lease (held by this worktree and not expired), booted, app installed, native fingerprint match (the binary on the device must also hash the same as the cached build `up` installed), JS runtime reachable with zero captured errors, and the bundle calling the run's API (`api-base`). Run it before the first drive, after any surprising result, and before reporting. Don't drive an instance that fails doctor. Fix it, or `wwv down` then `wwv up`.

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

The monkey relaunches the app, seeds, then presses random enabled controls, types hostile text (RTL, emoji, 512 chars, format strings), scrolls, and goes back. It never touches delete, purchase, share, export, iCloud or developer controls. It fails on any captured JS error or an unresponsive app. It also fails as `stuck` when more than 25% of steps had to refocus or relaunch the app instead of acting. The summary reports `actions`, `refocused` and `realActionShare`. Its JSONL log, screenshot and a replay command land in the run's artifacts.

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

## Concurrency and resources

Many worktrees share one Mac. All of them coordinate through `~/.ww-verify`.

- **Iterate without a device.** Use typecheck, lint and vitest while you work. Take a device lease once, for the proof. Use Android only when the change is platform-sensitive.
- **Caps.** At most `WW_VERIFY_MAX_IOS` simulators and `WW_VERIFY_MAX_ANDROID` emulators are leased at once, and the pool never grows past the cap. Only `WW_VERIFY_MAX_BUILDS` native builds run at a time. A worktree waiting for a build slot stops waiting as soon as its fingerprint appears in the cache, and a cached artifact never waits.
- **Builds.** Always the development variant (`com.leviwilkerson.jwtimedev`); the harness refuses to cache or install anything else and never adds PostHog's symbol upload. A build never installs anything; `up` installs the cached artifact after it holds a lease. A failed build's `.verify/DerivedData` or `android/app/build` is deleted too. Android builds run without a Gradle or Kotlin daemon, so nothing stays resident afterwards.
- **Orphaned builds.** A build runs in its own process group, recorded with its slot. If its `up` dies (killed, crashed), the next `up` or `wwv gc` kills that group and deletes its build dirs; `wwv status` shows it as `orphaned` until then.
- **Waiting.** When every device is leased, `up` queues first-come and prints the holders and your place. Builds queue first-come too, and a device request waits behind an earlier build that is only short of memory, so builds aren't starved. `up` gives up after `--wait <minutes>` (default 30). Don't kill another worktree's lease; run `wwv status` (it lists who waits for what, and why) and wait, or work without a device.
- **Idle expiry.** Every command that touches the device refreshes the lease. A lease that is idle for `WW_VERIFY_LEASE_IDLE_MIN`, or whose worktree was deleted, gets reaped by the next `up` or `wwv gc`: the reaper shuts the device down and stops that worktree's Metro. After that, your commands fail with "no longer holds its lease"; run `wwv up` again.
- **Memory budget.** A lease or build waits while the estimated total would exceed `WW_VERIFY_MEMORY_BUDGET_GB`; a request bigger than the whole budget fails at once. Emulators boot with 2 GB and 2 cores, and Metro runs with 2 workers.
- **Always `wwv down` when done**, including after a failed `up`.

```bash
wwv status     # leases, device and build waiters with reasons, builds, Metros, memory (read-only)
wwv gc         # reap expired leases and orphaned builds now
```

Defaults depend on the machine's RAM; env vars always win, and `wwv status` prints the effective policy and where each value came from (`env` or `auto`).

| Variable                                                       | ≤ 16 GB RAM           | Larger machines       |
| -------------------------------------------------------------- | --------------------- | --------------------- |
| `WW_VERIFY_MAX_IOS`, `WW_VERIFY_MAX_ANDROID`                   | 1, 1                  | 2, 2                  |
| `WW_VERIFY_MAX_BUILDS`                                         | 1                     | 1                     |
| `WW_VERIFY_LEASE_IDLE_MIN`                                     | 15                    | 30                    |
| `WW_VERIFY_MEMORY_BUDGET_GB`                                   | 8                     | 70% of RAM            |
| `WW_VERIFY_EST_{IOS,ANDROID,METRO,IOS_BUILD,ANDROID_BUILD}_GB` | 3.4, 3.2, 0.6, 6, 6.5 | 3.4, 3.2, 0.6, 6, 6.5 |
| `WW_VERIFY_METRO_WORKERS`, `WW_VERIFY_GRADLE_WORKERS`          | 2, 2                  | 2, 2                  |
| `WW_VERIFY_HOME`                                               | `~/.ww-verify`        | `~/.ww-verify`        |

The estimates are measured memory footprints on a 16 GB Mac Mini: a simulator about 3.4 GB and an emulator about 3.2 GB, each plus its worktree's Metro (0.5 to 0.6 GB); an iOS build peaks near 6 GB and an Android build near 6.5 GB. The 8 GB budget fits one iPhone and one Android emulator at once (about 7.8 GB with two Metros), or one build on its own. A build waits until the devices it needs room from are handed back; that can't deadlock, because a worktree waiting to build holds no device.

The budget covers only the harness. The rest of the 16 GB is spoken for: macOS and the simulator services take about 3.5 GB, T3 about 1 GB, each agent CLI about 0.3 GB, and `tsgo` typechecks spike about 1.5 GB each. Keep typechecks of many worktrees from overlapping. If you run more than about 15 agents on a 16 GB machine, lower `WW_VERIFY_MEMORY_BUDGET_GB` further (to 7 or 6, which allows one device at a time).

**Spotlight.** Spotlight skips hidden folders and folders ending in `.noindex`, so `.verify/` and `~/.ww-verify` are never indexed, and neither is DerivedData; a `.metadata_never_index` file does not stop it on current macOS. Keep worktrees under a hidden folder (such as `~/.t3/worktrees`), or add the worktrees folder in System Settings > Spotlight > Search Privacy, or `mds` indexes every new checkout.

## Cleanup

```bash
wwv down                    # close sessions, shut down claimed devices, stop Metro (and local API)
wwv down --keep-device      # keep the device booted for a follow-up task
```

`down` releases this worktree's leases (even if the device is already gone), only stops what this worktree started, and keeps `.verify/artifacts/`. Simulators and AVDs stay installed for reuse. Delete them only to reclaim disk: `xcrun simctl delete <udid>` or `avdmanager delete avd -n ww-verify-N`, plus stale builds in `~/.ww-verify/builds`.

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
- **`up` failed with SimError 405 ("Shutting Down").** `down` now waits until the simulator is Shutdown, and `up` waits out a shutdown and retries the install once. If it still happens, run `wwv down`, then `wwv up`.
- **A manual fingerprint check doesn't match `up`.** `createFingerprintAsync('.')` hashes differently from the absolute path. Pass the absolute repo root, as the harness does: `createFingerprintAsync(process.cwd(), { platforms: ['ios'] })`.
- **`status` shows an `orphaned` build.** Its `up` died mid-build. Run `wwv gc` to kill the build's process group and free the slot; never kill builds by process name.

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
