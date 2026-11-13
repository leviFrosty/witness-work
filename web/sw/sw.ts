import { clientsClaim } from 'workbox-core'
import { ExpirationPlugin } from 'workbox-expiration'
import {
  addRoute,
  cleanupOutdatedCaches,
  matchPrecache,
  precache,
} from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { CacheFirst, StaleWhileRevalidate } from 'workbox-strategies'
import { partialResponse } from '../host/src/range'
import {
  GUEST_CACHE,
  KEEP_FILES,
  NAVIGATION_TIMEOUT_MS,
  ON_DEMAND_CACHE_PREFIX,
  SHELL_URL,
  guestFilesToKeep,
  isChunkRequest,
  isGuestFile,
  isGuestScope,
  isHtml,
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

const storableOnly = {
  cacheWillUpdate: async ({ response }: { response: Response }) =>
    isStorableFile(response) ? response : null,
}

async function fetchGuestShell(): Promise<Response> {
  const fetched = await fetch(SHELL_URL, { cache: 'no-cache' })
  if (fetched.status !== 200 || !isHtml(fetched)) return fetched
  const shell = new Response(await fetched.blob(), {
    status: 200,
    headers: fetched.headers,
  })
  const cache = await caches.open(GUEST_CACHE)
  await cache.put(SHELL_URL, shell.clone())
  return shell
}

async function guestShell(event: ExtendableEvent): Promise<Response> {
  const refresh = fetchGuestShell()
  const cached = await caches
    .open(GUEST_CACHE)
    .then((cache) => cache.match(SHELL_URL))
  if (!cached) return refresh.catch(() => Response.error())
  event.waitUntil(refresh.catch(() => undefined))
  return cached
}

function guestWorker() {
  self.addEventListener('install', (event) => {
    void self.skipWaiting()
    event.waitUntil(fetchGuestShell().catch(() => undefined))
  })

  const files = new CacheFirst({
    cacheName: GUEST_CACHE,
    plugins: [
      storableOnly,
      new ExpirationPlugin({ maxEntries: 80, purgeOnQuotaError: true }),
    ],
  })
  registerRoute(
    ({ request, url }) =>
      request.mode === 'navigate' && !isNeverCached(url, self.location.origin),
    ({ event }) => guestShell(event)
  )
  registerRoute(
    ({ request, url }) =>
      !request.headers.has('Range') && isGuestFile(url, self.location.origin),
    files
  )
  registerRoute(
    ({ url }) =>
      url.origin === self.location.origin &&
      url.pathname === '/launch-splash.js',
    new StaleWhileRevalidate({
      cacheName: GUEST_CACHE,
      plugins: [storableOnly],
    })
  )

  self.addEventListener('message', (event) => {
    if (event.data?.type !== KEEP_FILES) return
    event.waitUntil(
      Promise.all(
        guestFilesToKeep(event.data.urls, self.location.origin).map((path) =>
          files
            .handle({ event, request: new Request(path) })
            .catch(() => undefined)
        )
      )
    )
  })
}

function appWorker() {
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

  registerRoute(
    ({ request, url }) =>
      request.headers.has('Range') && !isNeverCached(url, self.location.origin),
    async ({ request }) => {
      const cached = await matchPrecache(request.url)
      return cached
        ? partialResponse(request.headers.get('Range') ?? '', cached)
        : fetch(request)
    }
  )
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
}

if (isGuestScope(self.registration.scope)) guestWorker()
else appWorker()
