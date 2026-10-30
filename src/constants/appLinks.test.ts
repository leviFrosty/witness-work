import { describe, expect, it } from 'vitest'
import {
  APP_LINK_HOST,
  APP_LINK_HOSTS,
  DEV_APP_LINK_HOST,
  LEGACY_APP_LINK_HOST,
  WEB_APP_HOST,
  appLinkBasePattern,
  appLinkFragment,
  appLinkPaths,
  escapeRegExp,
  isOwnAppLink,
  legacyContactPathPayload,
} from '@/constants/appLinks'

describe('app link hosts and paths', () => {
  it('reads the old host, the apex, and the dev apex', () => {
    expect(APP_LINK_HOSTS).toEqual([
      'witnesswork.app',
      'dev.witnesswork.app',
      'ww-proxy.leviwilkerson.com',
    ])
    expect([APP_LINK_HOST, DEV_APP_LINK_HOST, LEGACY_APP_LINK_HOST]).toEqual(
      APP_LINK_HOSTS
    )
    expect(WEB_APP_HOST).toBe('app.witnesswork.app')
  })

  it('reads short paths and full words on the old host', () => {
    expect(appLinkPaths(LEGACY_APP_LINK_HOST, 'contact')).toEqual([
      '/c',
      '/contacts',
    ])
    expect(appLinkPaths(LEGACY_APP_LINK_HOST, 'buddyInvite')).toEqual([
      '/b',
      '/buddies/invite',
    ])
    expect(appLinkPaths('WW-PROXY.leviwilkerson.com', 'handoff')).toEqual([
      '/h',
      '/accounts/handoff',
    ])
  })

  it('reads only full words on the new hosts', () => {
    for (const host of [APP_LINK_HOST, DEV_APP_LINK_HOST]) {
      expect(appLinkPaths(host, 'contact')).toEqual(['/contacts'])
      expect(appLinkPaths(host, 'buddyInvite')).toEqual(['/buddies/invite'])
      expect(appLinkPaths(host, 'handoff')).toEqual(['/accounts/handoff'])
    }
    expect(appLinkPaths('example.com', 'contact')).toEqual([])
    expect(appLinkPaths(WEB_APP_HOST, 'contact')).toEqual([])
  })
})

describe('escapeRegExp', () => {
  it('matches the text literally', () => {
    for (const text of ['a.b', '/c/', 'x?y*z+', '(a|b)[c]{d}', 'a^b$c\\d'])
      expect(new RegExp(`^${escapeRegExp(text)}$`).test(text)).toBe(true)
    expect(new RegExp(`^${escapeRegExp('a.b')}$`).test('axb')).toBe(false)
  })
})

describe('appLinkBasePattern', () => {
  const matches = (kind: Parameters<typeof appLinkBasePattern>[0]) => {
    const pattern = new RegExp(`^${appLinkBasePattern(kind)}$`)
    return (text: string) => pattern.test(text)
  }

  it('matches every host with its paths for the kind', () => {
    const handoff = matches('handoff')
    expect(handoff('https://ww-proxy.leviwilkerson.com/h')).toBe(true)
    expect(handoff('https://ww-proxy.leviwilkerson.com/accounts/handoff')).toBe(
      true
    )
    expect(handoff('https://witnesswork.app/accounts/handoff')).toBe(true)
    expect(handoff('https://dev.witnesswork.app/accounts/handoff')).toBe(true)
  })

  it('matches the scheme and host in any case, a trailing slash and a query', () => {
    const invite = matches('buddyInvite')
    expect(invite('HTTPS://WITNESSWORK.APP/buddies/invite')).toBe(true)
    expect(invite('Https://Ww-Proxy.LeviWilkerson.com/b')).toBe(true)
    expect(invite('https://witnesswork.app/buddies/invite/')).toBe(true)
    expect(invite('https://witnesswork.app/buddies/invite?x=1')).toBe(true)
    expect(invite('https://witnesswork.app/buddies/invite/?x=1')).toBe(true)
  })

  it('matches paths exactly, and never short paths on the new hosts', () => {
    const invite = matches('buddyInvite')
    expect(invite('https://witnesswork.app/BUDDIES/INVITE')).toBe(false)
    expect(invite('https://ww-proxy.leviwilkerson.com/B')).toBe(false)
    expect(invite('https://witnesswork.app/b')).toBe(false)
    expect(invite('https://dev.witnesswork.app/b')).toBe(false)
    expect(invite('https://app.witnesswork.app/buddies/invite')).toBe(false)
    expect(invite('https://wwitnesswork.app/buddies/invite')).toBe(false)
    expect(invite('https://witnesswork.appx/buddies/invite')).toBe(false)
    expect(invite('https://witnesswork.app/buddies/invite//')).toBe(false)
    expect(invite('https://witnesswork.app/buddies/invite?x 1')).toBe(false)
  })
})

describe('appLinkFragment', () => {
  it('reads what follows the #, or an empty string without one', () => {
    expect(
      appLinkFragment('https://witnesswork.app/contacts#abc', 'contact')
    ).toBe('abc')
    expect(
      appLinkFragment(
        ' https://ww-proxy.leviwilkerson.com/h?x=1#1x\n',
        'handoff'
      )
    ).toBe('1x')
    expect(appLinkFragment('https://witnesswork.app/contacts', 'contact')).toBe(
      ''
    )
  })

  it('reads only a whole link', () => {
    for (const text of [
      'see https://witnesswork.app/contacts#abc',
      'witnesswork://x?u=https://witnesswork.app/contacts#abc',
      'https://witnesswork.app/contacts/abc#abc',
      'https://witnesswork.app/c#abc',
    ])
      expect(appLinkFragment(text, 'contact')).toBeNull()
  })
})

describe('legacyContactPathPayload', () => {
  it('reads /c/<payload> on the old host only', () => {
    expect(
      legacyContactPathPayload('https://ww-proxy.leviwilkerson.com/c/H4sIabc')
    ).toBe('H4sIabc')
    expect(
      legacyContactPathPayload('HTTPS://WW-PROXY.LEVIWILKERSON.COM/c/H4sI?x#y')
    ).toBe('H4sI')
    for (const text of [
      'https://ww-proxy.leviwilkerson.com/c/',
      'https://ww-proxy.leviwilkerson.com/C/H4sI',
      'https://ww-proxy.leviwilkerson.com/contacts/H4sI',
      'https://witnesswork.app/c/H4sI',
      'https://witnesswork.app/contacts/H4sI',
      'x https://ww-proxy.leviwilkerson.com/c/H4sI',
    ])
      expect(legacyContactPathPayload(text)).toBeNull()
  })
})

describe('isOwnAppLink', () => {
  it('owns everything on the old host', () => {
    for (const url of [
      'https://ww-proxy.leviwilkerson.com',
      'https://ww-proxy.leviwilkerson.com/b#1AAAA',
      'https://WW-PROXY.leviwilkerson.com/c#abc',
      'https://ww-proxy.leviwilkerson.com/c/abc',
      'https://ww-proxy.leviwilkerson.com/h?x=1#1abc',
      'https://ww-proxy.leviwilkerson.com/buddies/invite#1AAAA',
    ])
      expect(isOwnAppLink(url)).toBe(true)
  })

  it('owns only the claimed paths on the new hosts', () => {
    for (const url of [
      'https://witnesswork.app/contacts#abc',
      'https://WITNESSWORK.app/buddies/invite#1AAAA',
      'Https://witnesswork.app/buddies/invite/#1AAAA',
      'https://witnesswork.app/accounts/handoff/?lang=es#1abc',
      'https://witnesswork.app/accounts/handoff?lang=es#1abc',
      'https://dev.witnesswork.app/contacts',
      'https://dev.witnesswork.app/accounts/handoff#1abc',
      // Android decodes the path before matching its intent filters.
      'https://witnesswork.app/%63ontacts#abc',
    ])
      expect(isOwnAppLink(url)).toBe(true)
    for (const url of [
      // The website lives on the apex too.
      'https://witnesswork.app',
      'https://witnesswork.app/privacy',
      'https://witnesswork.app/help/time/time-rollover',
      'https://witnesswork.app/contactsfoo',
      'https://witnesswork.app/contacts//',
      'https://witnesswork.app/CONTACTS#abc',
      'https://witnesswork.app/c#abc',
      'https://witnesswork.app/b#1AAAA',
      'https://witnesswork.app/h#1abc',
      // The web app is never an app-link host.
      'https://app.witnesswork.app/contacts#abc',
      'https://ww-proxy.leviwilkerson.com.example.org/b',
      'https://witnesswork.app.example.org/contacts',
      'http://witnesswork.app/contacts#abc',
      'witnesswork://contact/abc',
      'not a link',
    ])
      expect(isOwnAppLink(url)).toBe(false)
  })
})
