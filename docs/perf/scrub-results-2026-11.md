# Schedule scrub: before and after (November 2026)

What a person feels when they hold a finger on the Schedule's month list and move it quickly up and down across a month boundary. Measured with `scripts/perf/scrub.mjs` (see [README](./README.md#scroll-smoothness-the-schedule-scrub)): Release probe builds on the WW Verify iPhone simulator (60 Hz), `stress` data (six years of hours, 420 Plans with 20 Recurring), real HID touch input at 120 Hz on a 500 ms up-and-down cycle of 280 pt, 8 rounds of 8 s, medians. Each round starts from the same list position, so every round crosses a month boundary 34 times. Raw rounds: [`scrub-final-before.json`](./scrub-final-before.json), [`scrub-final-after.json`](./scrub-final-after.json).

## Result

| Metric                            | Before |    After |
| --------------------------------- | -----: | -------: |
| UI thread frames per second       |   42.4 | **54.6** |
| UI frame time p95 (ms)            |   48.9 | **33.3** |
| UI worst frame (ms)               |   75.5 | **43.9** |
| UI dropped (% of refreshes)       |   29.4 |  **9.1** |
| UI hitch time ratio (ms/s)        |    281 | **90.7** |
| JS thread frames per second       |   18.7 | **59.6** |
| JS frame time p95 (ms)            |  251.6 | **23.4** |
| JS worst frame (ms)               |  497.7 | **38.5** |
| JS dropped (% of refreshes)       |   69.4 |  **2.4** |
| Day cell renders per round        |   8565 | **1166** |
| Week row renders per round        |   1452 |  **200** |
| Schedule screen renders per round |     72 |   **32** |
| Hermes GCs per round              |    477 |   **77** |

The remaining screen renders follow the header hiding and showing as the finger changes direction, which is the intended behavior.

## What was slow, and the fix

Found with the counters above, Instruments Time Profiler traces of the Release build, and CDP samples of the dev build's JS thread.

1. **Every month change re-rendered the whole screen.** The focused month lived in `useScheduleCalendar` state, so each crossing re-rendered the screen, the list, every mounted row and every day cell, and each cell re-parsed its date and expanded every Recurring Plan for its day. The focus now lives in a small store (`ScheduleFocusStore`) that only the month meter, the iPad side panel and the Today button subscribe to.
2. **Day cells computed on the fly.** Each month's cells are now built once into `CalendarDayModel`s (`scheduleMonthModels`), cached against the store snapshots they came from (the day index and the Recurring Plans array) plus locale and time zone, so any edit invalidates exactly what it changes. Recurring Plans are filtered to the month first (`recurringPlansOverlapping`), so the cost scales with the plans that can fall in that month, not every plan ever made. The months around the focus are built ahead in idle time. `plannedMinutesThroughDayForMonth` and `buildScheduleDayIndex` are cached the same way.
3. **The React Compiler silently skipped `ScheduleScreen`.** A ref read before its declaration made the shipping compiler bail out (the ESLint plugin didn't flag it), so `pressDay` changed on every render and no row memo held. Fixed, and `scheduleCompiler.test.ts` now compiles the hot-path files through the real Babel pipeline and fails on any bailout.
4. **Focus veils restarted an animation on every row.** Each row's veil now animates only when its own month gains or loses focus.
5. **The scroll-away header animated `marginBottom`.** That re-laid out the whole screen and every SwiftUI host each frame. The header now changes layout once and slides the content with a transform (`useScrollAwayMotion`).
6. **`@expo/ui` watched every host's global frame.** Its safe-area mitigation re-ran for every day cell on every scroll frame. The patch now observes only horizontal placement.

### Step by step

Earlier probe (some rounds crossed few months), 6 rounds each:

| Step                                 | UI fps | UI dropped % | JS fps | Day cell renders |
| ------------------------------------ | -----: | -----------: | -----: | ---------------: |
| Before                               |   42.7 |         28.9 |   24.8 |             7433 |
| 1. Focus store, cached day models    |   44.1 |         26.5 |   51.7 |             4307 |
| 2. Compile `ScheduleScreen`          |   45.3 |         24.7 |   59.4 |             1099 |
| 3. Quiet veils and `@expo/ui` frames |   52.1 |         13.2 |   59.7 |             1049 |
| 4. Header slides with a transform    |   56.9 |          5.1 |   59.8 |             1184 |

## Experiments not shipped

| Experiment                                     | UI fps | UI dropped % | Verdict                     |
| ---------------------------------------------- | -----: | -----------: | --------------------------- |
| Header never hides (to size its cost)          |   58.0 |          3.4 | Changes the UX              |
| FlashList `drawDistance` of 8 rows             |   50.1 |         16.7 | Worse                       |
| Reanimated `IOS_SYNCHRONOUSLY_UPDATE_UI_PROPS` |   55.0 |          8.5 | Within noise, app-wide risk |

## What's left

In the after trace, the main thread's remaining time during a scrub goes mostly to SwiftUI rendering and layout of the per-cell `@expo/ui` `Host` (one per day cell, for the context menu; about 27%), and to React Native's scroll view walking its subtree to update clipping after each mounting transaction (about 17%). Replacing the per-cell hosts with one native context menu interaction per row is the next step if the UI thread needs more.
