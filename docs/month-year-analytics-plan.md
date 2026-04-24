# Month & Year Analytics — Review and Plan

A review of the Month and Year screens with a prioritized set of changes to improve the analytics shown, tighten the hierarchy, and surface the one number that matters most at each zoom level.

This doc is the single source of truth for the work. Every implementation sub-task must read and conform to it.

---

## 1. Current state

### Month screen

Path: `src/screens/MonthScreen/MonthScreen.tsx` → `src/screens/TimeReportsDashboard.tsx` → `src/components/MonthSummary.tsx`.

`MonthSummary` renders, top to bottom:

1. Month title + export icon.
2. Right-aligned "`X hrs of Y hours to goal`" line.
3. Optional credit-overage warning.
4. `MonthServiceReportProgressBar`.
5. **Goal progress stats block** (`MonthSummary.tsx:243-341`) — a two-column row with five mutually exclusive text variants on the left (`goalAchieved` / `remaining` / `short` / `completed` / `goal`) and three on the right (`daysLeft` / `% of goal` / `days total`).
6. Categories table (Standard, LDC, Other).
7. Primary CTA (`createPlan` or `addTime`).

### Year screen

Path: `src/screens/YearScreen.tsx` → `src/components/AnnualServiceReportSummary.tsx` + `src/components/YearScreenMonthRow.tsx`.

- `AnnualServiceReportSummary` at the top — progress bar, the same five-variant goal-progress block as Month (`AnnualServiceReportSummary.tsx:242-340`), and a pace badge ("`X hours per month to goal`").
- A `FlashList` of 12 `YearScreenMonthRow` rows. Each row is a flat `"MMMM  —  Xhrs of Y hours to goal"` text pair. No bar, no sparkline, no mix.

---

## 2. What's not working

1. **Too many text variants, no shape.** The five-way goal-progress block is wordy and reads slower than a single hero line. It also appears in two places — duplicated, not shared (`MonthSummary.tsx:243-341` ↔ `AnnualServiceReportSummary.tsx:242-340`).
2. **The single most useful daily number is missing.** On a current month, users want _"how many hours/day do I need to hit goal?"_ That number is nowhere.
3. **No temporal context.** No comparison to prior month, same month last year, or cumulative vs. goal.
4. **Year is a text table.** Twelve near-identical rows carry trend information in words only. A 12-bar chart would deliver the same data pre-attentively.
5. **Category mix is a plain table.** A stacked bar or single-row segment chart would communicate the standard/LDC/other split in one glance and free vertical space.
6. **Year screen lacks a "months remaining in service year" chip** (already in `todo.md:24`).

---

## 3. Guiding principles

1. **One hero number per zoom level.** Month: hrs/day needed. Year: hrs/month needed. Everything else is secondary.
2. **Shape beats prose.** Prefer bars, chips, and segments over conditional sentences.
3. **Share, don't duplicate.** The goal-progress block lives in one component used by both Month and Year.
4. **Don't bury the drill-down.** Charts augment — the month rows and category table still drill into detail.
5. **No new dependencies until we've confirmed the app has none.** Before adding a chart library, prototype with plain `<View>` bars first.

---

## 4. Plan

Five steps, in order. Each is independently shippable.

### Step 1 — Month hero line

`src/components/MonthSummary.tsx`

- Replace the five-variant goal-progress block (`:243-341`) with:
  - **Hero line** (large, single sentence):
    - Current month, goal not met: `"X.X hrs/day to hit goal"` (or `"You're on pace"` when remaining ÷ days-left ≤ current daily avg).
    - Current month, goal met: `"🎯 Goal met — keep going"`.
    - Past month, goal met: `"✅ Completed"`.
    - Past month, goal not met: `"Y hrs short"`.
    - Future month: `"Goal: Y hrs"`.
  - **Secondary line** (small, muted, single row): `"Xhrs / Y hrs  ·  Z% · N days left"` — always the same shape, no conditionals.
- Remove the existing right-aligned "`X of Y hours to goal`" line above the progress bar since it's now in the secondary line.
- Keep the credit-overage warning exactly where it is.

Acceptance: one hero text node, one secondary text node, no conditional trees deeper than one level.

### Step 2 — Share goal-progress between Month and Year

Extract a `src/components/GoalProgressStats.tsx` that accepts `{ minutesCompleted, goalHours, periodStart, periodEnd, now, label }` and renders the Step-1 hero + secondary pair. Use it in both `MonthSummary.tsx` and `AnnualServiceReportSummary.tsx`. Delete the duplicated blocks.

Acceptance: one component, two call sites, identical behavior to Step 1 on Month and to today's behavior on Year.

### Step 3 — Year 12-bar chart

`src/screens/YearScreen.tsx`

- Above the month rows, render a `<YearBarChart>` — 12 vertical bars, one per month in the service year, each scaled to `min(minutes, goalHours*60)` with a tick-mark at `goalHours`. Tapping a bar navigates to that month (same behavior as the current rows).
- Implement with plain `<View>` + flex — no chart lib.
- Color: accent for months that hit goal, muted for those that didn't, faded for future months.
- Keep the rows below the chart as drill-down.

Acceptance: chart renders offline, uses no new dependency, tap opens the Month screen for that month.

### Step 4 — Month-over-month delta & cumulative line

- **Month:** add a small chip next to the hero: `"↑ 2.3 hrs vs last month"` (green up, red down, muted equal). Data is already available via `getMonthsReports` on `month-1`.
- **Year:** under the bar chart, render a single cumulative-vs-goal mini line — expected cumulative (straight line from 0 to annual goal) and actual cumulative. Also a plain `<View>` implementation.
- **Year:** add a `"N months left"` chip to satisfy `todo.md:24`.

Acceptance: all three chips/lines render with existing data; no new store fields.

### Step 5 — Category mix as segment bar

`src/components/MonthSummary.tsx` (and a future `AnnualCategoryMix` for Year).

- Replace the Standard/LDC/Other text table with a single-row stacked segment bar (`Standard | LDC | Other tags...`), each segment sized by share of total minutes, plus a compact legend beneath.
- Keep the numeric detail available on tap (sheet or expand), so the table isn't lost — just collapsed.

Acceptance: category section shrinks from ~120px to ~60px vertical; numbers still reachable.

---

## 5. Out of scope for this pass

- No chart library adoption. If Step 3/4 prove cramped we can revisit with Victory Native or Skia, but only after shipping the plain-`<View>` version.
- No new store fields or service-report schema changes. All data is derivable from existing `useServiceReport` state and helpers in `src/lib/serviceReport.ts`.
- "Year, Wrapped" (`todo.md:8`) and polished year-in-review card (`todo.md:19`) are separate from this pass.
- Charting trends across multiple service years is out of scope (listed under Supporter features, `todo.md:36`).

---

## 6. i18n keys

All five steps should reuse existing keys where possible. Likely reuse:

- `remaining`, `short`, `completed`, `goalAchieved`, `goal`, `daysLeft`, `perDay`, `needed`, `of`, `hours`, `hoursToGoal`.

New keys that may be needed (add to `src/locales/en-US.json` and rely on the auto-translate flow used elsewhere):

- `onPace` — "on pace"
- `hrsPerDayToGoal` — "{{count}} hrs/day to goal"
- `vsLastMonth` — "vs last month"
- `monthsLeft` — "{{count}} months left"

---

## 7. Rollout order

1. Step 1 alone is the highest signal / lowest risk — ship first, gather feedback on hero copy.
2. Step 2 is pure refactor — piggyback on the Step 1 PR if it keeps the diff small, otherwise follow-up.
3. Step 3 unlocks Steps 4 and 5 visually. Ship as its own PR.
4. Steps 4 and 5 can ship in either order.
