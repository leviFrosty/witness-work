# iOS Widgets

iOS-only. One widget extension (`targets/widgets/`) hosts a `WidgetBundle` with three widgets:

- **ReportWidget** — service hours card. Small shows today, medium shows this week, large shows this month (full HourEntryCard parity). Publishers (`publisher === 'publisher'`) get a state-machine version: an unreported checkbox CTA, a "reported today" celebration card, or a running conversations/studies summary depending on where they are in the month.
- **ContactsWidget** — top contacts ordered by user sort with favorites and bible studies tiered to the top. Small + medium + large. Each row shows a staleness color dot, the contact name, and a single configurable quick action (directions / call / text / none).
- **AppointmentsWidget** — upcoming follow-ups within a configurable window. Medium + large. Overdue follow-ups always surface in red regardless of the window and deep-link to the in-app Reschedule sheet on tap.

Widget configuration (sort, quick action, time window) lives in **Settings > Widgets** in the app — it is the single source of truth and gets pushed into the snapshot's `config` block. Widgets use `StaticConfiguration`; there is no long-press "Edit Widget" UI.

## Architecture

```
zustand stores (MMKV) ──▶ buildWidgetSnapshot() ──▶ snapshot.json (App Group) ──▶ Swift TimelineProvider
                                  ▲
            store.subscribe() / AppState=active / BGTaskScheduler
                                  │
                            WidgetBridge.writeSnapshot()
                            WidgetBridge.reloadAllTimelines()
```

MMKV's binary format isn't readable from Swift, so JS computes a small derived **snapshot** and writes it as JSON into an App Group container the widget can read. The widget never knows about MMKV, zustand, moment, or i18n.

## Key files

| File                                                                    | Purpose                                                                                                                            |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/widgets/snapshot.ts`                                           | Snapshot schema + `buildWidgetSnapshot()`. Single source of truth for the JSON shape. Bump `SNAPSHOT_VERSION` on breaking changes. |
| `src/lib/widgets/buildReport.ts`                                        | Builds the `report` slice. Today/week/month minutes + planned, publisher state machine, conversation+study counts.                 |
| `src/lib/widgets/buildContacts.ts`                                      | Builds `contacts[]`. Applies user sort (`config.contactSort`) with favorites/studies tiering, computes staleness, formats URLs.    |
| `src/lib/widgets/buildAppointments.ts`                                  | Builds `appointments[]` from follow-ups within 30d back through 31d forward. Pre-formats `timeFormatted`, flags `isOverdue`.       |
| `src/lib/widgets/widgetSync.ts`                                         | `installWidgetSync()` — subscribes to relevant stores, foreground events, and registers the background fetch task.                 |
| `src/lib/linking.ts`                                                    | React Navigation linking config + the `witnesswork://shared-good-news` URL detector.                                               |
| `src/lib/contactStaleness.ts`                                           | `getContactStaleness()` + `stalenessToColor()` — shared between in-app pin colors and the contacts widget dot.                     |
| `src/screens/RescheduleConversationScreen.tsx`                          | Modal sheet for overdue follow-ups, reachable from `witnesswork://reschedule/:contactId/:convId`.                                  |
| `src/screens/settings/preferences/screens/PreferencesWidgetsScreen.tsx` | Settings > Widgets — single source of truth for sort, action, and window. Pushes into snapshot config.                             |
| `src/components/SharedGoodNewsListener.tsx`                             | Mounts inside `AnimationViewProvider`. Reacts to the `shared-good-news` deep link by adding a 0h0m report and playing confetti.    |
| `modules/widget-bridge/`                                                | Local Expo module exposing `writeSnapshot`, `reloadAllTimelines`, `getAppGroupIdentifier` to JS. iOS-only.                         |
| `targets/widgets/Snapshot.swift`                                        | Swift mirror of the TS `WidgetSnapshot` schema. Bump `SUPPORTED_VERSION` in lockstep with the TS `SNAPSHOT_VERSION`.               |
| `targets/widgets/SnapshotLoader.swift`                                  | Reads `snapshot.json` from the App Group container. App Group resolved from the widget's bundle id.                                |
| `targets/widgets/Theme.swift`                                           | Widget-only spacing scale + app-matched colors (accent green, warn, error, staleness palette). Tighter than the in-app theme.      |
| `targets/widgets/WidgetURLs.swift`                                      | Centralized factory for widget → app deep link URLs. Mirrors the route table in `src/lib/linking.ts`.                              |
| `targets/widgets/WidgetsBundle.swift`                                   | `@main WidgetBundle` referencing all 3 widgets.                                                                                    |
| `targets/widgets/ReportWidget.swift`                                    | Service-report card. Size-aware (today/week/month) plus a publisher state machine.                                                 |
| `targets/widgets/ContactsWidget.swift`                                  | Top-N contact list. Reads sort + quick action from `snapshot.config`.                                                              |
| `targets/widgets/AppointmentsWidget.swift`                              | Upcoming follow-ups list. Reads time window from `snapshot.config`. Overdue rows route to the Reschedule sheet.                    |
| `targets/widgets/expo-target.config.js`                                 | `@bacons/apple-targets` target config. App Group mirrored from `APP_VARIANT`.                                                      |

## App Groups

- prod: `group.com.leviwilkerson.jwtime`
- dev: `group.com.leviwilkerson.jwtimedev`

The dev variant has its own group so dev builds can iterate without polluting prod data. Both are declared in `app.config.ts` (`ios.entitlements`) and mirrored in `targets/hours/expo-target.config.js`.

## Adding a field to the snapshot

1. Add the field to `WidgetSnapshot` in `src/lib/widgets/snapshot.ts` and populate it in `buildWidgetSnapshot()` (or one of the `build*.ts` helpers it composes). Reuse existing utilities from `src/lib/serviceReport.ts`, `src/lib/minutes.ts`, `src/lib/contacts.ts`, etc. — never reimplement.
2. If the new field is for **display strings**, resolve them via `i18n.t()` in JS so the widget never needs Swift-side localization.
3. If the schema change is breaking (renamed/removed field), bump `SNAPSHOT_VERSION` in both `snapshot.ts` and `SUPPORTED_VERSION` in `targets/widgets/Snapshot.swift`. The widgets will render the empty placeholder until the app rewrites the snapshot.
4. Add the corresponding field to the Swift `WidgetSnapshot` struct in `targets/widgets/Snapshot.swift` (single file shared across all widgets in the bundle).

## Adding a new widget

1. Add a new Swift file in `targets/widgets/` (e.g. `MyWidget.swift`). Reuse `SnapshotLoader.load()` and the existing `WidgetSnapshot` model.
2. Register it in `WidgetsBundle.swift` alongside the existing widgets. Do **not** add `@main` — the bundle owns that.
3. Use `StaticConfiguration` and `TimelineProvider` (not `IntentConfiguration` / `AppIntentTimelineProvider`). Widget configuration always lives in **Settings > Widgets** and is delivered via `snapshot.config` — there is intentionally no long-press "Edit Widget" UI so users have one place to tune behavior.
4. If the widget needs user-configurable settings, add the field to `preferences.ts`, surface a control in `WidgetsPreferencesSection.tsx`, add it to `WidgetConfig` in `snapshot.ts`, mirror it in `Snapshot.swift`, and read it from `snapshot.config` in your widget view.
5. If the widget needs new snapshot data fields, follow the "Adding a field" section above.
6. Re-run `npm run prebuild`.

## Deep linking

Widgets deep-link into the app via the `witnesswork://` scheme declared in `app.config.ts`. The route table lives in `src/lib/linking.ts` and the Swift-side URL factory lives in `targets/widgets/WidgetURLs.swift` — keep them in sync.

| URL                                           | Effect                                              |
| --------------------------------------------- | --------------------------------------------------- |
| `witnesswork://add-time`                      | Push the Add Time screen.                           |
| `witnesswork://contact/:id`                   | Push Contact Details.                               |
| `witnesswork://contact/:id/:convId`           | Push Contact Details with the conversation focused. |
| `witnesswork://reschedule/:contactId/:convId` | Open the Reschedule sheet for an overdue follow-up. |
| `witnesswork://shared-good-news`              | **Action**: log a 0h0m report + play confetti.      |

`shared-good-news` is handled by `SharedGoodNewsListener.tsx`, not React Navigation, because it mutates state instead of pushing a screen.

## Refresh model

The snapshot is rewritten on:

1. **Any zustand store change** in `serviceReport`, `preferences`, `contacts`, or `conversations` (debounced 500ms).
2. **App foreground** (`AppState === 'active'`) — covers locale switches and midnight rollover.
3. **Background fetch** every ~1h via `expo-background-fetch` / `BGTaskScheduler` (iOS treats the interval as a hint, not a guarantee).
4. **Cold start**.

After every write, `WidgetCenter.shared.reloadAllTimelines()` is called.

## Testing the loop end-to-end

1. `bun install`
2. `npm run prebuild` — confirm `ios/` regenerates with the widget target listed and the App Group entitlement on **both** the app and widget targets.
3. `npm run dev` — boot dev variant on a real device or simulator.
4. Long-press home screen → add the **Hours** widget.
5. In the app, log a service report time entry. The widget should refresh within ~1s and show the new month-to-date value.
6. Kill the app — widget should still show the last-written values (proves the snapshot persists).
7. Locale switch: change app language, foreground the app, confirm the widget label updates next refresh.
8. Background fetch: Xcode → Debug → Simulate Background Fetch → confirm the snapshot's `updatedAt` advances.

## Limitations

- iOS only. The `widget-bridge` module declares `platforms: ["ios"]`; calls from Android are no-ops.
- Snapshot is intentionally tiny (<1 KB). If it grows past ~32 KB, switch the Swift loader from a JSON file to a `Data` blob in `UserDefaults(suiteName:)` — the JS API doesn't need to change.
- Background fetch is best-effort; iOS may throttle or skip it.
