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
