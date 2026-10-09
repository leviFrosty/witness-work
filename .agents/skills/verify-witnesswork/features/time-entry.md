# Time entry

Users who log hours record service time for a day, from the Home service report card, the Quick Action menu, or a widget deep link. Home and Progress totals update immediately.

## Sub-features

- `time-home-card` opens Add Time from Home's service report card.
- `time-quick-action` opens Add Time from the center "Quick Action" menu.
- `time-deep-link` opens `witnesswork://add-time` (empty) and `witnesswork://add-time/<YYYY-MM-DD>` (date pre-filled).
- `time-validation` keeps Submit disabled until hours or minutes are set (the Time pill reads "Time" until then), and while the Type is an unnamed Custom category (a hint under the Type row says why). Time from a timer stopped under a minute shows "Provided time is less than one minute." above the pills.
- `time-category` selects a Type (Standard, or a credit Category such as LDC).
- `time-edit-delete` edits or deletes an existing entry from the month report.

## How to get to it (user POV)

- Home → "Add Time" on the service report card.
- The center "+" ("Quick Action") → "Add Time".
- `witnesswork://add-time/<date>`, which pre-fills the date.

## Driving it with ww-verify

Preconditions:

- `wwv seed pioneer`. A Regular Pioneer has hours entry. A `publisher` uses the checkbox mode and has no Add Time card.

Steps:

- **Open.** Run `wwv ad press 'label="Add Time"' --settle`. The form has the Plan form's layout: a Details list (Note, Type) above a bottom dock with the Date and Time pills and Submit, which is disabled. The dock's controls have testIDs: `time-entry-date-pill`, `time-entry-duration-pill`, `time-entry-picker-done` (the pickers' Done) and `time-entry-save`. The Note row is `time-entry-note-row`; it opens the full-screen note editor (see [Rich notes](./rich-notes.md)), closed by `note-editor-done`.
- **Pick hours.** Run `wwv ad press 'id="time-entry-duration-pill"' --settle`, tap a row of the hours wheel (see Gotchas), then `wwv ad press 'id="time-entry-picker-done"' --settle`. The pill shows the duration and Submit is enabled.
- **Submit.** Run `wwv ad press 'id="time-entry-save"' --settle`. The app returns to Home.
- **Read back.** Run `wwv eval 'Object.values(__WW_DEV__.stores.serviceReports.getState().serviceReports).flatMap(m => Object.values(m).flat()).filter(e => !e.id.startsWith("verify-") && new Date(e.date).toDateString() === new Date().toDateString())'`. One entry with `hours: 2`.
- **Second view.** Run `wwv ad press 'label="Progress"' --settle`. The month cell's logged hours went up by 2.
- **Deep link.** Run `wwv link 'witnesswork://add-time/2026-10-01'`. The route is `Add Time` and the Date pill shows that day.
- **Quick Action.** Run `wwv ad press 'label="Quick Action"' --settle`, then `wwv ad press 'label="Add Time"' --settle`.
- **Proof.** Run `wwv shot time-entry-saved` and `wwv errors`.
- **Scripted.** Run `wwv flow e2e/maestro/add-time.yaml`.

## Gotchas

- The hours and minutes wheels both run from 0, so a label like "2" matches a row on each; `label="2"` fails as ambiguous. Take `wwv ad snapshot -i --json` and press the hours row's center by coordinates, or in a flow use `tapOn: { text: '2', index: 0 }` and assert on total minutes.
- Wheel values below the visible window need a scroll inside the sheet. Pick visible values. On Android a tap can settle one row short, so read the pill's name ("Time, 2 Hrs" on Android) or the stored entry rather than trusting the tap.
- The note editor covers the form; close it with `note-editor-done` before pressing a pill or Submit.
- Time display follows the user's format preference (decimal or "1h 30m"). Assert with the store, not a formatted string.
- The `pioneer` scenario already has today's entries on Tuesdays and Saturdays. Filter out `verify-` ids when reading back.
