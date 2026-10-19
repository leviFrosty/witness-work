# iOS Widgets

iOS-only. One widget extension (`targets/widgets/`) hosts a `WidgetBundle` (`WidgetsBundle.swift`) with five widgets and the timer's Live Activity:

- **ReportWidget** — this month's service hours toward the goal. Small + medium, plus the lock screen's circular and rectangular families. Publishers (checkbox entry mode) get a state-machine version: an unreported checkbox CTA, a "reported today" card, or a running conversations/studies summary depending on where they are in the month.
- **CalendarWidget** — the month calendar, with the same day colors, plans, notes and buddy badges as the Schedule tab. Medium shows the current week, large the whole month. Locked for publishers who don't log hours. Day cells open that day's sheet; "+" opens Plan Day.
- **AppointmentsWidget** — upcoming follow-ups within a configurable window. Medium + large. Overdue follow-ups always surface in red regardless of the window and deep-link to the in-app Reschedule sheet on tap.
- **ContactsWidget** — top contacts ordered by user sort with favorites and bible studies tiered to the top. Small + medium + large. Each row shows a staleness color dot, the contact name, and a single configurable quick action (directions / call / text / none).
- **PetWidget** — the Pet Companion (`docs/pet-companion.md`). Small + medium + large. See [Pet widget](#pet-widget).
- **StopwatchLiveActivity** — the service timer on the lock screen and in the Dynamic Island (iOS 16.2+), driven by `modules/stopwatch-bridge`, not the snapshot.

Widget configuration (sort, quick action, time window) lives in **Settings > Widgets** in the app — it is the single source of truth and gets pushed into the snapshot's `config` block. Widgets use `StaticConfiguration`; there is no long-press "Edit Widget" UI.

## Architecture

```
zustand stores (MMKV) ──▶ buildWidgetSnapshot() ──▶ snapshot.json (App Group) ──▶ Swift TimelineProvider
                                  ▲
      store.subscribe() / addForegroundListener / BGTaskScheduler
                                  │
                            WidgetBridge.writeSnapshot()
                            WidgetBridge.reloadAllTimelines()
```

MMKV's binary format isn't readable from Swift, so JS computes a small derived **snapshot** and writes it as JSON into an App Group container the widget can read. The widget never knows about MMKV, zustand, moment, or i18n.

## Key files

| File                                                                             | Purpose                                                                                                                               |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/widgets/snapshot.ts`                                                    | Snapshot schema + `buildWidgetSnapshot()`. Single source of truth for the JSON shape. Bump `SNAPSHOT_VERSION` on breaking changes.    |
| `src/app/widgets/buildReport.ts`                                                 | Builds the `report` slice. This month's minutes, goal and pace, publisher state machine, conversation+study counts.                   |
| `src/app/widgets/buildContacts.ts`                                               | Builds `contacts[]`. Applies user sort (`config.contactSort`) with favorites/studies tiering, computes staleness, formats URLs.       |
| `src/app/widgets/buildAppointments.ts`                                           | Builds `appointments[]` from follow-ups within 30d back through 31d forward. Pre-formats `timeFormatted`, flags `isOverdue`.          |
| `src/app/widgets/buildCalendar.ts`                                               | Builds the `calendar` slice: the 6-week grid with day statuses, plans, notes and buddy badges. Locked for publishers.                 |
| `src/app/widgets/petWidget.ts`                                                   | `PetWidgetSnapshot` type, `planPetWidget()` / `renderPetWidget()`, the `pet` slice. See [Pet widget](#pet-widget).                    |
| `src/app/widgets/widgetSync.ts`                                                  | `installWidgetSync()` — subscribes to the store slices the snapshot reads, foreground returns, and registers the background task.     |
| `src/features/contacts/lib/linking.ts`                                           | React Navigation linking config, including the widget URL contract.                                                                   |
| `src/lib/contactStaleness.ts`                                                    | `getContactStaleness()` + `stalenessToColor()` — shared between in-app pin colors and the contacts widget dot.                        |
| `src/features/visits/screens/RescheduleVisitScreen.tsx`                          | Modal sheet for overdue follow-ups, reachable from `witnesswork://reschedule/:contactId/:visitId`.                                    |
| `src/features/settings/screens/preferences/screens/PreferencesWidgetsScreen.tsx` | Settings > Widgets — single source of truth for sort, action, and window. Pushes into snapshot config.                                |
| `src/features/contacts/components/SharedGoodNewsListener.tsx`                    | Reacts to the `shared-good-news` deep link by adding a 0h0m report and playing confetti.                                              |
| `modules/widget-bridge/`                                                         | Local Expo module exposing `writeSnapshot`, `writeFile`, `pruneFiles`, `reloadAllTimelines`, `getAppGroupIdentifier` to JS. iOS-only. |
| `targets/widgets/Snapshot.swift`                                                 | Swift mirror of the TS `WidgetSnapshot` schema. Bump `SUPPORTED_VERSION` in lockstep with the TS `SNAPSHOT_VERSION`.                  |
| `targets/widgets/SnapshotLoader.swift`                                           | Reads `snapshot.json` from the App Group container. App Group resolved from the widget's bundle id.                                   |
| `targets/widgets/Theme.swift`                                                    | Widget-only spacing scale + app-matched colors (accent green, warn, error, staleness palette). Tighter than the in-app theme.         |
| `targets/widgets/WidgetURLs.swift`                                               | Centralized factory for widget → app deep link URLs. Mirrors the route table in `src/lib/linking.ts`.                                 |
| `targets/widgets/WidgetsBundle.swift`                                            | `@main WidgetBundle` referencing every widget and the Live Activity.                                                                  |
| `targets/widgets/ReportWidget.swift`                                             | Service-report card (always this month) plus a publisher state machine and the lock screen views.                                     |
| `targets/widgets/CalendarWidget.swift`                                           | Month calendar (medium: current week, large: month), with buddy badges. Locked placeholder for publishers.                            |
| `targets/widgets/ContactsWidget.swift`                                           | Top-N contact list. Reads sort + quick action from `snapshot.config`.                                                                 |
| `targets/widgets/AppointmentsWidget.swift`                                       | Upcoming follow-ups list. Reads time window from `snapshot.config`. Overdue rows route to the Reschedule sheet.                       |
| `targets/widgets/PetWidget.swift`                                                | Pet Companion: a timeline of the app's PNGs from `pet/`, with natively drawn pixel hearts.                                            |
| `targets/widgets/StopwatchLiveActivity.swift`                                    | The timer's Live Activity. Its shared code in `Stopwatch/` is copied from `modules/stopwatch-bridge/ios`.                             |
| `targets/widgets/WidgetStrings.swift`, `Localizable.xcstrings`                   | `L10n.t` and the bundled catalog for the widget gallery and the no-snapshot placeholders. Generated; see below.                       |
| `targets/widgets/expo-target.config.js`                                          | `@bacons/apple-targets` target config. The App Group comes from the host app's entitlements, per `APP_VARIANT`.                       |

## App Groups

- prod: `group.com.leviwilkerson.jwtime`
- dev: `group.com.leviwilkerson.jwtimedev`
- beta: `group.com.leviwilkerson.jwtimebeta`

Dev and beta each have their own group so they can iterate without polluting prod data. All are declared in `app.config.ts` (`ios.entitlements`); `targets/widgets/expo-target.config.js` copies the host's entitlement, and `Shared/AppGroup.swift` derives the same identifier from the bundle id at runtime.

The container holds `snapshot.json` and the Pet widget's `pet/` folder of PNGs.

## Adding a field to the snapshot

1. Add the field to `WidgetSnapshot` in `src/app/widgets/snapshot.ts` and populate it in `buildWidgetSnapshot()` (or one of the `build*.ts` helpers it composes). Reuse existing utilities from `src/lib/serviceReport.ts`, `src/lib/minutes.ts`, `src/lib/contacts.ts`, etc. — never reimplement.
2. If the new field is for **display strings**, resolve them via `i18n.t()` in JS so the widget shows the app's language. Only text shown without a snapshot (the gallery) belongs in the bundled catalog.
3. If the schema change is breaking (renamed/removed field), bump `SNAPSHOT_VERSION` in both `snapshot.ts` and `SUPPORTED_VERSION` in `targets/widgets/Snapshot.swift`. The widgets will render the empty placeholder until the app rewrites the snapshot.
4. Add the corresponding field to the Swift `WidgetSnapshot` struct in `targets/widgets/Snapshot.swift` (single file shared across all widgets in the bundle).

## Language, direction and numbers

Widgets show the language chosen in the app, which can differ from the phone's:

- **Text** comes translated in the snapshot's `strings`. The widget gallery's names and descriptions are system UI shown before any snapshot, so they come from `targets/widgets/Localizable.xcstrings` in the phone's language. `pnpm sync:widget-shared` generates it from `src/locales` for the keys under `iosWidgetStrings` in `src/app/watch/watchStringKeys.json`; Swift reads them with `L10n.t("key")` (`WidgetStrings.swift`), and the sync fails on a key it uses but doesn't list.
- **Direction and digits** come from the snapshot's `rtl` and `numberLocale`. Each widget's root view, and the Live Activity's, applies `.appLanguage(snapshot.appLanguage)` (`Shared/AppLanguage.swift`, from `targets/watch`): right to left for an RTL Language or the dev Force Right to Left switch, and SwiftUI's number formatting in Arabic-Indic digits for Arabic. Numbers Swift writes into a `String` go through `snapshot.appLanguage.number(_:)` or `.decimal(_:)`, and figures the phone already wrote (`monthHoursFormatted`) through `.digits(_:)`. Lay views out with `.leading`/`.trailing` and use `.leftToRightTracking(_:)` for letter spacing, which pulls Arabic's joined letters apart. See [ADR 0026](./adr/0026-app-owns-layout-direction.md).

## Adding a new widget

1. Add a new Swift file in `targets/widgets/` (e.g. `MyWidget.swift`). Reuse `SnapshotLoader.load()` and the existing `WidgetSnapshot` model.
2. Register it in `WidgetsBundle.swift` alongside the existing widgets. Do **not** add `@main` — the bundle owns that.
3. Use `StaticConfiguration` and `TimelineProvider` (not `IntentConfiguration` / `AppIntentTimelineProvider`). Widget configuration always lives in **Settings > Widgets** and is delivered via `snapshot.config` — there is intentionally no long-press "Edit Widget" UI so users have one place to tune behavior.
4. If the widget needs user-configurable settings, add the field to `src/stores/preferences.ts`, surface a control in `src/features/settings/components/preferences-sections/WidgetsPreferencesSection.tsx`, add it to `WidgetConfig` in `snapshot.ts`, mirror it in `Snapshot.swift`, and read it from `snapshot.config` in your widget view.
5. If the widget needs new snapshot data fields, follow the "Adding a field" section above.
6. Add its gallery name and description to `src/locales/en-US.json`, list the keys under `iosWidgetStrings` in `src/app/watch/watchStringKeys.json`, run `pnpm sync:widget-shared`, and read them with `L10n.t("key")`.
7. Re-run `pnpm prebuild`.

## Deep linking

Widgets deep-link into the app via the `witnesswork://` scheme declared in `app.config.ts`. The route table lives in `src/features/contacts/lib/linking.ts` and the Swift-side URL factory lives in `targets/widgets/WidgetURLs.swift` — keep them in sync.

| URL                                            | Effect                                              |
| ---------------------------------------------- | --------------------------------------------------- |
| `witnesswork://home`                           | Home tab (Report states, Pet widget).               |
| `witnesswork://add-time`                       | Push the Add Time screen.                           |
| `witnesswork://add-time/:date`                 | Add Time with the date pre-filled.                  |
| `witnesswork://contact/:id`                    | Push Contact Details.                               |
| `witnesswork://contact/:id/:visitId`           | Push Contact Details with the conversation focused. |
| `witnesswork://reschedule/:contactId/:visitId` | Open the Reschedule sheet for an overdue follow-up. |
| `witnesswork://schedule/:date`                 | Schedule tab with that day's sheet (Calendar day).  |
| `witnesswork://day`                            | Push an empty Plan Day (Calendar "+").              |
| `witnesswork://shared-good-news`               | **Action**: log a 0h0m report + play confetti.      |

`shared-good-news` is handled by `src/features/contacts/components/SharedGoodNewsListener.tsx`, not React Navigation, because it mutates state instead of pushing a screen.

## Pet widget

`PetWidget` (`targets/widgets/PetWidget.swift`) shows the Pet Companion. The app draws the pet; Swift only lays out the images and draws the hearts and text.

- **Small**: the pet, full bleed (square image), with its name and pixel hearts over the top leading corner on a shadow.
- **Medium**: the square pet image on the leading edge; name, hearts, lamp days (`lampDaysLabel`) and the wall sign's value (`signLine`) beside it.
- **Large**: the room image (123:100) across the top, about 78% of the height, over a slim row of name and hearts, with lamp days at the trailing end.
- Images draw with `.interpolation(.none)` so pixels stay crisp, on the room's background (`WidgetColor.petRoom`: parchment `#F6EFE2`, a dark brown in dark mode). They keep their colors in the tinted Home Screen (`widgetAccentedRenderingMode(.fullColor)`).
- Hearts are the app's 5×4 stamp drawn as squares (full, half, empty, gold), in whole-point pixels that grow with Dynamic Type, and mirrored right to left.
- No snapshot or no pet: a placeholder asking the user to choose a pet (`strings.petPlaceholderLabel`, else the bundled `pet.widgetPlaceholder`). Every tap opens Home.

**Images.** The app renders one set of PNGs per future state and writes them with `WidgetBridge.writeFile(name, base64)` into `<App Group>/pet/<name>` (atomic; names must match `^[a-z0-9-]+\.png$`; the promise rejects when the write fails). `WidgetBridge.pruneFiles(keep)` deletes the rest. Write the files before the snapshot that names them. After a snapshot is written, prune only what neither it nor the snapshot before it names: until WidgetKit reloads, the widget may still be showing the older timeline.

**Snapshot.** `snapshot.pet` (`PetWidgetSnapshot` in `src/app/widgets/petWidget.ts`, `WidgetSnapshot.Pet` in Swift) is `null` without a pet. It carries the pre-translated `name` and `entries`, oldest first: `{ date (epoch ms), small, medium, large (file names), hearts, dead, gold, status }`, where `status` is that entry's `{ lampLevel, lampDaysLabel (null when streaks are hidden or there's no streak), signLine, accessibilityLabel }`. The top-level `accessibilityLabel`, `lampDaysLabel`, `signLine`, `hearts`/`dead`/`gold`/`lampLevel` repeat the first entry's for widget builds older than `status`; Swift reads an entry's `status` when it has one. The widget reads only its slice (`version`, `rtl`, `numberLocale`, `strings.petPlaceholderLabel`, `pet`), and every widget decodes `pet` leniently (`WidgetSnapshot.LenientPet`), so a problem elsewhere can't blank the pet and a malformed pet slice can't blank the others.

**Building it.** `planPetWidget` (`src/app/widgets/petWidget.ts`, pure) works out the timeline without drawing:

- The next 48 hours, densely: the start of the current period (today's midnight, or the last Live window boundary), each local midnight, and with a Live window each time-of-day boundary (6:00, 9:00, 17:00, 20:00). Each day is computed from its date (`localMidnight`), so a day where DST skips midnight starts at 01:00 without moving the others.
- Then, until the pet would die (61 days), each midnight its hearts, mood, gold or gift change and each first of the month (sign, season). These stand for whole days, so the window shows as at noon.
- At each it replays hearts for that day with the same active days and wakes (`simulateLifeAhead`, one replay; no new activity), the lamp's streak and the wall sign on that day (`streakAt`, `signAt`), and the window's time and season, and drops states identical to the one before.
- At most 12: the 48 hours first, then the later days whose change matters most (dying, falling asleep, a new mood, other hearts, the month), in date order.

Each entry gets its text and an image key (`contentHash` of everything its images depend on: species, coat, room, mood and moments, lamp, window, and the sign values that room shows), and the plan a `hash` of all of it. `renderPetWidget` draws each image key once as a still frame (`composeScene` at t = 0 with Reduce Motion: static Zzz when asleep, greyscale and lying when it died, static gold sparkles, gift and sill, a rainbow on its day outside night; no visitor, paradise or star), cropped to `VIEW_PET_SQUARE` (small and medium share it) and `VIEW_WIDGET_LARGE`, and named `pet-<hashBuffer>.png`, so unchanged pixels keep their name. An in-memory cache by image key skips composing and encoding a state it has seen; an image that fails to encode fails the whole build (`PetWidgetRenderError`). Bump `PET_WIDGET_RENDER_VERSION` when the images change for the same inputs.

**Writing it.** `petWidgetWriter.ts` (used by `widgetSync.ts`) keeps the pet slice last written, its images and the previous snapshot's in MMKV (`widgetPetWritten`). A push draws nothing when the plan's hash is the one written, even in a fresh process. When drawing or writing an image fails, it keeps the slice already written (so the snapshot is unchanged and no reload is spent) and tries the same inputs again only after an hour. It writes only images it hasn't written this run, remembering a name only once its write succeeded, and forgets them all if a prune fails. `petWidgetInput.ts` reads the stores. The first entry starts at the current period, not at `now`, so an unchanged pet hashes the same and isn't rewritten.

**Timeline.** The latest entry whose date has passed shows now, then each later entry at its own date, with policy `.atEnd`. Once the entries run out, the policy is `.never`: the widget can't render a newer state itself, and the app reloads it with a new snapshot when it next runs. With the days ahead in the snapshot, a pet whose User stops opening the app still fades, falls asleep and dies on time, up to the 12-entry cap.

## Refresh model

The snapshot is rebuilt on:

1. **A change to a slice the snapshot reads** (debounced 500ms): `serviceReport`'s reports and plans, `contacts`, `conversations`, Supporter status, Buddies' calendar markers, the pet store's companion and room, and the preferences in `WIDGET_PREFERENCES`. Other preference writes (iCloud sync bookkeeping, for one) are ignored.
2. **Return to the app** (`addForegroundListener`, so not `inactive` blips) — covers locale switches and midnight rollover.
3. **Background fetch** every ~1h via `expo-background-task` / `BGTaskScheduler` (iOS treats the interval as a hint, not a guarantee), after the iCloud pull that task runs.
4. **Cold start**.

Each rebuild is hashed without `updatedAt` (`widgetSnapshotHash` in MMKV). Only a changed snapshot is written and followed by `WidgetCenter.shared.reloadAllTimelines()`, since reloads come out of WidgetKit's daily budget.

## Testing the loop end-to-end

The `verify-witnesswork` skill builds the dev client with the widget extension (`wwv up --platform ios`) but can't place widgets on the Home Screen. By hand:

1. `pnpm install`
2. `pnpm prebuild` — confirm `ios/` regenerates with the widget target listed and the App Group entitlement on **both** the app and widget targets.
3. `pnpm ios` — boot dev variant on a real device or simulator.
4. Long-press home screen → add the **Service Report** widget.
5. In the app, log a service report time entry. The widget should refresh within ~1s and show the new month-to-date value.
6. Kill the app — widget should still show the last-written values (proves the snapshot persists).
7. Locale switch: change app language, foreground the app, confirm the widget label updates next refresh.
8. Background fetch: change data on another device, then Xcode → Debug → Simulate Background Fetch → confirm the snapshot's `updatedAt` advances. With nothing changed, it stays put.

## Limitations

- iOS only. The `widget-bridge` module declares `platforms: ["ios"]`.
- Keep the snapshot small: every widget decodes all of it on each timeline reload. Buddy photos ride in it as base64 thumbnails; the pet's images don't, they're separate files in `pet/`.
- Widget extensions get about 30 MB of memory. Keep the pet PNGs at the widget's pixel size, not larger.
- Background fetch is best-effort; iOS may throttle or skip it.
