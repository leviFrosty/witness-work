export const CHUNK_PREFIX = '/_expo/static/js/web/'

export const SHELL_URL = '/index.html'

export const WORKER_URL = '/sw.js'

export const NAVIGATION_TIMEOUT_MS = 4000

export function isNeverCached(url: URL, origin: string): boolean {
  if (url.origin !== origin) return true
  const { pathname } = url
  return (
    pathname === WORKER_URL ||
    pathname === '/_csp-report' ||
    pathname.startsWith('/.well-known/')
  )
}

export function isChunkRequest(url: URL, origin: string): boolean {
  return (
    !isNeverCached(url, origin) &&
    url.pathname.startsWith(CHUNK_PREFIX) &&
    url.pathname.endsWith('.js')
  )
}

export function isOnDemandFile(url: URL, origin: string): boolean {
  return !isNeverCached(url, origin) && /^\/[^/]+\.wasm$/.test(url.pathname)
}

export const ON_DEMAND_CACHE_PREFIX = 'ww-on-demand-'

export function isStorableFile(response: {
  status: number
  headers: { get(name: string): string | null }
}): boolean {
  if (response.status !== 200) return false
  return !(response.headers.get('Content-Type') ?? '')
    .toLowerCase()
    .startsWith('text/html')
}

export function isUsableNavigation(response: { status: number }): boolean {
  return response.status < 500
}
