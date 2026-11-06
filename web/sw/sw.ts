// WitnessWork's service worker (docs/web-offline.md): the app opens without a
// connection, like a document editor (ADR 0037 §6). Built after `expo export`
// by `scripts/web-sw.mjs`, which bundles this file and has Workbox's
// `injectManifest` fill in the precache list. Same-origin and self-contained:
// no `importScripts`, so it runs under the CSP and Trusted Types.
import { clientsClaim } from 'workbox-core'
import { ExpirationPlugin } from 'workbox-expiration'
import {
  addRoute,
  cleanupOutdatedCaches,
  matchPrecache,
  precache,
} from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { CacheFirst } from 'workbox-strategies'
import {
  NAVIGATION_TIMEOUT_MS,
  ON_DEMAND_CACHE_PREFIX,
  SHELL_URL,
  isChunkRequest,
  isNeverCached,
  isOnDemandFile,
  isStorableFile,
  isUsableNavigation,
} from './rules'

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null } | string>
}

/** The wasm files' revision, written in at build (`scripts/web-sw.mjs`). */
declare const __WW_ON_DEMAND_REVISION__: string
const ON_DEMAND_CACHE = `${ON_DEMAND_CACHE_PREFIX}${__WW_ON_DEMAND_REVISION__}`

/** The page asks to take over once the User accepts the update. */
const SKIP_WAITING = 'SKIP_WAITING'

// A new worker waits until the User accepts it (`skipWaiting` by message), so
// a tab never changes under someone mid-edit. The first one takes over at once.
clientsClaim()
self.addEventListener('message', (event) => {
  if (event.data?.type === SKIP_WAITING) void self.skipWaiting()
})

// Network first for pages: a deploy shows up on the next navigation. When the
// network is down, slow or failing, the shell this worker precached answers;
// the app itself reads its data from IndexedDB. This route comes before the
// precache's own, which would otherwise answer `/` and `/index.html` first.
registerRoute(
  ({ request, url }) =>
    request.mode === 'navigate' && !isNeverCached(url, self.location.origin),
  async ({ request }) => {
    try {
      const response = await Promise.race([
        fetch(request),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error('navigation timed out')),
            NAVIGATION_TIMEOUT_MS
          )
        ),
      ])
      if (isUsableNavigation(response)) return response
    } catch {
      // Offline, or too slow: the shell below.
    }
    return (await matchPrecache(SHELL_URL)) ?? Response.error()
  }
)

// The app shell, the entry chunk, fonts, images and the wasm files, from the
// manifest `injectManifest` writes in. Hashed names carry their own version.
precache(self.__WB_MANIFEST)
addRoute()
cleanupOutdatedCaches()

// Languages other than English load when picked and are kept once loaded, so
// they open offline too. Old versions' chunks stay until they age out or the cache fills,
// so a tab that hasn't updated can still load them.
registerRoute(
  ({ url }) => isChunkRequest(url, self.location.origin),
  new CacheFirst({
    cacheName: 'ww-chunks',
    plugins: [
      {
        cacheWillUpdate: async ({ response }) =>
          isStorableFile(response) ? response : null,
        cachedResponseWillBeUsed: async ({ cachedResponse }) =>
          cachedResponse && isStorableFile(cachedResponse)
            ? cachedResponse
            : null,
      },
      // Bounded by count, not age: a language picked months ago must still
      // open offline.
      new ExpirationPlugin({ maxEntries: 120, purgeOnQuotaError: true }),
    ],
  })
)

// The wasm files download when something first needs them (CanvasKit when
// something first draws with Skia) and are kept from then on, in a cache named
// after this build's copies; an activated worker drops other builds'.
registerRoute(
  ({ url }) => isOnDemandFile(url, self.location.origin),
  new CacheFirst({
    cacheName: ON_DEMAND_CACHE,
    plugins: [
      {
        cacheWillUpdate: async ({ response }) =>
          isStorableFile(response) ? response : null,
      },
    ],
  })
)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter(
              (name) =>
                name.startsWith(ON_DEMAND_CACHE_PREFIX) &&
                name !== ON_DEMAND_CACHE
            )
            .map((name) => caches.delete(name))
        )
      )
  )
})

// Everything else (ww-api, PostHog, the Help Center, `/.well-known/*`, the CSP
// report) matches no route, so the browser handles it and nothing is stored.
