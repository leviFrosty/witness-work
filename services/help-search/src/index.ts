import type { HelpBundle } from './contract'
import { EMBED_DEADLINE_MS, embedQuery } from './embed'
import { getIndex } from './indexes'
import {
  cacheKeyUrl,
  parseSearchParams,
  rank,
  scoreAll,
  type SearchParams,
} from './search'
import { runSync, type SyncOptions } from './sync'

export type Env = {
  AI: Ai
  SYNC_STATE: KVNamespace
  SEARCH_LIMITER: RateLimit
  HELP_CENTER_ORIGIN: string
  ADMIN_TOKEN: string
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type, authorization',
  'access-control-max-age': '86400',
}

const CACHE_SECONDS = 300

async function searchIndex(
  env: Env,
  params: SearchParams,
  ctx: ExecutionContext
) {
  // The embedding and a cold index read run side by side.
  const [index, vector] = await Promise.all([
    getIndex(env.SYNC_STATE, params.locale, ctx),
    embedQuery(env.AI, params.q, EMBED_DEADLINE_MS),
  ])
  return { index, vector }
}

const json = (body: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...CORS,
      ...headers,
    },
  })

async function isAdmin(request: Request, env: Env): Promise<boolean> {
  const header = request.headers.get('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!env.ADMIN_TOKEN || !token) return false
  const encoder = new TextEncoder()
  const [a, b] = await Promise.all(
    [token, env.ADMIN_TOKEN].map((value) =>
      crypto.subtle.digest('SHA-256', encoder.encode(value))
    )
  )
  return crypto.subtle.timingSafeEqual(a, b)
}

async function handleSearch(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  const url = new URL(request.url)
  const parsed = parseSearchParams(url)
  if (!parsed.ok) return json({ error: parsed.error }, 400)
  const { params } = parsed

  const cache = caches.default
  const cacheKey = new Request(cacheKeyUrl(url.origin, params))
  const cached = await cache.match(cacheKey)
  if (cached) return cached

  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown'
  const { success } = await env.SEARCH_LIMITER.limit({ key: ip })
  if (!success)
    return json({ error: 'rate_limited' }, 429, { 'retry-after': '60' })

  let found: Awaited<ReturnType<typeof searchIndex>>
  try {
    found = await searchIndex(env, params, ctx)
  } catch (error) {
    console.error('search failed', String(error))
    return json({ error: 'search_unavailable' }, 503)
  }
  // Not built yet (first sync after a deploy): clients use local search.
  if (!found.index) return json({ error: 'search_unavailable' }, 503)

  const results = rank(found.index, params, found.vector)
  // Keyword-only answers (the embedding was late or failed) aren't cached, so
  // the next try gets the full search.
  if (!found.vector)
    return json({ results }, 200, { 'cache-control': 'no-store' })
  const result = json({ results }, 200, {
    'cache-control': `public, max-age=${CACHE_SECONDS}`,
  })
  ctx.waitUntil(cache.put(cacheKey, result.clone()))
  return result
}

/** Every eligible answer's raw scores, for tuning the relevance floors. */
async function handleAdminExplain(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  const parsed = parseSearchParams(new URL(request.url))
  if (!parsed.ok) return json({ error: parsed.error }, 400)
  const started = Date.now()
  const { index, vector } = await searchIndex(env, parsed.params, ctx)
  if (!index) return json({ error: 'search_unavailable' }, 503)
  return json({
    ms: Date.now() - started,
    model: index.model,
    bundleHash: index.bundleHash,
    embedded: !!vector,
    results: rank(index, parsed.params, vector),
    scores: scoreAll(index, parsed.params, vector).map(
      ({ slug, vectorScore, keywordScore }) => ({
        slug,
        vectorScore:
          vectorScore === undefined
            ? undefined
            : Math.round(vectorScore * 1e4) / 1e4,
        keywordScore:
          keywordScore === undefined
            ? undefined
            : Math.round(keywordScore * 1e3) / 1e3,
      })
    ),
  })
}

async function handleAdminSync(request: Request, env: Env): Promise<Response> {
  let body: {
    origin?: string
    bundles?: HelpBundle[]
    force?: boolean
    budget?: number
  } = {}
  if (request.headers.get('content-type')?.includes('application/json'))
    body = await request.json()
  const options: SyncOptions = {
    origin: body.origin ?? env.HELP_CENTER_ORIGIN,
    bundles: body.bundles,
    force: body.force,
    budget: body.budget,
  }
  try {
    return json(await runSync(env, options))
  } catch (error) {
    return json(
      { error: String(error instanceof Error ? error.message : error) },
      502
    )
  }
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const { pathname } = new URL(request.url)
    if (request.method === 'OPTIONS')
      return new Response(null, { status: 204, headers: CORS })

    if (pathname === '/v1/health') return json({ ok: true })
    if (pathname === '/v1/search') {
      if (request.method !== 'GET')
        return json({ error: 'method_not_allowed' }, 405)
      return handleSearch(request, env, ctx)
    }
    if (pathname.startsWith('/v1/admin/')) {
      if (request.method !== 'POST')
        return json({ error: 'method_not_allowed' }, 405)
      if (!(await isAdmin(request, env)))
        return json({ error: 'unauthorized' }, 401)
      if (pathname === '/v1/admin/sync') return handleAdminSync(request, env)
      if (pathname === '/v1/admin/explain')
        return handleAdminExplain(request, env, ctx)
    }
    return json({ error: 'not_found' }, 404)
  },

  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(
      runSync(env, { origin: env.HELP_CENTER_ORIGIN }).then(
        (summary) => console.log('sync', JSON.stringify(summary)),
        (error) => console.error('sync failed', error)
      )
    )
  },
} satisfies ExportedHandler<Env>
