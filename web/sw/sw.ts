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

declare const __WW_ON_DEMAND_REVISION__: string
const ON_DEMAND_CACHE = `${ON_DEMAND_CACHE_PREFIX}${__WW_ON_DEMAND_REVISION__}`

const SKIP_WAITING = 'SKIP_WAITING'

clientsClaim()
self.addEventListener('message', (event) => {
  if (event.data?.type === SKIP_WAITING) void self.skipWaiting()
})

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
    } catch {}
    return (await matchPrecache(SHELL_URL)) ?? Response.error()
  }
)

precache(self.__WB_MANIFEST)
addRoute()
cleanupOutdatedCaches()

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

      new ExpirationPlugin({ maxEntries: 120, purgeOnQuotaError: true }),
    ],
  })
)

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
