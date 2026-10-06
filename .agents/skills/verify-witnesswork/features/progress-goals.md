# Progress and goals

The Progress tab shows how the month and service year are going against the publisher's goal: hours logged, hours left, studies, a projection from plans, rollover of fractional time, and annual milestones for pioneers.

## Sub-features

- `progress-month` shows the month cell (logged / goal hours, hours left, days left, and the change versus last month), the category breakdown, "Add Time", and the projected month.
- `progress-year` shows the service-year pace chart, the projection, and the milestone ladder (pioneer roles only).
- `progress-alltime` shows lifetime totals.
- `progress-rollover` offers "Roll N min from <last month>?" when last month had fractional time.
- `progress-publisher` shows the checkbox "Shared in ministry" report for Regular Publishers instead of hours.

## How to get to it (user POV)

- The Progress tab (roles with year tabs). A Regular Publisher sees the report from Home instead.
- Home → "View Report".

## Driving it with ww-verify

Preconditions:

- Hours roles: `wwv seed pioneer` (Regular Pioneer, 50 h goal).
- Checkbox role: `wwv seed publisher`.

Steps:

- **Month.** Run `wwv ad press 'label="Progress"' --settle`. The text "Regular Pioneer · 50 Hrs goal" appears, plus a cell reading "<logged>, / 50 hours, <left> Hrs left · <n> days left", and "PROJECTED MONTH".
- **Year.** Run `wwv ad press 'label="Year"' --settle`. The pace chart and milestone ladder render.
- **Scrub the chart.** Run `wwv ad longpress` on the chart, or use a gesture swipe. A value readout appears. Hover readouts need an iPad pointer, which can't be automated; report hover as unverified.
- **Totals follow entries.** Log time (time-entry.md). The logged hours in the month cell rise by the same amount.
- **Publisher.** After `wwv seed publisher`, Home → "View Report" shows the shared checkbox state for this month and the past two.
- **Proof.** Run `wwv shot progress-month` and `wwv shot progress-year`, then `wwv errors`.

## Gotchas

- Numbers depend on today's date, because scenarios are relative. Assert relationships (rises by 2, goal 50) rather than absolute totals.
- The rollover card is expected in `pioneer`, since September has a half-hour remainder.
- A publisher has no Progress tab. Its absence there is correct, not a failure.
