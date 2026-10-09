# Perf baseline: `aafc411b` (aafc411beb03)

Captured 2026-10-09T04:05:38.591Z with `node scripts/perf/run.mjs --ref aafc411b --name after-ab2`. See [README](./README.md) for what each number means.

## iOS (WW Verify iPhone 1)

10 cold launches measured (after 1 discarded warm-up); machine load 1-min average 3.47 (max 6.98), 67% memory free, 0 other leased devices.

| Cold launch                                | median | p90    | min    | max   |
| ------------------------------------------ | ------ | ------ | ------ | ----- |
| Launch to first screen (end to end)        | 2281   | 2291.7 | 2268   | 2325  |
| Launch to bundle start (native, before JS) | 1983.4 | 1995.3 | 1969.6 | 2021  |
| Bundle start to first screen               | 298.6  | 304.5  | 289.7  | 308.9 |
| Bundle start to initializeApp              | 164.7  | 172.5  | 157.6  | 175.2 |
| initializeApp to App render                | 7.1    | 7.3    | 6.7    | 7.6   |
| App render to tree render                  | 35.3   | 36.2   | 34.6   | 36.4  |
| Tree render to navigation ready            | 89     | 91.1   | 88.4   | 91.2  |
| JS blocked in 8 s after first screen       | 151    | 156.1  | 149    | 157   |
| Network requests by 8 s after first screen | 2      | 3      | 2      | 3     |
| JS heap after launch (MB)                  | 64     | 64     | 64     | 64    |
| RSS after launch (MB)                      | 567    | 567.1  | 566.7  | 567.3 |
| iOS simctl launch command                  | 130.5  | 134    | 122    | 134   |

<details><summary>Launch counters (median per launch)</summary>

| Counter                                           | median |
| ------------------------------------------------- | ------ |
| `net:total`                                       | 2      |
| `sync:push`                                       | 0      |
| `sync:pull`                                       | 0      |
| `sync:catchUp`                                    | 1      |
| `reminders:schedule`                              | 0      |
| `reminders:cancel`                                | 0      |
| `widget:push`                                     | 1      |
| `widget:reload`                                   | 0      |
| `watch:push`                                      | 1      |
| `calendar:run`                                    | 1      |
| `flags:reload`                                    | 1      |
| `buddies:sync`                                    | 0      |
| `prefs:set`                                       | 0      |
| `account:reconcile`                               | 3      |
| `rc:identify`                                     | 1      |
| `render:App`                                      | 4      |
| `render:Home`                                     | 1      |
| `buddies:syncFloor`                               | 1      |
| `http:request`                                    | 0      |
| `net:127.0.0.1:8780/buddies/v1/inbox`             | 0      |
| `net:ww-api-r.leviwilkerson.com/array/:id/config` | 1      |
| `net:ww-api-r.leviwilkerson.com/flags`            | 1      |
| `reminders:skip`                                  | 1      |
| `widget:skip`                                     | 1      |
| `ws:127.0.0.1:8780/buddies/v1/inbox`              | 1      |
| `ws:open`                                         | 1      |

</details>

### Foreground (background 5 s, then return)

5 cycles; JS blocked in the 8 s after return: median 61 ms, p90 61.6 ms.

| Counter (delta per cycle)             | median |
| ------------------------------------- | ------ |
| `net:total`                           | 1      |
| `sync:push`                           | 0      |
| `sync:pull`                           | 0      |
| `sync:catchUp`                        | 1      |
| `reminders:schedule`                  | 0      |
| `reminders:cancel`                    | 0      |
| `widget:push`                         | 2      |
| `widget:reload`                       | 0      |
| `watch:push`                          | 1      |
| `calendar:run`                        | 1      |
| `flags:reload`                        | 0      |
| `buddies:sync`                        | 1      |
| `prefs:set`                           | 0      |
| `account:reconcile`                   | 0      |
| `rc:identify`                         | 0      |
| `render:App`                          | 0      |
| `render:Home`                         | 0      |
| `http:request`                        | 1      |
| `net:127.0.0.1:8780/buddies/v1/inbox` | 1      |
| `reminders:skip`                      | 1      |
| `widget:skip`                         | 2      |
| `ws:127.0.0.1:8780/buddies/v1/inbox`  | 1      |
| `ws:open`                             | 1      |

### Inactive blip

3 cycles; JS blocked in the 8 s after return: median 0 ms, p90 0 ms.

| Counter (delta per cycle) | median |
| ------------------------- | ------ |
| `net:total`               | 0      |
| `sync:push`               | 0      |
| `sync:pull`               | 0      |
| `sync:catchUp`            | 0      |
| `reminders:schedule`      | 0      |
| `reminders:cancel`        | 0      |
| `widget:push`             | 0      |
| `widget:reload`           | 0      |
| `watch:push`              | 0      |
| `calendar:run`            | 0      |
| `flags:reload`            | 0      |
| `buddies:sync`            | 0      |
| `prefs:set`               | 0      |
| `account:reconcile`       | 0      |
| `rc:identify`             | 0      |
| `render:App`              | 0      |
| `render:Home`             | 0      |

### Setup

Seeded `busy`; notifications granted, Calendar Sync error: CALENDAR_UNAVAILABLE: undefined reason (at ExpoModulesCore/Promise.swift:65), Buddies inbox ok.

## Android (ww-verify-1)

10 cold launches measured (after 1 discarded warm-up); machine load 1-min average 2.76 (max 3.36), 73% memory free, 0 other leased devices.

| Cold launch                                | median | p90   | min   | max   |
| ------------------------------------------ | ------ | ----- | ----- | ----- |
| Launch to first screen (end to end)        | 683.5  | 702.7 | 652   | 745   |
| Launch to bundle start (native, before JS) | 218.2  | 254.2 | 196.5 | 268.3 |
| Bundle start to first screen               | 462.2  | 477.3 | 438.5 | 482.7 |
| Bundle start to initializeApp              | 287.7  | 305.5 | 272.3 | 313.7 |
| initializeApp to App render                | 2.2    | 3.8   | 0.8   | 4.1   |
| App render to tree render                  | 10     | 21.9  | 7.6   | 23.7  |
| Tree render to navigation ready            | 157.2  | 165   | 123.2 | 172.3 |
| JS blocked in 8 s after first screen       | 150    | 179.2 | 135   | 190   |
| Network requests by 8 s after first screen | 2      | 3     | 2     | 3     |
| JS heap after launch (MB)                  | 44     | 44    | 44    | 44    |
| RSS after launch (MB)                      | 414.7  | 415.5 | 414.2 | 415.6 |
| Android TotalTime (am start -W)            | 533.5  | 580.4 | 503   | 584   |

<details><summary>Launch counters (median per launch)</summary>

| Counter                                           | median |
| ------------------------------------------------- | ------ |
| `net:total`                                       | 2      |
| `sync:push`                                       | 0      |
| `sync:pull`                                       | 0      |
| `sync:catchUp`                                    | 1      |
| `reminders:schedule`                              | 0      |
| `reminders:cancel`                                | 0      |
| `widget:push`                                     | 0      |
| `widget:reload`                                   | 0      |
| `watch:push`                                      | 2      |
| `calendar:run`                                    | 1      |
| `flags:reload`                                    | 1      |
| `buddies:sync`                                    | 0      |
| `prefs:set`                                       | 0      |
| `account:reconcile`                               | 1      |
| `rc:identify`                                     | 0      |
| `render:App`                                      | 4      |
| `render:Home`                                     | 1      |
| `buddies:syncFloor`                               | 1      |
| `http:request`                                    | 0      |
| `net:127.0.0.1:8780/buddies/v1/inbox`             | 0      |
| `net:ww-api-r.leviwilkerson.com/array/:id/config` | 1      |
| `net:ww-api-r.leviwilkerson.com/flags`            | 1      |
| `reminders:skip`                                  | 1      |
| `ws:127.0.0.1:8780/buddies/v1/inbox`              | 1      |
| `ws:open`                                         | 1      |

</details>

### Foreground (background 5 s, then return)

5 cycles; JS blocked in the 8 s after return: median 0 ms, p90 66.6 ms.

| Counter (delta per cycle)             | median |
| ------------------------------------- | ------ |
| `net:total`                           | 1      |
| `sync:push`                           | 0      |
| `sync:pull`                           | 0      |
| `sync:catchUp`                        | 1      |
| `reminders:schedule`                  | 0      |
| `reminders:cancel`                    | 0      |
| `widget:push`                         | 0      |
| `widget:reload`                       | 0      |
| `watch:push`                          | 1      |
| `calendar:run`                        | 1      |
| `flags:reload`                        | 0      |
| `buddies:sync`                        | 1      |
| `prefs:set`                           | 0      |
| `account:reconcile`                   | 0      |
| `rc:identify`                         | 0      |
| `render:App`                          | 0      |
| `render:Home`                         | 0      |
| `http:request`                        | 1      |
| `net:127.0.0.1:8780/buddies/v1/inbox` | 1      |
| `reminders:skip`                      | 1      |
| `ws:127.0.0.1:8780/buddies/v1/inbox`  | 1      |
| `ws:open`                             | 1      |

### Inactive blip

Not measured: Android has no inactive state

### Setup

Seeded `busy`; notifications granted, Calendar Sync connected, Buddies inbox ok.

## Bundle

| Platform | JS (minified) | Hermes bytecode | Embedded bytecode (probe build) | Modules |
| -------- | ------------- | --------------- | ------------------------------- | ------- |
| ios      | 16911 KB      | 20798 KB        | 22338 KB                        | 5981    |
| android  | 16907 KB      | 20748 KB        | 19122 KB                        | 5967    |
