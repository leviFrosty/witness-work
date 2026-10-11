# Time entry

Users who log hours record service time for a day, from the Home service report card, the Quick Action menu, a widget deep link, or inside a day's sheet. Home and Progress totals update immediately.

## Sub-features

- `time-home-card` opens Add Time from Home's service report card.
- `time-quick-action` opens Add Time from the center "Quick Action" menu.
- `time-deep-link` opens `witnesswork://add-time` (empty) and `witnesswork://add-time/<YYYY-MM-DD>` (date pre-filled).
- `time-validation` keeps Submit disabled until hours or minutes are set (the Time pill reads "Time" until then), and while the Type is an unnamed Custom category (a hint under the Type row says why). Time from a timer stopped under a minute shows "Provided time is less than one minute." above the pills.
- `time-category` selects a Type (Standard, or a credit Category such as LDC).
- `time-edit-delete` edits or deletes an existing entry from the month report.
- `time-day-sheet` logs, edits or deletes time inside a day's sheet without leaving the day. A day on Schedule, Home's This Week, or Progress' All Days opens a split sheet over the bottom half of the screen. A day with no time yet folds the form into Time Reports under a native collapsible "Add Time" card (`day-time-form`; SwiftUI's DisclosureGroup, Compose's expandable list item). Tapping it unfolds the Time pill, Note and Type, and Submit (no Date pill), and the saved entry takes the card's place. Otherwise + beside Time Reports (`day-add-time`), a tapped entry, or a Plan's Log as Time swaps the day for the full form, and saving returns to the day. Note opens the full-screen note editor; the sheet slides out of view while it's up and comes back with the form as it was. The sheet's grabber ("Resize") drags it between 30% and 65% of the window (kept on the device), and dragging it well below that, or Close, closes it.

## How to get to it (user POV)

- Home → "Add Time" on the service report card.
- The center "+" ("Quick Action") → "Add Time".
- `witnesswork://add-time/<date>`, which pre-fills the date.
- A day on Schedule, Home's This Week, or Progress' All Days → "Add Time" in the day's sheet.

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
- **Day sheet.** Run `wwv flow e2e/maestro/day-sheet-add-time.yaml`: its setup clears today's entries and opens today on Schedule (as the Calendar widget's link does); it unfolds `day-time-form`, logs 2 hours with a note (through the note editor), the entry replaces the card, then `day-add-time` opens the full form and Go Back returns to the day. Resize with `wwv ad gesture pan <x> <y> 0 <dy>` from the grabber's center (the "Resize" node) and screenshot; read the kept size (a share of the window) with `wwv eval '__WW_DEV__.stores.splitSheet.getState().ratio'`.

## Gotchas

- The hours and minutes wheels both run from 0, so a label like "2" matches a row on each; `label="2"` fails as ambiguous. Each wheel row has an id, `<wheel testID>-<value>`: press `id="time-entry-duration-hours-2"`. Use that inside a day's sheet, where the calendar or list above also shows small numbers and `tapOn: { text: '2', index: 0 }` can hit those.
- Wheel values below the visible window need a scroll inside the sheet. Pick visible values. On Android a tap can settle one row short, so read the pill's name ("Time, 2 Hrs" on Android) or the stored entry rather than trusting the tap.
- The note editor covers the form; close it with `note-editor-done` before pressing a pill or Submit.
- Time display follows the user's format preference (decimal or "1h 30m"). Assert with the store, not a formatted string.
- The `pioneer` scenario already has today's entries on Tuesdays and Saturdays. Filter out `verify-` ids when reading back.
- The Progress month card has its own "Add Time"; inside a day's sheet press `id="day-add-time"` or `id="day-time-form"`, not the label.
- A hardware keyboard on the iOS simulator hides the software keyboard, so the sheet's growth for the keyboard (to 85% of the window) can't be seen there.
