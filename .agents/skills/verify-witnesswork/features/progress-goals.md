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
- **Year cards.** Everything under the year's total is a card: Milestones, the pace chart, the stat cards and Months. `id="progress-edit-cards"` (or holding a card; Months lifts from its "MONTH, HOURS, VS GOAL" heading) starts editing. Move one with `wwv ad gesture drag 'label="Months, compact"' 'label="Average, small"' 700 900 400`, switch Months between its short list and all twelve with `wwv ad press 'label="Resize Months"'`, then read `__WW_DEV__.stores.preferences.getState().yearProgressCards` (ids and sizes in order; a removed Milestones or Months stays as a `hidden` entry). The total has no Remove button and doesn't move. On iPad, Months has the second column at full length; agent-device's drag finds nothing there, so hold and drag with `axe touch --down` then `axe drag` at the card's coordinates. `e2e/web/progressYear.spec.ts` covers resize and a pointer drag in a browser.
- **Scrub the chart.** Run `wwv ad longpress` on the chart, or use a gesture swipe. A value readout appears. Hover readouts need an iPad pointer, which can't be automated; report hover as unverified.
- **Totals follow entries.** Log time (time-entry.md). The logged hours in the month cell rise by the same amount.
- **Publisher.** After `wwv seed publisher`, Home → "View Report" shows the shared checkbox state for this month and the past two.
- **Days.** The Days card (`days-list-scroll`) is a window five and a half rows tall that scrolls inside the screen and opens with today as its second row; the last half row is cut off on purpose. Wide layouts list every day in the pane beside the report, scrolled to today. `wwv web test e2e/web/progressDays.spec.ts --project chromium-phone --project chromium-desktop` re-proves the opening position and that the page still scrolls at the list's ends.
- **Proof.** Run `wwv shot progress-month` and `wwv shot progress-year`, then `wwv errors`.
- **Scripted.** Run `wwv flow e2e/maestro/rollover.yaml` (its setup leaves last month on :30; the prompt shows once per launch, so `wwv up` before a rerun), `wwv flow e2e/maestro/monthly-report.yaml` for marking last month's report sent from Home's `due-report-row`, `progress-tabs.yaml` (a month back and Today, then Year and All-time), `service-history.yaml` (All-time → Add earlier year → 12 hours in its September's `service-history-hours-0` → Save; Year by Year lists it) and `report-send.yaml` (Submission method → Share, cancel the share sheet and it stays unsent; then Copy To Clipboard marks it sent).

## Gotchas

- Numbers depend on today's date, because scenarios are relative. Assert relationships (rises by 2, goal 50) rather than absolute totals.
- The rollover card is expected in `pioneer`, since September has a half-hour remainder.
- A publisher has no Progress tab. Its absence there is correct, not a failure.
