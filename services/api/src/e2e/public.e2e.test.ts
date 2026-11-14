import { request as httpRequest } from 'node:http'
import { afterAll, describe, expect, it } from 'vitest'
import {
  BASE_URL,
  LOCAL_LAUNCHER,
  configured,
  http,
  nextIp,
  localKv,
  writeTranscript,
} from '../test/e2e'

/**
 * Public, unauthenticated surfaces: health, Notes Import availability, the
 * paywall ratings, universal-link support, and the HERE proxy (opt-in only).
 */

afterAll(() => {
  writeTranscript('public')
})

describe('health and status', () => {
  it('GET /health reports ok with build metadata', async () => {
    const res = await http('GET', '/health')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ status: 'ok' })
    expect(typeof res.body.timestamp).toBe('string')
    expect(Number.isNaN(Date.parse(res.body.timestamp))).toBe(false)
    expect(typeof res.body.versionId).toBe('string')
    // Clock calibration: uncached, with the server time in ms and as Date.
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(res.body.serverTime).toBe(Date.parse(res.body.timestamp))
    const date = Date.parse(res.headers.get('date') ?? '')
    expect(Math.abs(date - res.body.serverTime)).toBeLessThan(1_000)
  })

  it('GET /notes-import/status returns availability, capabilities, no-store', async () => {
    const res = await http('GET', '/notes-import/status')
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(typeof res.body.available).toBe('boolean')
    expect(res.body.capabilities).toEqual({
      appAttest: { protocolVersions: [1, 2] },
      transcribe: { maxPages: 10, maxBytes: expect.any(Number) },
    })
    if (res.body.available && res.body.limits) {
      expect(res.body.limits).toMatchObject({
        imports: { free: expect.any(Number) },
        windowDays: expect.any(Number),
      })
    }
  })

  it('unknown routes are a JSON 404', async () => {
    const res = await http('GET', '/definitely-not-a-route')
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ ok: false, error: 'not_found', code: 'not_found' })
  })
})

describe('per-IP rate limits', () => {
  it('refuses a family past 60/min with Retry-After, leaving other families open', async () => {
    const ip = `198.19.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`
    const headers = { 'cf-connecting-ip': ip }
    let refused: Awaited<ReturnType<typeof http>> | null = null
    // The admin route is the cheapest in its family: no token, a fast 404.
    for (let i = 0; i < 70 && !refused; i++) {
      const res = await http('POST', '/admin/notes-import/reset', { headers, body: {} })
      if (res.status === 429) refused = res
      else expect(res.status).toBe(404)
    }
    expect(refused?.body).toEqual({
      ok: false,
      error: 'rate_limited',
      code: 'rate_limited',
      retryAfter: 60,
    })
    expect(refused?.headers.get('retry-after')).toBe('60')

    // Same IP, another family: its own bucket.
    const status = await http('GET', '/notes-import/status', { headers })
    expect(status.status).toBe(200)
  })
})

describe('app store ratings', () => {
  const summary = {
    complete: true,
    averageRating: 4.87,
    ratingCount: 1234,
    countryCount: 42,
    updatedAt: '2026-10-01T00:00:00.000Z',
  }

  it('serves 503 for missing or legacy totals, then the complete summary', async () => {
    const first = await http('GET', '/app-store/ratings')
    if (first.status === 503) {
      expect(first.body).toEqual({
        ok: false,
        error: 'unavailable',
        code: 'unavailable',
        retryAfter: 3600,
      })
      expect(first.headers.get('cache-control')).toBe('no-store')
      expect(first.headers.get('retry-after')).toBe('3600')
      if (!LOCAL_LAUNCHER) return
      // Seed what the hourly cron would publish, then read it back.
      localKv('put', 'app-store-ratings:summary', JSON.stringify(summary))
      const legacy = await http('GET', '/app-store/ratings')
      expect(legacy.status).toBe(503)
      expect(legacy.headers.get('cache-control')).toBe('no-store')
      localKv('put', 'app-store-ratings:summary:v2', JSON.stringify(summary))
      const seeded = await http('GET', '/app-store/ratings')
      expect(seeded.status).toBe(200)
      expect(seeded.body).toEqual(summary)
      expect(seeded.headers.get('cache-control')).toContain('s-maxage=21600')
    } else {
      // Already seeded by an earlier run against the same persisted state.
      expect(first.status).toBe(200)
      expect(first.body).toMatchObject({
        complete: true,
        averageRating: expect.any(Number),
        ratingCount: expect.any(Number),
        countryCount: expect.any(Number),
        updatedAt: expect.any(String),
      })
    }
  })
})

describe('universal links', () => {
  const LOCAL_WEB_APP = 'http://localhost:8081'

  it('serves the AASA as JSON with the readable and short link paths', async () => {
    const res = await http('GET', '/.well-known/apple-app-site-association')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('application/json')
    const [detail] = res.body.applinks.details
    expect(detail.appIDs).toHaveLength(3)
    for (const appId of detail.appIDs) {
      expect(appId).toMatch(/^[A-Z0-9]{10}\.com\.leviwilkerson\.jwtime(beta|dev)?$/)
    }
    expect(detail.components).toEqual([
      { '/': '/contacts', '#': '?*' },
      { '/': '/buddies/invite', '#': '1?*' },
      { '/': '/accounts/handoff', '#': '1?*' },
      { '/': '/c', '#': '?*' },
      { '/': '/c/*' },
      { '/': '/b', '#': '1?*' },
      { '/': '/h', '#': '1?*' },
    ])
  })

  it.each(['/contacts', '/c'])('GET %s renders the localized contact fallback page', async (path) => {
    const english = await http('GET', path)
    expect(english.status).toBe(200)
    expect(english.headers.get('content-type')).toContain('text/html')
    expect(english.text).toContain('id="open-app"')
    expect(english.text).toContain('witnesswork://import-contact/')
    // The host the Worker was reached on. `[env.dev]` has no routes, so the
    // local worker reports its own `http://127.0.0.1:<port>`; a deployed one
    // is always https.
    if (LOCAL_LAUNCHER) {
      expect(english.text).toContain(`property="og:url" content="${BASE_URL}${path}"`)
      // The local web app (`WEB_APP_ORIGIN` in `[env.dev.vars]`).
      expect(english.text).toContain(`id="continue-web" data-base="${LOCAL_WEB_APP}/contacts" hidden`)
    } else {
      expect(english.text).toMatch(new RegExp(`property="og:url" content="https://[a-z0-9.-]+${path}"`))
    }

    const spanish = await http('GET', `${path}?lang=es`)
    expect(spanish.status).toBe(200)
    expect(spanish.headers.get('content-language')).toMatch(/^es/)
    expect(spanish.text).toContain('<html lang="es')
  })

  // `[env.dev]` has no routes, so the local worker takes its host from the
  // request: a `Host` header shows what a deployed host serves.
  it.skipIf(!LOCAL_LAUNCHER)('serves the apex variant when reached as the Beta website', async () => {
    // `fetch` won't send another `Host`, so this goes through node:http.
    const asBetaApex = (path: string) =>
      new Promise<{ status: number; text: string }>((resolve, reject) => {
        const url = new URL(path, BASE_URL)
        const request = httpRequest(
          {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname,
            headers: { host: 'beta.witnesswork.app', connection: 'close', 'cf-connecting-ip': nextIp() },
          },
          (response) => {
            let text = ''
            response.setEncoding('utf8')
            response.on('data', (chunk) => (text += chunk))
            response.on('end', () => resolve({ status: response.statusCode ?? 0, text }))
          }
        )
        request.on('error', reject)
        request.end()
      })
    const aasa = await asBetaApex('/.well-known/apple-app-site-association')
    expect(aasa.status).toBe(200)
    // Only the full-word paths: the apex never had short links.
    expect(JSON.parse(aasa.text).applinks.details[0].components).toEqual([
      { '/': '/contacts', '#': '?*' },
      { '/': '/buddies/invite', '#': '1?*' },
      { '/': '/accounts/handoff', '#': '1?*' },
    ])
    for (const path of ['/contacts', '/buddies/invite', '/accounts/handoff']) {
      const page = await asBetaApex(path)
      expect(page.status).toBe(200)
      expect(page.text).toContain(`property="og:url" content="https://beta.witnesswork.app${path}"`)
      // On the apex the site owns /assets, so images come from Beta's API host.
      expect(page.text).toContain('content="https://api-beta.witnesswork.app/assets/og-image.png"')
    }
    // Reached as itself, the same worker serves the short paths too.
    const own = await http('GET', '/.well-known/apple-app-site-association')
    expect(own.body.applinks.details[0].components).toHaveLength(7)
  })

  it('GET /c/:payload links legacy payloads into the app, never into meta tags', async () => {
    const payload = 'abc_DEF-123'
    const res = await http('GET', `/c/${payload}`)
    expect(res.status).toBe(200)
    expect(res.text).toContain(`href="witnesswork://import-contact/${payload}"`)
    expect(res.text).not.toMatch(new RegExp(`<meta[^>]+${payload}`))

    const hostile = await http('GET', `/c/${encodeURIComponent('"><script>x</script>')}`)
    expect(hostile.status).toBe(200)
    expect(hostile.text).not.toContain('<script>x</script>')
  })

  it('serves assetlinks.json as JSON from the static assets', async () => {
    const res = await http('GET', '/.well-known/assetlinks.json')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/json')
    expect(res.body[0].target.package_name).toBe('com.leviwilkerson.jwtime')
  })

  it.each(['/buddies/invite', '/b'])('GET %s serves the buddy invite page with a locked-down CSP', async (path) => {
    const res = await http('GET', path)
    expect(res.status).toBe(200)
    expect(res.text).toContain('WitnessWork buddy invite')
    if (LOCAL_LAUNCHER) {
      expect(res.text).toContain(`id="continue-web" class="btn secondary" data-base="${LOCAL_WEB_APP}/buddies/invite" hidden`)
    }
    expect(res.headers.get('content-security-policy')).toContain("default-src 'none'")
    expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow')
    expect(res.headers.get('referrer-policy')).toBe('no-referrer')
  })
})

describe('HERE proxy', () => {
  // Each call hits the HERE API; one request total, only with a real key.
  const enabled = configured('HERE_API_KEY') && !process.env.WW_API_E2E_SKIP_HERE
  it.skipIf(!enabled)('GET /geocode proxies one lookup', async () => {
    const res = await http('GET', '/geocode?q=Times+Square+New+York&limit=1')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.items)).toBe(true)
  })
  it.skipIf(!enabled)('GET /autocomplete proxies one lookup', async () => {
    const res = await http('GET', '/autocomplete?q=Times+Squ&limit=1')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.items)).toBe(true)
  })
})
