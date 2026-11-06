// The web app's Worker (ADR 0037 §3). Cloudflare serves the static export and
// falls back to index.html for app routes. `run_worker_first` sends files the
// app loads by URL (chunks, assets, wasm, JSON) here instead, so a missing one
// gets a real 404 rather than index.html, and a stale tab can reload once.
// Responses from Worker code don't get `_headers`, so this sets them itself.
// `/.well-known/*` runs here too, so a missing file there is a 404 as well,
// never the app.
// Export nothing but the handler: Workers treats named exports as entrypoints.
import environments from '../../../config/web-environments.json'
import { receiveReport } from './cspReport'
import {
  IMMUTABLE,
  PRECOMPRESSED_TYPES,
  REPORT_PATH,
  REVALIDATE,
  securityHeaders,
  type WebProfile,
} from './headers'

export interface Env {
  ASSETS: Fetcher
  WW_WEB_PROFILE: string
}

const profiles: Record<string, WebProfile> = environments as Record<
  string,
  WebProfile
>

// Expo names every bundled chunk and asset after its content hash.
const HASHED = /[.-][0-9a-f]{32}(\.[A-Za-z0-9]+)+$/

// Files under `/.well-known/` with no extension, which the asset server can't
// type: Apple's app site association and the WebAuthn related origins list.
const WELL_KNOWN_JSON = new Set([
  '/.well-known/apple-app-site-association',
  '/.well-known/webauthn',
])

// The service worker's file must be fetched fresh on every update check, so a
// deploy's new version reaches every tab (docs/web-offline.md). The manifest is
// typed here because the asset server doesn't know `.webmanifest`.
const WORKER_FILE = '/sw.js'
const MANIFEST_FILE = '/manifest.webmanifest'

/**
 * `pathname` as the asset server names its files: each segment decoded, then
 * encoded, as it does itself. It answers any other spelling (`@` rather than
 * `%40`, as Expo's asset URLs have it) with a redirect, which isn't the file.
 */
function assetPath(pathname: string): string {
  return pathname
    .split('/')
    .map((segment) => {
      try {
        return encodeURIComponent(decodeURIComponent(segment))
      } catch {
        return segment
      }
    })
    .join('/')
}

/** Responses whose body is a `.br` file's bytes, already encoded. */
const PRECOMPRESSED_BODIES = new WeakSet<Response>()

const extension = (pathname: string) =>
  /\.([A-Za-z0-9]+)$/.exec(pathname)?.[1].toLowerCase()

/** The browser takes brotli and asked for the whole file. */
const wantsBrotli = (request: Request) =>
  request.method === 'GET' &&
  !request.headers.has('Range') &&
  /\bbr\b/.test(request.headers.get('Accept-Encoding') ?? '')

/**
 * `<file>.br`, served as the file with `Content-Encoding: br`, or null when the
 * export has no such file. `encodeBody: 'manual'` sends the bytes as they are.
 */
async function precompressed(
  request: Request,
  env: Env,
  url: URL
): Promise<Response | null> {
  const type = PRECOMPRESSED_TYPES[extension(url.pathname) ?? '']
  if (!type || !wantsBrotli(request)) return null
  const compressed = new URL(url)
  compressed.pathname = `${url.pathname}.br`
  // Its revalidation too: the `.br` file has its own ETag.
  const headers = new Headers({ 'Accept-Encoding': 'identity' })
  for (const name of ['If-None-Match', 'If-Modified-Since']) {
    const value = request.headers.get(name)
    if (value) headers.set(name, value)
  }
  const asset = await env.ASSETS.fetch(new Request(compressed, { headers }))
  if (![200, 304].includes(asset.status) || isHtml(asset)) {
    await asset.body?.cancel()
    return null
  }
  const answer = new Headers(asset.headers)
  answer.set('Content-Type', type)
  answer.set('Content-Encoding', 'br')
  answer.delete('Content-Length')
  return new Response(asset.status === 304 ? null : asset.body, {
    status: asset.status,
    headers: answer,
    encodeBody: 'manual',
  })
}

const isHtml = (response: Response) =>
  (response.headers.get('Content-Type') ?? '').startsWith('text/html')

function withHeaders(response: Response, profile: WebProfile): Response {
  const headers = new Headers(response.headers)
  for (const [name, value] of Object.entries(securityHeaders(profile)))
    headers.set(name, value)
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
    // A precompressed body is already encoded; others the runtime encodes.
    ...(PRECOMPRESSED_BODIES.has(response) && {
      encodeBody: 'manual' as const,
    }),
  })
}

const notFound = (method: string) =>
  new Response(method === 'HEAD' ? null : 'Not found\n', {
    status: 404,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      // A redeploy can bring the file back; never cache its absence.
      'Cache-Control': 'no-store',
    },
  })

async function serveFile(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD')
    return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } })
  const url = new URL(request.url)
  url.pathname = assetPath(url.pathname)
  const brotli = await precompressed(request, env, url)
  const asset = brotli ?? (await env.ASSETS.fetch(new Request(url, request)))
  // Anything but the file itself, including the SPA's index.html fallback,
  // means this deploy doesn't have it.
  if (![200, 206, 304].includes(asset.status) || isHtml(asset)) {
    await asset.body?.cancel()
    return notFound(request.method)
  }
  const response = brotli ?? new Response(asset.body, asset)
  if (brotli) PRECOMPRESSED_BODIES.add(response)
  const { pathname } = new URL(request.url)
  // One URL, two encodings: caches must keep them apart.
  if (PRECOMPRESSED_TYPES[extension(pathname) ?? ''])
    response.headers.set('Vary', 'Accept-Encoding')
  response.headers.set(
    'Cache-Control',
    HASHED.test(pathname) ? IMMUTABLE : REVALIDATE
  )
  if (WELL_KNOWN_JSON.has(pathname))
    response.headers.set('Content-Type', 'application/json')
  if (pathname === WORKER_FILE)
    response.headers.set('Cache-Control', 'no-cache')
  if (pathname === MANIFEST_FILE)
    response.headers.set('Content-Type', 'application/manifest+json')
  return response
}

export default {
  async fetch(request, env): Promise<Response> {
    const profile = profiles[env.WW_WEB_PROFILE]
    if (!profile) return new Response(null, { status: 500 })
    const { pathname } = new URL(request.url)
    const response =
      pathname === REPORT_PATH
        ? await receiveReport(request)
        : await serveFile(request, env)
    return withHeaders(response, profile)
  },
} satisfies ExportedHandler<Env>
