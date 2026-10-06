# Schedule and plans

The Schedule tab shows a month calendar of planned versus actual time. Users create one-time or recurring plans for future days, and the Plan Day screen edits them.

## Sub-features

- `schedule-month` shows the calendar, with the Missed / Partial / Completed / Planned legend and month navigation (Sep / Nov).
- `plans-create` lets the user tap a future day, or use Quick Action → "Create Plan", to add a plan with minutes, start time, title and location.
- `plans-recurring` sets a weekly recurrence, with overrides for single days.
- `plans-deep-link` opens `witnesswork://day` (the empty Plan Day, from the widget "+").
- `plans-buddies` marks plans buddies joined, and lets the user ask to join (flagged; see buddies.md).

## How to get to it (user POV)

- The Schedule tab → a day cell.
- Quick Action → "Create Plan".
- The calendar widget "+", which opens `witnesswork://day`.

## Driving it with ww-verify

Preconditions:

- `wwv seed pioneer`. Three plans fall 1, 3 and 6 days ahead, and the first is titled "Cart witnessing".

Steps:

- **Month.** Run `wwv ad press 'label="Schedule"' --settle`. The month title shows the current month, and the legend shows "Planned".
- **Existing plan.** Press tomorrow's day cell (its label is the day number). The plan shows "Cart witnessing" and 2 hours.
- **Create.** Press Quick Action → "Create Plan" (or `wwv link 'witnesswork://day'`). Set a date and time, then save.
- **Read back.** Run `wwv eval '__WW_DEV__.stores.serviceReports.getState().dayPlans.length'`. It returns 4.
- **Proof.** Run `wwv shot schedule-month` and `wwv errors`.

## Gotchas

- Calendar day cells are labeled only by day number, so "1" also matches other numbers on screen. Take `wwv ad snapshot -i` and press the cell's `@ref`.
- Day cells from the previous and next month are visible and pressable.
- Plans forecast Credit Time only through their Category. Assert the category, not a credit flag.
