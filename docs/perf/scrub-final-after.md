# Schedule scrub: scrub-final-after

Commit `3c2b5983a73f`, Release build, WW Verify iPhone 1, scenario `stress`, pattern `drag` (500 ms per cycle, 280 pt each way, 120 Hz touch samples, 8 s per round), median of 8 rounds. Refresh period 16.7 ms.

| Metric                         | UI thread | JS thread |
| ------------------------------ | --------: | --------: |
| Frames per second              |      54.6 |      59.6 |
| Frame time p50 (ms)            |      16.7 |      16.7 |
| Frame time p95 (ms)            |      33.3 |      23.4 |
| Frame time p99 (ms)            |      38.9 |      28.6 |
| Worst frame (ms)               |      43.9 |      38.5 |
| Hitches (frames > 1.5 periods) |        44 |      12.5 |
| Frames > 33 ms                 |        17 |         1 |
| Missed refreshes               |      45.5 |      12.5 |
| Dropped (% of refreshes)       |       9.1 |       2.4 |
| Hitch time ratio (ms/s)        |      90.7 |      17.6 |

| Counter (per round)            | Median |
| ------------------------------ | -----: |
| `render:CalendarDay`           | 1165.5 |
| `render:DayCell`               | 1165.5 |
| `render:FocusVeil`             |  199.5 |
| `render:MonthGoalMeter`        |     34 |
| `render:ScheduleCalendarStage` |     32 |
| `render:ScheduleMonthHeader`   |     33 |
| `render:ScheduleMonthView`     |     32 |
| `render:ScheduleScreen`        |     32 |
| `render:ScheduleWeekRow`       |  199.5 |
| `schedule:focus`               |     34 |
| `schedule:scroll`              |    601 |
| Hermes GCs                     |     77 |
