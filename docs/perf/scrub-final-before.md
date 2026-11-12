# Schedule scrub: scrub-final-before

Commit `e9bc9a17f763`, Release build, WW Verify iPhone 1, scenario `stress`, pattern `drag` (500 ms per cycle, 280 pt each way, 120 Hz touch samples, 8 s per round), median of 8 rounds. Refresh period 16.7 ms.

| Metric                         | UI thread | JS thread |
| ------------------------------ | --------: | --------: |
| Frames per second              |      42.4 |      18.7 |
| Frame time p50 (ms)            |      16.7 |      16.7 |
| Frame time p95 (ms)            |      48.9 |     251.6 |
| Frame time p99 (ms)            |      61.5 |     391.6 |
| Worst frame (ms)               |      75.5 |     497.7 |
| Hitches (frames > 1.5 periods) |     101.5 |        46 |
| Frames > 33 ms                 |        52 |        34 |
| Missed refreshes               |     147.5 |     353.5 |
| Dropped (% of refreshes)       |      29.4 |      69.4 |
| Hitch time ratio (ms/s)        |       281 |     694.6 |

| Counter (per round)            | Median |
| ------------------------------ | -----: |
| `render:CalendarDay`           |   8565 |
| `render:DayCell`               |   8565 |
| `render:FocusVeil`             |  216.5 |
| `render:MonthGoalMeter`        |   69.5 |
| `render:ScheduleCalendarStage` |   69.5 |
| `render:ScheduleMonthHeader`   |  304.5 |
| `render:ScheduleMonthView`     |   69.5 |
| `render:ScheduleScreen`        |     72 |
| `render:ScheduleWeekRow`       |   1452 |
| `schedule:focus`               |     34 |
| `schedule:scroll`              |  353.5 |
| Hermes GCs                     |    477 |
