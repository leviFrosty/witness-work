# Time entry

Users who log hours record service time for a day, from the Home service report card, the Quick Action menu, a widget deep link, or inside a day's sheet. Home and Progress totals update immediately.

## Sub-features

- `time-home-card` opens Add Time from Home's service report card.
- `time-quick-action` opens Add Time from the center "Quick Action" menu.
- `time-deep-link` opens `witnesswork://add-time` (empty) and `witnesswork://add-time/<YYYY-MM-DD>` (date pre-filled).
- `time-validation` keeps Add active; tapping it without hours or minutes blocks saving and outlines the time in red (the button reads "Add Time" until there's a time, then "Add 2 Hrs"). An unnamed Custom category also blocks saving and outlines its name field in red (a hint under the Type row says why). Time from a timer stopped under a minute shows "Provided time is less than one minute." under the time.
- `time-category` selects a Type (Standard, or a credit Category such as LDC).
- `time-edit-delete` edits or deletes an existing entry from the month report.
- `time-day-sheet` logs, edits or deletes time inside a day's sheet without leaving the day. A day on Schedule, Home's This Week, or Progress' All Days opens a split sheet over the bottom half of the screen. A day with no time yet shows an "Add Time" card in Time Reports (`day-time-form`; a + badge, ⤢ `day-time-form-expand` to open it full screen, and a chevron). Today or a past day opens with the card unfolded and the sheet at 65% (without changing the kept size); a future day keeps it folded, and tapping the row unfolds it. Unfolded it shows the time, presets, Type and Note, and Add (no Date row), and the saved entry takes the card's place. Plan Day uses the same card (`day-plan-form`, `day-plan-form-expand`). Otherwise + beside Time Reports (`day-add-time`), a tapped entry, or a Plan's Log as Time swaps the day for the full form, and saving returns to the day. Note opens the full-screen note editor; the sheet slides out of view while it's up and comes back with the form as it was. The sheet's grabber ("Resize") drags it between 30% and 65% of the window (kept on the device), and dragging it well below that, or Close, closes it.

## How to get to it (user POV)

- Home → "Add Time" on the service report card.
- The center "+" ("Quick Action") → "Add Time".
- `witnesswork://add-time/<date>`, which pre-fills the date.
- A day on Schedule, Home's This Week, or Progress' All Days → "Add Time" in the day's sheet.

## Driving it with ww-verify

Preconditions:

- `wwv seed pioneer`. A Regular Pioneer has hours entry. A `publisher` uses the checkbox mode and has no Add Time card.

Steps:

- **Open.** Run `wwv ad press 'label="Add Time"' --settle`. The form is one stack anchored low: the month card ("6.5 Hrs → 8.5 Hrs of 50 Hrs" once a time is entered), the time between − and + with presets under it, a card with Date, Type and Note, and Add docked at the bottom, always enabled. Press Add with zero duration: the form stays open and the time is outlined red; the store must be unchanged. testIDs: `time-entry-duration-pill` (the value; opens the hours and minutes wheels), `time-entry-picker-done` (the wheels' Done), `time-entry-preset-<minutes>` (`-30`, `-60`, `-90`, `-120`, `-180`), `time-entry-date-row` and `time-entry-date-done`, `time-entry-note-row` and `time-entry-save`. − and + are labeled "15m less" and "15m more" and move to the next 15-minute mark. The Note row opens the full-screen note editor (see [Rich notes](./rich-notes.md)), closed by `note-editor-done`. The Type row opens a menu (Standard, LDC, the user's Types, Custom).
- **Pick hours.** Press `id="time-entry-preset-120"` for 2 hours, or for an exact time `wwv ad press 'id="time-entry-duration-pill"' --settle`, tap a row of the hours wheel (see Gotchas), then `wwv ad press 'id="time-entry-picker-done"' --settle`. The value shows the duration and its red outline clears.
- **Add.** Run `wwv ad press 'id="time-entry-save"' --settle`. The app returns to Home.
- **Read back.** Run `wwv eval 'Object.values(__WW_DEV__.stores.serviceReports.getState().serviceReports).flatMap(m => Object.values(m).flat()).filter(e => !e.id.startsWith("verify-") && new Date(e.date).toDateString() === new Date().toDateString())'`. One entry with `hours: 2`.
- **Second view.** Run `wwv ad press 'label="Progress"' --settle`. The month cell's logged hours went up by 2.
- **Deep link.** Run `wwv link 'witnesswork://add-time/2026-10-01'`. The route is `Add Time` and the Date row shows that day.
- **Quick Action.** Run `wwv ad press 'label="Quick Action"' --settle`, then `wwv ad press 'label="Add Time"' --settle`.
- **Proof.** Run `wwv shot time-entry-saved` and `wwv errors`.
- **Scripted.** Run `wwv flow e2e/maestro/time-validation.yaml` for empty-submit rejection and correction, and `wwv flow e2e/maestro/add-time.yaml` for logging with a note.
- **Day sheet.** Run `wwv flow e2e/maestro/day-sheet-add-time.yaml`: its setup clears today's entries and opens today on Schedule (as the Calendar widget's link does); the form is already unfolded; it logs 2 hours with a note (through the note editor), the entry replaces the card, then `day-add-time` opens the full form and Go Back returns to the day. Resize with `wwv ad gesture pan <x> <y> 0 <dy>` from the grabber's center (the "Resize" node) and screenshot; read the kept size (a share of the window) with `wwv eval '__WW_DEV__.stores.splitSheet.getState().ratio'`.

## Gotchas

- The hours and minutes wheels both run from 0, so a label like "2" matches a row on each; `label="2"` fails as ambiguous. Each wheel row has an id, `<wheel testID>-<value>`: press `id="time-entry-duration-hours-2"`. Use that inside a day's sheet, where the calendar or list above also shows small numbers and `tapOn: { text: '2', index: 0 }` can hit those.
- Wheel values below the visible window need a scroll inside the sheet. Pick visible values. On Android a tap can settle one row short, so read the value's name ("Time, 2 Hrs" on Android) or the stored entry rather than trusting the tap.
- The note editor covers the form; close it with `note-editor-done` before pressing the time or Add.
- After a tap on the iOS simulator its pointer hovers where it tapped, and the hover tint fades slowly; a screenshot right after can show the tapped preset dimmed. Tap elsewhere and wait a few seconds before shooting.
- The setup checklist's confetti plays after a seed; set `homeChecklistAllDoneCelebrated: true` and `homeChecklistDismissed: true` in preferences to keep it out of screenshots.
- Time display follows the user's format preference (decimal or "1h 30m"). Assert with the store, not a formatted string.
- The `pioneer` scenario already has today's entries on Tuesdays and Saturdays. Filter out `verify-` ids when reading back.
- The Progress month card has its own "Add Time"; inside a day's sheet press `id="day-add-time"` or `id="day-time-form"`, not the label.
- A hardware keyboard on the iOS simulator hides the software keyboard, so the sheet's growth for the keyboard (to 85% of the window) can't be seen there.
