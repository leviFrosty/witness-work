import { describe, expect, it } from 'vitest'
import { toB64u } from '@/lib/bytes'
import {
  deriveLinkCredentials,
  deriveLinkSecret,
  deriveScopeKey,
  guestLinkFragment,
  guestLinkUrl,
  linkVerifier,
  newLinkId,
  parseGuestLinkFragment,
  parseGuestLinkUrl,
  scopeIdForStreet,
  sortedScopeIds,
  streetIdForScope,
} from '@/lib/sharedSpaces/scopes'

const counting = (length: number, start = 0) =>
  Uint8Array.from({ length }, (_, index) => (start + index) & 0xff)

const spaceId = toB64u(counting(16, 0x10))
const linkId = toB64u(counting(16, 0x22))
const linkSecret = counting(32, 0x44)
const street = '3f2a9c1e-5b7d-4e8f-a1b2-c3d4e5f60718'

describe('scope ids', () => {
  it('are the street UUID’s 16 bytes, and turn back into the lowercase UUID', () => {
    const scopeId = scopeIdForStreet(street)
    expect(scopeId).toHaveLength(22)
    expect(streetIdForScope(scopeId)).toBe(street)
    expect(scopeIdForStreet(street.toUpperCase())).toBe(scopeId)
  })

  it('refuse a street id that isn’t a UUID', () => {
    for (const id of ['street-1', '', '3f2a9c1e5b7d4e8fa1b2c3d4e5f60718'])
      expect(() => scopeIdForStreet(id)).toThrow()
  })

  it('read only canonical 22-character ids back', () => {
    expect(streetIdForScope('short')).toBeNull()
    const scopeId = scopeIdForStreet(street)
    const last = scopeId.at(-1)!
    const nonCanonical = scopeId.slice(0, -1) + (last === 'B' ? 'C' : 'B')
    expect(streetIdForScope(nonCanonical)).toBeNull()
  })

  it('sort and dedupe for the guest record’s first scope', () => {
    expect(sortedScopeIds(['b', 'a', 'b'])).toEqual(['a', 'b'])
  })
})

describe('scope keys', () => {
  it('differ per scope and per epoch key, and come back the same', () => {
    const key = counting(32, 0x40)
    const a = deriveScopeKey(key, scopeIdForStreet(street))
    const b = deriveScopeKey(key, toB64u(counting(16, 0x01)))
    expect(a).toHaveLength(32)
    expect(toB64u(a)).not.toBe(toB64u(b))
    expect(deriveScopeKey(key, scopeIdForStreet(street))).toBe(a)
    expect(
      toB64u(deriveScopeKey(counting(32, 0x41), scopeIdForStreet(street)))
    ).not.toBe(toB64u(a))
  })

  it('refuse a short key or a bad scope id', () => {
    expect(() =>
      deriveScopeKey(counting(16), scopeIdForStreet(street))
    ).toThrow()
    expect(() => deriveScopeKey(counting(32), 's.bad')).toThrow()
  })
})

describe('guest links', () => {
  it('derive a secret per space and link from the root seed', () => {
    const seed = counting(32)
    const secret = deriveLinkSecret(seed, spaceId, linkId)
    expect(secret).toHaveLength(32)
    expect(toB64u(deriveLinkSecret(seed, spaceId, linkId))).toBe(toB64u(secret))
    expect(
      toB64u(deriveLinkSecret(seed, spaceId, toB64u(counting(16, 0x23))))
    ).not.toBe(toB64u(secret))
    expect(() => deriveLinkSecret(counting(16), spaceId, linkId)).toThrow()
  })

  it('give a token whose hash is the verifier, and a different key', () => {
    const { linkToken, verifier, linkKey } = deriveLinkCredentials(linkSecret)
    expect(linkToken).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(linkVerifier(linkToken)).toBe(verifier)
    expect(toB64u(linkKey)).not.toBe(linkToken)
    expect(toB64u(linkKey)).not.toBe(toB64u(linkSecret))
  })

  it('make new 22-character link ids', () => {
    expect(newLinkId((length) => counting(length, 0x22))).toBe(linkId)
  })

  it('build the URL on each variant’s web host, with the secret only in the fragment', () => {
    const link = { spaceId, linkId, linkSecret }
    const fragment = `v1.${spaceId}.${linkId}.${toB64u(linkSecret)}`
    expect(guestLinkFragment(link)).toBe(fragment)
    expect(guestLinkUrl('production', link)).toBe(
      `https://app.witnesswork.app/territories/guest#${fragment}`
    )
    expect(guestLinkUrl('beta', link)).toBe(
      `https://beta.app.witnesswork.app/territories/guest#${fragment}`
    )
    expect(guestLinkUrl('development', link)).toBe(
      `https://app-dev.witnesswork.app/territories/guest#${fragment}`
    )
    for (const variant of ['production', 'beta', 'development'] as const) {
      const url = guestLinkUrl(variant, link)
      expect(url.split('#')[0]).not.toContain(toB64u(linkSecret))
      const parsed = parseGuestLinkUrl(url)
      expect(parsed?.variant).toBe(variant)
      expect(parsed?.spaceId).toBe(spaceId)
      expect(parsed?.linkId).toBe(linkId)
      expect(toB64u(parsed!.linkSecret)).toBe(toB64u(linkSecret))
    }
  })

  it('parse the fragment with or without its #', () => {
    const fragment = guestLinkFragment({ spaceId, linkId, linkSecret })
    for (const text of [fragment, `#${fragment}`]) {
      const parsed = parseGuestLinkFragment(text)
      expect(parsed && toB64u(parsed.linkSecret)).toBe(toB64u(linkSecret))
    }
  })

  it('refuse anything that isn’t a v1 link on a known host and path', () => {
    const fragment = guestLinkFragment({ spaceId, linkId, linkSecret })
    const secret = toB64u(linkSecret)
    const bad = [
      `https://witnesswork.app/territories/guest#${fragment}`,
      `https://app.witnesswork.app/t/guest#${fragment}`,
      `http://app.witnesswork.app/territories/guest#${fragment}`,
      `https://app.witnesswork.app/territories/guest`,
      `https://app.witnesswork.app/territories/guest#v2.${spaceId}.${linkId}.${secret}`,
      `https://app.witnesswork.app/territories/guest#v1.${spaceId}.${linkId}`,
      `https://app.witnesswork.app/territories/guest#v1.${spaceId}.${linkId}.${secret}.x`,
      `https://app.witnesswork.app/territories/guest#v1.${spaceId}.${linkId}.${secret.slice(1)}`,
      `https://app.witnesswork.app/territories/guest#v1.short.${linkId}.${secret}`,
    ]
    for (const url of bad) expect(parseGuestLinkUrl(url), url).toBeNull()
    expect(
      parseGuestLinkUrl(
        `https://app.witnesswork.app/territories/guest/?utm=x#${fragment}`
      )?.variant
    ).toBe('production')
  })
})
