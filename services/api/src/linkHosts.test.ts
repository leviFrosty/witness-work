import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Environment } from './types'

vi.mock('cloudflare:workers', () => ({ DurableObject: class {} }))

import worker from './index'
import { APEX_LINK_PATHS } from './linkHosts'

const OLD = 'https://ww-proxy.leviwilkerson.com'
const APEX = 'https://witnesswork.app'
const BETA_APEX = 'https://beta.witnesswork.app'
const API = 'https://api.witnesswork.app'
const API_BETA = 'https://api-beta.witnesswork.app'
// A local `wrangler dev` ([env.dev] has no routes, so it answers as itself).
const LOCAL = 'http://127.0.0.1:8787'
const WEB = 'https://app.witnesswork.app'
const WEB_BETA = 'https://beta.app.witnesswork.app'
const WEB_LOCAL = 'http://localhost:8081'

// gzip + base64url contact JSON, exactly as the app encodes it.
const PAYLOAD =
  'H4sIAAAAAAAAE42MMQvCMBQG_0r4VpPyUohgNsHJ2ckttA8MYl5IglVK_7tEcBduvLsVTy41SoKHHQga7Z0ZHktsiWtdpNzNJKmFqUGDX1lK4_nY4DHSuDd0MGQvRP7LQERXaPwKvyLO8JgsNFJ49PM5JFYn4a4VDn_c8k1SL3dWOecUWSJs2wdjV8GKuwAAAA'
const INVITE = '1AAECAwQFBgcICQoLDA0ODw'
const HANDOFF = `1${'A'.repeat(86)}`

const PROD_ENV = { APPLE_TEAM_ID: 'TEAM123456', WEB_APP_ORIGIN: WEB } as Environment
const BETA_ENV = { APPLE_TEAM_ID: 'TEAM123456', WEB_APP_ORIGIN: WEB_BETA } as Environment
const LOCAL_ENV = {
  APPLE_TEAM_ID: 'TEAM123456',
  APP_ATTEST_ENVIRONMENT: 'development',
  WEB_APP_ORIGIN: WEB_LOCAL,
} as Environment

async function request(url: string, env: Environment = PROD_ENV) {
  const pending: Promise<unknown>[] = []
  const context = {
    waitUntil: (promise: Promise<unknown>) => pending.push(promise),
    passThroughOnException: () => {},
  }
  const response = await worker.fetch!(new Request(url) as never, env, context as never)
  await Promise.all(pending)
  return response
}

const html = async (url: string, env?: Environment) => {
  const response = await request(url, env)
  expect(response.status).toBe(200)
  return response.text()
}

const meta = (page: string, property: string) =>
  page.match(new RegExp(`<meta property="${property}" content="([^"]*)">`))?.[1]

type Link = { href: string; hidden: boolean; base: string | null }

/** The page's links by id, as rendered. */
function linksOf(page: string): Record<string, Link> {
  const links: Record<string, Link> = {}
  for (const [tag] of page.matchAll(/<a [^>]*id="[^"]+"[^>]*>/g)) {
    const id = tag.match(/id="([^"]+)"/)![1]
    links[id] = {
      href: tag.match(/href="([^"]*)"/)?.[1] ?? '',
      hidden: / hidden[ >]/.test(tag),
      base: tag.match(/data-base="([^"]*)"/)?.[1] ?? null,
    }
  }
  return links
}

/** Runs the page's inline script against a stub DOM, as a browser at `hash` would. */
function linksAt(page: string, hash: string): Record<string, Link> {
  const links = linksOf(page)
  const script = page.match(/<script>([\s\S]*?)<\/script>/)?.[1]
  if (!script) return links
  const document = {
    getElementById: (id: string) => {
      // The invite page's copy button and its status line.
      if (id === 'copy' || id === 'copy-status') return { hidden: true, addEventListener: () => {} }
      const link = links[id]
      if (!link) return null
      return Object.assign(link, {
        getAttribute: (name: string) => (name === 'data-base' ? link.base : null),
        addEventListener: () => {},
      })
    },
  }
  new Function('location', 'document', script)({ hash, href: '' }, document)
  return links
}

const visible = (links: Record<string, Link>, id: string) =>
  links[id] && !links[id].hidden ? links[id].href : undefined

describe('apple-app-site-association', () => {
  // Byte-for-byte what ww-proxy.leviwilkerson.com served before witnesswork.app.
  const OLD_HOST_AASA =
    '{"applinks":{"details":[{"appIDs":["TEAM123456.com.leviwilkerson.jwtime","TEAM123456.com.leviwilkerson.jwtimebeta","TEAM123456.com.leviwilkerson.jwtimedev"],"components":[{"/":"/contacts","#":"?*"},{"/":"/buddies/invite","#":"1?*"},{"/":"/accounts/handoff","#":"1?*"},{"/":"/c","#":"?*"},{"/":"/c/*"},{"/":"/b","#":"1?*"},{"/":"/h","#":"1?*"}]}]}}'

  it.each([OLD, API, API_BETA, LOCAL])('serves %s exactly what the old host always has', async (origin) => {
    const response = await request(`${origin}/.well-known/apple-app-site-association`)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/json')
    expect(await response.text()).toBe(OLD_HOST_AASA)
  })

  it.each([APEX, BETA_APEX])('lists only the full-word paths on %s', async (origin) => {
    const response = await request(`${origin}/.well-known/apple-app-site-association`)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/json')
    expect(await response.json()).toEqual({
      applinks: {
        details: [
          {
            appIDs: [
              'TEAM123456.com.leviwilkerson.jwtime',
              'TEAM123456.com.leviwilkerson.jwtimebeta',
              'TEAM123456.com.leviwilkerson.jwtimedev',
            ],
            components: [
              { '/': '/contacts', '#': '?*' },
              { '/': '/buddies/invite', '#': '1?*' },
              { '/': '/accounts/handoff', '#': '1?*' },
            ],
          },
        ],
      },
    })
  })
})

describe('assetlinks.json', () => {
  // Served by the [assets] layer on every host the Worker answers, apex
  // included (its route sends the exact path here); the e2e suite checks it
  // over HTTP.
  const file = JSON.parse(
    readFileSync(new URL('../public/.well-known/assetlinks.json', import.meta.url), 'utf8')
  )

  it('verifies the production app with its Play signing certificates only', () => {
    expect(file).toEqual([
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: 'com.leviwilkerson.jwtime',
          sha256_cert_fingerprints: [
            '4C:13:98:34:37:2C:85:5A:6E:A6:19:CF:AF:03:D4:6B:91:14:14:2D:EB:CB:CB:CB:F1:C1:C7:40:55:3E:1C:AC',
            'C5:1E:FF:DC:9B:BF:6B:C0:2B:7B:4C:31:92:90:0B:AC:42:67:BD:6E:05:F4:CF:C5:21:77:E5:36:23:A4:75:EB',
          ],
        },
      },
    ])
  })

  it('is a static asset, not a route the Worker answers', async () => {
    for (const origin of [OLD, APEX]) {
      expect((await request(`${origin}/.well-known/assetlinks.json`)).status).toBe(404)
    }
  })
})

describe('link pages follow the request host', () => {
  it.each([
    ['/contacts', '/contacts'],
    ['/c', '/c'],
    [`/c/${PAYLOAD}`, '/c'],
    ['/buddies/invite', '/buddies/invite'],
    ['/b', '/b'],
    ['/accounts/handoff', '/accounts/handoff'],
    ['/h', '/h'],
  ])('%s keeps the old host’s og:url and image', async (path, canonical) => {
    const page = await html(`${OLD}${path}`)
    expect(meta(page, 'og:url')).toBe(`${OLD}${canonical}`)
    expect(meta(page, 'og:image')).toBe(`${OLD}/assets/og-image.png`)
  })

  // On the apex the site owns `/assets/…`, so images come from the API host
  // on the same Worker.
  it.each([
    [APEX, API],
    [BETA_APEX, API_BETA],
    [API, API],
  ])('serves og:url from %s and its images from %s', async (origin, assets) => {
    for (const path of ['/contacts', '/buddies/invite', '/accounts/handoff']) {
      const page = await html(`${origin}${path}?lang=en`)
      expect(meta(page, 'og:url')).toBe(`${origin}${path}`)
      expect(meta(page, 'og:image')).toBe(`${assets}/assets/og-image.png`)
      expect(page).not.toContain('leviwilkerson.com/assets')
    }
    const contact = await html(`${origin}/contacts`)
    expect(contact).toContain(`<link rel="apple-touch-icon" href="${assets}/assets/apple-touch-icon.png">`)
    expect(contact).toContain(`<img class="icon" src="${assets}/assets/apple-touch-icon.png"`)
  })

  it.each([
    [APEX, API],
    [BETA_APEX, API_BETA],
  ])('lets the invite and handoff pages on %s load images from %s only', async (origin, assets) => {
    for (const path of ['/buddies/invite', '/accounts/handoff']) {
      const response = await request(`${origin}${path}`)
      expect(response.headers.get('Content-Security-Policy')).toContain(`img-src 'self' ${assets};`)
      const page = await response.text()
      expect(page).toContain(`<link rel="apple-touch-icon" href="${assets}/assets/apple-touch-icon.png">`)
      expect(page).toContain(`<img class="icon" src="${assets}/assets/apple-touch-icon.png"`)
    }
    for (const path of ['/b', '/h']) {
      const response = await request(`${OLD}${path}`)
      expect(response.headers.get('Content-Security-Policy')).toContain("img-src 'self';")
      expect(await response.text()).toContain('<link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">')
    }
  })

  it('reports https even if the request reached the Worker over http', async () => {
    const page = await html('http://witnesswork.app/contacts')
    expect(meta(page, 'og:url')).toBe(`${APEX}/contacts`)
  })
})

describe('Continue on the web', () => {
  it.each([
    [PROD_ENV, WEB],
    [BETA_ENV, WEB_BETA],
    [LOCAL_ENV, WEB_LOCAL],
  ])('opens the web app’s contact page with the same fragment', async (env, web) => {
    for (const url of [`${OLD}/contacts`, `${OLD}/c`, `${APEX}/contacts`]) {
      {
        const page = await html(url, env)
        expect(linksOf(page)['continue-web']).toEqual({ href: '', hidden: true, base: `${web}/contacts` })
        expect(visible(linksAt(page, `#${PAYLOAD}`), 'continue-web')).toBe(`${web}/contacts#${PAYLOAD}`)
      }
    }
  })

  it('maps the legacy path payload to the fragment', async () => {
    const page = await html(`${OLD}/c/${PAYLOAD}`, BETA_ENV)
    expect(visible(linksOf(page), 'continue-web')).toBe(`${WEB_BETA}/contacts#${PAYLOAD}`)
    expect(page.slice(0, page.indexOf('</head>'))).not.toContain(PAYLOAD)
    const invalid = await html(`${OLD}/c/%22%3E%3Cb%3Ehi`, BETA_ENV)
    expect(linksOf(invalid)['continue-web']).toBeUndefined()
  })

  it.each([
    [PROD_ENV, WEB],
    [BETA_ENV, WEB_BETA],
    [LOCAL_ENV, WEB_LOCAL],
  ])('opens the web app’s invite page with the same fragment', async (env, web) => {
    for (const url of [`${OLD}/buddies/invite`, `${OLD}/b`, `${APEX}/buddies/invite`]) {
      const page = await html(url, env)
      expect(linksOf(page)['continue-web']).toEqual({ href: '', hidden: true, base: `${web}/buddies/invite` })
      expect(visible(linksAt(page, `#${INVITE}`), 'continue-web')).toBe(`${web}/buddies/invite#${INVITE}`)
    }
  })

  it('stays hidden without a fragment, or with one the app could never have made', async () => {
    const pages = [
      await html(`${APEX}/contacts`),
      await html(`${OLD}/c`),
      await html(`${APEX}/buddies/invite`),
      await html(`${OLD}/b`),
    ]
    for (const page of pages) {
      for (const hash of ['', '#', '#a b', '#%22%3E%3Cscript%3E', '#javascript:alert(1)', `#${PAYLOAD}=`]) {
        const links = linksAt(page, hash)
        expect(links['continue-web'].hidden).toBe(true)
        expect(links['continue-web'].href).toBe('')
      }
    }
  })

  it('is left out without a web app origin, or with one that isn’t https', async () => {
    for (const WEB_APP_ORIGIN of [undefined, '', 'http://app.witnesswork.app', 'javascript:alert(1)', 'not a url']) {
      const env = { APPLE_TEAM_ID: 'TEAM123456', WEB_APP_ORIGIN } as Environment
      for (const url of [`${APEX}/contacts`, `${OLD}/c/${PAYLOAD}`, `${APEX}/buddies/invite`]) {
        expect(await html(url, env)).not.toContain('id="continue-web"')
      }
    }
  })

  it('takes a local http origin on a development worker only', async () => {
    const urls = [`${LOCAL}/contacts`, `${LOCAL}/c/${PAYLOAD}`, `${LOCAL}/buddies/invite`]
    for (const url of urls) {
      expect(await html(url, LOCAL_ENV)).toContain(`${WEB_LOCAL}/`)
    }
    const refused = [
      // Beta and production never link to a local web app.
      { ...LOCAL_ENV, APP_ATTEST_ENVIRONMENT: 'production' },
      { ...LOCAL_ENV, APP_ATTEST_ENVIRONMENT: undefined },
      // Only a loopback host, even on a development worker.
      { ...LOCAL_ENV, WEB_APP_ORIGIN: 'http://app.witnesswork.app' },
      { ...LOCAL_ENV, WEB_APP_ORIGIN: 'http://localhost.evil.example' },
    ] as Environment[]
    for (const env of refused) {
      for (const url of urls) {
        expect(await html(url, env)).not.toContain('id="continue-web"')
      }
    }
  })

  it('is never on the handoff page', async () => {
    for (const url of [`${OLD}/h`, `${APEX}/accounts/handoff`]) {
      const page = await html(url)
      expect(page).not.toContain('id="continue-web"')
      expect(page).not.toContain(WEB)
    }
  })

  it('is translated with the rest of the contact page', async () => {
    const page = await html(`${APEX}/contacts?lang=de`)
    expect(page).toMatch(/id="continue-web"[^>]*>Im Web fortfahren<\/a>/)
  })
})

/** What the invite page's Copy invite link button copies at `href`. */
async function copiedAt(page: string, href: string): Promise<string> {
  const script = page.match(/<script>([\s\S]*?)<\/script>/)![1]
  let click = () => {}
  let copied = ''
  const element = (id: string) => ({
    hidden: true,
    textContent: '',
    addEventListener: (_: string, handler: () => void) => {
      if (id === 'copy') click = handler
    },
    getAttribute: () => null,
  })
  const navigator = {
    clipboard: { writeText: async (text: string) => void (copied = text) },
  }
  const hash = href.includes('#') ? href.slice(href.indexOf('#')) : ''
  new Function('location', 'document', 'navigator', script)(
    { hash, href },
    { getElementById: element },
    navigator
  )
  click()
  await Promise.resolve()
  return copied
}

describe('Copy invite link', () => {
  // Every build's paste field reads the old host's `/b#1…` only.
  it.each([OLD, APEX, BETA_APEX, API])('copies the old host’s /b link on %s', async (origin) => {
    for (const path of ['/buddies/invite', '/b'].filter((path) => origin === OLD || path !== '/b')) {
      const page = await html(`${origin}${path}`)
      expect(await copiedAt(page, `${origin}${path}#${INVITE}`)).toBe(`${OLD}/b#${INVITE}`)
    }
  })

  it('copies the address as is when the fragment isn’t an invite', async () => {
    const page = await html(`${APEX}/buddies/invite`)
    expect(await copiedAt(page, `${APEX}/buddies/invite`)).toBe(`${APEX}/buddies/invite`)
    expect(await copiedAt(page, `${APEX}/buddies/invite#<x>`)).toBe(`${APEX}/buddies/invite#<x>`)
  })
})

describe('Open in WitnessWork on the apex', () => {
  it.each([APEX, BETA_APEX])('links %s invite and handoff pages to the old host’s short paths', async (origin) => {
    const invite = await html(`${origin}/buddies/invite`)
    expect(linksOf(invite)['open-app']).toEqual({ href: '', hidden: true, base: `${OLD}/b` })
    expect(visible(linksAt(invite, `#${INVITE}`), 'open-app')).toBe(`${OLD}/b#${INVITE}`)

    const handoff = await html(`${origin}/accounts/handoff`)
    expect(linksOf(handoff)['open-app']).toEqual({ href: '', hidden: true, base: `${OLD}/h` })
    expect(visible(linksAt(handoff, `#${HANDOFF}`), 'open-app')).toBe(`${OLD}/h#${HANDOFF}`)
    expect(linksAt(handoff, '')['open-app'].hidden).toBe(true)
  })

  it('lets the apex handoff page run only its own script', async () => {
    const response = await request(`${APEX}/accounts/handoff`)
    const page = await response.text()
    const script = page.match(/<script>([\s\S]*?)<\/script>/)![1]
    const digest = new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(script))
    )
    const hash = btoa(String.fromCharCode(...digest))
    const policy = response.headers.get('content-security-policy') ?? ''
    expect(policy).toContain(`script-src 'sha256-${hash}'`)
    expect(policy).toContain("default-src 'none'")
    expect(script).not.toMatch(/\bfetch\(|sendBeacon|XMLHttpRequest/)
  })

  it('keeps the contact page’s app-scheme link, which every version opens', async () => {
    const page = await html(`${APEX}/contacts`)
    expect(visible(linksAt(page, `#${PAYLOAD}`), 'open-app')).toBe(`witnesswork://import-contact/${PAYLOAD}`)
  })

  it('isn’t on the old host, where a link to itself opens no app', async () => {
    for (const path of ['/b', '/buddies/invite', '/h', '/accounts/handoff']) {
      expect(linksOf(await html(`${OLD}${path}`))['open-app']).toBeUndefined()
    }
    const response = await request(`${OLD}/h`)
    expect(response.headers.get('content-security-policy')).not.toContain('script-src')
    expect(await response.text()).not.toContain('<script')
  })

  it('keeps the store buttons', async () => {
    for (const url of [`${APEX}/buddies/invite`, `${APEX}/accounts/handoff`]) {
      const page = await html(url)
      expect(page).toContain('href="https://apps.apple.com/us/app/jw-time/id6469723047"')
      expect(page).toContain('href="https://play.google.com/store/apps/details?id=com.leviwilkerson.jwtime"')
    }
  })
})

describe('apex passthrough', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const stubSite = () => {
    const site = vi.fn(async (input: Request) => new Response(`site ${new URL(input.url).pathname}`))
    vi.stubGlobal('fetch', site)
    return site
  }

  it('hands the site every apex request but the five exact paths', async () => {
    const site = stubSite()
    for (const origin of [APEX, BETA_APEX]) {
      for (const path of ['/contacts/', '/contactsX', '/contacts/abc', '/buddies/invite/x', '/accounts/handoffs', '/c', '/b', '/h', '/health']) {
        const response = await request(`${origin}${path}?q=1`)
        expect(await response.text()).toBe(`site ${path}`)
      }
    }
    expect(site).toHaveBeenCalledTimes(18)
    expect(site.mock.calls[0][0].url).toBe(`${APEX}/contacts/?q=1`)
  })

  it('answers the exact paths itself, query strings included', async () => {
    const site = stubSite()
    for (const path of APEX_LINK_PATHS.filter((path) => !path.endsWith('.json'))) {
      expect((await request(`${APEX}${path}?fbclid=x`)).status).toBe(200)
    }
    expect(site).not.toHaveBeenCalled()
  })

  it('forwards the method, body and headers', async () => {
    const site = vi.fn(async (input: Request) =>
      new Response(`${input.method} ${input.headers.get('x-test')} ${await input.text()}`)
    )
    vi.stubGlobal('fetch', site)
    const pending: Promise<unknown>[] = []
    const response = await worker.fetch!(
      new Request(`${APEX}/contacts/form`, { method: 'POST', body: 'a=1', headers: { 'x-test': 'yes' } }) as never,
      PROD_ENV,
      { waitUntil: (promise: Promise<unknown>) => pending.push(promise), passThroughOnException: () => {} } as never
    )
    await Promise.all(pending)
    expect(await response.text()).toBe('POST yes a=1')
  })

  it('answers 502 when the site can’t be reached', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed') }))
    const response = await request(`${APEX}/contacts/x`)
    expect(response.status).toBe(502)
    expect(await response.text()).toBe('')
  })

  it('never runs on any other host', async () => {
    const site = stubSite()
    for (const origin of [OLD, API, API_BETA, LOCAL]) {
      expect((await request(`${origin}/c`)).status).toBe(200)
      expect((await request(`${origin}/contacts/x`)).status).toBe(404)
    }
    expect(site).not.toHaveBeenCalled()
  })
})

describe('wrangler.toml', () => {
  type Route = { pattern?: string; zone_name?: string; custom_domain?: boolean }

  const routes = (header: string): Route[] => {
    const tables: Route[] = []
    let current: Route | null = null
    for (const line of readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8').split('\n')) {
      const table = /^\s*(\[\[?[^\]]+\]\]?)/.exec(line)?.[1]
      if (table) {
        current = table === `[[${header}]]` ? {} : null
        if (current) tables.push(current)
        continue
      }
      const pair = /^\s*(\w+)\s*=\s*(.+?)\s*(?:#.*)?$/.exec(line)
      if (!current || !pair) continue
      const [, key, raw] = pair
      ;(current as Record<string, unknown>)[key] = raw === 'true' ? true : JSON.parse(raw)
    }
    return tables
  }

  const apexRoutes = (host: string) =>
    APEX_LINK_PATHS.map((path) => ({
      // Page paths end in `*` so a query string still matches.
      pattern: `${host}${path}${path.startsWith('/.well-known/') ? '' : '*'}`,
      zone_name: 'witnesswork.app',
    }))

  it('keeps the old host and adds api.witnesswork.app and the five apex paths for prod', () => {
    expect(routes('routes')).toEqual([
      { pattern: 'ww-proxy.leviwilkerson.com', custom_domain: true },
      { pattern: 'api.witnesswork.app', custom_domain: true },
      ...apexRoutes('witnesswork.app'),
    ])
  })

  it('gives Beta api-beta.witnesswork.app and the five paths on beta.witnesswork.app', () => {
    expect(routes('env.beta.routes')).toEqual([
      { pattern: 'api-beta.witnesswork.app', custom_domain: true },
      ...apexRoutes('beta.witnesswork.app'),
    ])
  })

  const toml = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8')
  const section = (name: string) => toml.split(`\n[${name}]\n`)[1]?.split(/\n\[/)[0] ?? ''

  // Routes are inherited by a named env, so without its own empty list a
  // local `wrangler dev --env dev` would answer as production's first host.
  it('gives dev no routes at all: it is never deployed', () => {
    expect(section('env.dev')).toMatch(/^routes = \[\]$/m)
    expect(routes('env.dev.routes')).toEqual([])
  })

  it('names every Worker, and none of them answers on workers.dev', () => {
    expect(toml.split(/\n\[/)[0]).toMatch(/^name = "ww-proxy"$/m)
    expect(section('env.beta')).toMatch(/^name = "ww-proxy-beta"$/m)
    for (const head of [toml.split(/\n\[/)[0], section('env.beta'), section('env.dev')]) {
      expect(head).toMatch(/^workers_dev = false$/m)
      expect(head).toMatch(/^preview_urls = false$/m)
    }
  })

  it('keeps Continue on the web off in production until the web app is live', () => {
    expect(section('vars')).not.toMatch(/^WEB_APP_ORIGIN\s*=/m)
    expect(section('env.beta.vars')).toMatch(/^WEB_APP_ORIGIN = "https:\/\/beta\.app\.witnesswork\.app"$/m)
    expect(section('env.dev.vars')).toMatch(/^WEB_APP_ORIGIN = "http:\/\/localhost:8081"$/m)
  })

  it('never routes a short path on the apex', () => {
    for (const { pattern } of [...routes('routes'), ...routes('env.beta.routes')]) {
      expect(pattern).not.toMatch(/witnesswork\.app\/(c|b|h)(\/|\*|$)/)
    }
  })
})
