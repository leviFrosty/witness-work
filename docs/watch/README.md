# Watch apps and their parity

WitnessWork has two watch apps that do the same things:

- **Apple Watch** (iPhone): `targets/watch`, complications in
  `targets/watch-widgets`, Siri in `targets/watch/Shared` (from
  `targets/intents`), and the iPhone side in `modules/watch-bridge/ios`.
- **Wear OS** (Android phone): `targets/wear-os`, a Gradle module of the Android
  project ([docs/build.md](../build.md#wear-os)), and the phone side in
  `modules/watch-bridge/android` and `modules/stopwatch-bridge/android`.

Both get the same data from the phone's JavaScript (`src/app/watch`), and
neither keeps records of its own: the phone is the source of truth.

## The feature registry

[`features.json`](./features.json) lists every user-visible feature and
behavior of the watch apps, with a stable id, a description, and for each watch
(`watchos`, `wearos`) its status, the files that implement it, and notes.

| Status           | Meaning                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------- |
| `implemented`    | Works the same way, apart from platform conventions. Needs `paths`.                         |
| `partial`        | The closest equivalent the platform allows. Needs `paths`, and `notes` saying what differs. |
| `gap`            | Missing on this watch. Needs `notes` saying why.                                            |
| `not-applicable` | The platform has no such surface. Needs `notes` naming what covers it instead.              |

A path may end in `#text`, a type, function or key the file must still contain,
so a rename shows up in the check. `shared` lists the phone-side code both
watches use.

**When you change either watch app, update the registry in the same change:**
add or edit the feature, and keep the other watch's entry honest. A change
that only one watch gets is a parity gap; say so in its notes.

```bash
pnpm check:watch-parity      # also in pre-commit, and as a vitest in CI
```

The check (`scripts/check-watch-parity.mjs`) fails when a feature lacks either
watch, an implemented or partial feature has no paths, anything short of
implemented has no notes, a referenced file or `#text` is gone, or a source
file of either watch app (or `src/app/watch`) belongs to no feature (list
build glue under `infrastructure`).

## How the platforms map

| Apple Watch                                                     | Wear OS                                                                                                                                                                   |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SwiftUI views                                                   | Compose for Wear OS (Material 3)                                                                                                                                          |
| WidgetKit complications (circular, corner, rectangular, inline) | Complication data sources (RANGED_VALUE, SHORT_TEXT, LONG_TEXT), with timelines                                                                                           |
| Smart Stack                                                     | The Monthly Progress tile                                                                                                                                                 |
| The iPhone's timer Live Activity in the Smart Stack             | An Ongoing Activity with Pause and Stop                                                                                                                                   |
| Siri and Shortcuts                                              | No equivalent for other apps: the tile's buttons and the Ongoing Activity's actions cover the timer and Add Time; trips can't be logged (see the registry's `shortcut.*`) |
| WatchConnectivity application context                           | A Data Layer data item (`/witnesswork/context`)                                                                                                                           |
| `sendMessage` with a reply                                      | `MessageClient.sendRequest` (`/witnesswork/request`)                                                                                                                      |
| `transferUserInfo`                                              | A data item per request (`/witnesswork/queued/<id>`), deleted once handled                                                                                                |
| Background refresh tasks                                        | `WearableListenerService` on both sides                                                                                                                                   |
| Luminance reduced (wrist down)                                  | Ambient mode                                                                                                                                                              |
| App Group container                                             | The app's files directory (complications and tile run in the app)                                                                                                         |
| String catalogs from `src/locales`                              | String resources from `src/locales`, same keys                                                                                                                            |

Messages are the same JSON on both platforms (`WatchProtocol.swift`,
`WatchProtocol.kt`). `src/__tests__/watchProtocolContract.test.ts` checks the
snapshot JavaScript builds against a fixture that the Kotlin tests on both sides
of the Wear OS connection decode. Wear OS adds two request origins, `tile` and
`ongoing_activity`, which only the Android phone receives.

Strings that name the phone have an `…Android` variant ("phone" for "iPhone"),
listed under `androidVariants` in `src/app/watch/watchStringKeys.json`;
`wearStrings` are the few only the Wear OS app shows. The phone sends the right
ones for its platform, and `pnpm sync:widget-shared` builds the Wear OS app's
bundled resources from them.

## Seeding sample data

Both watch apps keep the phone's last message in `phone-context.json`, so the
same sample data can be shown on either watch without a paired phone, for
screenshots and side-by-side checks. `scripts/watch-fixture.mjs` prints one,
with times relative to now:

```bash
node scripts/watch-fixture.mjs pioneer [--running] [--platform android]
node scripts/watch-fixture.mjs publisher [--reported]
```

- **Wear OS** (debug build): write it into the app's files and relaunch.

  ```bash
  node scripts/watch-fixture.mjs pioneer --platform android > /tmp/context.json
  adb shell am force-stop com.leviwilkerson.jwtimedev
  adb shell "run-as com.leviwilkerson.jwtimedev sh -c 'cat > files/phone-context.json'" < /tmp/context.json
  adb shell am start -n com.leviwilkerson.jwtimedev/com.leviwilkerson.witnesswork.wear.MainActivity
  ```

- **Apple Watch** (simulator): write it into the watch app's App Group
  container (`xcrun simctl get_app_container <watch> com.leviwilkerson.jwtimedev.watchkitapp groups`),
  then relaunch the watch app.

## Known differences

The registry is the full list; in short:

- **Voice.** Wear OS has no voice actions for other apps, so there's no
  "Add time in WitnessWork". The tile (Add Time, start/pause) and the running
  timer's notification (Pause, Stop) are the closest. Logging a mileage trip,
  which the Apple Watch only does through Siri, isn't available on Wear OS.
- **Names on the watch face.** watchOS hides Contacts' names in the Up Next
  complication only while the wrist is down. Wear OS can't change a
  complication for ambient mode, so it always shows "Follow Up" there.
- **Saving promptly.** A watch request wakes the iPhone app, which saves the
  entry at once. Android delivers it to the phone app's process (timer and
  inbox are handled natively), but the entry is saved the next time
  WitnessWork opens on the phone; until then the watch shows Syncing with phone.
