import { describe, expect, it } from 'vitest'
import {
  scrubShareLinkProperties,
  scrubShareLinkUrl,
} from '@/lib/shareLinkScrub'

describe('scrubShareLinkUrl', () => {
  it('drops contact payloads from legacy path links', () => {
    expect(
      scrubShareLinkUrl('https://ww-proxy.leviwilkerson.com/c/H4sIAAAA_x-y')
    ).toBe('https://ww-proxy.leviwilkerson.com/c/[redacted]')
  })

  it('drops fragments from ww-proxy links', () => {
    expect(
      scrubShareLinkUrl('https://ww-proxy.leviwilkerson.com/c#H4sIAAAA')
    ).toBe('https://ww-proxy.leviwilkerson.com/c#[redacted]')
    expect(
      scrubShareLinkUrl(
        'https://ww-proxy.leviwilkerson.com/b#1AbCdEfGhIjKlMnOpQrStUv'
      )
    ).toBe('https://ww-proxy.leviwilkerson.com/b#[redacted]')
  })

  it('drops fragments on the new hosts and the web app', () => {
    for (const [url, scrubbed] of [
      [
        'https://witnesswork.app/contacts#H4sIAAAA',
        'https://witnesswork.app/contacts#[redacted]',
      ],
      [
        'https://witnesswork.app/buddies/invite#1AbCdEfGhIjKlMnOpQrStUv',
        'https://witnesswork.app/buddies/invite#[redacted]',
      ],
      [
        'https://witnesswork.app/accounts/handoff?lang=es#1Secret',
        'https://witnesswork.app/accounts/handoff?lang=es#[redacted]',
      ],
      [
        'https://dev.witnesswork.app/contacts#H4sIAAAA',
        'https://dev.witnesswork.app/contacts#[redacted]',
      ],
      [
        // "Continue on the web" carries the same fragment.
        'https://app.witnesswork.app/contacts#H4sIAAAA',
        'https://app.witnesswork.app/contacts#[redacted]',
      ],
      [
        'opened "https://WITNESSWORK.APP/contacts#H4sIAAAA" twice',
        'opened "https://WITNESSWORK.APP/contacts#[redacted]" twice',
      ],
    ])
      expect(scrubShareLinkUrl(url)).toBe(scrubbed)
  })

  it('drops secrets from percent-encoded links on every host', () => {
    for (const link of [
      'https://witnesswork.app/contacts#H4sISECRET',
      'https://dev.witnesswork.app/buddies/invite#1SECRET',
      'https://app.witnesswork.app/contacts#H4sISECRET',
      'https://witnesswork.app/accounts/handoff?lang=es#1SECRET',
      'https://ww-proxy.leviwilkerson.com/c#H4sISECRET',
      'https://ww-proxy.leviwilkerson.com/contacts#H4sISECRET',
      'https://ww-proxy.leviwilkerson.com/b#1SECRET',
      'https://ww-proxy.leviwilkerson.com/h#1SECRET',
      'https://ww-proxy.leviwilkerson.com/c/H4sISECRET',
      'witnesswork://import-contact/H4sISECRET',
    ]) {
      const once = encodeURIComponent(link)
      for (const text of [
        once,
        once.toLowerCase().replace(/secret/g, 'SECRET'),
        encodeURIComponent(once),
        `https://example.com/open?u=${once}&x=1`,
      ])
        expect(scrubShareLinkUrl(text)).not.toContain('SECRET')
    }
    expect(
      scrubShareLinkUrl('https%3A%2F%2Fwitnesswork.app%2Fcontacts%23H4sISECRET')
    ).toBe('https%3A%2F%2Fwitnesswork.app%2Fcontacts%23[redacted]')
  })

  it('redacts from the first # on, wherever more follow', () => {
    for (const text of [
      'https://witnesswork.app/contacts%23SECRET%23more',
      'https://witnesswork.app/contacts%23SECRET#more',
      'https://witnesswork.app/contacts#SECRET%23more',
    ])
      expect(scrubShareLinkUrl(text)).not.toContain('SECRET')
  })

  it('redacts fragments after a quote in the query, which the parsers read', () => {
    for (const text of [
      `https://witnesswork.app/buddies/invite?r='x#1SECRET`,
      'https://witnesswork.app/buddies/invite?r="x#1SECRET',
    ])
      expect(scrubShareLinkUrl(text)).not.toContain('SECRET')
  })

  it('drops payloads from the import-contact hand-off', () => {
    expect(scrubShareLinkUrl('witnesswork://import-contact/H4sIAAAA')).toBe(
      'witnesswork://import-contact/[redacted]'
    )
  })

  it('leaves other URLs alone', () => {
    expect(scrubShareLinkUrl('witnesswork://contact/abc#note')).toBe(
      'witnesswork://contact/abc#note'
    )
    expect(scrubShareLinkUrl('https://example.com/c/x#y')).toBe(
      'https://example.com/c/x#y'
    )
    expect(scrubShareLinkUrl('https://witnesswork.app/c/x')).toBe(
      'https://witnesswork.app/c/x'
    )
  })
})

describe('scrubShareLinkProperties', () => {
  it('scrubs string values and keeps everything else', () => {
    expect(
      scrubShareLinkProperties({
        url: 'https://ww-proxy.leviwilkerson.com/c#payload',
        version: '1.43.0',
        count: 2,
      })
    ).toEqual({
      url: 'https://ww-proxy.leviwilkerson.com/c#[redacted]',
      version: '1.43.0',
      count: 2,
    })
  })
})
