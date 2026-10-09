# a2c04fb0 (a2c04fb0fc31) → aafc411b (aafc411beb03)

| Platform | Group           | Metric                                          | Before   | After    | Change           | p90 before → after |
| -------- | --------------- | ----------------------------------------------- | -------- | -------- | ---------------- | ------------------ |
| ios      | launch          | Launch to first screen (end to end)             | 2428     | 2281     | -147 (-6.1%)     | 2445 → 2291.7      |
| ios      | launch          | Launch to bundle start (native, before JS)      | 1978.8   | 1983.4   | +4.6 (+0.2%)     | 1995.5 → 1995.3    |
| ios      | launch          | Bundle start to first screen                    | 444.8    | 298.6    | -146.2 (-32.9%)  | 451.9 → 304.5      |
| ios      | launch          | Bundle start to initializeApp                   | 197.3    | 164.7    | -32.6 (-16.5%)   | 203.4 → 172.5      |
| ios      | launch          | initializeApp to App render                     | 6.9      | 7.1      | +0.2 (+2.9%)     | 7 → 7.3            |
| ios      | launch          | App render to tree render                       | 62.4     | 35.3     | -27.1 (-43.4%)   | 63.2 → 36.2        |
| ios      | launch          | Tree render to navigation ready                 | 178.2    | 89       | -89.2 (-50.1%)   | 179.3 → 91.1       |
| ios      | launch          | JS blocked in 8 s after first screen            | 52       | 151      | +99 (+190.4%)    | 113.2 → 156.1      |
| ios      | launch          | Network requests by 8 s after first screen      | 3        | 2        | -1 (-33.3%)      | 3 → 3              |
| ios      | launch          | JS heap after launch (MB)                       | 76       | 64       | -12 (-15.8%)     | 76 → 64            |
| ios      | launch          | RSS after launch (MB)                           | 608      | 567      | -41 (-6.7%)      | 608.2 → 567.1      |
| ios      | launch          | iOS simctl launch command                       | 130.5    | 130.5    | 0 (0%)           | 134.3 → 134        |
| ios      | foreground      | JS blocked (ms)                                 | 64       | 61       | -3 (-4.7%)       | 64.6 → 61.6        |
| ios      | foreground      | account:reconcile                               | 1        | 0        | -1 (-100%)       |                    |
| ios      | foreground      | buddies:sync                                    | 1        | 1        | 0 (0%)           |                    |
| ios      | foreground      | calendar:run                                    | 1        | 1        | 0 (0%)           |                    |
| ios      | foreground      | flags:reload                                    | 1        | 0        | -1 (-100%)       |                    |
| ios      | foreground      | http:request                                    | 0        | 1        | +1               |                    |
| ios      | foreground      | net:127.0.0.1:8780/buddies/v1/inbox             | 0        | 1        | +1               |                    |
| ios      | foreground      | net:total                                       | 1        | 1        | 0 (0%)           |                    |
| ios      | foreground      | net:ww-api-r.leviwilkerson.com/flags            | 1        | 0        | -1 (-100%)       |                    |
| ios      | foreground      | reminders:cancel                                | 3        | 0        | -3 (-100%)       |                    |
| ios      | foreground      | reminders:schedule                              | 3        | 0        | -3 (-100%)       |                    |
| ios      | foreground      | reminders:skip                                  | 0        | 1        | +1               |                    |
| ios      | foreground      | render:App                                      | 3        | 0        | -3 (-100%)       |                    |
| ios      | foreground      | sync:catchUp                                    | 1        | 1        | 0 (0%)           |                    |
| ios      | foreground      | watch:push                                      | 1        | 1        | 0 (0%)           |                    |
| ios      | foreground      | widget:push                                     | 2        | 2        | 0 (0%)           |                    |
| ios      | foreground      | widget:reload                                   | 2        | 0        | -2 (-100%)       |                    |
| ios      | foreground      | widget:skip                                     | 0        | 2        | +2               |                    |
| ios      | foreground      | ws:127.0.0.1:8780/buddies/v1/inbox              | 1        | 1        | 0 (0%)           |                    |
| ios      | foreground      | ws:open                                         | 1        | 1        | 0 (0%)           |                    |
| ios      | active          | JS blocked (ms)                                 | 54       | 0        | -54 (-100%)      | 94 → 0             |
| ios      | active          | account:reconcile                               | 1        | 0        | -1 (-100%)       |                    |
| ios      | active          | buddies:sync                                    | 1        | 0        | -1 (-100%)       |                    |
| ios      | active          | calendar:run                                    | 1        | 0        | -1 (-100%)       |                    |
| ios      | active          | flags:reload                                    | 1        | 0        | -1 (-100%)       |                    |
| ios      | active          | net:total                                       | 1        | 0        | -1 (-100%)       |                    |
| ios      | active          | net:ww-api-r.leviwilkerson.com/flags            | 1        | 0        | -1 (-100%)       |                    |
| ios      | active          | reminders:cancel                                | 3        | 0        | -3 (-100%)       |                    |
| ios      | active          | reminders:schedule                              | 3        | 0        | -3 (-100%)       |                    |
| ios      | active          | render:App                                      | 3        | 0        | -3 (-100%)       |                    |
| ios      | active          | sync:catchUp                                    | 1        | 0        | -1 (-100%)       |                    |
| ios      | active          | watch:push                                      | 1        | 0        | -1 (-100%)       |                    |
| ios      | active          | widget:push                                     | 2        | 0        | -2 (-100%)       |                    |
| ios      | active          | widget:reload                                   | 2        | 0        | -2 (-100%)       |                    |
| ios      | launch counters | account:reconcile                               | 3        | 3        | 0 (0%)           |                    |
| ios      | launch counters | buddies:sync                                    | 0        | 0        | 0                |                    |
| ios      | launch counters | buddies:syncFloor                               | 0        | 1        | +1               |                    |
| ios      | launch counters | calendar:run                                    | 1        | 1        | 0 (0%)           |                    |
| ios      | launch counters | flags:reload                                    | 1        | 1        | 0 (0%)           |                    |
| ios      | launch counters | http:request                                    | 0        | 0        | 0                |                    |
| ios      | launch counters | net:127.0.0.1:8780/buddies/v1/inbox             | 0        | 0        | 0                |                    |
| ios      | launch counters | net:total                                       | 3        | 2        | -1 (-33.3%)      |                    |
| ios      | launch counters | net:ww-api-r.leviwilkerson.com/array/:id/config | 1        | 1        | 0 (0%)           |                    |
| ios      | launch counters | net:ww-api-r.leviwilkerson.com/flags            | 2        | 1        | -1 (-50%)        |                    |
| ios      | launch counters | rc:identify                                     | 1        | 1        | 0 (0%)           |                    |
| ios      | launch counters | reminders:cancel                                | 4        | 0        | -4 (-100%)       |                    |
| ios      | launch counters | reminders:schedule                              | 4        | 0        | -4 (-100%)       |                    |
| ios      | launch counters | reminders:skip                                  | 0        | 1        | +1               |                    |
| ios      | launch counters | render:App                                      | 5        | 4        | -1 (-20%)        |                    |
| ios      | launch counters | render:Home                                     | 1        | 1        | 0 (0%)           |                    |
| ios      | launch counters | sync:catchUp                                    | 1        | 1        | 0 (0%)           |                    |
| ios      | launch counters | watch:push                                      | 1        | 1        | 0 (0%)           |                    |
| ios      | launch counters | widget:push                                     | 2        | 1        | -1 (-50%)        |                    |
| ios      | launch counters | widget:reload                                   | 2        | 0        | -2 (-100%)       |                    |
| ios      | launch counters | widget:skip                                     | 0        | 1        | +1               |                    |
| ios      | launch counters | ws:127.0.0.1:8780/buddies/v1/inbox              | 1        | 1        | 0 (0%)           |                    |
| ios      | launch counters | ws:open                                         | 1        | 1        | 0 (0%)           |                    |
| android  | launch          | Launch to first screen (end to end)             | 884      | 683.5    | -200.5 (-22.7%)  | 943.5 → 702.7      |
| android  | launch          | Launch to bundle start (native, before JS)      | 207.6    | 218.2    | +10.6 (+5.1%)    | 231.1 → 254.2      |
| android  | launch          | Bundle start to first screen                    | 692.6    | 462.2    | -230.4 (-33.3%)  | 712.4 → 477.3      |
| android  | launch          | Bundle start to initializeApp                   | 330.7    | 287.7    | -43 (-13%)       | 338.9 → 305.5      |
| android  | launch          | initializeApp to App render                     | 2        | 2.2      | +0.2 (+10%)      | 2.4 → 3.8          |
| android  | launch          | App render to tree render                       | 16.7     | 10       | -6.7 (-40.1%)    | 32.4 → 21.9        |
| android  | launch          | Tree render to navigation ready                 | 344      | 157.2    | -186.8 (-54.3%)  | 363.8 → 165        |
| android  | launch          | JS blocked in 8 s after first screen            | 57       | 150      | +93 (+163.2%)    | 66.8 → 179.2       |
| android  | launch          | Network requests by 8 s after first screen      | 3        | 2        | -1 (-33.3%)      | 3 → 3              |
| android  | launch          | JS heap after launch (MB)                       | 56       | 44       | -12 (-21.4%)     | 56 → 44            |
| android  | launch          | RSS after launch (MB)                           | 452      | 414.7    | -37.3 (-8.3%)    | 452.9 → 415.5      |
| android  | launch          | Android TotalTime (am start -W)                 | 559.5    | 533.5    | -26 (-4.6%)      | 597.6 → 580.4      |
| android  | foreground      | JS blocked (ms)                                 | 0        | 0        | 0                | 62 → 66.6          |
| android  | foreground      | account:reconcile                               | 1        | 0        | -1 (-100%)       |                    |
| android  | foreground      | buddies:sync                                    | 1        | 1        | 0 (0%)           |                    |
| android  | foreground      | calendar:run                                    | 1        | 1        | 0 (0%)           |                    |
| android  | foreground      | flags:reload                                    | 1        | 0        | -1 (-100%)       |                    |
| android  | foreground      | http:request                                    | 0        | 1        | +1               |                    |
| android  | foreground      | net:127.0.0.1:8780/buddies/v1/inbox             | 0        | 1        | +1               |                    |
| android  | foreground      | net:total                                       | 1        | 1        | 0 (0%)           |                    |
| android  | foreground      | net:ww-api-r.leviwilkerson.com/flags            | 1        | 0        | -1 (-100%)       |                    |
| android  | foreground      | reminders:cancel                                | 3        | 0        | -3 (-100%)       |                    |
| android  | foreground      | reminders:schedule                              | 3        | 0        | -3 (-100%)       |                    |
| android  | foreground      | reminders:skip                                  | 0        | 1        | +1               |                    |
| android  | foreground      | render:App                                      | 3        | 0        | -3 (-100%)       |                    |
| android  | foreground      | sync:catchUp                                    | 1        | 1        | 0 (0%)           |                    |
| android  | foreground      | watch:push                                      | 1        | 1        | 0 (0%)           |                    |
| android  | foreground      | ws:127.0.0.1:8780/buddies/v1/inbox              | 1        | 1        | 0 (0%)           |                    |
| android  | foreground      | ws:open                                         | 1        | 1        | 0 (0%)           |                    |
| android  | launch counters | account:reconcile                               | 1        | 1        | 0 (0%)           |                    |
| android  | launch counters | buddies:sync                                    | 0        | 0        | 0                |                    |
| android  | launch counters | buddies:syncFloor                               | 0        | 1        | +1               |                    |
| android  | launch counters | calendar:run                                    | 1        | 1        | 0 (0%)           |                    |
| android  | launch counters | flags:reload                                    | 1        | 1        | 0 (0%)           |                    |
| android  | launch counters | http:request                                    | 0        | 0        | 0                |                    |
| android  | launch counters | net:127.0.0.1:8780/buddies/v1/inbox             | 0        | 0        | 0                |                    |
| android  | launch counters | net:total                                       | 3        | 2        | -1 (-33.3%)      |                    |
| android  | launch counters | net:ww-api-r.leviwilkerson.com/array/:id/config | 1        | 1        | 0 (0%)           |                    |
| android  | launch counters | net:ww-api-r.leviwilkerson.com/flags            | 2        | 1        | -1 (-50%)        |                    |
| android  | launch counters | reminders:cancel                                | 3        | 0        | -3 (-100%)       |                    |
| android  | launch counters | reminders:schedule                              | 3        | 0        | -3 (-100%)       |                    |
| android  | launch counters | reminders:skip                                  | 0        | 1        | +1               |                    |
| android  | launch counters | render:App                                      | 6        | 4        | -2 (-33.3%)      |                    |
| android  | launch counters | render:Home                                     | 1        | 1        | 0 (0%)           |                    |
| android  | launch counters | sync:catchUp                                    | 1        | 1        | 0 (0%)           |                    |
| android  | launch counters | watch:push                                      | 2        | 2        | 0 (0%)           |                    |
| android  | launch counters | ws:127.0.0.1:8780/buddies/v1/inbox              | 1        | 1        | 0 (0%)           |                    |
| android  | launch counters | ws:open                                         | 1        | 1        | 0 (0%)           |                    |
| ios      | bundle          | jsBytes                                         | 18686282 | 17316417 | -1369865 (-7.3%) |                    |
| ios      | bundle          | hbcBytes                                        | 23036910 | 21297109 | -1739801 (-7.6%) |                    |
| ios      | bundle          | embeddedHbcBytes                                | 24609337 | 22874455 | -1734882 (-7%)   |                    |
| ios      | bundle          | modules                                         | 7526     | 5981     | -1545 (-20.5%)   |                    |
| android  | bundle          | jsBytes                                         | 18683318 | 17312782 | -1370536 (-7.3%) |                    |
| android  | bundle          | hbcBytes                                        | 22995871 | 21245641 | -1750230 (-7.6%) |                    |
| android  | bundle          | embeddedHbcBytes                                | 20800152 | 19581224 | -1218928 (-5.9%) |                    |
| android  | bundle          | modules                                         | 7512     | 5967     | -1545 (-20.6%)   |                    |
