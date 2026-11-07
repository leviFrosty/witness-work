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

const HASHED = /[.-][0-9a-f]{32}(\.[A-Za-z0-9]+)+$/

const WELL_KNOWN_JSON = new Set([
  '/.well-known/apple-app-site-association',
  '/.well-known/webauthn',
])

const WORKER_FILE = '/sw.js'
const MANIFEST_FILE = '/manifest.webmanifest'

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

const PRECOMPRESSED_BODIES = new WeakSet<Response>()

const extension = (pathname: string) =>
  /\.([A-Za-z0-9]+)$/.exec(pathname)?.[1].toLowerCase()

const wantsBrotli = (request: Request) =>
  request.method === 'GET' &&
  !request.headers.has('Range') &&
  /\bbr\b/.test(request.headers.get('Accept-Encoding') ?? '')

async function precompressed(
  request: Request,
  env: Env,
  url: URL
): Promise<Response | null> {
  const type = PRECOMPRESSED_TYPES[extension(url.pathname) ?? '']
  if (!type || !wantsBrotli(request)) return null
  const compressed = new URL(url)
  compressed.pathname = `${url.pathname}.br`

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

  if (![200, 206, 304].includes(asset.status) || isHtml(asset)) {
    await asset.body?.cancel()
    return notFound(request.method)
  }
  const response = brotli ?? new Response(asset.body, asset)
  if (brotli) PRECOMPRESSED_BODIES.add(response)
  const { pathname } = new URL(request.url)

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
