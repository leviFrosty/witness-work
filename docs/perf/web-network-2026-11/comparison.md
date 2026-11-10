# before → after

## cold load

|                              |     Before |      After |  Change |
| ---------------------------- | ---------: | ---------: | ------: |
| Requests on the network      |        429 |        424 |      -5 |
| CORS preflights              |          8 |          7 |      -1 |
| Sent more than once (routes) |          3 |          2 |      -1 |
| Sent                         |   173.5 KB |   169.5 KB | −4.1 KB |
| Received (wire)              | 50201.8 KB | 50197.5 KB | −4.3 KB |

| Request                                                         | Before | After |
| --------------------------------------------------------------- | -----: | ----: |
| `GET localhost:4173/_expo/static/js/web/FAQScreen-18758ae1….js` |      1 |     0 |
| `GET localhost:4173/_expo/static/js/web/FAQScreen-8898f364….js` |      0 |     1 |
| `GET localhost:4173/_expo/static/js/web/index-3b0fa729….js`     |      0 |     2 |
| `GET localhost:4173/_expo/static/js/web/index-993c6bcc….js`     |      2 |     0 |
| `OPTIONS (preflight) 127.0.0.1:8790/accounts/v1/sync/get`       |      1 |     0 |
| `POST 127.0.0.1:8790/accounts/v1/sync/get`                      |      2 |     0 |
| `POST 127.0.0.1:8790/accounts/v1/sync/list`                     |      4 |     2 |

## warm load

|                              |    Before |     After |  Change |
| ---------------------------- | --------: | --------: | ------: |
| Requests on the network      |        19 |        16 |      -3 |
| CORS preflights              |         2 |         2 |       0 |
| Sent more than once (routes) |         2 |         1 |      -1 |
| Sent                         |   16.4 KB |   13.3 KB | −3.0 KB |
| Received (wire)              | 7911.2 KB | 7905.9 KB | −5.3 KB |

| Request                                     | Before | After |
| ------------------------------------------- | -----: | ----: |
| `POST 127.0.0.1:8790/accounts/v1/sync/get`  |      2 |     0 |
| `POST 127.0.0.1:8790/accounts/v1/sync/list` |      3 |     2 |
