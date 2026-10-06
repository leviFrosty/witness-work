# iOS simulator testing

How to run a change on an iOS simulator, collect evidence, and test iPad-only
input such as pointer hover. For first-time setup, see [`build.md`](./build.md).
For Android, see [`android-emulator-testing.md`](./android-emulator-testing.md).

For automated verification, use the
[`verify-witnesswork`](../.agents/skills/verify-witnesswork/SKILL.md) skill
(`node scripts/verify/ww-verify.mjs up`). It claims a dedicated simulator or
emulator, runs its own Metro, installs a build that matches the native
fingerprint, and seeds state over CDP. The manual steps below are its
underpinnings and the fallback.

Most changes need checking on both an iPhone and an iPad simulator. iPad
layouts differ: a sidebar from 1,000 pt wide, split views, the menu bar, and
pointer input.

## Find a simulator

```bash
xcrun simctl list devices booted       # booted simulators and their UDIDs
xcrun simctl boot <UDID>               # boot one if none is running
```

Use the UDID in the commands below, not the device name. Names repeat across
runtimes.

## Build only when native code changes

A JavaScript-only change needs nothing more than Metro. Rebuild when the change
touches anything native:

- `modules/**`
- `patches/**` that patch native code
- `plugins/**`
- native dependencies
- `app.config.ts` native settings

```bash
pnpm run ios --device <UDID> --no-bundler
```

- Run it through `pnpm run`. Calling `scripts/with-local-env.mjs` directly fails
  with `spawnSync expo ENOENT`, because `expo` isn't on the `PATH` outside pnpm.
- To regenerate `ios/` from scratch, run `APP_VARIANT=development pnpm run prebuild`.
  The `prebuild` script doesn't go through `with-local-env.mjs`, so without
  `APP_VARIANT` it generates the production app.
- On a headless machine (no Simulator window), `pnpm run ios` can end with
  "Simulator app did not open fast enough". The app is already built and
  installed by then, so ignore it.
- The first build takes a long time; incremental builds are much faster. Run it
  in the background and log to a file.
- The built app lands in
  `~/Library/Developer/Xcode/DerivedData/WitnessWorkDev-*/Build/Products/Debug-iphonesimulator/WitnessWorkDev.app`.
  One simulator build works on both iPhone and iPad, so install it on the other
  simulator instead of building twice:

  ```bash
  xcrun simctl install <UDID> <path-to>/WitnessWorkDev.app
  ```

- After changing a pnpm patch, run `pnpm install` so `node_modules` picks it
  up, then rebuild. `pnpm install` and `pnpm patch-commit` rewrite
  `pnpm-lock.yaml` in pnpm's own style. Run `npx prettier --write pnpm-lock.yaml`
  so the diff stays small.
- Check free disk space first (`df -h /System/Volumes/Data`). Builds and
  DerivedData need several GB, and tests fail with "no space left on device"
  when the disk is nearly full.

## Run Metro and open the app

```bash
pnpm exec node scripts/with-local-env.mjs development ios -- expo start --dev-client
xcrun simctl openurl <UDID> "exp+jw-time://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081"
```

Run only one Metro. If port 8081 is already taken, reuse that server.
`curl -s localhost:8081/status` prints `packager-status:running` when it's up.

- Don't start Metro with `--localhost`. It binds only `[::1]`, the app connects
  to `127.0.0.1`, and you get "Could not connect to development server".
- `simctl openurl` shows an "Open in WitnessWork Dev?" system prompt, which
  nothing can tap on a headless machine. Launch straight into the bundle instead:

  ```bash
  xcrun simctl launch --terminate-running-process <UDID> com.leviwilkerson.jwtimedev --initialUrl http://127.0.0.1:8081
  ```

- The first launch on a simulator covers the app with the Expo dev-menu intro
  sheet. Skip it once per simulator:

  ```bash
  xcrun simctl spawn <UDID> defaults write com.leviwilkerson.jwtimedev EXDevMenuIsOnboardingFinished -bool YES
  ```

- Metro's log contains control characters, so plain `grep` can miss matches.
  Use `grep -a`.

Saved files fast-refresh. A syntax error in a half-edited file shows up in the
Metro log and on screen; fix it before judging any results.

## Collect evidence

```bash
xcrun simctl io <UDID> screenshot /tmp/<name>.png
xcrun simctl ui <UDID> appearance dark   # or light
```

iPad screenshots are about 2,400 px wide. Shrink them before reading them
(`sips -Z 1400 <file>`). Check both light and dark appearance for any new
surface.

Watch the Metro output for red boxes, warnings, and errors such as
"GestureDetector must be used as a descendant of GestureHandlerRootView". A
screenshot alone doesn't prove an interaction worked. Compare the screens
before and after the action.

## Interact with the simulator

- **`ww-verify ad <args>`:** the same `agent-device` CLI, bound to the
  verification run's device and session. Its interactive snapshots see React
  Native views on iOS 27; Maestro 2.4's iOS driver and agent-device's replay
  runner only see the window and status bar, so `ww-verify flow` interprets
  Maestro-style YAML through the session instead.
- **Don't reload JS on Xcode 27 dev builds.** A reload leaves the native
  splash over the running app. Cold-launch through the dev-client link
  (`ww-verify up`) instead.
- **T3 Code Device panel:** use `device_open`, then the `agent-device` CLI it
  returns. This is the preferred way to tap, type, and read accessibility
  snapshots. It can fail to list iOS simulators (`simctl list` errors inside
  it). If so, report that rather than working around it silently.
- **DeviceHub** (`/Applications/Xcode.app/Contents/Applications/DeviceHub.app`)
  replaces Simulator.app in current Xcode. Driving its window from a script
  needs macOS Screen Recording and Accessibility permission for the calling
  app. Without them, `screencapture` fails with "could not create image from
  display" and AppleScript times out. Ask the user to grant them rather than
  retrying.
- `idb ui tap` didn't deliver touches with Xcode 27 simulators. Don't take a
  screen that ignores `idb` input as a sign the app is broken.

## iPad pointer and Pencil hover

Hover needs a real pointer. Neither `xcrun simctl` nor XCTest can produce
hover events on iOS; XCTest's `hover()` is macOS-only. To test hover:

1. Open the iPad simulator in DeviceHub.
2. Turn on pointer capture so the Mac trackpad or mouse drives the iPad
   pointer. In Simulator.app this was I/O → Input → Send Pointer to Device;
   DeviceHub should have the equivalent.
3. Check the behaviour described in the `agents.md` pointer section: effects
   on buttons and rows, tooltips on icon-only controls, chart readouts, map pin
   names, and the resize arrows on the sidebar grip.

If you can't get pointer input, say hover is untested. Don't infer results
from code or unit tests.

## Before reporting

- List what you checked and on which simulators.
- Say what you couldn't verify and why: no pointer, missing permissions,
  missing data such as contacts with addresses for the map.
- Run the regular checks too: `pnpm run typecheck`, `pnpm run lint`, and
  `pnpm vitest run`. Add `--maxWorkers=2` when disk or memory is tight.
