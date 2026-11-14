import { describe, expect, it } from 'vitest'
import { Hono } from 'hono'
import type { Environment } from '../types'
import { handleAasaRequest } from '../contactLink'
import { handleBuddyInvitePage } from './invitePage'

const app = new Hono<{ Bindings: Environment }>()
app.get('/.well-known/apple-app-site-association', handleAasaRequest)
app.get('/b', handleBuddyInvitePage)
app.get('/buddies/invite', handleBuddyInvitePage)

const env = { APPLE_TEAM_ID: 'TEAMID1234' } as Environment

describe('GET /buddies/invite', () => {
  it('serves the /b page under its own og:url', async () => {
    const [short, readable] = await Promise.all(
      ['/b', '/buddies/invite'].map(async (path) =>
        (
          await app.request(`https://ww-proxy.leviwilkerson.com${path}`, {}, env)
        ).text()
      )
    )
    expect(readable).toContain(
      'property="og:url" content="https://ww-proxy.leviwilkerson.com/buddies/invite"'
    )
    expect(short).toContain(
      'property="og:url" content="https://ww-proxy.leviwilkerson.com/b"'
    )
    expect(readable.replace('/buddies/invite"', '/b"')).toBe(short)
  })
})

describe('GET /b', () => {
  it('serves a static, generic, noindex page with the install steps and a copy button', async () => {
    const response = await app.request('/b', {}, env)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/html')
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow')
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')

    const html = await response.text()
    expect(html).toContain('<meta name="robots" content="noindex, nofollow">')
    expect(html).toContain(
      'property="og:title" content="A WitnessWork buddy invite"'
    )
    expect(html).toContain(
      'href="https://apps.apple.com/us/app/jw-time/id6469723047"'
    )
    expect(html).toContain(
      'href="https://play.google.com/store/apps/details?id=com.leviwilkerson.jwtime"'
    )
    expect(html).toContain('After installing, tap the invite link again')
    expect(html).toContain('Copy invite link')
    expect(html).toContain('navigator.clipboard.writeText(link)')
    // No custom-scheme deep link, and nothing that could send the fragment.
    expect(html).not.toContain('witnesswork://')
    expect(html).not.toMatch(/\bfetch\(|sendBeacon|XMLHttpRequest/)
  })

  it('reads nothing from the request URL', async () => {
    const plain = await (await app.request('/b', {}, env)).text()
    const noisy = await (
      await app.request(
        '/b?inviteId=QUJDREVGR0hJSktMTU5PUFFS&x=%3Cscript%3E',
        {},
        env
      )
    ).text()
    expect(noisy).toBe(plain)
    expect(noisy).not.toContain('QUJDREVGR0hJSktMTU5PUFFS')
  })

  it('allows only its own inline script, and no network access, via CSP', async () => {
    const response = await app.request('/b', {}, env)
    const policy = response.headers.get('content-security-policy') ?? ''
    expect(policy).toContain("default-src 'none'")
    expect(policy).not.toContain('connect-src')

    const html = await response.text()
    const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1] ?? ''
    const digest = new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(script))
    )
    let binary = ''
    for (const byte of digest) binary += String.fromCharCode(byte)
    expect(policy).toContain(`script-src 'sha256-${btoa(binary)}'`)
  })
})

describe('apple-app-site-association', () => {
  it('adds the /b invite component with a fragment matcher next to contact links', async () => {
    const response = await app.request(
      '/.well-known/apple-app-site-association',
      {},
      env
    )
    const body = (await response.json()) as {
      applinks: { details: Array<{ appIDs: string[]; components: unknown[] }> }
    }
    const [details] = body.applinks.details
    expect(details.appIDs).toEqual([
      'TEAMID1234.com.leviwilkerson.jwtime',
      'TEAMID1234.com.leviwilkerson.jwtimebeta',
      'TEAMID1234.com.leviwilkerson.jwtimedev',
    ])
    expect(details.components).toEqual([
      { '/': '/contacts', '#': '?*' },
      { '/': '/buddies/invite', '#': '1?*' },
      { '/': '/accounts/handoff', '#': '1?*' },
      { '/': '/c', '#': '?*' },
      { '/': '/c/*' },
      { '/': '/b', '#': '1?*' },
      { '/': '/h', '#': '1?*' },
    ])
  })
})
