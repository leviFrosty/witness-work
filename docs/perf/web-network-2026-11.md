# Web launch network profile, November 2026

What the web app requests when it launches, why some requests went out more than once, and what changed. The captures were made with [`scripts/perf/web-network.mjs`](./web-network.md); the summaries are in [`web-network-2026-11/`](./web-network-2026-11/).

## What was measured

| Capture                                                                           | Build                                                  | Backend                   | Account                                           |
| --------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------- | ------------------------------------------------- |
| [`beta-signed-out`](./web-network-2026-11/beta-signed-out.md)                     | Beta web (`beta.app.witnesswork.app`)                  | production ww-api         | signed out                                        |
| [`before`](./web-network-2026-11/before.md)                                       | production-mode export of `main` at `ab8cebac4`        | local ww-api at `7d50b4b` | web-only account, one device                      |
| [`after`](./web-network-2026-11/after.md)                                         | production-mode export of this change (on `c94023a57`) | the same                  | the same account and browser profile              |
| [`after-first-browser-again`](./web-network-2026-11/after-first-browser-again.md) | with this change                                       | the same                  | the same account after a second browser joined it |

**No signed-in capture of Beta.** Beta web signs in to production accounts. Production has web sign-up turned off, and an existing account needs its owner's passkey or phone. The signed-in launches were measured on a production-mode export against a local ww-api instead. That shows the same app code making the same calls, but not the edge: the local static server doesn't compress, the local build has no RevenueCat web key, and timings are loopback timings. The exports call `http://127.0.0.1:8790`; in the second one that origin was patched into the built entry chunk instead of rebuilding.

## Signed out, on Beta

A cold load is 13 requests and 2.55 MB on the wire (11.5 MB decoded). Nothing is requested twice, there are no ww-api calls, and no service worker is registered yet.

| Request                                   |     Wire |  Decoded | Encoding | Cache-Control                |
| ----------------------------------------- | -------: | -------: | -------- | ---------------------------- |
| Entry chunk `index-….js`                  | 1,966 KB | 9,833 KB | br       | `immutable`                  |
| Four Inter fonts (`.ttf`)                 |   485 KB | 1,227 KB | br       | `immutable`                  |
| English strings chunk                     |    85 KB |   413 KB | br       | `immutable`                  |
| Page, manifest, icons, runtime chunk      |    18 KB |    27 KB | br, zstd | `max-age=0, must-revalidate` |
| PostHog remote config (and its preflight) |   1.5 KB |   3.2 KB | gzip     | `max-age=300`                |

A warm reload is 5 requests and 4.7 KB: the page, manifest and icons revalidate, and everything else comes from the HTTP cache.

## Signed in: before and after

ww-api requests during a cold launch of a signed-in browser with one device on the account:

| Request                              |  Before |   After |
| ------------------------------------ | ------: | ------: |
| `GET /scribe/v1/status`              |       1 |       1 |
| `GET /app/v1/config`                 |       1 |       1 |
| `GET /health`                        |       1 |       1 |
| `POST /accounts/v1/sessions/refresh` |       1 |       1 |
| `POST /accounts/v1/live/ticket`      |       1 |       1 |
| `GET /accounts/v1/sync`              |       1 |       1 |
| `POST /accounts/v1/sync/list`        |   **4** |   **2** |
| `POST /accounts/v1/sync/get`         |   **2** |   **0** |
| `POST /accounts/v1/sync/put`         |       1 |       1 |
| CORS preflights                      |       6 |       5 |
| **Total**                            |  **19** |  **14** |
| Sent                                 | 15.9 KB | 11.8 KB |
| Received (wire)                      |  9.9 KB |  4.2 KB |

A warm reload goes from 12 ww-api requests to 9 (`sync/list` 3 to 2, `sync/get` 2 to 0), and from 9.5 KB received to 4.2 KB. The test account is nearly empty, so its snapshot is 2.1 KB. `sync/get` returns the whole snapshot, so on a real account the two downloads that are gone were two copies of all of the device's own data.

Everything else in the launch is unchanged: 4 PostHog requests (remote config and flags, each with a preflight), the app's own files, and one WebSocket.

With a second browser on the account, a cold launch of the first one lists three times and downloads the other browser's snapshot once ([capture](./web-network-2026-11/after-first-browser-again.md)). The third listing is the live socket's: see [What is left](#what-is-left).

## Why requests went out more than once

**`sync/list` four times.** The four listings had three causes.

1. The launch catch-up lists the account's slots. This one is needed.
2. Cloud Sync's status check (`refreshCloudSyncStatus`) tells the sync engine that sync is available every time it succeeds, and the session does the same when it becomes ready. Both happen during launch, while the launch catch-up is already running. Each announcement queued another full catch-up, and each catch-up listed again. That is two of the four.
3. After its first upload, a browser removes the slots of browsers that have signed out (`pruneEndedWebSnapshots`), and lists again to do it. This is deliberate and web-only.

**`sync/get` twice.** The slot listing includes the device's own slot. The engine downloaded every listed slot whose ETag it hadn't seen this launch, including its own. The ETag cache is in memory, so the first pull of every launch downloaded the device's own snapshot, and because an upload changes the slot's ETag, the next pull downloaded it again. The engine only needs to know that its own slot exists.

**Rows that look like duplicates but aren't.** ww-api is on a different origin from the web app, so the browser sends an `OPTIONS` preflight before each call with a bearer token. DevTools shows it as a second row with the same URL. ww-api lets the browser cache the answer for two hours (`Access-Control-Max-Age: 7200`), so a returning visitor sends fewer of them.

**`canvaskit.wasm` twice.** The Skia loader fetches the file to check that it is there, and Skia then fetches it again to compile it. On Beta the file is 2.5 MB compressed with `max-age=0, must-revalidate`, so the second fetch should be a `304`, not a second download. That wasn't measured in a signed-in browser on the edge.

All of it is production behavior, not a development artifact. `React.StrictMode` isn't used.

**iOS and Android** run the same sync engine and status check, so they made the same extra listings and own-slot downloads (without the web-only removal step), plus a photo listing with each pass. This is from reading the code and the unit tests, not from a device capture.

## What changed

- **An availability announcement no longer starts a catch-up that a running or just-finished one covers.** It is skipped when a catch-up for the same transport, the same account, and the same pull generation is in flight, or finished completely within the last 30 seconds. A catch-up that left a file unread, a change of account, and a reset of the pull state all still start a new one, and an announcement that arrives during a catch-up which then leaves a file unread starts one when it ends.
- **A device no longer downloads its own slot.** The pull asks the transport to list it without fetching it. The engine still sees that its own slot is missing and uploads it again. [`accounts-protocol.md`](../accounts-protocol.md) already described reads this way.

Neither changes the wire protocol or what is merged.

## What is left

Not changed here, because each one touches sync behavior, the protocol, or the architecture.

| Proposal                                                             | Saving                                                                                                                 | Risk                                                                                                                         |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Remember each slot's last merged ETag across launches                | One whole-snapshot download per other device on every launch and reload                                                | Medium. A wrong entry skips a real change, so it must be cleared with the pull state and written only after a merge commits. |
| Skip the launch upload when the snapshot hasn't changed              | One whole-snapshot upload per launch, and the wake-up it sends every other device                                      | Medium. Every launch uploads on purpose today; the upload also refreshes the slot's age.                                     |
| Compare the live socket's `hello` with the listing that is in flight | One `sync/list` on launches where the socket opens before the first listing returns                                    | Low to medium. It is a sequence-number comparison, but it changes timing in the shared live-socket client.                   |
| Record-level sync instead of whole snapshots (ADR 0030, phase 2)     | Most of the bytes of every edit on a large account                                                                     | High. A new protocol and merge path. Measure snapshot sizes first.                                                           |
| Serve ww-api on the web app's origin through the web Worker          | Every preflight and one TLS connection per visit                                                                       | Medium. Changes hosting, cookies and CSP assumptions.                                                                        |
| Hand Skia the bytes the loader already fetched                       | One conditional request for `canvaskit.wasm` per launch                                                                | Low. Needs a browser check on the edge.                                                                                      |
| Subset the fonts by script (WOFF2)                                   | Up to about 350 KB of 485 KB on a first visit for Latin-script users (estimate). Plain WOFF2 saves little over Brotli. | Low. Each script needs its own subset.                                                                                       |
| Back off after a failed session refresh                              | A burst of refresh attempts when ww-api is unreachable (17 in 8.5 s in one capture)                                    | Low to medium. Must not delay recovery when the network returns.                                                             |

## The WebSocket

The sync socket carries almost nothing: a 24-byte `hello`, a ~29-byte `changed` notice when another device uploads, and a 4-byte ping and pong every 25 seconds. `permessage-deflate` is already negotiated. Compressing or delta-encoding these frames would save nothing. The bytes are in the HTTP calls a `changed` notice leads to, so that is where delta work belongs: the ETag ledger first, then record-level sync.
