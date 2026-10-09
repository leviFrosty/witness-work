# Release-build profiling

`scripts/perf` measures a commit's **Release** build of the development app (`com.leviwilkerson.jwtimedev`): the JS bundle is embedded as Hermes bytecode, dev mode is off and there is no Metro. It builds, leases devices and installs through the same machinery as [`scripts/verify`](../../.agents/skills/verify-witnesswork/SKILL.md), so it never fights other worktrees for build slots, memory or devices, and it never installs a production or beta app.

Results land here as `<name>.json` (everything, machine-readable) and `<name>.md` (the summary tables). The first baseline is [`baseline-9ec4ab0b.md`](./baseline-9ec4ab0b.md): `perf-foundation` plus this runner, whose app-side code is dead in every bundle built without the probe.

## Run it

```bash
# Both platforms (10 cold launches, 5 foreground cycles, 3 iOS blips each), back to back
export WW_API_DIR=~/dev/ww-api-worktrees/<a checkout of ww-api origin/main>
node scripts/perf/run.mjs --ref <baseline sha> --name before
node scripts/perf/run.mjs --ref <after sha> --name after

# One platform
node scripts/perf/run.mjs --ref <sha> --platform ios --runs 10 --name after-ios

# Before/after table
node scripts/perf/compare.mjs docs/perf/before.json docs/perf/after.json
node scripts/perf/compare.mjs a.json b.json --all --out comparison.md   # every counter, saved
```

`node scripts/perf/run.mjs help` lists every flag. For a fair comparison, run both commits back to back on a quiet machine (`wwv status` shows leases, builds and memory) and compare the `conditions` recorded next to each run.

### Requirements

- **The commit must contain this runner's app-side setup** (`src/app/dev-harness/perfSetup.ts`), so profile commits that include it. The runner refuses others.
- **A ww-api checkout with `scripts/verify/dev.mjs`** (`WW_API_DIR` or `--api-dir`; default `~/dev/ww-api`). The runner starts that isolated worker, or reuses it when it's already up. `--api-url <url>` relays to an API that's already running instead. Nothing touches production or the user's data.
- Port `8780` free (`WW_PERF_API_PORT` changes it, and forces a rebuild).

## What it does

1. **Builds** each platform's Release app from a clean checkout of the commit (`<main checkout>-worktrees/perf-<sha12>`, removed afterwards unless `--keep-source`). It builds with `APP_VARIANT=development`, `EXPO_PUBLIC_PERF_PROBE=1` and `EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:8780`, under a `wwv` build slot. Builds are cached in `~/.ww-verify/perf-builds/` by platform and the commit's app sources: the git tree without `docs/`, `scripts/perf/`, `scripts/tests/` and Markdown, so amending only the runner or a report reuses the build. With the probe, `app.config.ts` turns expo-updates off (no OTA may replace the bundle under test) and allows cleartext HTTP on Android (for the local API). Without it, the resolved config is unchanged, and so is the dev client's native fingerprint. The iOS Release build also compiles with RevenueCat's `BYPASS_SIMULATED_STORE_RELEASE_CHECK`, because the dev variant's Test Store key otherwise makes RevenueCat show an alert and crash a Release build. Android can't opt out (RevenueCat checks that the app isn't debuggable, and a debuggable build would slow ART), so the Android probe build has no RevenueCat key. It takes the app's existing purchases-unavailable path: no `rc:identify`, and none of RevenueCat's native startup work.
2. **Measures bundle sizes** with `expo export --no-bytecode --source-maps`, without the probe (what ships). It compiles the export with the app's `hermesc -O` and counts modules from the source map. It also reads the embedded bytecode size from the probe build itself.
3. **Starts the backend**: the isolated ww-api plus a relay from `127.0.0.1:8780` to it (`adb reverse` on Android), because a Release bundle bakes its API URL in.
4. **Leases a device** (`WW Verify iPhone N`, `ww-verify-N`) through `wwv`'s queue, boots it, and installs the app **fresh** (uninstall first). iOS gets calendar, location, contacts and photo access through `simctl privacy`; Android gets every runtime permission (`adb install -g`).
5. **First launch: setup.** The app seeds the `busy` scenario (160 contacts; `src/app/dev-harness/scenarios.ts`) and turns on the paths the counters cover (`perfSetup.ts`):
   - **Reminders:** notification permission (the runner accepts the iOS alert with agent-device, then stops its XCUITest runner), plus reminders to log time, since the scenario's follow-ups don't notify.
   - **Calendar Sync:** `quickConnectCalendar()`. Android creates a local calendar. iOS needs CloudKit, so on a simulator without an Apple Account it fails, and `calendar:run` only covers the check.
   - **Buddies:** the `buddies` flag forced on (every launch) and an inbox registered with the local relay.
   - **iCloud sync is not covered.** It needs Supporter status and an Apple Account (`ubiquityIdentityToken`), and neither exists on a simulator. Google Drive sync on Android needs a Google sign-in. `sync:catchUp` still counts, but `sync:push` / `sync:pull` stay at 0.

   The app prints a `setup` report with each outcome; the runner records it.

6. **Cold launches** (`--runs`, default 10, plus one discarded warm-up). Each one terminates the app (process state only; data stays), waits `--settle` seconds, records the machine's conditions, launches and waits for the `launch` report, then reads the process's RSS.
7. **Foreground cycles** (`--foreground`, default 5). From the running app, each cycle waits `--dwell` seconds (20 s, so the 30 s Buddies floor and similar throttles don't hide work), sends the app to the background (iOS opens Settings, Android presses HOME), waits `--background` seconds (5), returns, and reads the `foreground` report.
8. **Inactive blips** (iOS, `--blips`, default 3). agent-device pulls Control Center down from the top-right corner, then pushes it back up. That makes the app inactive without backgrounding it, like Control Center, Face ID or a system sheet does for a real user. The runner reads the `active` report. agent-device's XCUITest runner stays up during the blips, so their timing carries its load. Other triggers didn't work from the CLI: the app's own `witnesswork://` link opens without a prompt, `tel:` and `facetime:` links do nothing on a simulator, and Notification Center shows the lock-screen cover sheet, which backgrounds the app. If no report arrives, the result records why instead.
9. **Releases** the device to `wwv`'s warm pool and stops what it started. The install record names the perf build, so the next `wwv up` reinstalls the dev client.

## Where the numbers come from

With `EXPO_PUBLIC_PERF_PROBE=1`, `src/lib/perfProbe.ts` prints `[ww-perf] {json}` with `console.log`. Release builds send that to the device log, where the runner reads it live:

- **iOS:** os_log, subsystem `com.facebook.react.log`, category `javascript`, at info level (`log stream --level info`).
- **Android:** logcat tag `ReactNativeJS`.

os_log truncates messages near 1 KB, so longer reports go out as numbered `[ww-perf~<id>:<i>/<n>]` parts that the runner reassembles.

| Report       | When                                   | Contents                                                                                                                                                                                                                                                   |
| ------------ | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `launch`     | 8 s after the first screen             | `performance.now()` marks (`initializeApp`, `appFirstRender`, `appTreeRender`, `navReady`), RN's `startup` timing, `wallNavReady` (`Date.now()` at the first screen), `blockedMsAfterReady`, every counter since launch, `countersAfterReady`, Hermes heap |
| `foreground` | 8 s after a return from the background | counter deltas, `blockedMs`, heap                                                                                                                                                                                                                          |
| `active`     | 8 s after an inactive → active blip    | counter deltas, `blockedMs`, heap                                                                                                                                                                                                                          |
| `setup`      | once, after the first launch's setup   | scenario and each path's outcome                                                                                                                                                                                                                           |

## Metrics

Times are in ms. The tables show the **median** and **p90** of the measured runs (the warm-up excluded), with p90 interpolated linearly between order statistics. With 10 runs, p90 lies between the 9th and 10th slowest.

| Metric                                                                     | Meaning                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Launch to first screen (end to end)                                        | `wallNavReady − launchWall`. iOS: `launchWall` is the host clock just before `simctl launch`, which the simulator shares, so it includes about 50–150 ms of simctl process overhead. Android: it's the device-clock timestamp of the system's `START u0` log line for the app, so it's on the same clock as the app.                                                                                                                                                    |
| Launch to bundle start (native, before JS)                                 | End to end minus bundle start → first screen: process launch, native init and loading the bytecode, until the bundle's first line runs. React Native 0.86's own `startup.startTime` marks runtime init, which is the same moment as bundle start, so it can't show this part.                                                                                                                                                                                           |
| Bundle start to first screen                                               | JS time from the bundle's first line to `NavigationContainer.onReady`.                                                                                                                                                                                                                                                                                                                                                                                                  |
| Bundle start → initializeApp → App render → tree render → navigation ready | The same JS time split at the app's marks.                                                                                                                                                                                                                                                                                                                                                                                                                              |
| JS blocked in 8 s after first screen                                       | `blockedMsAfterReady`: the sum of each 16 ms timer tick's lateness past 50 ms (like Total Blocking Time). Work that janks the first seconds on screen.                                                                                                                                                                                                                                                                                                                  |
| Network requests by 8 s after first screen                                 | `net:total`: every XHR/fetch since launch. Endpoints are listed under the launch counters as `net:<host>/<path>`. Native SDK traffic (RevenueCat, PostHog's native side, CloudKit) isn't seen.                                                                                                                                                                                                                                                                          |
| JS heap after launch                                                       | Hermes `js_heapSize` at the `launch` report.                                                                                                                                                                                                                                                                                                                                                                                                                            |
| RSS after launch                                                           | iOS: the simulator process's RSS (`ps`, host memory). Android: `TOTAL RSS` from `dumpsys meminfo`. Both are read just after the `launch` report.                                                                                                                                                                                                                                                                                                                        |
| Android TotalTime                                                          | `am start -W`'s TotalTime: the system's launch-to-first-frame, which is the native splash, not the first JS screen.                                                                                                                                                                                                                                                                                                                                                     |
| iOS simctl launch command                                                  | How long `simctl launch` took to return, the share of iOS end to end spent in the launch tool rather than the app.                                                                                                                                                                                                                                                                                                                                                      |
| Counters                                                                   | `perf.count` sites (`sync:*`, `reminders:*`, `widget:*`, `watch:push`, `calendar:run`, `flags:reload`, `buddies:sync`, `prefs:set`, `account:reconcile`, `rc:identify`, `render:*`, `http:request`). Launch tables show each counter's median per launch, and foreground/active tables its median delta per cycle. Several count before their gate, for example `calendar:run`, `widget:push` and `watch:push`, so a count means "checked", not necessarily "did work". |
| Bundle                                                                     | Minified JS bytes, its Hermes bytecode bytes (`hermesc -O`), the probe build's embedded bytecode, and the module count.                                                                                                                                                                                                                                                                                                                                                 |

Every run records `conditions`: the 1- and 5-minute load averages, `kern.memorystatus_level` (percent of memory free), other worktrees' leased devices and running builds. The summary prints their median, so a noisy baseline is visible.

## Limits

- Simulators and emulators share the Mac's CPU, so absolute times are not device times. Compare runs on the same machine, ideally back to back and quiet.
- iCloud sync, iOS Calendar Sync publishing, APNs/FCM pushes, widgets' and the watch's far side, and RevenueCat's native network aren't exercised (see step 5).
- iOS launch time includes simctl overhead (see the metric table); Android's doesn't.
- Android has no inactive state, so it has no blip cycles.
