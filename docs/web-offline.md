# Web offline, updates and install

How WitnessWork on the web opens without a connection, takes a new version, and
gets installed (ADR 0037 §6, §7). The Help Center's answers
(`services/marketing/content/help/en-US/general/web-offline.mdx`,
`web-updates.mdx`, `web-install.mdx`) describe this behavior; change them with it.

## The service worker

`/sw.js` is built after `expo export` by `scripts/web-sw.mjs`, which `pnpm web:build`
runs every time:

1. **esbuild** bundles `web/sw/sw.ts` (Workbox's `precaching`, `routing`,
   `strategies` and `expiration`) into one self-contained file. There's no
   `importScripts`, so nothing loads from another origin.
2. **Workbox `injectManifest`** writes the precache list into it, with
   `maximumFileSizeToCacheInBytes` raised to 32 MiB so `canvaskit.wasm` (about
   8 MB) and the entry chunk (about 15 MB) are kept.
3. **`checkExport`** (`serviceWorker: true`) fails the build if `sw.js` is missing
   or doesn't precache `index.html` and every chunk `index.html` loads.

The page registers it from `src/app/web-offline/WebOfflineRuntime.web.tsx`, only
in exported builds (`__DEV__` is false) and only where the browser has service
workers (a secure context). The registration goes through the existing
Trusted Types policy: `ww-chunks` also creates the one script URL `/sw.js`
(`src/vendor/web/trustedTypes.ts`), so the enforcing CSP and
`require-trusted-types-for 'script'` hold. `worker-src 'self'` already allows it.
The Worker serves `/sw.js` with `Cache-Control: no-cache`, and the page registers
it with `updateViaCache: 'none'`, so every update check is fresh.

### What it caches

| Request                                                                        | Strategy                                                                 |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `index.html`, the entry and on-demand chunks, English, fonts, images, `*.wasm` | **Precache**, versioned by the build.                                    |
| Navigations (`/`, any app route)                                               | **Network first**, 4 s; the precached shell when offline, slow or a 5xx. |
| Chunks that aren't precached (other languages, the session replay recorder)    | **Cache first** once loaded, 120 entries, purged on quota errors.        |
| ww-api, PostHog, the Help Center, RevenueCat, any other origin                 | **Never** cached; the worker doesn't touch them.                         |
| `/_csp-report`, `/.well-known/*`, `/sw.js`                                     | **Never** cached.                                                        |

A response is stored under a script's URL only if it isn't HTML (`isStorableFile`
in `web/sw/rules.ts`): Cloudflare answers an unknown path with `index.html`, and
a cached page under a `.js` URL would keep a tab broken. The app's data never
passes through the worker: it lives in IndexedDB (`docs/web-storage.md`).

A first visit loads its language before the worker controls the page, so once a
worker controls it the page asks for the chunks it already loaded again and the
worker keeps them (`keepLoadedChunks`). Reloading offline right after a first
visit therefore opens in the User's language.

Limits: a language the browser has never loaded needs a connection the first
time it's picked. If it can't download (offline, or a deploy removed the file),
the app opens in English instead of failing (`setI18nLocale`) and loads the
language on the next try. Everything else opens offline: all screens are in the
entry chunk, and the other on-demand chunks (such as the database's) are
precached.

## Updates

A new deploy changes `sw.js`, so the browser installs a new worker beside the
running one, on the next navigation and when the page asks (a tab coming back
to the front, and every hour: `createUpdateChecks`). The new worker **waits**.
`src/lib/webOffline/updateFlow.ts` is the state machine:

`idle → waiting → prompted → activating → reloading`

- A waiting worker shows **Update available** while the tab is visible: a
  `toast.info` bar at the bottom for 20 s with a **Reload** button (the top
  `news` card has no button to offer). Closed unanswered, it comes back the next
  time the User returns to the tab. It says Reload when you're ready: the open
  screen's unsaved input is lost by a reload, saved records aren't.
- **Reload** posts `SKIP_WAITING`; when the new worker takes over
  (`controllerchange`) the page reloads, once. If no worker is waiting any more
  (another tab took the update), Reload reloads at once.
- **Only an accepted update reloads.** A worker that takes over for any other
  reason (another tab accepted, the first install) never reloads this tab, so
  nothing changes under someone who is editing.
- If the worker doesn't take over within 10 s the state goes back to `waiting`.

The old version's lazy chunks stay in the cache until they age out, so a tab that
hasn't updated can still load them.

### Stale tabs

A tab left open across a deploy can ask for a hashed file the new version no
longer has. The Worker answers a real 404 for it
(`docs/web-hosting.md`). `fetchThenEval.ts` then calls `onChunkLoadFailed`
(`src/lib/webOffline/staleChunk.ts`): it asks the server again with a `HEAD`
request, and **reloads the tab once** if the answer is 404/410. It never reloads
offline or when the server doesn't answer, and `reloadGuard.ts` allows one reload
per build within ten minutes (`sessionStorage` key `ww.staleChunkReload`), so a
reload that doesn't fix it can't loop.

## The offline banner

`OfflineBanner` (`src/app/web-offline/OfflineBanner.tsx`) shows ADR 0037 §6's text
(`webOffline_banner`) as a strip above the app, in `WebBannersLayout`, so it
covers no sheet or button. It shows while `offlineBannerShows` is true: the browser says it's offline, or Cloud Sync's last
read or write failed for the network's reason (`iCloudSyncIssue` with
`iCloudSyncErrorCode: 'network'`). It goes when the connection is back and a sync
works.

## Sync triggers

The web doesn't have a sync of its own: it uses the engine (`installiCloudSync`
and Cloud Sync, ADR 0030). Its triggers on the web:

- **App open:** the launch catch-up.
- **Return to the page:** `visibilitychange` → visible (React Native Web's
  `AppState`), and the window's **`focus`** (`addWindowFocusListener`), under the
  engine's 30 s throttle.
- **`online`:** `expo-network` reports it; the engine's reconnect listener pulls and
  pushes what waited.
- **After local writes:** `subscribeToLocalDataChanges` → a push debounced by 5 s.

## Install

`public/index.html` is Expo's template with the web app manifest
(`public/manifest.webmanifest`, icons in `public/icons/`, made by
`scripts/generate-web-icons.py`) and Apple's Smart App Banner
(`<meta name="apple-itunes-app" content="app-id=6469723047">`), so iPhone and iPad
Safari offer the App Store app. `public/` is copied to the export's root; the Worker
serves the manifest as `application/manifest+json`.

On an **Android phone's browser** the app draws its own Install App banner above
everything (`src/app/web-install`): it shows when the browser has offered its
install prompt (`beforeinstallprompt`, captured at startup in
`src/lib/webInstall/installPrompt.ts`), **Install** calls `prompt()`, and the X
(a 44-point target) hides it for good in the app's persisted stores
(`src/lib/webInstall/dismissal.ts`, IndexedDB-backed, never `localStorage`). It
hides once installed (`appinstalled`) and never shows in standalone mode, on
desktop, on iPhone or iPad.

**Switching to Google Play.** The intended Android target is the Play listing, which
isn't public yet. `ANDROID_INSTALL_TARGET` in `src/constants/webInstall.ts` is the
one line to change: `{ source: 'play', url: links.playStore }` shows the banner on
every Android phone browser and opens the listing instead of the browser's prompt.
Change the banner's copy (`webInstall_message`) and the `webInstall` and `android`
Help answers with it; a Play install doesn't fire `appinstalled` in the browser, so
the banner then hides only through the X.

## Analytics

`web_update_prompted`, `web_update_accepted`, `web_stale_chunk_reload`,
`web_install_banner_shown`, `web_install_accepted` and
`web_install_banner_dismissed`, without properties: see
[`analytics.md`](analytics.md#web-updates-and-install).

## Testing

Unit tests cover the state machine, the reload guard, the stale-chunk check, the
install decision and the worker's rules. `e2e/web/offline.spec.ts` and
`install.spec.ts` drive the real thing through the Worker (`E2E_WORKER=dev`);
`e2e/web/README.md` says how to run them, including the update flow, which needs a
second build (`node e2e/web/next-version.mjs`).
