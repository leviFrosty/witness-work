import { describe, expect, it } from 'vitest'
import { shortLink } from '@/features/territories/lib/shortLink'

describe('shortLink', () => {
  it('keeps the host and the end of the link', () => {
    expect(
      shortLink(
        `https://app.witnesswork.app/territories/guest#v1.${'a'.repeat(22)}.${'b'.repeat(22)}.${'c'.repeat(39)}wxyz`
      )
    ).toBe('app.witnesswork.app/…ccwxyz')
  })

  it('leaves a short address whole', () => {
    expect(shortLink('https://example.org/a#short')).toBe('example.org/a#short')
  })
})
