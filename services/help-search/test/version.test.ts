import { describe, expect, it } from 'vitest'
import { encodeVersion } from '../src/version'

describe('encodeVersion', () => {
  it('encodes major, minor and patch', () => {
    expect(encodeVersion('4.12.3')).toBe(4_012_003)
    expect(encodeVersion('0.0.1')).toBe(1)
    expect(encodeVersion('10.0.0')).toBe(10_000_000)
  })
  it('treats a missing patch as 0', () => {
    expect(encodeVersion('4.12')).toBe(4_012_000)
  })
  it('orders like semver', () => {
    expect(encodeVersion('4.9.99')!).toBeLessThan(encodeVersion('4.10.0')!)
  })
  it('rejects anything else', () => {
    for (const bad of [
      '',
      '4',
      '4.x.0',
      '1.2.3.4',
      '1.2.3-beta',
      '1000.0.0',
      'v1.2.3',
    ])
      expect(encodeVersion(bad)).toBeNull()
  })
})
