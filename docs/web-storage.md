# Web storage

How WitnessWork on the web keeps the User's data in the browser (ADR 0037 §6).
The code is in [`src/lib/webStorage/`](../src/lib/webStorage/).

## Stores live in IndexedDB, read from memory

The app's storage is synchronous: MMKV, zustand persist and the preferences
storage read and write without awaiting. On the web:

- **One database.** `witnesswork-stores` has one object store, `entries`, keyed
  `[mmkvId, key]`, with the value as set (`string`, `number`, `boolean` or
  `ArrayBuffer`). Every MMKV instance (`mmkv.default`, `server-account`,
  `install-id`, `account`, `help-center`, …) and AsyncStorage (`async-storage`)
  share it.
- **No call site changes.** [`metro/bundleRedirects.js`](../metro/bundleRedirects.js)
  swaps react-native-mmkv's internal `createMMKV` for
  [`webMmkv.ts`](../src/lib/webStorage/webMmkv.ts), and AsyncStorage for
  [`webAsyncStorage.ts`](../src/lib/webStorage/webAsyncStorage.ts), on the web
  only. `new MMKV({ id })` keeps working everywhere. MMKV's own web build would
  use `localStorage`, which is small, shared with other libraries, and easily
  evicted.
- **Hydration before the first render.** The web entry awaits
  `webStorageBoot.prepare()` next to CanvasKit while the launch splash shows. It
  claims the tab (below), then reads the whole database into memory in one
  transaction. Reads from then on are synchronous `Map` lookups.
- **Write-through.** Each write updates memory and marks the key dirty. At the
  end of the task (a microtask, never a timer, which background tabs throttle)
  every dirty key goes out in one `readwrite` transaction, the last value for
  each key, then `commit()`. Writes from later tasks go in later transactions,
  which IndexedDB runs in order. `clearAll()` deletes the id's range in the same
  transaction, before that task's later writes.
- **Flush.** `visibilitychange` (hidden) and `pagehide` retry anything that
  failed. Nothing else is waiting by then: writes are on their way at the end of
  each task.

## When the browser can't save

The User is told once per page load and kind, by `WebStorageNotices` through
`toast.error`, and `web_storage_failed` is sent.

- **A failed write** (quota, a disk error): memory keeps every change. The ids
  that write touched are saved again in full, from memory, on the next write, on
  hide or close, or after 15 s. A full rewrite never brings back rows deleted in
  between, and never reorders writes.
- **Out of space:** `QuotaExceededError`, the same path as above, with its own
  message.
- **No IndexedDB** (missing, refused by a private window, or an open that stays
  blocked for 10 s): the tab runs from memory only. Nothing is written to
  IndexedDB for the rest of that page load, because memory doesn't hold what it
  has.
- **The browser closes the connection** (site data cleared while the tab is
  open, a disk error): the database opens again and memory is saved in full;
  if it can't open yet, it tries again every 15 s. Clearing site data then a
  reload clears it for real.
- **A newer version** (`versionchange`): the tab sends what's waiting, closes
  its connection and reloads.
- **Persistence:** once storage is up, the boot calls `navigator.storage.persist()`
  if it isn't persistent yet (Chromium and Safari decide silently; Firefox asks
  once) and reads `estimate()`. Problem breadcrumbs carry both.
- **Safari's 7-day wipe** of a site in a browser tab (Home Screen web apps are
  exempt) leaves an empty database, which boots as a fresh install. The User
  signs in again (ADR 0037 §6).

## One active tab

Each tab keeps the stores in memory and saves them whole, so two tabs editing at
once would overwrite each other. One tab works with the data at a time:

- The active tab holds the Web Lock `witnesswork-active-tab` until it closes.
- Another tab can't get it and shows **WitnessWork Is Open in Another Tab** with
  **Use Here**. It loads the stores read-only for the User's language and theme,
  and starts nothing else of the app.
- **Use Here** marks the tab in `sessionStorage` and reloads it. The reload
  steals the lock. The other tab sends what's waiting, stops writing, waits for
  those writes to land and lets go of a second lock, `…:writer`. Only then does
  the new tab read the database, so its read sees every change the other tab
  made. A tab that never lets go (frozen, hung) loses the writer lock after 5 s.
  The other tab then reloads into the in-use screen.
- Changes a tab couldn't save (out of space) are lost when another tab takes
  over; the toast asked the User to keep that tab open.
- Browsers without Web Locks (Safari 15.3 and older) run every tab as active.

`web_tab_taken_over` is sent when Use Here makes a tab active.

## Secure key/value store (for accounts on the web)

[`secureKv.ts`](../src/lib/webStorage/secureKv.ts) keeps the browser's account
secrets (ADR 0038 §8) in a database of its own, `witnesswork-keys`, apart from
the stores.

```ts
import { secureKv } from '@/lib/webStorage/secureKv'

secureKv.available // false on iOS and Android
await secureKv.set('wrapKey', cryptoKey) // any structured-cloneable value
const key = await secureKv.get<CryptoKey>('wrapKey') // undefined if missing
await secureKv.delete('wrapKey')
await secureKv.clearAll()
```

- Values are stored as structured clones, never strings. A non-extractable
  `CryptoKey` comes back usable and still non-extractable. A value that can't be
  cloned (a function, a class with private state) rejects `set`.
- Every call is its own transaction and resolves once it's committed.
- It isn't in memory and isn't covered by the tab lock: read it when needed.
- On iOS and Android there's no IndexedDB: `available` is false and every call
  rejects. Keep it on web code paths.

## The account at rest

The browser's account (docs/passkeys-protocol.md, "On the web") keeps its
secrets in `secureKv`, sealed by
[`sealedSecrets.ts`](../src/lib/webStorage/sealedSecrets.ts):

- `wrap-key`: a non-extractable AES-GCM 256 `CryptoKey`, made the first time a
  secret is saved (one tab at a time, under the Web Lock
  `witnesswork-wrap-key`). Page code can use it but never read it.
- `sealed:account-key` and `sealed:session`: `{ v: 1, iv, data }`, AES-GCM with
  a fresh 12-byte nonce each write and the name as additional data, so one
  can't be swapped for the other. The session record holds the refresh token;
  the access token stays in memory. A value that won't open (a lost wrap key,
  or tampering) reads as missing and is reported to error tracking by name
  only.
- `sealed:account-key-change`: while the browser changes its account key (ADR
  0039), the change record, which holds the old key and the new one
  ([`webKeyChangeRecordStore.ts`](../src/lib/accountKey/webKeyChangeRecordStore.ts)).
  It's deleted when the change is done, and a wipe takes it too.
- `sealed:device.<name>`: what phones keep in `modules/device-secrets` (this
  device only, never synced), sealed the same way by its web build
  ([`modules/device-secrets/web.ts`](../modules/device-secrets/web.ts)): the
  account's key history while a key change re-seals
  (`device.account-key-history`), and Buddies' progress through a key change
  (`device.buddies.key-change`). A wipe takes them.

Beside them, in the clear, never a secret:

- `data-owner`: the account id the local data belongs to, written when a
  session is kept. Signing in keeps the data only for that account; anything
  else, or data with no owner, is wiped first. Whether the old key can be read
  never decides it.
- `session-refresh-in-flight`: a hash of the refresh token on the wire,
  written before a refresh is sent and cleared once its replacement is stored.
  A `reused` answer for a token still marked is this browser's own lost answer
  (any refresh whose answer never arrived: a tab closed, a timeout, a lost
  connection): the session ends as `expired`, keeping the data. Nothing is sent
  while the browser says it's offline.
- `session-stale`: a hash of a refresh token that a failed write left behind
  (`session.ts`).
- `wipe-pending`: set before a wipe starts and before any other tab hears of
  it; see [Wiping everything](#wiping-everything).

The code that reads and writes them is
[`webRuntime.web.ts`](../src/lib/serverAccount/webRuntime.web.ts); phones load
`webRuntime.ts`, which is null, so none of it is in their bundle.

[`webAccountKey.ts`](../src/lib/accountKey/webAccountKey.ts) reads the account
key into memory before the first render (`beforeAppLoads.web.ts`), so
`modules/buddies-keychain`'s web version can answer `isAvailable()` (signed
in) synchronously. The browser never makes a key by itself: it arrives with a
sign-in, or web sign-up makes it. Only its own key change replaces it
(`lib/accountKey`, step 4); a sign-in as another account wipes the browser
first.

[`webAccount.ts`](../src/lib/serverAccount/webAccount.ts) signs in with a
ticket (`openWebSessionWithTicket`), keeps web sign-up's session, and signs
out. Signing in as another account closes the old session, wipes, stores the
new key without loading it into the page, and reloads every tab, so nothing
acts on the new key while the old account's data is in memory. The session engine (`session.ts`, `web`) never opens a session by itself
on the web. Its tabs refresh one at a time under the Web Lock `ww-session`,
read the stored refresh token again inside it, and share the new access token
over the `BroadcastChannel` `ww-session` (`webTabs.ts`), which also carries
sign-in, a wipe and an ended session to every tab.

## Wiping everything

`clearAllWebData()` from [`boot.ts`](../src/lib/webStorage/boot.ts) deletes all of
WitnessWork's local data in this browser: every store row, the memory copy, and
every secure key/value entry, the stores first. Writes stop until the page
reloads, so call `location.reload()` (or navigate) straight after. Signing out
calls it, as do a session the server ended as `revoked` or `reused` (in every
tab that hears of it), and signing in as another account (`webAccount.ts`).
Each first calls `markWipePending()`, which sets `wipe-pending` in `secureKv`;
the wipe clears it last. When every tab closes mid-wipe, the next active tab
finds it before the app loads, finishes the wipe, and reloads. It doesn't touch other libraries' own keys (PostHog's and RevenueCat's
`localStorage` entries) or service worker caches.

## What `localStorage` still holds

No app store data; after a session in Chromium, WebKit and Firefox it was
empty. PostHog's queue (`.posthog-rn.json`) uses AsyncStorage, so it lands in
the store database (`async-storage`) too, and `clearAllWebData()` deletes it.
The purchases SDK may keep its own key there (`revenuecat_user_id`); that's the
SDK's to manage. `sessionStorage` briefly holds `witnesswork-take-over` during
Use Here.

## Testing

- Unit: `src/lib/webStorage/*.test.ts` on `fake-indexeddb`, including a real
  non-extractable WebCrypto key.
- Browsers: `e2e/web/storage.spec.ts` on the production export in Chromium,
  WebKit and Firefox (`pnpm web:test`).
