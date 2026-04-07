# iOS Widgets

iOS-only. Plumbing only — `targets/hours/HoursStubWidget` is a verification stub, not a real widget UI.

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

| File                                  | Purpose                                                                                                                            |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/widgets/snapshot.ts`         | Snapshot schema + `buildWidgetSnapshot()`. Single source of truth for the JSON shape. Bump `SNAPSHOT_VERSION` on breaking changes. |
| `src/lib/widgets/widgetSync.ts`       | `installWidgetSync()` — subscribes to relevant stores, foreground events, and registers the background fetch task.                 |
| `modules/widget-bridge/`              | Local Expo module exposing `writeSnapshot`, `reloadAllTimelines`, `getAppGroupIdentifier` to JS. iOS-only.                         |
| `targets/hours/HoursStubWidget.swift` | Stub widget reading `snapshot.json`. Mirrors the TS schema in `WidgetSnapshot`.                                                    |
| `targets/hours/expo-target.config.js` | `@bacons/apple-targets` target config. App Group mirrored from `APP_VARIANT`.                                                      |

## App Groups

- prod: `group.com.leviwilkerson.jwtime`
- dev: `group.com.leviwilkerson.jwtimedev`

The dev variant has its own group so dev builds can iterate without polluting prod data. Both are declared in `app.config.ts` (`ios.entitlements`) and mirrored in `targets/hours/expo-target.config.js`.

## Apple Team ID

App Group entitlements require an Apple Team ID. Set `APPLE_TEAM_ID` in your env (or the EAS project secrets). `app.config.ts` reads `process.env.APPLE_TEAM_ID` into `ios.appleTeamId`.

## Adding a field to the snapshot

1. Add the field to `WidgetSnapshot` in `src/lib/widgets/snapshot.ts` and populate it in `buildWidgetSnapshot()`. Reuse existing utilities from `src/lib/serviceReport.ts`, `src/lib/minutes.ts`, etc. — never reimplement.
2. If the new field is for **display strings**, resolve them via `i18n.t()` in JS so the widget never needs Swift-side localization.
3. If the schema change is breaking (renamed/removed field), bump `SNAPSHOT_VERSION` in both `snapshot.ts` and `SUPPORTED_VERSION` in the Swift widget. The widget will render the empty placeholder until the app rewrites the snapshot.
4. Add the corresponding field to the Swift `WidgetSnapshot` struct in any widget that consumes it.

## Adding a new widget target

1. `mkdir targets/<name>` and create `expo-target.config.js` (copy from `targets/hours`).
2. Add the widget Swift file alongside it. Use `@main` only on the single widget entry point or wrap multiple widgets in a `WidgetBundle`.
3. Re-run `npm run prebuild`.
4. If the new widget needs new snapshot fields, follow the section above.

## Refresh model

The snapshot is rewritten on:

1. **Any zustand store change** in `serviceReport` or `preferences` (debounced 500ms).
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
