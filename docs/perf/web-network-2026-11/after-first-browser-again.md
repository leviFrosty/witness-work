# Web network capture: after-first-browser-again

- URL: http://localhost:4173/
- Captured: 2026-11-10T08:03:35.919Z
- Browser: Chrome/156.0.8078.4

## cold load

429 requests on the network (9 CORS preflights), 11 answered by the service worker, 0 by the HTTP cache, 0 failed. Sent 172.8 KB, received 50201.6 KB on the wire (50121.7 KB decoded). Last response at 3.2 s.

| Group        | Requests |     Sent | Received (wire) | Received (decoded) |
| ------------ | -------: | -------: | --------------: | -----------------: |
| app (static) |      406 | 154.9 KB |      50191.5 KB |         50111.9 KB |
| PostHog      |        4 |   2.5 KB |          1.8 KB |             3.4 KB |
| ww-api       |       19 |  15.4 KB |          8.3 KB |             6.3 KB |

**Sent more than once:**

- `GET localhost:4173/canvaskit.wasm` ×2
- `POST 127.0.0.1:8790/accounts/v1/sync/list` ×3

|   # |      At | Method  | URL                                                                             | Status | From           | Type      |   Sent |      Wire |   Decoded | Encoding | Cache-Control       |   Took | Trigger   |
| --: | ------: | ------- | ------------------------------------------------------------------------------- | -----: | -------------- | --------- | -----: | --------: | --------: | -------- | ------------------- | -----: | --------- |
|   0 |    0 ms | GET     | `/`                                                                             |    200 | network        | Document  |  642 B |    5.3 KB |    5.2 KB | —        | —                   |   5 ms | other     |
|   1 |    8 ms | GET     | `/launch-splash.js`                                                             |    200 | network        | Script    |  487 B |    1.5 KB |    1.3 KB | —        | —                   |  10 ms | parser    |
|   2 |    8 ms | GET     | `/_expo/static/js/web/__expo-metro-runtime-8c088df8….js`                        |    200 | network        | Script    |  487 B |    3.8 KB |    3.7 KB | —        | —                   |  10 ms | parser    |
|   3 |    8 ms | GET     | `/_expo/static/js/web/index-3b0fa729….js`                                       |    200 | network        | Script    |  487 B | 9839.1 KB | 9837.6 KB | —        | —                   | 107 ms | parser    |
|   4 |   25 ms | GET     | `/manifest.webmanifest`                                                         |    200 | network        | Manifest  |  486 B |     722 B |     539 B | —        | —                   |   8 ms | parser    |
|   5 |  185 ms | GET     | `/favicon.ico`                                                                  |    200 | network        | Other     |  557 B |   14.3 KB |   14.2 KB | —        | —                   |   1 ms | other     |
|   6 |  186 ms | GET     | `/icons/icon-192.png`                                                           |    200 | network        | Other     |  557 B |    6.9 KB |    6.7 KB | —        | —                   |   1 ms | other     |
|   7 |  257 ms | GET     | `/_expo/static/js/web/en-US-10c3b7b4….js`                                       |    200 | network        | Script    |  487 B |  367.8 KB |  367.6 KB | —        | —                   |  26 ms | script    |
|   8 |  261 ms | GET     | `ww-api-r.leviwilkerson.com/array/<project key>/config`                         |    200 | network        | Fetch     |  658 B |    1.5 KB |    3.2 KB | gzip     | public, max-age=300 |  76 ms | script    |
|   9 |  268 ms | OPTIONS | `ww-api-r.leviwilkerson.com/array/<project key>/config`                         |    200 | network        | Preflight |  609 B |       0 B |         — | —        | —                   |  39 ms | preflight |
|  10 |  512 ms | GET     | `/assets/node_modules/@expo-google-fonts/inter/Inter_400Regular.079af0e2….ttf`  |    200 | network        | Font      |  513 B |  302.8 KB |  302.6 KB | —        | —                   |  15 ms | other     |
|  11 |  513 ms | GET     | `/assets/node_modules/@expo-google-fonts/inter/Inter_500Medium.ed533866….ttf`   |    200 | network        | Font      |  513 B |  307.5 KB |  307.3 KB | —        | —                   |  14 ms | other     |
|  12 |  513 ms | GET     | `/assets/node_modules/@expo-google-fonts/inter/Inter_600SemiBold.07a48beb….ttf` |    200 | network        | Font      |  513 B |  308.6 KB |  308.4 KB | —        | —                   |  12 ms | other     |
|  13 |  513 ms | GET     | `/assets/node_modules/@expo-google-fonts/inter/Inter_700Bold.275bfea5….ttf`     |    200 | network        | Font      |  513 B |  308.9 KB |  308.7 KB | —        | —                   |  12 ms | other     |
|  14 |  534 ms | GET     | `127.0.0.1:8790/scribe/v1/status`                                               |    200 | network        | Fetch     |  308 B |     584 B |     452 B | gzip     | no-store            |  31 ms | c         |
|  15 |  584 ms | GET     | `/canvaskit.wasm`                                                               |    200 | network        | Fetch     |  308 B | 7888.5 KB | 7887.3 KB | —        | —                   |  84 ms | c         |
|  16 |  618 ms | GET     | `127.0.0.1:8790/app/v1/config?…`                                                |    200 | network        | Fetch     |  308 B |     438 B |     168 B | gzip     | no-store            | 100 ms | c         |
|  17 |  631 ms | OPTIONS | `ww-api-r.leviwilkerson.com/flags/?…`                                           |    200 | network        | Preflight |  288 B |       0 B |         — | —        | —                   |  22 ms | preflight |
|  18 |  623 ms | GET     | `127.0.0.1:8790/health`                                                         |    200 | network        | Fetch     |  308 B |         — |     172 B | gzip     | no-store            |      … | script    |
|  19 |  624 ms | POST    | `ww-api-r.leviwilkerson.com/flags/?…`                                           |    200 | network        | Fetch     |  980 B |     393 B |     279 B | gzip     | —                   |  57 ms | script    |
|  23 |  679 ms | GET     | `/_expo/static/js/web/index-bba945bb….js`                                       |    200 | network        | Script    |  501 B |  120.9 KB |  120.7 KB | —        | —                   |   5 ms | script    |
|  24 |  679 ms | GET     | `/_expo/static/js/web/__shared-6405faa3c77c60e2-8b29e98a….js`                   |    200 | network        | Script    |  501 B |   54.1 KB |   53.9 KB | —        | —                   |   4 ms | script    |
|  26 |  690 ms | GET     | `/canvaskit.wasm`                                                               |    200 | network        | Fetch     |  497 B | 7888.5 KB | 7887.3 KB | —        | —                   |  46 ms | W         |
|  27 |  692 ms | POST    | `127.0.0.1:8790/accounts/v1/sessions/refresh`                                   |    200 | network        | Fetch     |  750 B |     740 B |     560 B | gzip     | —                   |  40 ms | c         |
|  28 |  692 ms | OPTIONS | `127.0.0.1:8790/accounts/v1/sessions/refresh`                                   |    204 | network        | Preflight |  493 B |       0 B |         — | gzip     | —                   |  27 ms | preflight |
|  35 |  736 ms | OPTIONS | `127.0.0.1:8790/accounts/v1/live/ticket`                                        |    204 | network        | Preflight |  507 B |       0 B |         — | gzip     | —                   |   3 ms | preflight |
|  36 |  736 ms | OPTIONS | `127.0.0.1:8790/accounts/v1/sync`                                               |    204 | network        | Preflight |  493 B |       0 B |         — | gzip     | —                   |   8 ms | preflight |
|  37 |  735 ms | POST    | `127.0.0.1:8790/accounts/v1/live/ticket`                                        |    200 | network        | Fetch     |  977 B |     719 B |     515 B | gzip     | —                   |  16 ms | c         |
|  38 |  736 ms | GET     | `127.0.0.1:8790/accounts/v1/sync`                                               |    200 | network        | Fetch     |  876 B |     383 B |     118 B | gzip     | —                   |  32 ms | c         |
|  39 |  736 ms | GET     | `127.0.0.1:8790/accounts/v1/activity?…`                                         |    200 | network        | Fetch     |  876 B |     921 B |    1.1 KB | gzip     | —                   |  57 ms | c         |
|  40 |  736 ms | POST    | `127.0.0.1:8790/accounts/v1/sync/list`                                          |    200 | network        | Fetch     |  929 B |     541 B |     345 B | gzip     | —                   |  56 ms | c         |
|  42 |  736 ms | OPTIONS | `127.0.0.1:8790/accounts/v1/activity?…`                                         |    204 | network        | Preflight |  288 B |       0 B |         — | gzip     | —                   |   9 ms | preflight |
|  43 |  736 ms | OPTIONS | `127.0.0.1:8790/accounts/v1/sync/list`                                          |    204 | network        | Preflight |  507 B |       0 B |         — | gzip     | —                   |   8 ms | preflight |
|  45 |  747 ms | GET     | `/_expo/static/js/web/PetPromptCard-4c1948da….js`                               |    200 | network        | Script    |  501 B |    5.1 KB |    4.9 KB | —        | —                   |   4 ms | script    |
|  46 |  747 ms | GET     | `/_expo/static/js/web/__shared-25217e3e9a119b52-9fbd06c7….js`                   |    200 | network        | Script    |  501 B |    2.5 KB |    2.3 KB | —        | —                   |   4 ms | script    |
|  47 |  747 ms | GET     | `/_expo/static/js/web/__shared-df893e27ee3fa854-9fc628d1….js`                   |    200 | network        | Script    |  501 B |    2.1 KB |    1.9 KB | —        | —                   |   3 ms | script    |
|  48 |  747 ms | GET     | `/_expo/static/js/web/__shared-37ed78094a48320a-670b47e8….js`                   |    200 | network        | Script    |  501 B |     952 B |     763 B | —        | —                   |   6 ms | script    |
|  49 |  747 ms | GET     | `/_expo/static/js/web/__shared-c8018f4182659e37-710820cd….js`                   |    200 | network        | Script    |  501 B |  423.1 KB |  422.8 KB | —        | —                   |  19 ms | script    |
|  50 |  747 ms | GET     | `/_expo/static/js/web/ScribeOrbCanvas-58e05e40….js`                             |    200 | network        | Script    |  501 B |    6.9 KB |    6.7 KB | —        | —                   |   7 ms | script    |
|  60 |  797 ms | POST    | `127.0.0.1:8790/accounts/v1/sync/get`                                           |    200 | network        | Fetch     |  965 B |    2.5 KB |    2.2 KB | —        | no-store            |  22 ms | c         |
|  61 |  805 ms | OPTIONS | `127.0.0.1:8790/accounts/v1/sync/get`                                           |    204 | network        | Preflight |  507 B |       0 B |         — | gzip     | —                   |  -2 ms | preflight |
|  94 |  886 ms | POST    | `127.0.0.1:8790/accounts/v1/sync/put`                                           |    200 | network        | Fetch     | 4.2 KB |     463 B |     110 B | gzip     | —                   |  33 ms | c         |
|  95 |  896 ms | OPTIONS | `127.0.0.1:8790/accounts/v1/sync/put`                                           |    204 | network        | Preflight |  532 B |       0 B |         — | gzip     | —                   |   5 ms | preflight |
| 115 |  998 ms | POST    | `127.0.0.1:8790/accounts/v1/sync/list`                                          |    200 | network        | Fetch     |  929 B |     533 B |     345 B | gzip     | —                   |  10 ms | c         |
| 122 | 1095 ms | POST    | `127.0.0.1:8790/accounts/v1/sync/list`                                          |    200 | network        | Fetch     |  929 B |     539 B |     345 B | gzip     | —                   |  11 ms | c         |
| 429 | 3115 ms | GET     | `/_expo/static/js/web/__expo-metro-runtime-8c088df8….js`                        |    200 | service-worker | Fetch     |  322 B |       0 B |    3.7 KB | —        | —                   |   3 ms | k         |
| 430 | 3115 ms | GET     | `/_expo/static/js/web/index-3b0fa729….js`                                       |    200 | service-worker | Fetch     |  322 B |       0 B | 9837.6 KB | —        | —                   |  59 ms | k         |
| 431 | 3115 ms | GET     | `/_expo/static/js/web/en-US-10c3b7b4….js`                                       |    200 | service-worker | Fetch     |  322 B |       0 B |  367.6 KB | —        | —                   |   3 ms | k         |
| 432 | 3115 ms | GET     | `/_expo/static/js/web/index-bba945bb….js`                                       |    200 | service-worker | Fetch     |  322 B |       0 B |  120.7 KB | —        | —                   |   3 ms | k         |
| 433 | 3115 ms | GET     | `/_expo/static/js/web/__shared-6405faa3c77c60e2-8b29e98a….js`                   |    200 | service-worker | Fetch     |  322 B |       0 B |   53.9 KB | —        | —                   |   3 ms | k         |
| 434 | 3115 ms | GET     | `/_expo/static/js/web/PetPromptCard-4c1948da….js`                               |    200 | service-worker | Fetch     |  322 B |       0 B |    4.9 KB | —        | —                   |   3 ms | k         |
| 435 | 3116 ms | GET     | `/_expo/static/js/web/__shared-df893e27ee3fa854-9fc628d1….js`                   |    200 | service-worker | Fetch     |  322 B |       0 B |    1.9 KB | —        | —                   |   2 ms | k         |
| 436 | 3116 ms | GET     | `/_expo/static/js/web/__shared-25217e3e9a119b52-9fbd06c7….js`                   |    200 | service-worker | Fetch     |  322 B |       0 B |    2.3 KB | —        | —                   |   2 ms | k         |
| 437 | 3116 ms | GET     | `/_expo/static/js/web/__shared-37ed78094a48320a-670b47e8….js`                   |    200 | service-worker | Fetch     |  322 B |       0 B |     763 B | —        | —                   |   2 ms | k         |
| 438 | 3116 ms | GET     | `/_expo/static/js/web/__shared-c8018f4182659e37-710820cd….js`                   |    200 | service-worker | Fetch     |  322 B |       0 B |  422.8 KB | —        | —                   |   2 ms | k         |
| 439 | 3116 ms | GET     | `/_expo/static/js/web/ScribeOrbCanvas-58e05e40….js`                             |    200 | service-worker | Fetch     |  322 B |       0 B |    6.7 KB | —        | —                   |   2 ms | k         |

**Service worker:** 384 more requests for the app's own files (its precache and what the page asked it for), 22331.6 KB on the wire. They aren't listed above.

**WebSocket** `127.0.0.1:8790/accounts/v1/sync/live` opened at 757 ms (extensions: permessage-deflate; client_max_window_bits=15): 7 frames, sent 12 B, received 36 B.

- 793 ms received 24 B: `{"type":"hello","seq":8}`
- 25788 ms sent 4 B: `ping`
- 25788 ms received 4 B: `pong`
- 50788 ms sent 4 B: `ping`
- 50793 ms received 4 B: `pong`
- 75790 ms sent 4 B: `ping`
- 75804 ms received 4 B: `pong`
