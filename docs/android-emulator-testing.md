# Android emulator testing

How to run a change on an Android emulator and collect evidence, including on a
headless machine with no Android Studio window. For SDK, JDK 17, and key setup,
see [`build.md`](./build.md#android-development). For iOS, see
[`ios-simulator-testing.md`](./ios-simulator-testing.md).

The local Android commands need `GOOGLE_MAPS_ANDROID_API_KEY` and
`EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY` in `.env`. Without them they refuse to
build. `pnpm run check:env:android` reports what's missing.

## Find or boot an emulator

```bash
adb devices                      # running emulators
emulator -list-avds              # available AVDs
emulator -avd <AVD> -no-window -no-audio -no-boot-anim -no-snapshot-save -no-metrics >/tmp/emu.log 2>&1 &
adb wait-for-device
until [ "$(adb shell getprop sys.boot_completed | tr -d '\r')" = 1 ]; do sleep 2; done
```

Drop `-no-window` when you want to watch the emulator. Headless emulators
render with software graphics, which is fine for screenshots.

## Build only when native code changes

The same native triggers as iOS apply (`modules/**`, native `patches/**`,
`plugins/**`, native dependencies, `app.config.ts`). Rebuild with:

```bash
pnpm run android --no-bundler
```

- It picks the running emulator and builds only that device's ABI. A cold build
  takes several minutes; incremental builds take seconds.
- To build with Gradle directly, pass the ABI, or Gradle builds all four:
  `cd android && ./gradlew assembleDebug -PreactNativeArchitectures=arm64-v8a`,
  then `adb install -r android/app/build/outputs/apk/debug/app-debug.apk`.

## Run Metro and open the app

```bash
pnpm exec node scripts/with-local-env.mjs development android -- expo start --dev-client
adb reverse tcp:8081 tcp:8081
adb shell am start -a android.intent.action.VIEW \
  -d "exp+jw-time://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081" \
  com.leviwilkerson.jwtimedev
```

- Run only one Metro, and don't start it with `--localhost` (see the iOS doc).
- The first launch covers the app with the Expo dev-menu intro sheet. Tap
  Continue, then close the menu.
- If the emulator drops to `offline` or adb restarts mid-session, the
  `adb reverse` rule is gone and the app sits on "Reloading…". Run
  `adb reverse tcp:8081 tcp:8081` again.

## Collect evidence

```bash
adb exec-out screencap -p > /tmp/<name>.png
adb shell "cmd uimode night yes"   # or no
```

Watch the Metro output for red boxes and errors, as on iOS. Remember the
features that stay hidden on Android (see `agents.md`) and check they don't show
a broken entry point.

## Clean up

```bash
adb emu kill
(cd android && ./gradlew --stop)
```

Leave `android/` in place for incremental builds unless you're done with it.
