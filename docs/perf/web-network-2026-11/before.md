# Web network capture: before

- URL: http://localhost:4173/
- Captured: 2026-11-10T07:49:15.537Z
- Browser: Chrome/156.0.8078.4

## cold load

429 requests on the network (8 CORS preflights), 11 answered by the service worker, 0 by the HTTP cache, 0 failed. Sent 173.5 KB, received 50201.8 KB on the wire (50120.7 KB decoded). Last response at 1.7 s.

| Group        | Requests |     Sent | Received (wire) | Received (decoded) |
| ------------ | -------: | -------: | --------------: | -----------------: |
| app (static) |      406 | 155.2 KB |      50190.0 KB |         50110.4 KB |
| PostHog      |        4 |   2.5 KB |          1.8 KB |             3.4 KB |
| ww-api       |       19 |  15.9 KB |          9.9 KB |             6.9 KB |

**Sent more than once:**

- `GET localhost:4173/canvaskit.wasm` ×2
- `POST 127.0.0.1:8790/accounts/v1/sync/list` ×4
- `POST 127.0.0.1:8790/accounts/v1/sync/get` ×2

|   # |      At | Method  | URL                                                                             | Status | From           | Type      |   Sent |      Wire |   Decoded | Encoding | Cache-Control       |  Took | Trigger   |
| --: | ------: | ------- | ------------------------------------------------------------------------------- | -----: | -------------- | --------- | -----: | --------: | --------: | -------- | ------------------- | ----: | --------- |
|   0 |    0 ms | GET     | `/`                                                                             |    200 | network        | Document  |  642 B |    5.3 KB |    5.2 KB | —        | —                   |  1 ms | other     |
|   1 |    3 ms | GET     | `/launch-splash.js`                                                             |    200 | network        | Script    |  487 B |    1.5 KB |    1.3 KB | —        | —                   |  3 ms | parser    |
|   2 |    3 ms | GET     | `/_expo/static/js/web/__expo-metro-runtime-8c088df8….js`                        |    200 | network        | Script    |  487 B |    3.8 KB |    3.7 KB | —        | —                   |  4 ms | parser    |
|   3 |    3 ms | GET     | `/_expo/static/js/web/index-993c6bcc….js`                                       |    200 | network        | Script    |  487 B | 9838.4 KB | 9836.9 KB | —        | —                   | 76 ms | parser    |
|   4 |    9 ms | GET     | `/manifest.webmanifest`                                                         |    200 | network        | Manifest  |  486 B |     722 B |     539 B | —        | —                   |  1 ms | parser    |
|   5 |  146 ms | GET     | `/favicon.ico`                                                                  |    200 | network        | Other     |  557 B |   14.3 KB |   14.2 KB | —        | —                   |  1 ms | other     |
|   6 |  146 ms | GET     | `/icons/icon-192.png`                                                           |    200 | network        | Other     |  557 B |    6.9 KB |    6.7 KB | —        | —                   |  1 ms | other     |
|   7 |  194 ms | OPTIONS | `ww-api-r.leviwilkerson.com/array/<project key>/config`                         |    200 | network        | Preflight |  609 B |       0 B |         — | —        | —                   | 44 ms | preflight |
|   8 |  192 ms | GET     | `/_expo/static/js/web/en-US-10c3b7b4….js`                                       |    200 | network        | Script    |  308 B |  367.8 KB |  367.6 KB | —        | —                   |  2 ms | script    |
|   9 |  194 ms | GET     | `ww-api-r.leviwilkerson.com/array/<project key>/config`                         |    200 | network        | Fetch     |  658 B |    1.5 KB |    3.2 KB | gzip     | public, max-age=300 | 71 ms | script    |
|  10 |  324 ms | GET     | `/assets/node_modules/@expo-google-fonts/inter/Inter_400Regular.079af0e2….ttf`  |    200 | network        | Font      |  513 B |  302.8 KB |  302.6 KB | —        | —                   |  3 ms | other     |
|  11 |  325 ms | GET     | `/assets/node_modules/@expo-google-fonts/inter/Inter_500Medium.ed533866….ttf`   |    200 | network        | Font      |  513 B |  307.5 KB |  307.3 KB | —        | —                   |  1 ms | other     |
|  12 |  325 ms | GET     | `/assets/node_modules/@expo-google-fonts/inter/Inter_600SemiBold.07a48beb….ttf` |    200 | network        | Font      |  513 B |  308.6 KB |  308.4 KB | —        | —                   |  2 ms | other     |
|  13 |  325 ms | GET     | `/assets/node_modules/@expo-google-fonts/inter/Inter_700Bold.275bfea5….ttf`     |    200 | network        | Font      |  513 B |  308.9 KB |  308.7 KB | —        | —                   |  3 ms | other     |
|  14 |  335 ms | GET     | `127.0.0.1:8790/scribe/v1/status`                                               |    200 | network        | Fetch     |  308 B |     589 B |     452 B | gzip     | no-store            |  3 ms | c         |
|  15 |  371 ms | GET     | `/canvaskit.wasm`                                                               |    200 | network        | Fetch     |  308 B | 7888.5 KB | 7887.3 KB | —        | —                   | 59 ms | c         |
|  16 |  394 ms | GET     | `127.0.0.1:8790/app/v1/config?…`                                                |    200 | network        | Fetch     |  308 B |     438 B |     168 B | gzip     | no-store            |  4 ms | c         |
|  17 |  406 ms | OPTIONS | `ww-api-r.leviwilkerson.com/flags/?…`                                           |    200 | network        | Preflight |  288 B |       0 B |         — | —        | —                   | 25 ms | preflight |
|  18 |  398 ms | GET     | `127.0.0.1:8790/health`                                                         |    200 | network        | Fetch     |  308 B |         — |     172 B | gzip     | no-store            |     … | script    |
|  19 |  399 ms | POST    | `ww-api-r.leviwilkerson.com/flags/?…`                                           |    200 | network        | Fetch     |  980 B |     394 B |     279 B | gzip     | —                   | 62 ms | script    |
|  31 |  435 ms | GET     | `/_expo/static/js/web/index-bba945bb….js`                                       |    200 | network        | Script    |  501 B |  120.9 KB |  120.7 KB | —        | —                   |  6 ms | script    |
|  32 |  435 ms | GET     | `/_expo/static/js/web/__shared-6405faa3c77c60e2-8b29e98a….js`                   |    200 | network        | Script    |  501 B |   54.1 KB |   53.9 KB | —        | —                   |  5 ms | script    |
|  34 |  451 ms | GET     | `/canvaskit.wasm`                                                               |    200 | network        | Fetch     |  497 B | 7888.5 KB | 7887.3 KB | —        | —                   | 31 ms | W         |
|  36 |  454 ms | POST    | `127.0.0.1:8790/accounts/v1/sessions/refresh`                                   |    200 | network        | Fetch     |  750 B |     738 B |     560 B | gzip     | —                   | 14 ms | c         |
|  37 |  454 ms | OPTIONS | `127.0.0.1:8790/accounts/v1/sessions/refresh`                                   |    204 | network        | Preflight |  493 B |       0 B |         — | gzip     | —                   |  4 ms | preflight |
|  43 |  475 ms | OPTIONS | `127.0.0.1:8790/accounts/v1/live/ticket`                                        |    204 | network        | Preflight |  507 B |       0 B |         — | gzip     | —                   |  7 ms | preflight |
|  44 |  475 ms | POST    | `127.0.0.1:8790/accounts/v1/live/ticket`                                        |    200 | network        | Fetch     |  977 B |     725 B |     515 B | gzip     | —                   | 14 ms | c         |
|  45 |  475 ms | GET     | `127.0.0.1:8790/accounts/v1/sync`                                               |    200 | network        | Fetch     |  876 B |     383 B |     118 B | gzip     | —                   | 20 ms | c         |
|  46 |  475 ms | POST    | `127.0.0.1:8790/accounts/v1/sync/list`                                          |    200 | network        | Fetch     |  929 B |     462 B |     187 B | gzip     | —                   | 20 ms | c         |
|  47 |  475 ms | OPTIONS | `127.0.0.1:8790/accounts/v1/sync`                                               |    204 | network        | Preflight |  493 B |       0 B |         — | gzip     | —                   | 11 ms | preflight |
|  48 |  475 ms | OPTIONS | `127.0.0.1:8790/accounts/v1/sync/list`                                          |    204 | network        | Preflight |  507 B |       0 B |         — | gzip     | —                   | 10 ms | preflight |
|  54 |  489 ms | GET     | `/_expo/static/js/web/PetPromptCard-4c1948da….js`                               |    200 | network        | Script    |  322 B |    5.1 KB |    4.9 KB | —        | —                   |  1 ms | script    |
|  55 |  489 ms | GET     | `/_expo/static/js/web/__shared-25217e3e9a119b52-9fbd06c7….js`                   |    200 | network        | Script    |  501 B |    2.5 KB |    2.3 KB | —        | —                   |  1 ms | script    |
|  56 |  489 ms | GET     | `/_expo/static/js/web/__shared-df893e27ee3fa854-9fc628d1….js`                   |    200 | network        | Script    |  501 B |    2.1 KB |    1.9 KB | —        | —                   |  1 ms | script    |
|  57 |  489 ms | GET     | `/_expo/static/js/web/__shared-37ed78094a48320a-670b47e8….js`                   |    200 | network        | Script    |  501 B |     952 B |     763 B | —        | —                   |  2 ms | script    |
|  58 |  489 ms | GET     | `/_expo/static/js/web/__shared-c8018f4182659e37-710820cd….js`                   |    200 | network        | Script    |  501 B |  423.1 KB |  422.8 KB | —        | —                   |  2 ms | script    |
|  59 |  489 ms | GET     | `/_expo/static/js/web/ScribeOrbCanvas-58e05e40….js`                             |    200 | network        | Script    |  501 B |    6.9 KB |    6.7 KB | —        | —                   |  2 ms | script    |
|  76 |  520 ms | OPTIONS | `127.0.0.1:8790/accounts/v1/sync/get`                                           |    204 | network        | Preflight |  507 B |       0 B |         — | gzip     | —                   |  3 ms | preflight |
|  77 |  520 ms | POST    | `127.0.0.1:8790/accounts/v1/sync/get`                                           |    200 | network        | Fetch     |  965 B |    2.4 KB |    2.1 KB | —        | no-store            |  8 ms | c         |
|  83 |  536 ms | POST    | `127.0.0.1:8790/accounts/v1/sync/put`                                           |    200 | network        | Fetch     | 4.1 KB |     463 B |     110 B | gzip     | —                   | 10 ms | c         |
|  84 |  536 ms | OPTIONS | `127.0.0.1:8790/accounts/v1/sync/put`                                           |    204 | network        | Preflight |  532 B |       0 B |         — | gzip     | —                   |  3 ms | preflight |
|  91 |  548 ms | POST    | `127.0.0.1:8790/accounts/v1/sync/list`                                          |    200 | network        | Fetch     |  705 B |     462 B |     187 B | gzip     | —                   |  5 ms | c         |
|  92 |  548 ms | POST    | `127.0.0.1:8790/accounts/v1/sync/list`                                          |    200 | network        | Fetch     |  929 B |     456 B |     187 B | gzip     | —                   | 12 ms | c         |
|  99 |  561 ms | POST    | `127.0.0.1:8790/accounts/v1/sync/get`                                           |    200 | network        | Fetch     |  965 B |    2.4 KB |    2.1 KB | —        | no-store            |  3 ms | c         |
| 198 |  818 ms | POST    | `127.0.0.1:8790/accounts/v1/sync/list`                                          |    200 | network        | Fetch     |  929 B |     462 B |     187 B | gzip     | —                   |  4 ms | c         |
| 429 | 1635 ms | GET     | `/_expo/static/js/web/__expo-metro-runtime-8c088df8….js`                        |    200 | service-worker | Fetch     |  322 B |       0 B |    3.7 KB | —        | —                   |  1 ms | k         |
| 430 | 1635 ms | GET     | `/_expo/static/js/web/index-993c6bcc….js`                                       |    200 | service-worker | Fetch     |  322 B |       0 B | 9836.9 KB | —        | —                   | 55 ms | k         |
| 431 | 1635 ms | GET     | `/_expo/static/js/web/en-US-10c3b7b4….js`                                       |    200 | service-worker | Fetch     |  322 B |       0 B |  367.6 KB | —        | —                   |  2 ms | k         |
| 432 | 1635 ms | GET     | `/_expo/static/js/web/__shared-6405faa3c77c60e2-8b29e98a….js`                   |    200 | service-worker | Fetch     |  322 B |       0 B |   53.9 KB | —        | —                   |  2 ms | k         |
| 433 | 1635 ms | GET     | `/_expo/static/js/web/index-bba945bb….js`                                       |    200 | service-worker | Fetch     |  322 B |       0 B |  120.7 KB | —        | —                   |  2 ms | k         |
| 434 | 1635 ms | GET     | `/_expo/static/js/web/PetPromptCard-4c1948da….js`                               |    200 | service-worker | Fetch     |  322 B |       0 B |    4.9 KB | —        | —                   |  2 ms | k         |
| 435 | 1635 ms | GET     | `/_expo/static/js/web/__shared-25217e3e9a119b52-9fbd06c7….js`                   |    200 | service-worker | Fetch     |  322 B |       0 B |    2.3 KB | —        | —                   |  2 ms | k         |
| 436 | 1635 ms | GET     | `/_expo/static/js/web/__shared-df893e27ee3fa854-9fc628d1….js`                   |    200 | service-worker | Fetch     |  322 B |       0 B |    1.9 KB | —        | —                   |  2 ms | k         |
| 437 | 1635 ms | GET     | `/_expo/static/js/web/__shared-37ed78094a48320a-670b47e8….js`                   |    200 | service-worker | Fetch     |  322 B |       0 B |     763 B | —        | —                   |  2 ms | k         |
| 438 | 1636 ms | GET     | `/_expo/static/js/web/ScribeOrbCanvas-58e05e40….js`                             |    200 | service-worker | Fetch     |  322 B |       0 B |    6.7 KB | —        | —                   |  1 ms | k         |
| 439 | 1636 ms | GET     | `/_expo/static/js/web/__shared-c8018f4182659e37-710820cd….js`                   |    200 | service-worker | Fetch     |  322 B |       0 B |  422.8 KB | —        | —                   |  1 ms | k         |

**Service worker:** 384 more requests for the app's own files (its precache and what the page asked it for), 22330.8 KB on the wire. They aren't listed above.

**WebSocket** `127.0.0.1:8790/accounts/v1/sync/live` opened at 491 ms (extensions: permessage-deflate; client_max_window_bits=15): 7 frames, sent 12 B, received 36 B.

- 518 ms received 24 B: `{"type":"hello","seq":2}`
- 25514 ms sent 4 B: `ping`
- 25514 ms received 4 B: `pong`
- 50514 ms sent 4 B: `ping`
- 50514 ms received 4 B: `pong`
- 75515 ms sent 4 B: `ping`
- 75515 ms received 4 B: `pong`

## warm load

19 requests on the network (2 CORS preflights), 23 answered by the service worker, 1 by the HTTP cache, 0 failed. Sent 16.4 KB, received 7911.2 KB on the wire (7901.5 KB decoded). Last response at 0.3 s.

| Group        | Requests |    Sent | Received (wire) | Received (decoded) |
| ------------ | -------: | ------: | --------------: | -----------------: |
| app (static) |        4 |  2.2 KB |       7901.5 KB |          7894.5 KB |
| PostHog      |        3 |  1.8 KB |           292 B |              279 B |
| ww-api       |       12 | 12.4 KB |          9.5 KB |             6.7 KB |

**Sent more than once:**

- `POST 127.0.0.1:8790/accounts/v1/sync/list` ×3
- `POST 127.0.0.1:8790/accounts/v1/sync/get` ×2

|   # |     At | Method  | URL                                                                             | Status | From           | Type      |   Sent |   Wire |   Decoded | Encoding | Cache-Control       |  Took | Trigger   |
| --: | -----: | ------- | ------------------------------------------------------------------------------- | -----: | -------------- | --------- | -----: | -----: | --------: | -------- | ------------------- | ----: | --------- |
|   0 |   0 ms | GET     | `/home/Dashboard`                                                               |    200 | service-worker | Document  |  305 B |    0 B |    5.2 KB | —        | —                   |  3 ms | other     |
|   2 |   9 ms | GET     | `/launch-splash.js`                                                             |    200 | service-worker | Script    |  322 B |    0 B |    1.3 KB | —        | —                   |  2 ms | parser    |
|   3 |   9 ms | GET     | `/_expo/static/js/web/__expo-metro-runtime-8c088df8….js`                        |    200 | service-worker | Script    |  322 B |    0 B |    3.7 KB | —        | —                   |  2 ms | parser    |
|   4 |   9 ms | GET     | `/_expo/static/js/web/index-993c6bcc….js`                                       |    200 | service-worker | Script    |  322 B |    0 B | 9836.9 KB | —        | —                   | 42 ms | parser    |
|   5 |  13 ms | GET     | `/manifest.webmanifest`                                                         |    200 | network        | Manifest  |  500 B |  722 B |     539 B | —        | —                   | 14 ms | parser    |
|   6 |  89 ms | GET     | `/favicon.ico`                                                                  |    200 | service-worker | Other     |  322 B |    0 B |   14.2 KB | —        | —                   |  2 ms | other     |
|   7 |  90 ms | GET     | `/icons/icon-192.png`                                                           |    200 | network        | Other     |  571 B | 6.9 KB |    6.7 KB | —        | —                   |  1 ms | other     |
|   8 | 102 ms | GET     | `/_expo/static/js/web/en-US-10c3b7b4….js`                                       |    200 | service-worker | Script    |  322 B |    0 B |  367.6 KB | —        | —                   |  4 ms | script    |
|   9 | 102 ms | GET     | `ww-api-r.leviwilkerson.com/array/<project key>/config`                         |    200 | disk-cache     | Fetch     |  340 B |    0 B |    3.2 KB | gzip     | public, max-age=300 | 29 ms | script    |
|  10 | 103 ms | OPTIONS | `ww-api-r.leviwilkerson.com/array/<project key>/config`                         |    200 | network        | Preflight |  609 B |    0 B |         — | —        | —                   | 28 ms | preflight |
|  11 | 147 ms | GET     | `/assets/node_modules/@expo-google-fonts/inter/Inter_400Regular.079af0e2….ttf`  |    200 | service-worker | Font      |  353 B |    0 B |  302.6 KB | —        | —                   |  4 ms | other     |
|  12 | 148 ms | GET     | `/assets/node_modules/@expo-google-fonts/inter/Inter_500Medium.ed533866….ttf`   |    200 | service-worker | Font      |  353 B |    0 B |  307.3 KB | —        | —                   |  3 ms | other     |
|  13 | 148 ms | GET     | `/assets/node_modules/@expo-google-fonts/inter/Inter_600SemiBold.07a48beb….ttf` |    200 | service-worker | Font      |  353 B |    0 B |  308.4 KB | —        | —                   |  3 ms | other     |
|  14 | 148 ms | GET     | `/assets/node_modules/@expo-google-fonts/inter/Inter_700Bold.275bfea5….ttf`     |    200 | service-worker | Font      |  353 B |    0 B |  308.7 KB | —        | —                   |  3 ms | other     |
|  16 | 156 ms | GET     | `127.0.0.1:8790/scribe/v1/status`                                               |    200 | network        | Fetch     |  308 B |  589 B |     452 B | gzip     | no-store            | 12 ms | c         |
|  17 | 171 ms | GET     | `/canvaskit.wasm`                                                               |    200 | service-worker | Fetch     |  322 B |    0 B | 7887.3 KB | —        | —                   | 49 ms | c         |
|  18 | 182 ms | GET     | `127.0.0.1:8790/app/v1/config?…`                                                |    200 | network        | Fetch     |  513 B |  438 B |     168 B | gzip     | no-store            |  5 ms | c         |
|  19 | 189 ms | OPTIONS | `ww-api-r.leviwilkerson.com/flags/?…`                                           |    200 | network        | Preflight |  288 B |    0 B |         — | —        | —                   | 24 ms | preflight |
|  20 | 185 ms | GET     | `127.0.0.1:8790/health`                                                         |    200 | network        | Fetch     |  308 B |      — |     172 B | gzip     | no-store            |     … | script    |
|  21 | 185 ms | POST    | `ww-api-r.leviwilkerson.com/flags/?…`                                           |    200 | network        | Fetch     |  980 B |  292 B |     279 B | gzip     | —                   | 58 ms | script    |
|  22 | 199 ms | GET     | `/_expo/static/js/web/__expo-metro-runtime-8c088df8….js`                        |    200 | service-worker | Fetch     |  322 B |    0 B |    3.7 KB | —        | —                   |  6 ms | k         |
|  23 | 199 ms | GET     | `/_expo/static/js/web/index-993c6bcc….js`                                       |    200 | service-worker | Fetch     |  322 B |    0 B | 9836.9 KB | —        | —                   | 82 ms | k         |
|  24 | 199 ms | GET     | `/_expo/static/js/web/en-US-10c3b7b4….js`                                       |    200 | service-worker | Fetch     |  322 B |    0 B |  367.6 KB | —        | —                   |  6 ms | k         |
|  25 | 214 ms | POST    | `127.0.0.1:8790/accounts/v1/sessions/refresh`                                   |    200 | network        | Fetch     |  750 B |  736 B |     560 B | gzip     | —                   | 11 ms | c         |
|  26 | 225 ms | GET     | `/_expo/static/js/web/index-bba945bb….js`                                       |    200 | service-worker | Script    |  322 B |    0 B |  120.7 KB | —        | —                   |  6 ms | script    |
|  27 | 225 ms | GET     | `/_expo/static/js/web/__shared-6405faa3c77c60e2-8b29e98a….js`                   |    200 | service-worker | Script    |  322 B |    0 B |   53.9 KB | —        | —                   |  4 ms | script    |
|  28 | 226 ms | POST    | `127.0.0.1:8790/accounts/v1/live/ticket`                                        |    200 | network        | Fetch     |  977 B |  719 B |     515 B | gzip     | —                   |  8 ms | c         |
|  29 | 226 ms | GET     | `127.0.0.1:8790/accounts/v1/sync`                                               |    200 | network        | Fetch     |  876 B |  383 B |     118 B | gzip     | —                   | 16 ms | c         |
|  30 | 226 ms | POST    | `127.0.0.1:8790/accounts/v1/sync/list`                                          |    200 | network        | Fetch     |  929 B |  462 B |     187 B | gzip     | —                   | 16 ms | c         |
|  31 | 232 ms | GET     | `/canvaskit.wasm`                                                               |    200 | service-worker | Fetch     |  322 B |    0 B | 7887.3 KB | —        | —                   | 27 ms | W         |
|  32 | 242 ms | POST    | `127.0.0.1:8790/accounts/v1/sync/get`                                           |    200 | network        | Fetch     |  965 B | 2.4 KB |    2.1 KB | —        | no-store            | 10 ms | c         |
|  33 | 257 ms | POST    | `127.0.0.1:8790/accounts/v1/sync/put`                                           |    200 | network        | Fetch     | 4.1 KB |  462 B |     110 B | gzip     | —                   | 17 ms | c         |
|  34 | 270 ms | GET     | `/_expo/static/js/web/PetPromptCard-4c1948da….js`                               |    200 | service-worker | Script    |  322 B |    0 B |    4.9 KB | —        | —                   |  4 ms | script    |
|  35 | 271 ms | GET     | `/_expo/static/js/web/__shared-25217e3e9a119b52-9fbd06c7….js`                   |    200 | service-worker | Script    |  322 B |    0 B |    2.3 KB | —        | —                   |  3 ms | script    |
|  36 | 271 ms | GET     | `/_expo/static/js/web/__shared-df893e27ee3fa854-9fc628d1….js`                   |    200 | service-worker | Script    |  322 B |    0 B |    1.9 KB | —        | —                   |  3 ms | script    |
|  37 | 271 ms | GET     | `/_expo/static/js/web/__shared-37ed78094a48320a-670b47e8….js`                   |    200 | service-worker | Script    |  322 B |    0 B |     763 B | —        | —                   |  3 ms | script    |
|  38 | 271 ms | GET     | `/_expo/static/js/web/__shared-c8018f4182659e37-710820cd….js`                   |    200 | service-worker | Script    |  322 B |    0 B |  422.8 KB | —        | —                   |  6 ms | script    |
|  39 | 271 ms | GET     | `/_expo/static/js/web/ScribeOrbCanvas-58e05e40….js`                             |    200 | service-worker | Script    |  322 B |    0 B |    6.7 KB | —        | —                   |  3 ms | script    |
|  40 | 279 ms | POST    | `127.0.0.1:8790/accounts/v1/sync/list`                                          |    200 | network        | Fetch     |  929 B |  462 B |     187 B | gzip     | —                   |  6 ms | c         |
|  41 | 279 ms | POST    | `127.0.0.1:8790/accounts/v1/sync/list`                                          |    200 | network        | Fetch     |  929 B |  462 B |     187 B | gzip     | —                   | 10 ms | c         |
|  42 | 306 ms | POST    | `127.0.0.1:8790/accounts/v1/sync/get`                                           |    200 | network        | Fetch     |  965 B | 2.4 KB |    2.1 KB | —        | no-store            |  3 ms | c         |

**Service worker:** 2 more requests for the app's own files (its precache and what the page asked it for), 7893.8 KB on the wire. They aren't listed above.

**WebSocket** `127.0.0.1:8790/accounts/v1/sync/live` opened at 235 ms (extensions: permessage-deflate; client_max_window_bits=15): 7 frames, sent 12 B, received 36 B.

- 248 ms received 24 B: `{"type":"hello","seq":3}`
- 25251 ms sent 4 B: `ping`
- 25252 ms received 4 B: `pong`
- 50251 ms sent 4 B: `ping`
- 50251 ms received 4 B: `pong`
- 75251 ms sent 4 B: `ping`
- 75251 ms received 4 B: `pong`
