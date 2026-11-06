// What the web app's service worker caches, and what it never touches
// (docs/web-offline.md). Plain functions with no worker globals, so
// `rules.test.ts` can run them under Node. Keep this file free of imports.

/** Where `expo export` writes script chunks: the entry and the lazy ones. */
export const CHUNK_PREFIX = '/_expo/static/js/web/'

/** The app shell, precached and served when the network can't answer. */
export const SHELL_URL = '/index.html'

/** The worker's own file, which the Worker serves with `no-cache`. */
export const WORKER_URL = '/sw.js'

/** How long a navigation waits for the network before the cached shell wins. */
export const NAVIGATION_TIMEOUT_MS = 4000

/**
 * Whether the worker leaves a request to the browser: ww-api, PostHog, the Help
 * Center and every other origin, the CSP report endpoint, `/.well-known/*` (the
 * passkey and app-link files) and the worker's own file. Nothing the worker
 * answers can carry an account's data, and none of these is ever stored.
 */
export function isNeverCached(url: URL, origin: string): boolean {
  if (url.origin !== origin) return true
  const { pathname } = url
  return (
    pathname === WORKER_URL ||
    pathname === '/_csp-report' ||
    pathname.startsWith('/.well-known/')
  )
}

/** A lazy script chunk (a language, say) the worker keeps once it's loaded. */
export function isChunkRequest(url: URL, origin: string): boolean {
  return (
    !isNeverCached(url, origin) &&
    url.pathname.startsWith(CHUNK_PREFIX) &&
    url.pathname.endsWith('.js')
  )
}

/**
 * A wasm file at the web root that downloads when something first needs it:
 * Skia's CanvasKit, SQLite's. The worker keeps it once loaded.
 */
export function isOnDemandFile(url: URL, origin: string): boolean {
  return !isNeverCached(url, origin) && /^\/[^/]+\.wasm$/.test(url.pathname)
}

/** The cache for on-demand files, named after their build's revision. */
export const ON_DEMAND_CACHE_PREFIX = 'ww-on-demand-'

/**
 * Whether a response is the file it was asked for. Cloudflare answers an
 * unknown path with `index.html` (the Worker turns that into a 404 for chunks,
 * but a worker mustn't depend on it), and a cached page under a `.js` URL would
 * keep a tab broken after the deploy is fixed.
 */
export function isStorableFile(response: {
  status: number
  headers: { get(name: string): string | null }
}): boolean {
  if (response.status !== 200) return false
  return !(response.headers.get('Content-Type') ?? '')
    .toLowerCase()
    .startsWith('text/html')
}

/**
 * A navigation answer worth showing: any but a server error, which the cached
 * shell replaces.
 */
export function isUsableNavigation(response: { status: number }): boolean {
  return response.status < 500
}
