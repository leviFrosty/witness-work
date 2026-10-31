import { describe, expect, it, vi } from 'vitest'

// vitest.setup.ts mocks this module for every other test.
vi.unmock('@/lib/appVariant')

vi.mock('expo-constants', () => ({
  default: { expoConfig: { extra: { appVariant: 'beta' } } },
}))

import { appVariant, toAppVariant } from '@/lib/appVariant'

describe('toAppVariant', () => {
  it('reads the three build variants', () => {
    expect(toAppVariant('development')).toBe('development')
    expect(toAppVariant('beta')).toBe('beta')
    expect(toAppVariant('production')).toBe('production')
  })

  it('treats anything else as production', () => {
    for (const value of [undefined, null, '', 'Development', 'staging', 1]) {
      expect(toAppVariant(value)).toBe('production')
    }
  })
})

describe('appVariant', () => {
  it("is this build's variant", () => {
    expect(appVariant).toBe('beta')
  })
})
