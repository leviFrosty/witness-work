# Schedule and plans

The Schedule tab shows a month calendar of planned versus actual time. Users create one-time or recurring plans for future days. Tapping a plan opens Plan Details (read-only, with Edit and More in the header), and its Edit opens the Plan Day screen.

## Sub-features

- `schedule-month` shows the calendar, with the Missed / Partial / Completed / Planned legend and month navigation (Sep / Nov).
- `schedule-day-sheet` opens a tapped day in a split sheet over the bottom half of the screen. The calendar stays usable above it: the picked day gets a ring, its week scrolls into view above the sheet, and tapping another day switches the sheet to it. The grabber ("Resize") drags the sheet between 30% and 65% of the window; "Close" or dragging it well down closes it. A day with no time or no Plans folds the time or Plan form into its list under a native collapsible card (`day-time-form` "Add Time", `day-plan-form` "Plan Day"); the saved entry or Plan takes the card's place. Each card's "Open Full Screen" (`day-time-form-expand`, `day-plan-form-expand`) opens Add Time or Plan Day with what's entered so far, and folds the card. + beside Time Reports or Plans, a tapped entry and a Plan's Log as Time open the full form there instead (see time-entry.md). The sheet slides out of view for another screen (the note editor, Buddies) and comes back as it was. On iPad wide windows the day shows in the inspector beside the calendar instead.
- `plans-details` opens a plan read-only from every list (Schedule list, day sheet, iPad inspector, Home week strip, Progress day list, plan reminders, the Home bell's buddy replies and invitations, a buddy's Together rows). Edit opens Plan Day; More has Duplicate, Log as Time, maps, copy, and Delete.
- `plans-create` lets the user tap a future day, or use Quick Action → "Create Plan", to add a plan. The form keeps the quick path in a dock at the bottom (One Time / Recurring, the Date, Time and Duration pills, and Save) and the optional details above it (Title, Location, Note, Invite Buddies, Notify Me, End Date for recurring plans, Type).
- `plans-recurring` sets a weekly recurrence, with overrides for single days.
- `plans-deep-link` opens `witnesswork://day` (the empty Plan Day, from the widget "+").
- `plans-buddies` marks plans buddies joined, and lets the user ask to join (flagged; see buddies.md).

## How to get to it (user POV)

- The Schedule tab → a day cell.
- Tapping a day on the calendar widget, which opens `witnesswork://schedule/<YYYY-MM-DD>` (that day's sheet).
- Quick Action → "Create Plan".
- The calendar widget "+", which opens `witnesswork://day`.

## Driving it with ww-verify

Preconditions:

- `wwv seed pioneer`. Three plans fall 1, 3 and 6 days ahead, and the first is titled "Cart witnessing".

Steps:

- **Month.** Run `wwv ad press 'label="Schedule"' --settle`. The month title shows the current month, and the legend shows "Planned".
- **Existing plan.** Press tomorrow's day cell (its label is the day number). The day's sheet opens over the bottom half, and its plan shows "Cart witnessing" and 2 hours.
- **Plan Details.** Run `wwv flow e2e/maestro/plan-details.yaml`. Each plan row has the testID `plan-row-<planId>`, so `wwv ad press 'id="plan-row-verify-plan-0"'` opens the route `Plan Details`; read it back with `__WW_DEV__.state().route`.
- **Create.** Run `wwv flow e2e/maestro/create-plan.yaml`, or press Quick Action → "Create Plan" (or `wwv link 'witnesswork://day'`). The dock's controls have testIDs: `plan-kind-one-time`, `plan-kind-recurring`, `plan-date-pill`, `plan-duration-pill` (How long?; its sheet switches between `plan-when-hours`, Just hours with the `plan-duration-hours`/`plan-duration-minutes` wheels, and `plan-when-span`, Time span with the `plan-span-start`/`plan-span-end` wheels), `plan-picker-done` (the pickers' Done) and `plan-save`. New Plans open in the mode last used (`planTimeMode` preference); Just hours saves `anytime: true` with the noon start kept for older app versions. The details rows use `plan-title-input`, `plan-note-row` (opens the full-screen note editor; see [Rich notes](./rich-notes.md)) and `plan-buddies-row`. Save stays enabled. With zero duration, pressing Save keeps the form open and outlines How long? in red without writing a Plan. Picking a positive duration clears the outline; an unnamed Custom category also blocks saving and outlines its name input.
- **Plan from the day.** Run `wwv flow e2e/maestro/day-sheet-plan.yaml`: its setup clears every Plan and opens today on Schedule; it unfolds `day-plan-form`, adds a 2-hour Just hours Plan with a title, and the Plan replaces the card. `plan_created` carries `source: day_sheet`.
- **Edit.** Run `wwv flow e2e/maestro/edit-plan.yaml`. It edits the first seeded plan's title and saves it from the dock.
- **Route stops.** Run `wwv flow e2e/maestro/route-stops.yaml`: from today's day sheet, Plan Today's Route → Add Stop → Contacts adds two contacts, and a stop's Options → Remove Stop takes one off. Read back `__WW_DEV__.stores.savedRoutes.getState().routes[<YYYY-MM-DD>].order`.
- **Read back.** Run `wwv eval '__WW_DEV__.stores.serviceReports.getState().dayPlans.length'`. It returns 4.
- **Proof.** Run `wwv shot schedule-month` and `wwv errors`.

## Gotchas

- Calendar day cells are labeled only by day number, so "1" also matches other numbers on screen. Take `wwv ad snapshot -i` and press the cell's `@ref`.
- Day cells from the previous and next month are visible and pressable.
- Plans forecast Credit Time only through their Category. Assert the category, not a credit flag.
- Plan rows' accessible labels merge every line of the row, so select a row by its testID or with `wwv ad find "<title>" click`.
- Plan Details' More menu is a native pull-down; open it with `label="More"`, then press an item by its label.
- The Plan form's dock fades out and ignores taps while a full keyboard is up (it rides above a hardware keyboard's short bar instead), so dismiss the keyboard (`hideKeyboard` in a flow) before pressing a pill or Save. The form's keyboard avoidance follows the native keyboard frame (`DockedFormLayout`, shared with Add Time), so fake `keyboardWillShow` events don't move it.
- A hardware keyboard on the iOS simulator suppresses the software keyboard, so keyboard-overlap checks need the software keyboard visible. On Android, `wwv ad` uses a hidden test keyboard; open the session with agent-device's `--no-test-ime` to see the real one.
