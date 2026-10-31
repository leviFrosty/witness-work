import { describe, expect, it } from 'vitest'
import {
  redactPurchaseEventProperties,
  redactPurchaseUrl,
  returnKeyFor,
  scrubPurchaseReturn,
} from '@/lib/purchaseReturn'

const PROD = 'https://app.witnesswork.app'
const DEV = 'https://app-dev.witnesswork.app'
const BETA = 'https://beta.app.witnesswork.app'
const LOCAL = 'http://localhost:8081'
const ID = 'a1B2c3D4e5F6g7H8'

const production = { variant: 'production', origin: PROD } as const

describe('scrubPurchaseReturn', () => {
  it('removes the app user id and keeps tier', () => {
    const result = scrubPurchaseReturn(
      `${PROD}/supporter/thank-you?tier=supporter&app_user_id=${ID}`,
      production
    )
    expect(result).toEqual({
      url: `${PROD}/supporter/thank-you?tier=supporter`,
      appUserId: ID,
      tier: 'supporter',
      forwardTo: null,
      forwarded: false,
    })
  })

  it('leaves an address without purchase params untouched', () => {
    const href = `${PROD}/contacts?sort=name#top`
    expect(scrubPurchaseReturn(href, production)).toEqual({
      url: href,
      appUserId: null,
      tier: null,
      forwardTo: null,
      forwarded: false,
    })
  })

  it('removes the ids on any path, not only the return page', () => {
    const result = scrubPurchaseReturn(
      `${PROD}/settings?app_user_id=${ID}&redeem_url=https%3A%2F%2Fx.example&tab=a`,
      production
    )
    expect(result.url).toBe(`${PROD}/settings?tab=a`)
    expect(result.appUserId).toBe(ID)
  })

  it('drops the question mark once nothing is left', () => {
    expect(
      scrubPurchaseReturn(`${PROD}/settings?app_user_id=${ID}`, production).url
    ).toBe(`${PROD}/settings`)
  })

  it('removes encoded and differently cased names', () => {
    const result = scrubPurchaseReturn(
      `${PROD}/supporter/thank-you?tier=tip&APP_USER_ID=${ID}&app%5Fuser%5Fid=${ID}&App_User_Id=${ID}&REDEEM%5FURL=x&app_user_id%20=${ID}`,
      production
    )
    expect(result.url).toBe(`${PROD}/supporter/thank-you?tier=tip`)
    expect(result.appUserId).toBe(ID)
  })

  it('removes the id between ; separators, keeping the rest', () => {
    expect(
      scrubPurchaseReturn(
        `${PROD}/supporter/thank-you?tier=tip;app_user_id=${ID};x=1`,
        production
      ).url
    ).toBe(`${PROD}/supporter/thank-you?tier=tip;x=1`)
    expect(
      scrubPurchaseReturn(`${PROD}/?a=1&b=2;app_user_id=${ID}&c=3`, production)
        .url
    ).toBe(`${PROD}/?a=1&b=2&c=3`)
  })

  it('removes an id whose name ends in [] or %00', () => {
    for (const name of [
      'app_user_id[]',
      'app_user_id%5B%5D',
      'app_user_id%00',
    ]) {
      expect(
        scrubPurchaseReturn(
          `${PROD}/supporter/thank-you?tier=tip&${name}=${ID}`,
          production
        ).url
      ).toBe(`${PROD}/supporter/thank-you?tier=tip`)
    }
  })

  it('removes a double-encoded name', () => {
    expect(
      scrubPurchaseReturn(`${PROD}/?app%255Fuser%255Fid=${ID}`, production).url
    ).toBe(`${PROD}/`)
  })

  it('removes every copy of a duplicated id and trusts none that disagree', () => {
    const result = scrubPurchaseReturn(
      `${PROD}/supporter/thank-you?app_user_id=${ID}&tier=tip&app_user_id=other_customer_1`,
      production
    )
    expect(result.url).toBe(`${PROD}/supporter/thank-you?tier=tip`)
    expect(result.appUserId).toBeNull()
  })

  it('keeps a duplicated id that agrees', () => {
    expect(
      scrubPurchaseReturn(
        `${PROD}/?app_user_id=${ID}&app_user_id=${ID}`,
        production
      ).appUserId
    ).toBe(ID)
  })

  it('decodes the removed id', () => {
    expect(
      scrubPurchaseReturn(`${PROD}/?app_user_id=ab%2Dcd_12345`, production)
        .appUserId
    ).toBe('ab-cd_12345')
  })

  it('survives a malformed encoding', () => {
    const result = scrubPurchaseReturn(
      `${PROD}/?app_user_id=%E0%A4%A&x=%ZZ`,
      production
    )
    expect(result.url).toBe(`${PROD}/?x=%ZZ`)
    expect(result.appUserId).toBeNull()
  })

  it('removes ids after the fragment too, keeping the route', () => {
    const result = scrubPurchaseReturn(
      `${PROD}/supporter/thank-you?tier=tip#/route?app_user_id=${ID}&a=1`,
      production
    )
    expect(result.url).toBe(`${PROD}/supporter/thank-you?tier=tip#/route?a=1`)
    expect(
      scrubPurchaseReturn(`${PROD}/x#app_user_id=${ID}`, production).url
    ).toBe(`${PROD}/x`)
  })

  it('reads tier only as supporter or tip', () => {
    const tier = (value: string) =>
      scrubPurchaseReturn(
        `${PROD}/supporter/thank-you?tier=${value}`,
        production
      ).tier
    expect(tier('supporter')).toBe('supporter')
    expect(tier('tip')).toBe('tip')
    expect(tier('Supporter')).toBeNull()
    expect(tier('lifetime')).toBeNull()
    expect(tier('')).toBeNull()
    expect(
      scrubPurchaseReturn(
        `${PROD}/supporter/thank-you?tier=tip&tier=supporter`,
        production
      ).tier
    ).toBeNull()
  })

  describe('forwarding', () => {
    it('marks a forwarded return, and removes the mark', () => {
      const result = scrubPurchaseReturn(
        `${BETA}/supporter/thank-you?tier=tip&forwarded=1`,
        { variant: 'beta', origin: BETA }
      )
      expect(result).toEqual({
        url: `${BETA}/supporter/thank-you?tier=tip`,
        appUserId: null,
        tier: 'tip',
        forwardTo: null,
        forwarded: true,
      })
    })

    it('forwards a return without a tier with only the mark', () => {
      expect(
        scrubPurchaseReturn(
          `${PROD}/supporter/thank-you?utm_content=beta&app_user_id=${ID}`,
          production
        ).forwardTo
      ).toBe(`${BETA}/supporter/thank-you?forwarded=1`)
    })

    it('reads the mark only on the return page, and removes it anywhere', () => {
      const result = scrubPurchaseReturn(
        `${PROD}/schedule?forwarded=1`,
        production
      )
      expect(result.forwarded).toBe(false)
      expect(result.url).toBe(`${PROD}/schedule`)
    })

    it('forwards a beta return from production with only the tier', () => {
      const result = scrubPurchaseReturn(
        `${PROD}/supporter/thank-you?tier=supporter&app_user_id=${ID}&utm_content=beta&utm_source=x`,
        production
      )
      expect(result.forwardTo).toBe(
        `${BETA}/supporter/thank-you?tier=supporter&forwarded=1`
      )
      expect(result.url).toBe(
        `${PROD}/supporter/thank-you?tier=supporter&utm_source=x`
      )
    })

    it('forwards a beta return in a beta build', () => {
      expect(
        scrubPurchaseReturn(
          `${PROD}/supporter/thank-you?tier=tip&utm_content=beta`,
          {
            variant: 'beta',
            origin: PROD,
          }
        ).forwardTo
      ).toBe(`${BETA}/supporter/thank-you?tier=tip&forwarded=1`)
    })

    it('forwards a local return in a development build', () => {
      expect(
        scrubPurchaseReturn(
          `${DEV}/supporter/thank-you?tier=tip&utm_content=local`,
          { variant: 'development', origin: DEV }
        ).forwardTo
      ).toBe(`${LOCAL}/supporter/thank-you?tier=tip&forwarded=1`)
    })

    it('never forwards to localhost from a production or beta build', () => {
      for (const variant of ['production', 'beta'] as const) {
        const result = scrubPurchaseReturn(
          `${PROD}/supporter/thank-you?tier=tip&utm_content=local`,
          { variant, origin: PROD }
        )
        expect(result.forwardTo).toBeNull()
        expect(result.url).toBe(`${PROD}/supporter/thank-you?tier=tip`)
      }
    })

    it('never forwards to beta from a development build', () => {
      expect(
        scrubPurchaseReturn(
          `${DEV}/supporter/thank-you?tier=tip&utm_content=beta`,
          { variant: 'development', origin: DEV }
        ).forwardTo
      ).toBeNull()
    })

    it('ignores unknown keys and origins in the URL', () => {
      for (const key of [
        'evil',
        'https://evil.example',
        encodeURIComponent('https://evil.example'),
        '//evil.example',
        'beta.evil.example',
      ]) {
        const href = `${PROD}/supporter/thank-you?tier=tip&utm_content=${key}`
        const result = scrubPurchaseReturn(href, production)
        expect(result.forwardTo).toBeNull()
        expect(result.url).toBe(href)
      }
    })

    it('reads a return key regardless of case or encoding', () => {
      expect(
        scrubPurchaseReturn(
          `${PROD}/supporter/thank-you?tier=tip&UTM_CONTENT=%42eta`,
          production
        ).forwardTo
      ).toBe(`${BETA}/supporter/thank-you?tier=tip&forwarded=1`)
    })

    it('does not forward when duplicated keys disagree', () => {
      const result = scrubPurchaseReturn(
        `${DEV}/supporter/thank-you?tier=tip&utm_content=local&utm_content=beta`,
        { variant: 'development', origin: DEV }
      )
      expect(result.forwardTo).toBeNull()
      expect(result.url).toBe(`${DEV}/supporter/thank-you?tier=tip`)
    })

    it('does not forward from another path, but still removes the key', () => {
      const result = scrubPurchaseReturn(
        `${PROD}/settings?tier=tip&utm_content=beta`,
        production
      )
      expect(result.forwardTo).toBeNull()
      expect(result.url).toBe(`${PROD}/settings?tier=tip`)
      expect(
        scrubPurchaseReturn(
          `${PROD}/supporter/thank-you/extra?utm_content=beta`,
          production
        ).forwardTo
      ).toBeNull()
    })

    it('does not forward a key that only appears in the fragment', () => {
      expect(
        scrubPurchaseReturn(
          `${PROD}/supporter/thank-you?tier=tip#utm_content=beta`,
          production
        ).forwardTo
      ).toBeNull()
    })

    it('does not forward to the current origin', () => {
      const result = scrubPurchaseReturn(
        `${BETA}/supporter/thank-you?tier=tip&utm_content=beta`,
        { variant: 'beta', origin: BETA }
      )
      expect(result.forwardTo).toBeNull()
      expect(result.url).toBe(`${BETA}/supporter/thank-you?tier=tip`)
    })

    it('forwards without a tier it cannot read', () => {
      expect(
        scrubPurchaseReturn(
          `${PROD}/supporter/thank-you?tier=evil&utm_content=beta`,
          production
        ).forwardTo
      ).toBe(`${BETA}/supporter/thank-you?forwarded=1`)
    })

    it('does not forward from an address on another origin', () => {
      expect(
        scrubPurchaseReturn(
          `https://evil.example/supporter/thank-you?utm_content=beta`,
          production
        ).forwardTo
      ).toBeNull()
    })
  })

  it('survives junk and non-http addresses', () => {
    for (const href of [
      '',
      'not a url',
      'javascript:alert(1)//?utm_content=beta',
      '/supporter/thank-you?utm_content=beta',
      '%%%',
    ]) {
      const result = scrubPurchaseReturn(href, production)
      expect(result.forwardTo).toBeNull()
      expect(result.url).not.toContain('utm_content=beta')
    }
  })
})

describe('returnKeyFor', () => {
  it('needs no key on the config return host', () => {
    expect(returnKeyFor({ origin: PROD, variant: 'production' })).toBeNull()
    expect(returnKeyFor({ origin: PROD, variant: 'beta' })).toBeNull()
    expect(returnKeyFor({ origin: DEV, variant: 'development' })).toBeNull()
  })

  it('names the origin a checkout must come back to', () => {
    expect(returnKeyFor({ origin: BETA, variant: 'beta' })).toBe('beta')
    expect(returnKeyFor({ origin: BETA, variant: 'production' })).toBe('beta')
    expect(returnKeyFor({ origin: LOCAL, variant: 'development' })).toBe(
      'local'
    )
  })

  it('has no key for an origin its build cannot return to', () => {
    expect(returnKeyFor({ origin: LOCAL, variant: 'production' })).toBeNull()
    expect(returnKeyFor({ origin: BETA, variant: 'development' })).toBeNull()
    expect(
      returnKeyFor({ origin: 'https://preview.example', variant: 'beta' })
    ).toBeNull()
    expect(returnKeyFor({ origin: 'junk', variant: 'beta' })).toBeNull()
  })

  it('compares origins, not strings', () => {
    expect(
      returnKeyFor({
        origin: 'HTTPS://BETA.APP.WITNESSWORK.APP/',
        variant: 'beta',
      })
    ).toBe('beta')
  })
})

describe('redactPurchaseUrl', () => {
  it('keeps only the origin of a checkout URL', () => {
    for (const url of [
      `https://pay.rev.cat/sandbox/abc123/${ID}?package_id=%24rc_monthly`,
      `https://PAY.REV.CAT/abc123/${ID}`,
      `http://pay.rev.cat/abc123/${ID}`,
      `https://pay.rev.cat./abc123/${ID}`,
      `https://user@pay.rev.cat/abc123/${ID}`,
      `//pay.rev.cat/abc123/${ID}`,
      `pay.rev.cat/abc123/${ID}`,
      `https:\\\\pay.rev.cat\\abc123\\${ID}`,
      `https://pay.rev.cat:99999/abc123/${ID}`,
    ]) {
      expect(redactPurchaseUrl(url)).toBe('https://pay.rev.cat/')
    }
  })

  it('does not mistake a lookalike host for checkout', () => {
    expect(redactPurchaseUrl('https://pay.rev.cat@evil.example/a')).toBe(
      'https://pay.rev.cat@evil.example/a'
    )
    expect(redactPurchaseUrl('https://notpay.rev.cat.example/a')).toBe(
      'https://notpay.rev.cat.example/a'
    )
  })

  it('removes a param that carries a checkout URL', () => {
    expect(
      redactPurchaseUrl(
        `${PROD}/x?next=${encodeURIComponent(`https://pay.rev.cat/abc/${ID}`)}&a=1`
      )
    ).toBe(`${PROD}/x?a=1`)
  })

  it('removes the return params from any URL', () => {
    expect(
      redactPurchaseUrl(
        `${PROD}/supporter/thank-you?tier=tip&app_user_id=${ID}&utm_content=beta&redeem_url=x`
      )
    ).toBe(`${PROD}/supporter/thank-you?tier=tip`)
  })

  it('works on relative URLs and fragments', () => {
    expect(redactPurchaseUrl(`/supporter/thank-you?app_user_id=${ID}`)).toBe(
      '/supporter/thank-you'
    )
    expect(redactPurchaseUrl(`?app_user_id=${ID}&a=1`)).toBe('?a=1')
    expect(redactPurchaseUrl(`#app_user_id=${ID}`)).toBe('')
  })

  it('works on javascript: URLs', () => {
    expect(redactPurchaseUrl(`javascript:void(0)?app_user_id=${ID}`)).toBe(
      'javascript:void(0)'
    )
  })

  it('survives junk input', () => {
    expect(redactPurchaseUrl('')).toBe('')
    expect(redactPurchaseUrl('%')).toBe('%')
    expect(redactPurchaseUrl('???&&&')).toBe('???&&&')
    expect(redactPurchaseUrl('http://[')).toBe('http://[')
    expect(redactPurchaseUrl(null as unknown as string)).toBeNull()
    expect(redactPurchaseUrl(42 as unknown as string)).toBe(42)
  })
})

describe('redactPurchaseEventProperties', () => {
  it('redacts URL properties and element hrefs in a copy', () => {
    const checkout = `https://pay.rev.cat/abc123/${ID}`
    const properties = {
      $current_url: `${PROD}/supporter/thank-you?tier=tip&app_user_id=${ID}`,
      $referrer: checkout,
      $initial_referrer: checkout,
      $el_href: checkout,
      $elements: [
        { tag_name: 'a', attr__href: checkout },
        { tag_name: 'div' },
        'junk',
      ],
      $set_once: {
        $initial_current_url: checkout,
        $initial_referrer: checkout,
      },
      other: checkout,
      count: 3,
    }
    const original = structuredClone(properties)
    const result = redactPurchaseEventProperties(properties)
    expect(result).toEqual({
      $current_url: `${PROD}/supporter/thank-you?tier=tip`,
      $referrer: 'https://pay.rev.cat/',
      $initial_referrer: 'https://pay.rev.cat/',
      $el_href: 'https://pay.rev.cat/',
      $elements: [
        { tag_name: 'a', attr__href: 'https://pay.rev.cat/' },
        { tag_name: 'div' },
        'junk',
      ],
      $set_once: {
        $initial_current_url: 'https://pay.rev.cat/',
        $initial_referrer: 'https://pay.rev.cat/',
      },
      other: 'https://pay.rev.cat/',
      count: 3,
    })
    expect(properties).toEqual(original)
    expect(result).not.toBe(properties)
  })

  it('leaves non-string and missing values alone', () => {
    expect(
      redactPurchaseEventProperties({
        $current_url: null,
        $elements: 'nope',
        $set: null,
      })
    ).toEqual({ $current_url: null, $elements: 'nope', $set: null })
    expect(redactPurchaseEventProperties({})).toEqual({})
  })

  const checkout = `https://pay.rev.cat/abc123/${ID}`
  const returned = `${PROD}/supporter/thank-you?tier=tip&app_user_id=${ID}`
  const scrubbed = `${PROD}/supporter/thank-you?tier=tip`

  for (const key of [
    '$session_entry_url',
    '$session_entry_referrer',
    '$external_click_url',
    '$initial_current_url',
  ]) {
    it(`redacts ${key}`, () => {
      expect(
        redactPurchaseEventProperties({ [key]: returned, other: 1 })
      ).toEqual({ [key]: scrubbed, other: 1 })
      expect(redactPurchaseEventProperties({ [key]: checkout })).toEqual({
        [key]: 'https://pay.rev.cat/',
      })
    })
  }

  it('redacts any top-level property that holds a URL', () => {
    expect(
      redactPurchaseEventProperties({
        $prev_pageview_pathname: `/supporter/thank-you?app_user_id=${ID}`,
        link: checkout,
        next: returned,
        hash: `#/route?app_user_id=${ID}`,
      })
    ).toEqual({
      $prev_pageview_pathname: '/supporter/thank-you',
      link: 'https://pay.rev.cat/',
      next: scrubbed,
      hash: '#/route',
    })
  })

  it('leaves strings that are not URLs as they were', () => {
    const properties = {
      $el_text: 'Thank you!',
      tier: 'tip',
      note: 'What? app_user_id',
    }
    expect(redactPurchaseEventProperties(properties)).toEqual(properties)
  })

  it('redacts every URL in $set and $set_once', () => {
    for (const key of ['$set', '$set_once']) {
      expect(
        redactPurchaseEventProperties({
          [key]: {
            $session_entry_url: returned,
            $initial_referrer: checkout,
            $initial_external_click_url: checkout,
            name: 'Ann',
          },
        })
      ).toEqual({
        [key]: {
          $session_entry_url: scrubbed,
          $initial_referrer: 'https://pay.rev.cat/',
          $initial_external_click_url: 'https://pay.rev.cat/',
          name: 'Ann',
        },
      })
    }
  })

  it('redacts href and attr__href in $elements', () => {
    expect(
      redactPurchaseEventProperties({
        $elements: [
          { tag_name: 'a', href: checkout },
          { tag_name: 'a', attr__href: returned, href: returned },
          { tag_name: 'a', href: 42 },
        ],
      })
    ).toEqual({
      $elements: [
        { tag_name: 'a', href: 'https://pay.rev.cat/' },
        { tag_name: 'a', attr__href: scrubbed, href: scrubbed },
        { tag_name: 'a', href: 42 },
      ],
    })
  })

  it('redacts href and attr__href values in $elements_chain', () => {
    const chain =
      `a.buy:attr__href="${checkout}"href="${checkout}"nth-child="1";` +
      `div:attr__href="${returned}"text="Thanks"`
    expect(redactPurchaseEventProperties({ $elements_chain: chain })).toEqual({
      $elements_chain:
        'a.buy:attr__href="https://pay.rev.cat/"href="https://pay.rev.cat/"nth-child="1";' +
        `div:attr__href="${scrubbed}"text="Thanks"`,
    })
  })

  it('leaves $elements_chain alone when it holds no purchase URL', () => {
    const chain = 'a.nav:attr__href="/settings"href="/settings"nth-child="2"'
    expect(redactPurchaseEventProperties({ $elements_chain: chain })).toEqual({
      $elements_chain: chain,
    })
  })
})
