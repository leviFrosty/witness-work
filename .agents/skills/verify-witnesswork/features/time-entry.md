# Time entry

Users who log hours record service time for a day, from the Home service report card, the Quick Action menu, or a widget deep link. Home and Progress totals update immediately.

## Sub-features

- `time-home-card` opens Add Time from Home's service report card.
- `time-quick-action` opens Add Time from the center "Quick Action" menu.
- `time-deep-link` opens `witnesswork://add-time` (empty) and `witnesswork://add-time/<YYYY-MM-DD>` (date pre-filled).
- `time-validation` keeps Submit disabled until hours or minutes are set ("Add hours or minutes above to submit your time entry.").
- `time-category` selects a Type (Standard, or a credit Category such as LDC).
- `time-edit-delete` edits or deletes an existing entry from the month report.

## How to get to it (user POV)

- Home → "Add Time" on the service report card.
- The center "+" ("Quick Action") → "Add Time".
- Tapping a day on the calendar widget, which opens `witnesswork://add-time/<date>`.

## Driving it with ww-verify

Preconditions:

- `wwv seed pioneer`. A Regular Pioneer has hours entry. A `publisher` uses the checkbox mode and has no Add Time card.

Steps:

- **Open.** Run `wwv ad press 'label="Add Time"' --settle`. The text "Entering time information below will log service time for that day" appears, and Submit is disabled.
- **Pick hours.** Run `wwv ad press 'role="button" label="Hours"' --settle`, then `wwv ad press 'label="2"' --settle`, then `wwv ad press 'label="Done"' --settle`. Submit is enabled.
- **Submit.** Run `wwv ad press 'label="Submit"' --settle`. The app returns to Home.
- **Read back.** Run `wwv eval 'Object.values(__WW_DEV__.stores.serviceReports.getState().serviceReports).flatMap(m => Object.values(m).flat()).filter(e => !e.id.startsWith("verify-") && new Date(e.date).toDateString() === new Date().toDateString())'`. One entry with `hours: 2`.
- **Second view.** Run `wwv ad press 'label="Progress"' --settle`. The month cell's logged hours went up by 2.
- **Deep link.** Run `wwv link 'witnesswork://add-time/2026-10-01'`. The route is `Add Time` and the date picker shows that day.
- **Quick Action.** Run `wwv ad press 'label="Quick Action"' --settle`, then `wwv ad press 'label="Add Time"' --settle`.
- **Proof.** Run `wwv shot time-entry-saved` and `wwv errors`.
- **Scripted.** Run `wwv flow e2e/maestro/add-time.yaml`.

## Gotchas

- "Hours" and "Minutes" are both a text label and a wheel button. Select with `role="button"`.
- Wheel values below the visible window need a scroll inside the sheet. Pick visible values. On Android a tap can settle one row short, so check the button's name ("Hours, 2") or read the stored entry rather than trusting the tap.
- Time display follows the user's format preference (decimal or "1h 30m"). Assert with the store, not a formatted string.
- The `pioneer` scenario already has today's entries on Tuesdays and Saturdays. Filter out `verify-` ids when reading back.
