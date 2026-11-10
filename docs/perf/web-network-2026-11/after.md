# Web network capture: after

- URL: http://localhost:4173/
- Captured: 2026-11-10T07:57:12.078Z
- Browser: Chrome/156.0.8078.4

## cold load

424 requests on the network (7 CORS preflights), 11 answered by the service worker, 0 by the HTTP cache, 0 failed. Sent 169.5 KB, received 50197.5 KB on the wire (50117.7 KB decoded). Last response at 2.7 s.

| Group        | Requests |     Sent | Received (wire) | Received (decoded) |
| ------------ | -------: | -------: | --------------: | -----------------: |
| app (static) |      406 | 155.2 KB |      50191.5 KB |         50111.9 KB |
| PostHog      |        4 |   2.5 KB |          1.8 KB |             3.4 KB |
| ww-api       |       14 |  11.8 KB |          4.2 KB |             2.4 KB |

**Sent more than once:**

- `GET localhost:4173/canvaskit.wasm` ×2
- `POST 127.0.0.1:8790/accounts/v1/sync/list` ×2

|   # |      At | Method  | URL                                                                             | Status | From           | Type      |   Sent |      Wire |   Decoded | Encoding | Cache-Control       |   Took | Trigger   |
| --: | ------: | ------- | ------------------------------------------------------------------------------- | -----: | -------------- | --------- | -----: | --------: | --------: | -------- | ------------------- | -----: | --------- |
|   0 |    0 ms | GET     | `/`                                                                             |    200 | network        | Document  |  642 B |    5.3 KB |    5.2 KB | —        | —                   |   2 ms | other     |
|   1 |    6 ms | GET     | `/launch-splash.js`                                                             |    200 | network        | Script    |  487 B |    1.5 KB |    1.3 KB | —        | —                   |   4 ms | parser    |
|   2 |    6 ms | GET     | `/_expo/static/js/web/__expo-metro-runtime-8c088df8….js`                        |    200 | network        | Script    |  487 B |    3.8 KB |    3.7 KB | —        | —                   |   4 ms | parser    |
|   3 |    6 ms | GET     | `/_expo/static/js/web/index-3b0fa729….js`                                       |    200 | network        | Script    |  487 B | 9839.1 KB | 9837.6 KB | —        | —                   | 141 ms | parser    |
|   4 |   13 ms | GET     | `/manifest.webmanifest`                                                         |    200 | network        | Manifest  |  486 B |     722 B |     539 B | —        | —                   |   1 ms | parser    |
|   5 |  220 ms | GET     | `/favicon.ico`                                                                  |    200 | network        | Other     |  557 B |   14.3 KB |   14.2 KB | —        | —                   |   1 ms | other     |
|   6 |  223 ms | GET     | `/icons/icon-192.png`                                                           |    200 | network        | Other     |  557 B |    6.9 KB |    6.7 KB | —        | —                   |   0 ms | other     |
|   7 |  320 ms | OPTIONS | `ww-api-r.leviwilkerson.com/array/<project key>/config`                         |    200 | network        | Preflight |  609 B |       0 B |         — | —        | —                   |  43 ms | preflight |
|   8 |  314 ms | GET     | `/_expo/static/js/web/en-US-10c3b7b4….js`                                       |    200 | network        | Script    |  308 B |  367.8 KB |  367.6 KB | —        | —                   |   4 ms | script    |
|   9 |  319 ms | GET     | `ww-api-r.leviwilkerson.com/array/<project key>/config`                         |    200 | network        | Fetch     |  658 B |    1.5 KB |    3.2 KB | gzip     | public, max-age=300 |  73 ms | script    |
|  10 |  510 ms | GET     | `/assets/node_modules/@expo-google-fonts/inter/Inter_400Regular.079af0e2….ttf`  |    200 | network        | Font      |  513 B |  302.8 KB |  302.6 KB | —        | —                   |   4 ms | other     |
|  11 |  510 ms | GET     | `/assets/node_modules/@expo-google-fonts/inter/Inter_500Medium.ed533866….ttf`   |    200 | network        | Font      |  513 B |  307.5 KB |  307.3 KB | —        | —                   |   4 ms | other     |
|  12 |  510 ms | GET     | `/assets/node_modules/@expo-google-fonts/inter/Inter_600SemiBold.07a48beb….ttf` |    200 | network        | Font      |  513 B |  308.6 KB |  308.4 KB | —        | —                   |   4 ms | other     |
|  13 |  511 ms | GET     | `/assets/node_modules/@expo-google-fonts/inter/Inter_700Bold.275bfea5….ttf`     |    200 | network        | Font      |  513 B |  308.9 KB |  308.7 KB | —        | —                   |   5 ms | other     |
|  14 |  522 ms | GET     | `127.0.0.1:8790/scribe/v1/status`                                               |    200 | network        | Fetch     |  308 B |     589 B |     452 B | gzip     | no-store            | 174 ms | c         |
|  15 |  584 ms | GET     | `/canvaskit.wasm`                                                               |    200 | network        | Fetch     |  308 B | 7888.5 KB | 7887.3 KB | —        | —                   | 106 ms | c         |
|  16 |  616 ms | GET     | `127.0.0.1:8790/app/v1/config?…`                                                |    200 | network        | Fetch     |  308 B |     432 B |     168 B | gzip     | no-store            |  98 ms | c         |
|  17 |  622 ms | GET     | `127.0.0.1:8790/health`                                                         |    200 | network        | Fetch     |  308 B |         — |     172 B | gzip     | no-store            |      … | script    |
|  18 |  624 ms | POST    | `ww-api-r.leviwilkerson.com/flags/?…`                                           |    200 | network        | Fetch     |  980 B |     395 B |     279 B | gzip     | —                   |  57 ms | script    |
|  19 |  629 ms | OPTIONS | `ww-api-r.leviwilkerson.com/flags/?…`                                           |    200 | network        | Preflight |  288 B |       0 B |         — | —        | —                   |  24 ms | preflight |
|  21 |  663 ms | POST    | `127.0.0.1:8790/accounts/v1/sessions/refresh`                                   |    200 | network        | Fetch     |  750 B |     741 B |     560 B | gzip     | —                   | 121 ms | c         |
|  22 |  663 ms | OPTIONS | `127.0.0.1:8790/accounts/v1/sessions/refresh`                                   |    204 | network        | Preflight |  493 B |       0 B |         — | gzip     | —                   |  51 ms | preflight |
|  23 |  695 ms | GET     | `/_expo/static/js/web/index-bba945bb….js`                                       |    200 | network        | Script    |  501 B |  120.9 KB |  120.7 KB | —        | —                   |   1 ms | script    |
|  24 |  695 ms | GET     | `/_expo/static/js/web/__shared-6405faa3c77c60e2-8b29e98a….js`                   |    200 | network        | Script    |  501 B |   54.1 KB |   53.9 KB | —        | —                   |   1 ms | script    |
|  26 |  701 ms | GET     | `/canvaskit.wasm`                                                               |    200 | network        | Fetch     |  497 B | 7888.5 KB | 7887.3 KB | —        | —                   |  36 ms | W         |
|  30 |  746 ms | GET     | `/_expo/static/js/web/PetPromptCard-4c1948da….js`                               |    200 | network        | Script    |  501 B |    5.1 KB |    4.9 KB | —        | —                   |   3 ms | script    |
|  31 |  746 ms | GET     | `/_expo/static/js/web/__shared-25217e3e9a119b52-9fbd06c7….js`                   |    200 | network        | Script    |  501 B |    2.5 KB |    2.3 KB | —        | —                   |   3 ms | script    |
|  32 |  747 ms | GET     | `/_expo/static/js/web/__shared-df893e27ee3fa854-9fc628d1….js`                   |    200 | network        | Script    |  501 B |    2.1 KB |    1.9 KB | —        | —                   |   2 ms | script    |
|  33 |  747 ms | GET     | `/_expo/static/js/web/__shared-37ed78094a48320a-670b47e8….js`                   |    200 | network        | Script    |  501 B |     952 B |     763 B | —        | —                   |   2 ms | script    |
|  34 |  747 ms | GET     | `/_expo/static/js/web/__shared-c8018f4182659e37-710820cd….js`                   |    200 | network        | Script    |  501 B |  423.1 KB |  422.8 KB | —        | —                   |   3 ms | script    |
|  35 |  747 ms | GET     | `/_expo/static/js/web/ScribeOrbCanvas-58e05e40….js`                             |    200 | network        | Script    |  501 B |    6.9 KB |    6.7 KB | —        | —                   |   2 ms | script    |
|  39 |  788 ms | OPTIONS | `127.0.0.1:8790/accounts/v1/live/ticket`                                        |    204 | network        | Preflight |  507 B |       0 B |         — | gzip     | —                   |   3 ms | preflight |
|  40 |  788 ms | POST    | `127.0.0.1:8790/accounts/v1/live/ticket`                                        |    200 | network        | Fetch     |  977 B |     726 B |     515 B | gzip     | —                   |  20 ms | c         |
|  41 |  788 ms | GET     | `127.0.0.1:8790/accounts/v1/sync`                                               |    200 | network        | Fetch     |  876 B |     383 B |     118 B | gzip     | —                   |  43 ms | c         |
|  42 |  788 ms | POST    | `127.0.0.1:8790/accounts/v1/sync/list`                                          |    200 | network        | Fetch     |  929 B |     462 B |     187 B | gzip     | —                   |  43 ms | c         |
|  43 |  788 ms | OPTIONS | `127.0.0.1:8790/accounts/v1/sync`                                               |    204 | network        | Preflight |  493 B |       0 B |         — | gzip     | —                   |   6 ms | preflight |
|  44 |  788 ms | OPTIONS | `127.0.0.1:8790/accounts/v1/sync/list`                                          |    204 | network        | Preflight |  507 B |       0 B |         — | gzip     | —                   |   6 ms | preflight |
|  51 |  840 ms | POST    | `127.0.0.1:8790/accounts/v1/sync/put`                                           |    200 | network        | Fetch     | 4.1 KB |     459 B |     110 B | gzip     | —                   |  77 ms | c         |
|  52 |  840 ms | OPTIONS | `127.0.0.1:8790/accounts/v1/sync/put`                                           |    204 | network        | Preflight |  532 B |       0 B |         — | gzip     | —                   |  39 ms | preflight |
| 109 | 1063 ms | POST    | `127.0.0.1:8790/accounts/v1/sync/list`                                          |    200 | network        | Fetch     |  929 B |     459 B |     187 B | gzip     | —                   |   6 ms | c         |
| 424 | 2671 ms | GET     | `/_expo/static/js/web/__expo-metro-runtime-8c088df8….js`                        |    200 | service-worker | Fetch     |  322 B |       0 B |    3.7 KB | —        | —                   |   3 ms | k         |
| 425 | 2672 ms | GET     | `/_expo/static/js/web/index-3b0fa729….js`                                       |    200 | service-worker | Fetch     |  322 B |       0 B | 9837.6 KB | —        | —                   |  57 ms | k         |
| 426 | 2672 ms | GET     | `/_expo/static/js/web/en-US-10c3b7b4….js`                                       |    200 | service-worker | Fetch     |  322 B |       0 B |  367.6 KB | —        | —                   |   5 ms | k         |
| 427 | 2672 ms | GET     | `/_expo/static/js/web/index-bba945bb….js`                                       |    200 | service-worker | Fetch     |  322 B |       0 B |  120.7 KB | —        | —                   |   4 ms | k         |
| 428 | 2672 ms | GET     | `/_expo/static/js/web/__shared-6405faa3c77c60e2-8b29e98a….js`                   |    200 | service-worker | Fetch     |  322 B |       0 B |   53.9 KB | —        | —                   |   5 ms | k         |
| 429 | 2672 ms | GET     | `/_expo/static/js/web/PetPromptCard-4c1948da….js`                               |    200 | service-worker | Fetch     |  322 B |       0 B |    4.9 KB | —        | —                   |   5 ms | k         |
| 430 | 2672 ms | GET     | `/_expo/static/js/web/__shared-df893e27ee3fa854-9fc628d1….js`                   |    200 | service-worker | Fetch     |  322 B |       0 B |    1.9 KB | —        | —                   |   5 ms | k         |
| 431 | 2672 ms | GET     | `/_expo/static/js/web/__shared-37ed78094a48320a-670b47e8….js`                   |    200 | service-worker | Fetch     |  322 B |       0 B |     763 B | —        | —                   |   5 ms | k         |
| 432 | 2672 ms | GET     | `/_expo/static/js/web/__shared-25217e3e9a119b52-9fbd06c7….js`                   |    200 | service-worker | Fetch     |  322 B |       0 B |    2.3 KB | —        | —                   |   5 ms | k         |
| 433 | 2672 ms | GET     | `/_expo/static/js/web/__shared-c8018f4182659e37-710820cd….js`                   |    200 | service-worker | Fetch     |  322 B |       0 B |  422.8 KB | —        | —                   |   5 ms | k         |
| 434 | 2672 ms | GET     | `/_expo/static/js/web/ScribeOrbCanvas-58e05e40….js`                             |    200 | service-worker | Fetch     |  322 B |       0 B |    6.7 KB | —        | —                   |   5 ms | k         |

**Service worker:** 384 more requests for the app's own files (its precache and what the page asked it for), 22331.6 KB on the wire. They aren't listed above.

**WebSocket** `127.0.0.1:8790/accounts/v1/sync/live` opened at 811 ms (extensions: permessage-deflate; client_max_window_bits=15): 7 frames, sent 12 B, received 36 B.

- 879 ms received 24 B: `{"type":"hello","seq":4}`
- 25879 ms sent 4 B: `ping`
- 25880 ms received 4 B: `pong`
- 50881 ms sent 4 B: `ping`
- 50881 ms received 4 B: `pong`
- 75881 ms sent 4 B: `ping`
- 75882 ms received 4 B: `pong`

## warm load

16 requests on the network (2 CORS preflights), 23 answered by the service worker, 1 by the HTTP cache, 0 failed. Sent 13.3 KB, received 7905.9 KB on the wire (7897.2 KB decoded). Last response at 0.3 s.

| Group        | Requests |   Sent | Received (wire) | Received (decoded) |
| ------------ | -------: | -----: | --------------: | -----------------: |
| app (static) |        4 | 2.2 KB |       7901.5 KB |          7894.5 KB |
| PostHog      |        3 | 1.8 KB |           293 B |              279 B |
| ww-api       |        9 | 9.3 KB |          4.2 KB |             2.4 KB |

**Sent more than once:**

- `POST 127.0.0.1:8790/accounts/v1/sync/list` ×2

|   # |     At | Method  | URL                                                                             | Status | From           | Type      |   Sent |   Wire |   Decoded | Encoding | Cache-Control       |  Took | Trigger   |
| --: | -----: | ------- | ------------------------------------------------------------------------------- | -----: | -------------- | --------- | -----: | -----: | --------: | -------- | ------------------- | ----: | --------- |
|   0 |   0 ms | GET     | `/home/Dashboard`                                                               |    200 | service-worker | Document  |  305 B |    0 B |    5.2 KB | —        | —                   |  4 ms | other     |
|   2 |   9 ms | GET     | `/launch-splash.js`                                                             |    200 | service-worker | Script    |  322 B |    0 B |    1.3 KB | —        | —                   |  1 ms | parser    |
|   3 |   9 ms | GET     | `/_expo/static/js/web/__expo-metro-runtime-8c088df8….js`                        |    200 | service-worker | Script    |  322 B |    0 B |    3.7 KB | —        | —                   |  1 ms | parser    |
|   4 |   9 ms | GET     | `/_expo/static/js/web/index-3b0fa729….js`                                       |    200 | service-worker | Script    |  322 B |    0 B | 9837.6 KB | —        | —                   | 41 ms | parser    |
|   5 |  14 ms | GET     | `/manifest.webmanifest`                                                         |    200 | network        | Manifest  |  500 B |  722 B |     539 B | —        | —                   |  4 ms | parser    |
|   6 |  82 ms | GET     | `/favicon.ico`                                                                  |    200 | service-worker | Other     |  322 B |    0 B |   14.2 KB | —        | —                   |  1 ms | other     |
|   7 |  82 ms | GET     | `/icons/icon-192.png`                                                           |    200 | network        | Other     |  571 B | 6.9 KB |    6.7 KB | —        | —                   |  2 ms | other     |
|   8 |  93 ms | GET     | `/_expo/static/js/web/en-US-10c3b7b4….js`                                       |    200 | service-worker | Script    |  322 B |    0 B |  367.6 KB | —        | —                   |  3 ms | script    |
|   9 |  93 ms | GET     | `ww-api-r.leviwilkerson.com/array/<project key>/config`                         |    200 | disk-cache     | Fetch     |  340 B |    0 B |    3.2 KB | gzip     | public, max-age=300 | 28 ms | script    |
|  10 |  94 ms | OPTIONS | `ww-api-r.leviwilkerson.com/array/<project key>/config`                         |    200 | network        | Preflight |  609 B |    0 B |         — | —        | —                   | 26 ms | preflight |
|  11 | 135 ms | GET     | `/assets/node_modules/@expo-google-fonts/inter/Inter_400Regular.079af0e2….ttf`  |    200 | service-worker | Font      |  353 B |    0 B |  302.6 KB | —        | —                   |  4 ms | other     |
|  12 | 135 ms | GET     | `/assets/node_modules/@expo-google-fonts/inter/Inter_500Medium.ed533866….ttf`   |    200 | service-worker | Font      |  353 B |    0 B |  307.3 KB | —        | —                   |  3 ms | other     |
|  13 | 135 ms | GET     | `/assets/node_modules/@expo-google-fonts/inter/Inter_600SemiBold.07a48beb….ttf` |    200 | service-worker | Font      |  353 B |    0 B |  308.4 KB | —        | —                   |  4 ms | other     |
|  14 | 135 ms | GET     | `/assets/node_modules/@expo-google-fonts/inter/Inter_700Bold.275bfea5….ttf`     |    200 | service-worker | Font      |  353 B |    0 B |  308.7 KB | —        | —                   |  4 ms | other     |
|  16 | 143 ms | GET     | `127.0.0.1:8790/scribe/v1/status`                                               |    200 | network        | Fetch     |  308 B |  589 B |     452 B | gzip     | no-store            |  5 ms | c         |
|  17 | 157 ms | GET     | `/canvaskit.wasm`                                                               |    200 | service-worker | Fetch     |  322 B |    0 B | 7887.3 KB | —        | —                   | 45 ms | c         |
|  18 | 166 ms | GET     | `127.0.0.1:8790/app/v1/config?…`                                                |    200 | network        | Fetch     |  308 B |  438 B |     168 B | gzip     | no-store            |  5 ms | c         |
|  19 | 169 ms | GET     | `127.0.0.1:8790/health`                                                         |    200 | network        | Fetch     |  308 B |      — |     172 B | gzip     | no-store            |     … | script    |
|  20 | 169 ms | POST    | `ww-api-r.leviwilkerson.com/flags/?…`                                           |    200 | network        | Fetch     |  980 B |  293 B |     279 B | gzip     | —                   | 55 ms | script    |
|  21 | 175 ms | OPTIONS | `ww-api-r.leviwilkerson.com/flags/?…`                                           |    200 | network        | Preflight |  288 B |    0 B |         — | —        | —                   | 21 ms | preflight |
|  22 | 183 ms | GET     | `/_expo/static/js/web/__expo-metro-runtime-8c088df8….js`                        |    200 | service-worker | Fetch     |  322 B |    0 B |    3.7 KB | —        | —                   |  5 ms | k         |
|  23 | 183 ms | GET     | `/_expo/static/js/web/index-3b0fa729….js`                                       |    200 | service-worker | Fetch     |  322 B |    0 B | 9837.6 KB | —        | —                   | 64 ms | k         |
|  24 | 183 ms | GET     | `/_expo/static/js/web/en-US-10c3b7b4….js`                                       |    200 | service-worker | Fetch     |  322 B |    0 B |  367.6 KB | —        | —                   |  5 ms | k         |
|  25 | 198 ms | POST    | `127.0.0.1:8790/accounts/v1/sessions/refresh`                                   |    200 | network        | Fetch     |  750 B |  740 B |     560 B | gzip     | —                   | 12 ms | c         |
|  26 | 206 ms | GET     | `/_expo/static/js/web/index-bba945bb….js`                                       |    200 | service-worker | Script    |  322 B |    0 B |  120.7 KB | —        | —                   |  6 ms | script    |
|  27 | 206 ms | GET     | `/_expo/static/js/web/__shared-6405faa3c77c60e2-8b29e98a….js`                   |    200 | service-worker | Script    |  322 B |    0 B |   53.9 KB | —        | —                   |  3 ms | script    |
|  28 | 212 ms | POST    | `127.0.0.1:8790/accounts/v1/live/ticket`                                        |    200 | network        | Fetch     |  977 B |  724 B |     515 B | gzip     | —                   |  4 ms | c         |
|  29 | 212 ms | GET     | `127.0.0.1:8790/accounts/v1/sync`                                               |    200 | network        | Fetch     |  876 B |  377 B |     118 B | gzip     | —                   | 17 ms | c         |
|  30 | 212 ms | POST    | `127.0.0.1:8790/accounts/v1/sync/list`                                          |    200 | network        | Fetch     |  929 B |  459 B |     187 B | gzip     | —                   | 16 ms | c         |
|  31 | 213 ms | GET     | `/canvaskit.wasm`                                                               |    200 | service-worker | Fetch     |  322 B |    0 B | 7887.3 KB | —        | —                   | 57 ms | W         |
|  32 | 233 ms | POST    | `127.0.0.1:8790/accounts/v1/sync/put`                                           |    200 | network        | Fetch     | 4.1 KB |  464 B |     110 B | gzip     | —                   | 17 ms | c         |
|  33 | 252 ms | POST    | `127.0.0.1:8790/accounts/v1/sync/list`                                          |    200 | network        | Fetch     |  929 B |  463 B |     187 B | gzip     | —                   |  6 ms | c         |
|  34 | 276 ms | GET     | `/_expo/static/js/web/PetPromptCard-4c1948da….js`                               |    200 | service-worker | Script    |  322 B |    0 B |    4.9 KB | —        | —                   |  5 ms | script    |
|  35 | 276 ms | GET     | `/_expo/static/js/web/__shared-25217e3e9a119b52-9fbd06c7….js`                   |    200 | service-worker | Script    |  322 B |    0 B |    2.3 KB | —        | —                   |  5 ms | script    |
|  36 | 276 ms | GET     | `/_expo/static/js/web/__shared-df893e27ee3fa854-9fc628d1….js`                   |    200 | service-worker | Script    |  322 B |    0 B |    1.9 KB | —        | —                   |  5 ms | script    |
|  37 | 276 ms | GET     | `/_expo/static/js/web/__shared-37ed78094a48320a-670b47e8….js`                   |    200 | service-worker | Script    |  322 B |    0 B |     763 B | —        | —                   |  5 ms | script    |
|  38 | 276 ms | GET     | `/_expo/static/js/web/__shared-c8018f4182659e37-710820cd….js`                   |    200 | service-worker | Script    |  322 B |    0 B |  422.8 KB | —        | —                   | 22 ms | script    |
|  39 | 276 ms | GET     | `/_expo/static/js/web/ScribeOrbCanvas-58e05e40….js`                             |    200 | service-worker | Script    |  322 B |    0 B |    6.7 KB | —        | —                   |  5 ms | script    |

**Service worker:** 2 more requests for the app's own files (its precache and what the page asked it for), 7893.8 KB on the wire. They aren't listed above.

**WebSocket** `127.0.0.1:8790/accounts/v1/sync/live` opened at 217 ms (extensions: permessage-deflate; client_max_window_bits=15): 7 frames, sent 12 B, received 36 B.

- 234 ms received 24 B: `{"type":"hello","seq":5}`
- 25235 ms sent 4 B: `ping`
- 25235 ms received 4 B: `pong`
- 50236 ms sent 4 B: `ping`
- 50236 ms received 4 B: `pong`
- 75234 ms sent 4 B: `ping`
- 75235 ms received 4 B: `pong`
