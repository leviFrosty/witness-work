# Perf baseline: `a2c04fb0` (a2c04fb0fc31)

Captured 2026-10-09T03:21:28.929Z with `node scripts/perf/run.mjs --ref a2c04fb0 --name before-ab`. See [README](./README.md) for what each number means.

## iOS (WW Verify iPhone 1)

10 cold launches measured (after 1 discarded warm-up); machine load 1-min average 3.62 (max 7.14), 68% memory free, 0 other leased devices.

| Cold launch                                | median | p90    | min    | max    |
| ------------------------------------------ | ------ | ------ | ------ | ------ |
| Launch to first screen (end to end)        | 2428   | 2445   | 2409   | 2445   |
| Launch to bundle start (native, before JS) | 1978.8 | 1995.5 | 1964.6 | 1999.6 |
| Bundle start to first screen               | 444.8  | 451.9  | 443.2  | 453.2  |
| Bundle start to initializeApp              | 197.3  | 203.4  | 194.6  | 203.5  |
| initializeApp to App render                | 6.9    | 7      | 6.7    | 7.1    |
| App render to tree render                  | 62.4   | 63.2   | 61.9   | 63.7   |
| Tree render to navigation ready            | 178.2  | 179.3  | 177.3  | 179.3  |
| JS blocked in 8 s after first screen       | 52     | 113.2  | 0      | 115    |
| Network requests by 8 s after first screen | 3      | 3      | 3      | 3      |
| JS heap after launch (MB)                  | 76     | 76     | 76     | 76     |
| RSS after launch (MB)                      | 608    | 608.2  | 607.3  | 608.4  |
| iOS simctl launch command                  | 130.5  | 134.3  | 114    | 137    |

<details><summary>Launch counters (median per launch)</summary>

| Counter                                           | median |
| ------------------------------------------------- | ------ |
| `net:total`                                       | 3      |
| `sync:push`                                       | 0      |
| `sync:pull`                                       | 0      |
| `sync:catchUp`                                    | 1      |
| `reminders:schedule`                              | 4      |
| `reminders:cancel`                                | 4      |
| `widget:push`                                     | 2      |
| `widget:reload`                                   | 2      |
| `watch:push`                                      | 1      |
| `calendar:run`                                    | 1      |
| `flags:reload`                                    | 1      |
| `buddies:sync`                                    | 0      |
| `prefs:set`                                       | 0      |
| `account:reconcile`                               | 3      |
| `rc:identify`                                     | 1      |
| `render:App`                                      | 5      |
| `render:Home`                                     | 1      |
| `net:ww-api-r.leviwilkerson.com/array/:id/config` | 1      |
| `net:ww-api-r.leviwilkerson.com/flags`            | 2      |
| `ws:127.0.0.1:8780/buddies/v1/inbox`              | 1      |
| `ws:open`                                         | 1      |

</details>

### Foreground (background 5 s, then return)

5 cycles; JS blocked in the 8 s after return: median 64 ms, p90 64.6 ms.

| Counter (delta per cycle)              | median |
| -------------------------------------- | ------ |
| `net:total`                            | 1      |
| `sync:push`                            | 0      |
| `sync:pull`                            | 0      |
| `sync:catchUp`                         | 1      |
| `reminders:schedule`                   | 3      |
| `reminders:cancel`                     | 3      |
| `widget:push`                          | 2      |
| `widget:reload`                        | 2      |
| `watch:push`                           | 1      |
| `calendar:run`                         | 1      |
| `flags:reload`                         | 1      |
| `buddies:sync`                         | 1      |
| `prefs:set`                            | 0      |
| `account:reconcile`                    | 1      |
| `rc:identify`                          | 0      |
| `render:App`                           | 3      |
| `render:Home`                          | 0      |
| `net:ww-api-r.leviwilkerson.com/flags` | 1      |
| `ws:127.0.0.1:8780/buddies/v1/inbox`   | 1      |
| `ws:open`                              | 1      |

### Inactive blip

3 cycles; JS blocked in the 8 s after return: median 54 ms, p90 94 ms.

| Counter (delta per cycle)              | median |
| -------------------------------------- | ------ |
| `net:total`                            | 1      |
| `sync:push`                            | 0      |
| `sync:pull`                            | 0      |
| `sync:catchUp`                         | 1      |
| `reminders:schedule`                   | 3      |
| `reminders:cancel`                     | 3      |
| `widget:push`                          | 2      |
| `widget:reload`                        | 2      |
| `watch:push`                           | 1      |
| `calendar:run`                         | 1      |
| `flags:reload`                         | 1      |
| `buddies:sync`                         | 1      |
| `prefs:set`                            | 0      |
| `account:reconcile`                    | 1      |
| `rc:identify`                          | 0      |
| `render:App`                           | 3      |
| `render:Home`                          | 0      |
| `net:ww-api-r.leviwilkerson.com/flags` | 1      |

### Setup

Seeded `busy`; notifications granted, Calendar Sync error: CALENDAR_UNAVAILABLE: undefined reason (at ExpoModulesCore/Promise.swift:65), Buddies inbox ok.

## Android (ww-verify-1)

10 cold launches measured (after 1 discarded warm-up); machine load 1-min average 1.54 (max 2.99), 74% memory free, 0 other leased devices.

| Cold launch                                | median | p90   | min   | max   |
| ------------------------------------------ | ------ | ----- | ----- | ----- |
| Launch to first screen (end to end)        | 884    | 943.5 | 843   | 957   |
| Launch to bundle start (native, before JS) | 207.6  | 231.1 | 161.9 | 231.9 |
| Bundle start to first screen               | 692.6  | 712.4 | 647.4 | 725.1 |
| Bundle start to initializeApp              | 330.7  | 338.9 | 310.8 | 354.5 |
| initializeApp to App render                | 2      | 2.4   | 0.5   | 2.6   |
| App render to tree render                  | 16.7   | 32.4  | 12.6  | 39.2  |
| Tree render to navigation ready            | 344    | 363.8 | 294.2 | 380.2 |
| JS blocked in 8 s after first screen       | 57     | 66.8  | 0     | 119   |
| Network requests by 8 s after first screen | 3      | 3     | 3     | 3     |
| JS heap after launch (MB)                  | 56     | 56    | 56    | 56    |
| RSS after launch (MB)                      | 452    | 452.9 | 425.9 | 452.9 |
| Android TotalTime (am start -W)            | 559.5  | 597.6 | 521   | 603   |

<details><summary>Launch counters (median per launch)</summary>

| Counter                                           | median |
| ------------------------------------------------- | ------ |
| `net:total`                                       | 3      |
| `sync:push`                                       | 0      |
| `sync:pull`                                       | 0      |
| `sync:catchUp`                                    | 1      |
| `reminders:schedule`                              | 3      |
| `reminders:cancel`                                | 3      |
| `widget:push`                                     | 0      |
| `widget:reload`                                   | 0      |
| `watch:push`                                      | 2      |
| `calendar:run`                                    | 1      |
| `flags:reload`                                    | 1      |
| `buddies:sync`                                    | 0      |
| `prefs:set`                                       | 0      |
| `account:reconcile`                               | 1      |
| `rc:identify`                                     | 0      |
| `render:App`                                      | 6      |
| `render:Home`                                     | 1      |
| `net:ww-api-r.leviwilkerson.com/array/:id/config` | 1      |
| `net:ww-api-r.leviwilkerson.com/flags`            | 2      |
| `ws:127.0.0.1:8780/buddies/v1/inbox`              | 1      |
| `ws:open`                                         | 1      |

</details>

### Foreground (background 5 s, then return)

5 cycles; JS blocked in the 8 s after return: median 0 ms, p90 62 ms.

| Counter (delta per cycle)              | median |
| -------------------------------------- | ------ |
| `net:total`                            | 1      |
| `sync:push`                            | 0      |
| `sync:pull`                            | 0      |
| `sync:catchUp`                         | 1      |
| `reminders:schedule`                   | 3      |
| `reminders:cancel`                     | 3      |
| `widget:push`                          | 0      |
| `widget:reload`                        | 0      |
| `watch:push`                           | 1      |
| `calendar:run`                         | 1      |
| `flags:reload`                         | 1      |
| `buddies:sync`                         | 1      |
| `prefs:set`                            | 0      |
| `account:reconcile`                    | 1      |
| `rc:identify`                          | 0      |
| `render:App`                           | 3      |
| `render:Home`                          | 0      |
| `net:ww-api-r.leviwilkerson.com/flags` | 1      |
| `ws:127.0.0.1:8780/buddies/v1/inbox`   | 1      |
| `ws:open`                              | 1      |

### Inactive blip

Not measured: Android has no inactive state

### Setup

Seeded `busy`; notifications granted, Calendar Sync connected, Buddies inbox ok.

## Bundle

| Platform | JS (minified) | Hermes bytecode | Embedded bytecode (probe build) | Modules |
| -------- | ------------- | --------------- | ------------------------------- | ------- |
| ios      | 18248 KB      | 22497 KB        | 24033 KB                        | 7526    |
| android  | 18245 KB      | 22457 KB        | 20313 KB                        | 7512    |
