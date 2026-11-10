# Web network capture: beta-signed-out

- URL: https://beta.app.witnesswork.app/
- Captured: 2026-11-10T07:03:35.492Z
- Browser: Chrome/156.0.8078.4

## cold load

13 requests on the network (0 CORS preflights), 0 answered by the service worker, 0 by the HTTP cache, 0 failed. Sent 7.5 KB, received 2554.9 KB on the wire (11502.1 KB decoded). Last response at 0.6 s.

| Group        | Requests |   Sent | Received (wire) | Received (decoded) |
| ------------ | -------: | -----: | --------------: | -----------------: |
| app (static) |       11 | 6.3 KB |       2553.5 KB |         11499.0 KB |
| PostHog      |        2 | 1.2 KB |          1.5 KB |             3.2 KB |

|   # |     At | Method  | URL                                                                             | Status | From    | Type     |  Sent |      Wire |   Decoded | Encoding | Cache-Control                                    |  Took | Trigger   |
| --: | -----: | ------- | ------------------------------------------------------------------------------- | -----: | ------- | -------- | ----: | --------: | --------: | -------- | ------------------------------------------------ | ----: | --------- |
|   0 |   0 ms | GET     | `/`                                                                             |    200 | network | Document | 692 B |    2.9 KB |    1.7 KB | —        | public, max-age=0, must-revalidate, no-transform | 14 ms | other     |
|   1 |  19 ms | GET     | `/_expo/static/js/web/__expo-metro-runtime-8c088df8….js`                        |    200 | network | Script   | 562 B |    2.5 KB |    3.7 KB | br       | public, max-age=31536000, immutable              | 15 ms | parser    |
|   2 |  19 ms | GET     | `/_expo/static/js/web/index-f79efc31….js`                                       |    200 | network | Script   | 547 B | 1965.6 KB | 9832.7 KB | br       | public, max-age=31536000, immutable              | 78 ms | parser    |
|   3 |  31 ms | GET     | `/manifest.webmanifest`                                                         |    200 | network | Manifest | 520 B |    1.5 KB |     539 B | zstd     | public, max-age=0, must-revalidate               | 21 ms | parser    |
|   4 | 189 ms | GET     | `/favicon.ico`                                                                  |    200 | network | Other    | 585 B |    2.9 KB |   14.2 KB | zstd     | public, max-age=0, must-revalidate               | 14 ms | other     |
|   5 | 191 ms | GET     | `/icons/icon-192.png`                                                           |    200 | network | Other    | 592 B |    7.9 KB |    6.7 KB | —        | public, max-age=0, must-revalidate               | 11 ms | other     |
|   6 | 261 ms | OPTIONS | `ww-api-r.leviwilkerson.com/array/<project key>/config`                         |    200 | network | Other    | 587 B |       0 B |         — | —        | —                                                | 47 ms | preflight |
|   7 | 255 ms | GET     | `/_expo/static/js/web/en-US-a0f94bbf….js`                                       |    200 | network | Script   | 286 B |   85.3 KB |  412.5 KB | br       | public, max-age=31536000, immutable              | 17 ms | script    |
|   8 | 259 ms | GET     | `ww-api-r.leviwilkerson.com/array/<project key>/config`                         |    200 | network | Fetch    | 636 B |    1.5 KB |    3.2 KB | gzip     | public, max-age=300                              | 82 ms | script    |
|   9 | 543 ms | GET     | `/assets/node_modules/@expo-google-fonts/inter/Inter_400Regular.079af0e2….ttf`  |    200 | network | Font     | 680 B |  114.2 KB |  302.6 KB | br       | public, max-age=31536000, immutable              | 18 ms | other     |
|  10 | 544 ms | GET     | `/assets/node_modules/@expo-google-fonts/inter/Inter_500Medium.ed533866….ttf`   |    200 | network | Font     | 679 B |  122.7 KB |  307.3 KB | br       | public, max-age=31536000, immutable              | 19 ms | other     |
|  11 | 544 ms | GET     | `/assets/node_modules/@expo-google-fonts/inter/Inter_600SemiBold.07a48beb….ttf` |    200 | network | Font     | 681 B |  124.0 KB |  308.4 KB | br       | public, max-age=31536000, immutable              | 21 ms | other     |
|  12 | 544 ms | GET     | `/assets/node_modules/@expo-google-fonts/inter/Inter_700Bold.275bfea5….ttf`     |    200 | network | Font     | 677 B |  124.1 KB |  308.7 KB | br       | public, max-age=31536000, immutable              | 23 ms | other     |

## warm load

5 requests on the network (0 CORS preflights), 0 answered by the service worker, 8 by the HTTP cache, 0 failed. Sent 3.1 KB, received 4.7 KB on the wire (23.1 KB decoded). Last response at 0.2 s.

| Group        | Requests |   Sent | Received (wire) | Received (decoded) |
| ------------ | -------: | -----: | --------------: | -----------------: |
| app (static) |        4 | 2.6 KB |          4.7 KB |            23.1 KB |
| PostHog      |        1 |  587 B |             0 B |                0 B |

|   # |     At | Method  | URL                                                                             | Status | From         | Type     |  Sent |   Wire |   Decoded | Encoding | Cache-Control                                    |  Took | Trigger   |
| --: | -----: | ------- | ------------------------------------------------------------------------------- | -----: | ------------ | -------- | ----: | -----: | --------: | -------- | ------------------------------------------------ | ----: | --------- |
|   0 |   0 ms | GET     | `/`                                                                             |    200 | network      | Document | 769 B | 1.2 KB |    1.7 KB | —        | public, max-age=0, must-revalidate, no-transform | 12 ms | other     |
|   1 |  20 ms | GET     | `/_expo/static/js/web/__expo-metro-runtime-8c088df8….js`                        |    200 | memory-cache | Script   |  11 B |    0 B |    3.7 KB | br       | public, max-age=31536000, immutable              |  0 ms | parser    |
|   2 |  20 ms | GET     | `/_expo/static/js/web/index-f79efc31….js`                                       |    200 | memory-cache | Script   |  11 B |    0 B | 9832.7 KB | br       | public, max-age=31536000, immutable              |  0 ms | parser    |
|   3 | 104 ms | GET     | `/manifest.webmanifest`                                                         |    200 | network      | Manifest | 573 B | 1.2 KB |     539 B | zstd     | public, max-age=0, must-revalidate               | 16 ms | other     |
|   4 | 108 ms | GET     | `/favicon.ico`                                                                  |    200 | network      | Other    | 638 B | 1.2 KB |   14.2 KB | zstd     | public, max-age=0, must-revalidate               | 15 ms | other     |
|   5 | 126 ms | OPTIONS | `ww-api-r.leviwilkerson.com/array/<project key>/config`                         |    200 | network      | Other    | 587 B |    0 B |         — | —        | —                                                | 30 ms | preflight |
|   6 | 122 ms | GET     | `/_expo/static/js/web/en-US-a0f94bbf….js`                                       |    200 | memory-cache | Script   |  11 B |    0 B |  412.5 KB | br       | public, max-age=31536000, immutable              |  2 ms | script    |
|   7 | 125 ms | GET     | `ww-api-r.leviwilkerson.com/array/<project key>/config`                         |    200 | disk-cache   | Fetch    | 318 B |    0 B |    3.2 KB | gzip     | public, max-age=300                              | 32 ms | script    |
|   8 | 130 ms | GET     | `/icons/icon-192.png`                                                           |    200 | network      | Other    | 643 B | 1.1 KB |    6.7 KB | —        | public, max-age=0, must-revalidate               | 11 ms | other     |
|   9 | 179 ms | GET     | `/assets/node_modules/@expo-google-fonts/inter/Inter_400Regular.079af0e2….ttf`  |    200 | memory-cache | Font     |  86 B |    0 B |  302.6 KB | br       | public, max-age=31536000, immutable              |  0 ms | other     |
|  10 | 179 ms | GET     | `/assets/node_modules/@expo-google-fonts/inter/Inter_500Medium.ed533866….ttf`   |    200 | memory-cache | Font     |  86 B |    0 B |  307.3 KB | br       | public, max-age=31536000, immutable              |  0 ms | other     |
|  11 | 179 ms | GET     | `/assets/node_modules/@expo-google-fonts/inter/Inter_600SemiBold.07a48beb….ttf` |    200 | memory-cache | Font     |  86 B |    0 B |  308.4 KB | br       | public, max-age=31536000, immutable              |  0 ms | other     |
|  12 | 179 ms | GET     | `/assets/node_modules/@expo-google-fonts/inter/Inter_700Bold.275bfea5….ttf`     |    200 | memory-cache | Font     |  86 B |    0 B |  308.7 KB | br       | public, max-age=31536000, immutable              |  0 ms | other     |
