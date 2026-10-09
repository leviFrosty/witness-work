# Perf baseline: `9ec4ab0b` (9ec4ab0bbbad)

Captured 2026-10-09T02:51:49.314Z with `node scripts/perf/run.mjs --ref 9ec4ab0b --name baseline-9ec4ab0b --wait 110`. See [README](./README.md) for what each number means.

## iOS (WW Verify iPhone 1)

10 cold launches measured (after 1 discarded warm-up); machine load 1-min average 4.29 (max 8.38), 69% memory free, 0 other leased devices.

| Cold launch                                | median | p90    | min    | max    |
| ------------------------------------------ | ------ | ------ | ------ | ------ |
| Launch to first screen (end to end)        | 2427   | 2437.7 | 2401   | 2444   |
| Launch to bundle start (native, before JS) | 1984.4 | 1994.8 | 1967.6 | 2000.7 |
| Bundle start to first screen               | 441.1  | 449.7  | 433.4  | 452.7  |
| Bundle start to initializeApp              | 194.1  | 201.1  | 184.4  | 203.6  |
| initializeApp to App render                | 7      | 7.4    | 6.6    | 7.7    |
| App render to tree render                  | 62.3   | 63.7   | 61.6   | 66.7   |
| Tree render to navigation ready            | 178.3  | 179.2  | 176.8  | 179.7  |
| JS blocked in 8 s after first screen       | 51.5   | 110.1  | 50     | 111    |
| Network requests by 8 s after first screen | 3      | 3      | 3      | 3      |
| JS heap after launch (MB)                  | 76     | 76     | 76     | 76     |
| RSS after launch (MB)                      | 608.3  | 608.6  | 607.5  | 608.6  |
| iOS simctl launch command                  | 129    | 132.6  | 126    | 138    |

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

5 cycles; JS blocked in the 8 s after return: median 63 ms, p90 66.6 ms.

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

3 cycles; JS blocked in the 8 s after return: median 55 ms, p90 96.6 ms.

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

10 cold launches measured (after 1 discarded warm-up); machine load 1-min average 2.38 (max 3.62), 75% memory free, 0 other leased devices.

| Cold launch                                | median | p90   | min   | max   |
| ------------------------------------------ | ------ | ----- | ----- | ----- |
| Launch to first screen (end to end)        | 915.5  | 956.5 | 869   | 979   |
| Launch to bundle start (native, before JS) | 223.4  | 238.4 | 188.7 | 244.6 |
| Bundle start to first screen               | 688.5  | 745.4 | 636.6 | 782.1 |
| Bundle start to initializeApp              | 322.8  | 346.4 | 300.3 | 376.7 |
| initializeApp to App render                | 2.1    | 2.3   | 0.6   | 2.3   |
| App render to tree render                  | 17.1   | 50.2  | 12.9  | 53.3  |
| Tree render to navigation ready            | 337.5  | 364.5 | 316.2 | 371.9 |
| JS blocked in 8 s after first screen       | 52     | 55.3  | 0     | 58    |
| Network requests by 8 s after first screen | 3      | 3     | 3     | 3     |
| JS heap after launch (MB)                  | 56     | 56    | 56    | 56    |
| RSS after launch (MB)                      | 453.2  | 455   | 452.5 | 455.5 |
| Android TotalTime (am start -W)            | 580.5  | 594.5 | 541   | 599   |

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

5 cycles; JS blocked in the 8 s after return: median 0 ms, p90 38.4 ms.

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
