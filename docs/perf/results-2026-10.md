# Performance and network overhaul: before and after (October 2026)

Release builds of the development app on an iPhone simulator and an Android emulator (`scripts/perf`, see [README](./README.md)). Both commits were measured back to back on the same quiet machine: 10 cold launches, 5 returns from the background and 3 iOS Control Center blips per platform. Medians, with p90 in [`comparison-before-after.md`](./comparison-before-after.md); raw runs are in [`before-ab.json`](./before-ab.json) and [`after-ab2.json`](./after-ab2.json).

- **Before:** `a2c04fb0`, today's app plus the probe and runner.
- **After:** `aafc411b`, the whole stack (#678 to #684 on top of #677 and #685).

## Launch

| Median, ms                           | iOS before | iOS after      | Android before | Android after  |
| ------------------------------------ | ---------- | -------------- | -------------- | -------------- |
| Launch to first screen (end to end)  | 2428       | **2281 (−6%)** | 884            | **684 (−23%)** |
| Bundle start to first screen (JS)    | 445        | **299 (−33%)** | 693            | **462 (−33%)** |
| Native time before JS                | 1979       | 1983           | 208            | 218            |
| JS blocked in 8 s after first screen | 52         | 151            | 57             | 150            |
| Network requests at launch           | 3          | 2              | 3              | 2              |
| JS heap after launch (MB)            | 76         | **64 (−16%)**  | 56             | **44 (−21%)**  |
| RSS after launch (MB)                | 608        | 567            | 452            | 415            |

The JS-blocked time after the first screen went up because launch work that used to hold the splash now runs after the first screen, one piece per idle period. Total JS time dropped and the first screen comes about a third sooner. Measuring each piece's cost, and splitting the longest one, is follow-up work.

iOS native time before JS (about 2 s, including about 130 ms of `simctl`) didn't change. Nothing in this overhaul touched it.

## Each return from the background

| Median per return               | iOS before | iOS after | Android before | Android after |
| ------------------------------- | ---------- | --------- | -------------- | ------------- |
| Reminders cancelled + scheduled | 3 + 3      | **0**     | 3 + 3          | **0**         |
| Widget timeline reloads         | 2          | **0**     | –              | –             |
| Feature-flag requests           | 1          | **0**     | 1              | **0**         |
| Account reconcile               | 1          | **0**     | 1              | **0**         |
| `App` re-renders                | 3          | **0**     | 3              | **0**         |

## iOS inactive blips (Control Center, Face ID, system sheets)

Before, each blip re-ran the whole foreground workload: reminders, widgets, watch, calendar, flags, Buddies, sync catch-up and account reconcile, with 54 ms of JS blocking. After, a blip does nothing (every counter 0, 0 ms blocked).

## Bundle

|                 | Before  | After            |
| --------------- | ------- | ---------------- |
| Modules         | 7,526   | **5,981 (−21%)** |
| Minified JS     | 18.7 MB | 17.3 MB (−7%)    |
| Hermes bytecode | 23.0 MB | 21.3 MB (−8%)    |

## Not covered by these numbers

iCloud and Google Drive sync, iOS Calendar Sync publishing, and RevenueCat's native work don't run in the profiling builds (see the README's Limits). Their improvements were measured by their own PRs against the fake Drive server and on dev builds:

- **Sync (#679):** three returns with no edits went from 12 Drive requests to 3 listings.
- **Buddies (#682):** returning to the app runs one sync instead of two, and the open Buddies screen and code panel stop polling (from 4 and 20 syncs a minute to 0).
