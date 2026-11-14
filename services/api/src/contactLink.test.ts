import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Environment } from './types'

vi.mock('cloudflare:workers', () => ({ DurableObject: class {} }))

import worker from './index'

const ORIGIN = 'https://ww-proxy.leviwilkerson.com'
const CANONICAL_URL = `${ORIGIN}/c`
const CONTACTS_URL = `${ORIGIN}/contacts`
// gzip + base64url contact JSON, exactly as the app encodes it.
const PAYLOAD =
  'H4sIAAAAAAAAE42MMQvCMBQG_0r4VpPyUohgNsHJ2ckttA8MYl5IglVK_7tEcBduvLsVTy41SoKHHQga7Z0ZHktsiWtdpNzNJKmFqUGDX1lK4_nY4DHSuDd0MGQvRP7LQERXaPwKvyLO8JgsNFJ49PM5JFYn4a4VDn_c8k1SL3dWOecUWSJs2wdjV8GKuwAAAA'
const ENV = { APPLE_TEAM_ID: 'TEAM123456' } as Environment

async function request(
  path: string,
  { env = ENV, headers }: { env?: Environment; headers?: HeadersInit } = {}
) {
  const pending: Promise<unknown>[] = []
  const context = {
    waitUntil: (promise: Promise<unknown>) => pending.push(promise),
    passThroughOnException: () => {},
  }
  const response = await worker.fetch!(
    new Request(`${ORIGIN}${path}`, { headers }) as never,
    env,
    context as never
  )
  await Promise.all(pending)
  return response
}

const html = async (path: string) => {
  const response = await request(path)
  expect(response.status).toBe(200)
  return response.text()
}

const ogUrl = (page: string) =>
  page.match(/<meta property="og:url" content="([^"]*)">/)?.[1]

/** Runs the page's inline script against a stub DOM, as a browser at `/c<hash>` would. */
function openAppLinkAt(page: string, hash: string) {
  const script = page.match(/<script>([\s\S]*?)<\/script>/)?.[1]
  expect(script).toBeDefined()
  const link = { href: '', hidden: true }
  const document = {
    getElementById: (id: string) => (id === 'open-app' ? link : null),
  }
  new Function('location', 'document', script!)({ hash }, document)
  return link
}

describe('apple-app-site-association', () => {
  it('matches fragment links and legacy path links for every app variant', async () => {
    const response = await request('/.well-known/apple-app-site-association')

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/json')
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
              { '/': '/c', '#': '?*' },
              { '/': '/c/*' },
              { '/': '/b', '#': '1?*' },
              { '/': '/h', '#': '1?*' },
            ],
          },
        ],
      },
    })
  })
})

describe('GET /c', () => {
  it('never puts a payload in the response', async () => {
    // Whatever request data reaches the worker, nothing is reflected.
    for (const path of ['/c', `/c?${PAYLOAD}`]) {
      const page = await html(path)
      expect(page).not.toContain(PAYLOAD)
      expect(ogUrl(page)).toBe(CANONICAL_URL)
      expect(page).toContain('<a class="secondary" id="open-app" hidden>')
    }
  })

  it('builds the Open app link from a base64url fragment', async () => {
    expect(openAppLinkAt(await html('/c'), `#${PAYLOAD}`)).toEqual({
      href: `witnesswork://import-contact/${PAYLOAD}`,
      hidden: false,
    })
  })

  it('keeps the Open app link hidden without a base64url fragment', async () => {
    const page = await html('/c')
    for (const hash of [
      '',
      '#',
      `#${PAYLOAD}=`,
      `#${PAYLOAD}/x`,
      '#%22%3E%3Cscript%3Ealert(1)%3C/script%3E',
      '#javascript:alert(1)',
    ]) {
      expect(openAppLinkAt(page, hash)).toEqual({ href: '', hidden: true })
    }
  })
})

describe('GET /contacts', () => {
  it('serves the /c page under its own og:url and never reflects a payload', async () => {
    for (const path of ['/contacts', `/contacts?${PAYLOAD}`]) {
      const page = await html(path)
      expect(page).not.toContain(PAYLOAD)
      expect(ogUrl(page)).toBe(CONTACTS_URL)
      expect(page).toContain('<a class="secondary" id="open-app" hidden>')
    }
    expect(openAppLinkAt(await html('/contacts'), `#${PAYLOAD}`)).toEqual({
      href: `witnesswork://import-contact/${PAYLOAD}`,
      hidden: false,
    })
  })

  it('has no path-payload form', async () => {
    expect((await request(`/contacts/${PAYLOAD}`)).status).toBe(404)
  })
})

describe('GET /c/:payload (legacy)', () => {
  it('keeps the deep link but leaves the payload out of og:url and every meta tag', async () => {
    const page = await html(`/c/${PAYLOAD}`)

    expect(ogUrl(page)).toBe(CANONICAL_URL)
    expect(page.slice(0, page.indexOf('</head>'))).not.toContain(PAYLOAD)
    expect(page).toContain(`href="witnesswork://import-contact/${PAYLOAD}"`)
  })

  it('renders no deep link for a payload that is not base64url', async () => {
    const page = await html('/c/%22%3E%3Cb%3Ehi')

    expect(page).not.toContain('witnesswork://import-contact/')
    expect(page).not.toContain('<b>hi')
  })
})

describe('contact link localization', () => {
  it.each([
    ['en-us', 'Open this contact in WitnessWork'],
    ['de-de', 'Diesen Kontakt in WitnessWork öffnen'],
    ['es-es', 'Abre este contacto en WitnessWork'],
    ['fr-fr', 'Ouvrir ce contact dans WitnessWork'],
    ['it-it', 'Apri questo contatto in WitnessWork'],
    ['ja-jp', 'この連絡先をWitnessWorkで開く'],
    ['ko-kr', 'WitnessWork에서 이 연락처 열기'],
    ['nl-nl', 'Open dit contact in WitnessWork'],
    ['pt-br', 'Abra este contato no WitnessWork'],
    ['pt-pt', 'Abra este contacto no WitnessWork'],
    ['ru-ru', 'Откройте этот контакт в WitnessWork'],
    ['vi-vn', 'Mở liên hệ này trong WitnessWork'],
    ['zh-hant-tw', '在WitnessWork中開啟此聯絡人'],
    ['zh-hans-cn', '在WitnessWork中打开此联系人'],
    ['sw-ke', 'Fungua anwani hii katika WitnessWork'],
    ['uk-ua', 'Відкрийте цей контакт у WitnessWork'],
    ['bem-zm', 'Isuleni uyu muntu muli WitnessWork'],
    ['rw-rw', 'Fungura iyi aderesi muri WitnessWork'],
  ])('renders %s on both routes, including preview titles', async (locale, title) => {
    for (const path of ['/c', `/c/${PAYLOAD}`]) {
      const response = await request(`${path}?lang=${locale}`, {
        headers: { 'Accept-Language': 'en-US' },
      })
      expect(response.status).toBe(200)
      expect(response.headers.get('content-language')).toBe(locale)
      expect(response.headers.get('vary')).toContain('Accept-Language')
      const page = await response.text()
      expect(page).toContain(`<html lang="${locale}">`)
      expect(page).toContain(`<title>${title}</title>`)
      expect(page).toContain(`<h1>${title}</h1>`)
      expect(page).toContain(`<meta property="og:title" content="${title}">`)
      expect(page).toContain(`<meta name="twitter:title" content="${title}">`)
      expect(ogUrl(page)).toBe(CANONICAL_URL)
      expect(page.slice(0, page.indexOf('</head>'))).not.toContain(PAYLOAD)
    }
  })

  it('renders Arabic right to left on both routes', async () => {
    const title = 'افتح جهة الاتصال هذه في WitnessWork'
    for (const path of ['/c', `/c/${PAYLOAD}`]) {
      const response = await request(path, {
        headers: { 'Accept-Language': 'ar-SA,ar;q=0.9,en;q=0.5' },
      })
      expect(response.status).toBe(200)
      expect(response.headers.get('content-language')).toBe('ar')
      const page = await response.text()
      expect(page).toContain('<html lang="ar" dir="rtl">')
      expect(page).toContain(`<title>${title}</title>`)
      expect(page).toContain(`<h1>${title}</h1>`)
      expect(page).toContain('<meta property="og:locale" content="ar_AR">')
      expect(page).toContain('>احصل على WitnessWork</a>')
      expect(page).toContain('>فتح التطبيق (مثبّت بالفعل)</a>')
      expect(ogUrl(page)).toBe(CANONICAL_URL)
      expect(page.slice(0, page.indexOf('</head>'))).not.toContain(PAYLOAD)
    }
    expect(await html('/c?lang=en-us')).toContain('<html lang="en-us">')
  })

  it('translates instructions, buttons, descriptions and image labels', async () => {
    const response = await request('/c', { headers: { 'Accept-Language': 'es-MX' } })
    const page = await response.text()
    const description = 'Han compartido un contacto contigo desde WitnessWork — la aplicación de gestión del tiempo de predicación y de contactos para los testigos de Jehová.'
    for (const meta of ['name="description"', 'property="og:description"', 'name="twitter:description"']) {
      expect(page).toContain(`<meta ${meta} content="${description}">`)
    }
    expect(page).toContain('<meta property="og:locale" content="es_ES">')
    expect(page).toContain('<p>Instala WitnessWork para importar el contacto compartido. Si ya tienes la aplicación, debería haberse abierto automáticamente.</p>')
    expect(page).toContain('>Descargar WitnessWork</a>')
    expect(page).toContain('>Abrir la aplicación (ya instalada)</a>')
    expect(page).toContain('alt="Icono de la aplicación WitnessWork"')
    expect(page).toContain('property="og:image:alt" content="Icono de la aplicación WitnessWork"')
    expect(page).toContain('name="twitter:image:alt" content="Icono de la aplicación WitnessWork"')
    expect(openAppLinkAt(page, `#${PAYLOAD}`).href).toBe(`witnesswork://import-contact/${PAYLOAD}`)
  })

  it.each([
    [undefined, 'en-us'],
    ['xx-XX, fr-CA;q=0.8, en;q=0.5', 'fr-fr'],
    ['de;q=0.2, ja;q=0.9', 'ja-jp'],
    ['de;q=0, ko;q=0.8', 'ko-kr'],
    ['fr;q=bogus, es;q=1.1, it;q=0.5', 'it-it'],
    ['ru;q=0.7, uk;q=0.7', 'ru-ru'],
    ['PT-pt', 'pt-pt'],
    ['pt', 'pt-br'],
    ['zh-TW', 'zh-hant-tw'],
    ['zh-HK', 'zh-hant-tw'],
    ['zh-Hant', 'zh-hant-tw'],
    ['zh-Hans-TW', 'zh-hans-cn'],
    ['zh-CN', 'zh-hans-cn'],
    ['zh', 'zh-hans-cn'],
    ['ar', 'ar'],
    ['ar-EG', 'ar'],
    ['xx, AR-sa;q=0.6', 'ar'],
    ['*', 'en-us'],
    ['xx-XX', 'en-us'],
    ['constructor, __proto__', 'en-us'],
  ])('negotiates Accept-Language %s as %s', async (header, locale) => {
    const response = await request('/c', {
      headers: header ? { 'Accept-Language': header } : undefined,
    })
    expect(response.headers.get('content-language')).toBe(locale)
    expect(await response.text()).toContain(`<html lang="${locale}"`)
  })

  it('normalizes explicit language and falls back safely for invalid values', async () => {
    for (const value of ['xx-XX', '"><script>alert(1)</script>', 'constructor', '__proto__']) {
      const response = await request(`/c?lang=${encodeURIComponent(value)}`, {
        headers: { 'Accept-Language': 'fr' },
      })
      expect(response.headers.get('content-language')).toBe('fr-fr')
      expect(await response.text()).not.toContain(value)
    }
    const response = await request('/c?lang=ZH-Hant', {
      headers: { 'Accept-Language': 'en' },
    })
    expect(response.headers.get('content-language')).toBe('zh-hant-tw')
    expect(await response.text()).toContain('property="og:locale" content="zh_TW"')
  })

  it('keeps the localized legacy deep link and rejects invalid payloads', async () => {
    const page = await html(`/c/${PAYLOAD}?lang=pt-pt`)
    expect(page).toContain(`href="witnesswork://import-contact/${PAYLOAD}">Abrir aplicação (já instalada)</a>`)
    const invalid = await html('/c/%22%3E%3Cb%3Ehi?lang=pt-pt')
    expect(invalid).not.toContain('witnesswork://import-contact/')
    expect(invalid).not.toContain('<b>hi')
  })
})

describe('Sentry reporting', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('names legacy link transactions by route and never sends the payload', async () => {
    const envelopes: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: unknown, init?: RequestInit) => {
        const body = init?.body
        envelopes.push(
          typeof body === 'string'
            ? body
            : new TextDecoder().decode(body as Uint8Array)
        )
        return new Response('{}', { status: 200 })
      })
    )

    await request(`/c/${PAYLOAD}`, {
      env: {
        ...ENV,
        APP_ATTEST_ENVIRONMENT: 'development',
        SENTRY_DSN: 'https://public@o0.ingest.sentry.io/0',
      },
      headers: { referer: `${ORIGIN}/c/${PAYLOAD}` },
    })

    const sent = envelopes.join('\n')
    expect(sent).toContain('"type":"transaction"')
    expect(sent).toContain('"transaction":"GET /c/:payload"')
    expect(sent).toContain('"transaction_info":{"source":"route"}')
    expect(sent).toContain(`${ORIGIN}/c/[redacted]`)
    expect(sent).not.toContain(PAYLOAD)
  })
})
