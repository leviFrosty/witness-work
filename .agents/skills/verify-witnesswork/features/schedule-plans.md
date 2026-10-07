# Schedule and plans

The Schedule tab shows a month calendar of planned versus actual time. Users create one-time or recurring plans for future days. Tapping a plan opens Plan Details (read-only, with Edit and More in the header), and its Edit opens the Plan Day screen.

## Sub-features

- `schedule-month` shows the calendar, with the Missed / Partial / Completed / Planned legend and month navigation (Sep / Nov).
- `plans-details` opens a plan read-only from every list (Schedule list, day sheet, iPad inspector, Home week strip, Progress day list, plan reminders, the Home bell's buddy replies and invitations, a buddy's Together rows). Edit opens Plan Day; More has Duplicate, Log as Time, maps, copy, and Delete.
- `plans-create` lets the user tap a future day, or use Quick Action → "Create Plan", to add a plan with minutes, start time, title and location.
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
- **Existing plan.** Press tomorrow's day cell (its label is the day number). The plan shows "Cart witnessing" and 2 hours.
- **Plan Details.** Run `wwv flow e2e/maestro/plan-details.yaml`. Each plan row has the testID `plan-row-<planId>`, so `wwv ad press 'id="plan-row-verify-plan-0"'` opens the route `Plan Details`; read it back with `__WW_DEV__.state().route`.
- **Create.** Press Quick Action → "Create Plan" (or `wwv link 'witnesswork://day'`). Set a date and time, then save.
- **Read back.** Run `wwv eval '__WW_DEV__.stores.serviceReports.getState().dayPlans.length'`. It returns 4.
- **Proof.** Run `wwv shot schedule-month` and `wwv errors`.

## Gotchas

- Calendar day cells are labeled only by day number, so "1" also matches other numbers on screen. Take `wwv ad snapshot -i` and press the cell's `@ref`.
- Day cells from the previous and next month are visible and pressable.
- Plans forecast Credit Time only through their Category. Assert the category, not a credit flag.
- Plan rows' accessible labels merge every line of the row, so select a row by its testID or with `wwv ad find "<title>" click`.
- Plan Details' More menu is a native pull-down; open it with `label="More"`, then press an item by its label.
