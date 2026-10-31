import { describe, expect, it } from 'vitest'
import {
  checkoutUrl,
  isWebPurchaseLink,
  parseWebPurchaseLinks,
} from '@/features/supporter/lib/webPurchaseLinks'
import type { ReturnKey } from '@/lib/purchaseReturn'

const appUserId = 'a1B2c3D4e5F6g7H8'

describe('parseWebPurchaseLinks', () => {
  const mixed =
    '{"Monthly $3.99":"sandbox/abcDEF123","One Time $4.99":"xyz_789-q"}'

  it('reads offering ids to links', () => {
    expect([...parseWebPurchaseLinks(mixed, 'development')]).toEqual([
      ['Monthly $3.99', 'sandbox/abcDEF123'],
      ['One Time $4.99', 'xyz_789-q'],
    ])
  })

  it('drops sandbox links outside development builds', () => {
    for (const variant of ['production', 'beta'] as const) {
      expect([...parseWebPurchaseLinks(mixed, variant)]).toEqual([
        ['One Time $4.99', 'xyz_789-q'],
      ])
    }
  })

  it("defaults to this build's variant, production in tests", () => {
    expect([...parseWebPurchaseLinks(mixed)]).toEqual([
      ['One Time $4.99', 'xyz_789-q'],
    ])
  })

  it('gives an empty map for a missing, malformed or non-object value', () => {
    for (const raw of [
      undefined,
      '',
      '   ',
      '{',
      'null',
      '"sandbox/abc"',
      '42',
      '["sandbox/abc"]',
    ]) {
      expect(parseWebPurchaseLinks(raw).size).toBe(0)
    }
  })

  it('drops entries whose link is not a link', () => {
    const links = parseWebPurchaseLinks(
      JSON.stringify({
        good: 'abc123',
        number: 42,
        empty: '',
        slash: 'abc/def',
        traversal: '../abc',
        url: 'https://evil.example/abc',
        query: 'abc?x=1',
        space: 'abc def',
        doubleSandbox: 'sandbox/sandbox/abc',
        bareSandbox: 'sandbox/',
        sandboxOnly: 'sandbox',
        sandboxOfSandbox: 'sandbox/sandbox',
        '': 'abc123',
      }),
      'development'
    )
    expect([...links]).toEqual([['good', 'abc123']])
  })

  it('never reads prototype keys as offerings', () => {
    const links = parseWebPurchaseLinks('{"__proto__":"abc123"}')
    expect(links.get('__proto__')).toBe('abc123')
    expect(links.get('constructor')).toBeUndefined()
    expect(links.get('toString')).toBeUndefined()
  })
})

describe('isWebPurchaseLink', () => {
  it('accepts production and sandbox tokens', () => {
    expect(isWebPurchaseLink('AbC_12-3')).toBe(true)
    expect(isWebPurchaseLink('sandbox/AbC_12-3')).toBe(true)
  })

  it('rejects anything else', () => {
    for (const link of [
      '',
      'sandbox',
      'sandbox/',
      'sandbox/sandbox',
      'Sandbox/abc',
      'abc/',
      '/abc',
      'abc%2Fdef',
      'abc\n',
      null,
      undefined,
      42,
    ]) {
      expect(isWebPurchaseLink(link)).toBe(false)
    }
  })
})

describe('checkoutUrl', () => {
  it('builds the hosted checkout URL for a monthly package', () => {
    expect(
      checkoutUrl({
        link: 'abc123',
        appUserId,
        packageId: '$rc_monthly',
        returnKey: null,
      })
    ).toBe(
      `https://pay.rev.cat/abc123/${appUserId}?package_id=%24rc_monthly&hide_back_button=true&skip_purchase_success=true`
    )
  })

  it('encodes the space in the One Time package', () => {
    const url = checkoutUrl({
      link: 'abc123',
      appUserId,
      packageId: 'One Time',
      returnKey: null,
    })
    expect(url).toContain('?package_id=One%20Time&')
    expect(new URL(url!).searchParams.get('package_id')).toBe('One Time')
  })

  it('keeps a sandbox link as it is', () => {
    expect(
      checkoutUrl({
        link: 'sandbox/abc123',
        appUserId,
        packageId: '$rc_annual',
        returnKey: null,
      })
    ).toMatch(
      new RegExp(`^https://pay\\.rev\\.cat/sandbox/abc123/${appUserId}\\?`)
    )
  })

  it('keeps an app user id with - and _', () => {
    const id = 'ab-cd_EF-12_34'
    const url = checkoutUrl({
      link: 'abc123',
      appUserId: id,
      packageId: '$rc_annual',
      returnKey: null,
    })
    expect(new URL(url!).pathname).toBe(`/abc123/${id}`)
  })

  it('adds the return key last', () => {
    expect(
      checkoutUrl({
        link: 'abc123',
        appUserId,
        packageId: '$rc_annual',
        returnKey: 'beta',
      })
    ).toBe(
      `https://pay.rev.cat/abc123/${appUserId}?package_id=%24rc_annual&hide_back_button=true&skip_purchase_success=true&utm_content=beta`
    )
  })

  it('refuses an anonymous or malformed app user id', () => {
    for (const id of [
      '$RCAnonymousID:0123456789abcdef',
      '',
      'short',
      'has space in it',
      'a'.repeat(65),
      '../../abcdefgh',
      null,
      undefined,
    ]) {
      expect(
        checkoutUrl({
          link: 'abc123',
          appUserId: id,
          packageId: '$rc_monthly',
          returnKey: null,
        })
      ).toBeNull()
    }
  })

  it('refuses a link that fails validation', () => {
    for (const link of ['https://evil.example', 'abc/def', '', 'abc?x=1']) {
      expect(
        checkoutUrl({
          link,
          appUserId,
          packageId: '$rc_monthly',
          returnKey: null,
        })
      ).toBeNull()
    }
  })

  it('refuses an empty or blank package id', () => {
    for (const packageId of ['', ' ', '\t\n ']) {
      expect(
        checkoutUrl({ link: 'abc123', appUserId, packageId, returnKey: null })
      ).toBeNull()
    }
  })

  it('refuses a return key outside the known keys', () => {
    for (const returnKey of ['x&y', 'BETA', 'prod', '', '__proto__']) {
      expect(
        checkoutUrl({
          link: 'abc123',
          appUserId,
          packageId: '$rc_annual',
          returnKey: returnKey as ReturnKey,
        })
      ).toBeNull()
    }
  })

  it('adds the local return key', () => {
    const url = checkoutUrl({
      link: 'abc123',
      appUserId,
      packageId: '$rc_annual',
      returnKey: 'local',
    })!
    expect(new URL(url).searchParams.get('utm_content')).toBe('local')
  })

  it('encodes whatever else it is given in the query', () => {
    const url = checkoutUrl({
      link: 'abc123',
      appUserId,
      packageId: 'a&b=c#d',
      returnKey: null,
    })!
    const params = new URL(url).searchParams
    expect(params.get('package_id')).toBe('a&b=c#d')
    expect(params.get('b')).toBeNull()
  })
})
