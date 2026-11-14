import { describe, expect, it } from 'vitest'
import { Hono } from 'hono'
import type { Environment } from '../types'
import { contactLinkTranslations } from '../contactLinkLocales'
import { handleHandoffPage } from './handoffPage'
import { handoffPageTranslations } from './handoffPageLocales'

const app = new Hono<{ Bindings: Environment }>()
app.get('/h', handleHandoffPage)
app.get('/accounts/handoff', handleHandoffPage)

const env = { APPLE_TEAM_ID: 'TEAMID1234' } as Environment

const page = (path = '/h', headers: Record<string, string> = {}) =>
  app.request(`https://ww-proxy.leviwilkerson.com${path}`, { headers }, env)

describe('GET /accounts/handoff', () => {
  it('serves the /h page under its own og:url', async () => {
    const short = await (await page('/h')).text()
    const readable = await (await page('/accounts/handoff')).text()
    expect(readable).toContain(
      'property="og:url" content="https://ww-proxy.leviwilkerson.com/accounts/handoff"'
    )
    expect(short).toContain(
      'property="og:url" content="https://ww-proxy.leviwilkerson.com/h"'
    )
    expect(readable.replace('/accounts/handoff"', '/h"')).toBe(short)
  })
})

describe('GET /h', () => {
  it('tells someone to scan the code from inside the app, with store links', async () => {
    const response = await page()
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/html')
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow')
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
    expect(response.headers.get('content-language')).toBe('en-us')
    const html = await response.text()
    expect(html).toContain('Scan this code in WitnessWork')
    expect(html).toContain('scan the code from inside the app')
    expect(html).toContain(
      'href="https://apps.apple.com/us/app/jw-time/id6469723047"'
    )
    expect(html).toContain(
      'href="https://play.google.com/store/apps/details?id=com.leviwilkerson.jwtime"'
    )
    expect(html).toContain('<meta property="og:url" content="https://ww-proxy.leviwilkerson.com/h">')
  })

  it('runs no script and may load nothing but its own images', async () => {
    const response = await page()
    const policy = response.headers.get('content-security-policy') ?? ''
    expect(policy).toContain("default-src 'none'")
    expect(policy).not.toContain('script-src')
    expect(policy).not.toContain('connect-src')
    const html = await response.text()
    expect(html).not.toContain('<script')
    expect(html).not.toContain('witnesswork://')
  })

  it('reads nothing from the request but the language', async () => {
    const plain = await (await page()).text()
    const noisy = await (
      await page('/h?channelId=QUJDREVGR0hJSktMTU5PUFFS&x=%3Cscript%3E')
    ).text()
    expect(noisy).toBe(plain)
    expect(noisy).not.toContain('QUJDREVGR0hJSktMTU5PUFFS')
  })

  it('speaks the visitor’s language, like /c', async () => {
    const german = await page('/h', { 'Accept-Language': 'de-DE,de;q=0.9' })
    expect(german.headers.get('content-language')).toBe('de-de')
    expect(await german.text()).toContain('Scanne diesen Code in WitnessWork')

    const arabic = await page('/h?lang=ar')
    const html = await arabic.text()
    expect(html).toContain('<html lang="ar" dir="rtl">')

    // Malformed input never reaches the page.
    const odd = await page('/h?lang=%22%3E%3Cscript%3E')
    expect(odd.headers.get('content-language')).toBe('en-us')
  })

  it('has every string in every locale /c has', () => {
    expect(Object.keys(handoffPageTranslations).sort()).toEqual(
      Object.keys(contactLinkTranslations).sort()
    )
    for (const messages of Object.values(handoffPageTranslations)) {
      for (const value of Object.values(messages)) {
        expect(value.trim()).not.toBe('')
        expect(value.toLowerCase()).not.toContain('magic')
      }
    }
  })
})
