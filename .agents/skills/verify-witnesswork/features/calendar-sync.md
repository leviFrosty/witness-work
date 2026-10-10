# Calendar Sync

Users publish all their upcoming Follow-ups to a calendar in their device's calendar app. They connect a calendar once (create a WitnessWork calendar or adopt an existing one); every upcoming Follow-up then appears as a 30-minute event whose alert mirrors Notify Me, and Settings offers **Sync now** and **Turn Off Calendar Sync** (keep or remove events). When updates stop, a "Calendar updates paused" tray alert offers the fix. iOS coordinates one primary device over iCloud; Android publishes from the device alone and upserts each event by a marker link in its description.

## Sub-features

- `calendar-connect` connects from Preferences → Calendar Sync ("Choose a calendar" → "Continue" → pick an existing calendar, or "Create WitnessWork calendar on this device" on Android).
- `calendar-quick-connect` is the one-tap **Add to Calendar** in the onboarding `calendarSync` step and the notifications-tray invitation ("Follow-ups in Your Calendar").
- `calendar-publish` adds, updates (reschedule, Notify Me alert, names and addresses) and removes events (dismissed or deleted Visit, deleted contact). Past Follow-ups aren't added.
- `calendar-turn-off` keeps or removes WitnessWork events; "Reconnect <calendar>" appears afterwards.
- `calendar-permission` shows the permission error with **Open Settings** when calendar access is denied or revoked.
- `calendar-paused-alert` puts "Calendar updates paused" in the notifications tray: at once for errors the user must fix, after a day for connection errors.
- `calendar-primary-device` (iOS only) lists devices and the primary under Primary device.

## How to get to it (user POV)

- Settings → Preferences → Calendar Sync.
- Onboarding, after the notifications step.
- The bell on Home → "Follow-ups in Your Calendar" → "Add to Calendar" (only until answered), or "Calendar updates paused" while updates fail.

## Driving it with ww-verify

Preconditions:

- `wwv seed pioneer`. `verify-contact-2` "Chen Wei" has an upcoming Follow-up (`verify-visit-2-0`); `verify-contact-1` "Bruno Okafor" has an overdue one that must never be added.
- Android: the harness installs with calendar permissions granted. To see the real prompt, run `adb -s <serial> shell pm revoke com.leviwilkerson.jwtimedev android.permission.READ_CALENDAR` (and `WRITE_CALENDAR`), then `wwv up` again, since revoking kills the app.
- Android has no calendars until one is created. To test adopting an existing calendar, insert one as its sync adapter: `adb -s <serial> shell content insert --uri "'content://com.android.calendar/calendars?caller_is_syncadapter=true&account_name=sam%40example.com&account_type=LOCAL'" --bind account_name:s:sam@example.com --bind account_type:s:LOCAL --bind name:s:ministry --bind calendar_displayName:s:Ministry --bind calendar_access_level:i:700 --bind ownerAccount:s:ministry@group.example.com --bind sync_events:i:1 --bind visible:i:1`. A calendar whose `ownerAccount` equals its account name is that account's primary and must not be offered.

Steps:

- **Connect.** `wwv nav "PreferencesCalendar"`, press "Choose a calendar", then "CONTINUE". On Android, tap **Allow** in the system dialog with `adb -s <serial> shell input tap <x> <y>` from a screenshot (about 539, 1315 on a 1080×2400 emulator). Press "Create WitnessWork calendar on this device" or the existing calendar, then "CONTINUE".
- **Read back the store.** `wwv eval 'JSON.stringify(__WW_DEV__.stores.calendarSync.getState())'` shows `enabled: true` and the destination; `__WW_DEV__.stores.calendarPublishing.getState().error` is `null`.
- **Read back the calendar (Android).** `adb -s <serial> shell content query --uri content://com.android.calendar/events --projection _id:calendar_id:title:dtstart:dtend:eventLocation:description:hasAlarm:deleted --where "deleted=0"`. Each event's description is `witnesswork://contact/<contact>/<visit>?followUp=<visit>&alert=<minutes|none>`. Reminders: `content query --uri content://com.android.calendar/reminders`.
- **Publish changes.** Edit through the real UI, wait about 2 seconds (1.5-second debounce), then query again: a new Follow-up inserts one 30-minute row; Reschedule (`wwv nav "RescheduleVisit" '{"contactId":…,"visitId":…}'` → Tomorrow → Reschedule) changes `dtstart` on the same `_id`; Notify Me adds a reminder row and `alert=<minutes>`; Include names and addresses changes `title` and `eventLocation`; Dismiss follow-up or deleting the Visit removes the row.
- **Idempotency and duplicates (Android).** Press "Sync now" repeatedly; the `_id`s don't change. Insert a duplicate with the same description (escape the colon in bindings: `--bind 'description:s:witnesswork\://contact/…'`), press "Sync now", and only one row remains: a row with `_sync_id` (insert it with the sync-adapter URI) wins over unsynced rows, then the lowest `_id`.
- **Turn off.** "Turn Off Calendar Sync" → "KEEP EVENTS" leaves the rows; "REMOVE EVENTS" deletes the marked rows in the selected calendar only.
- **Permission.** Revoke while connected and `wwv up`: Settings shows the error with "Open Settings" (opens App info), and the bell lists "Calendar updates paused". `pm grant` both permissions and press Back: the foreground sync clears the error.
- **Developer tools.** Every mock-data generator in Tools turns Calendar Sync off first (keeping events): `enabled: false`, `optedOut: true`. **Reset all** removes this device's published events before wiping. **Clear calendar events** removes marked events from every writable calendar, in any connection; on iOS it scans 10 years back and 5 ahead.
- **Proof.** `wwv shot calendar-sync` and `wwv errors`.

## Gotchas

- On Android, `wwv ad alert accept|dismiss` and pressing labels in the system permission dialog refocus the app, which closes the dialog without granting. Use `adb shell input tap`. A closed dialog doesn't set "don't ask again"; `pm clear-permission-flags <pkg> <perm> user-set user-fixed` resets it if needed.
- `wwv ad snapshot -i` lists only interactive elements; onboarding step titles ("Follow-ups in Your Calendar") need a full `wwv ad snapshot`.
- `wwv seed` resets the Calendar Sync settings with the rest of app data but leaves published events in the calendar. Tools → **Clear calendar events** removes every marked event from every calendar.
- Events deleted from a synced calendar stay as `deleted=1` until their sync adapter runs; filter with `--where "deleted=0"`.
- The emulator has no Google account, so Google Calendar's handling of the marker and default notifications can't be checked here.
- iOS needs full calendar access (the harness pre-grants it) and iCloud for ownership; Primary device and publishing across devices can't be proven on a simulator.
