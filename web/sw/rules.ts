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

export const GUEST_SCOPE_PATH = '/territories/guest'

export const GUEST_CACHE = 'ww-guest'

export const KEEP_FILES = 'KEEP_FILES'

export const isGuestScope = (scope: string): boolean => {
  try {
    return new URL(scope).pathname.replace(/\/+$/, '') === GUEST_SCOPE_PATH
  } catch {
    return false
  }
}

const HASHED_FILE = /[.-][0-9a-f]{32}\.[A-Za-z0-9]+$/

export function isGuestFile(url: URL, origin: string): boolean {
  if (isNeverCached(url, origin) || url.search) return false
  const { pathname } = url
  return (
    (pathname.startsWith(CHUNK_PREFIX) || pathname.startsWith('/assets/')) &&
    HASHED_FILE.test(pathname)
  )
}

export const isHtml = (response: {
  headers: { get(name: string): string | null }
}): boolean =>
  (response.headers.get('Content-Type') ?? '')
    .toLowerCase()
    .startsWith('text/html')

export function guestFilesToKeep(
  urls: unknown,
  origin: string,
  limit = 60
): string[] {
  if (!Array.isArray(urls)) return []
  const kept = new Set<string>()
  for (const value of urls) {
    if (typeof value !== 'string') continue
    let url: URL
    try {
      url = new URL(value, origin)
    } catch {
      continue
    }
    if (isGuestFile(url, origin)) kept.add(url.pathname)
    if (kept.size >= limit) break
  }
  return [...kept]
}
