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
  const asset = await env.ASSETS.fetch(new Request(url, request))
  // Anything but the file itself, including the SPA's index.html fallback,
  // means this deploy doesn't have it.
  if (![200, 206, 304].includes(asset.status) || isHtml(asset)) {
    await asset.body?.cancel()
    return notFound(request.method)
  }
  const response = new Response(asset.body, asset)
  const { pathname } = new URL(request.url)
  response.headers.set(
    'Cache-Control',
    HASHED.test(pathname) ? IMMUTABLE : REVALIDATE
  )
  if (WELL_KNOWN_JSON.has(pathname))
    response.headers.set('Content-Type', 'application/json')
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
