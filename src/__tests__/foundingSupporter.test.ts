import { describe, it, expect } from 'vitest'
import {
  FOUNDING_SUPPORTER_CUTOFF,
  isFoundingSupporter,
} from '@/lib/foundingSupporter'

describe('isFoundingSupporter', () => {
  it('returns false for a non-Supporter (no since date)', () => {
    expect(isFoundingSupporter(null)).toBe(false)
  })

  it('returns true for a Supporter since before the Supporter tier launched', () => {
    expect(isFoundingSupporter(new Date('2025-03-15T00:00:00Z'))).toBe(true)
  })

  it('returns false for a Supporter who joined on or after the cutoff', () => {
    expect(isFoundingSupporter(FOUNDING_SUPPORTER_CUTOFF)).toBe(false)
    expect(isFoundingSupporter(new Date('2026-08-01T00:00:00Z'))).toBe(false)
  })

  it('treats the instant just before the cutoff as founding', () => {
    expect(
      isFoundingSupporter(new Date(FOUNDING_SUPPORTER_CUTOFF.getTime() - 1))
    ).toBe(true)
  })
})
