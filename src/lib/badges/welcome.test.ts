import { describe, expect, it } from 'vitest'
import { welcomeAfterEvaluation } from '@/lib/badges/welcome'

const base = {
  firstPass: true,
  welcome: null,
  quiet: false,
  showBadges: true,
  historyCount: 3,
} as const

describe('welcomeAfterEvaluation', () => {
  it('welcomes a device whose first pass finds history', () => {
    expect(welcomeAfterEvaluation(base)).toBe('pending')
  })

  it('settles it for good when the first pass finds nothing', () => {
    expect(welcomeAfterEvaluation({ ...base, historyCount: 0 })).toBe('done')
  })

  it('never welcomes with badges hidden or while seeding', () => {
    expect(welcomeAfterEvaluation({ ...base, showBadges: false })).toBe('done')
    expect(welcomeAfterEvaluation({ ...base, quiet: true })).toBe('done')
  })

  it('leaves imports and restores to the summary card', () => {
    // Their first pass comes after the device's own, so the welcome is set.
    expect(welcomeAfterEvaluation({ ...base, welcome: 'done' })).toBeUndefined()
    expect(
      welcomeAfterEvaluation({ ...base, welcome: 'pending' })
    ).toBeUndefined()
  })

  it('does nothing after the first pass', () => {
    expect(
      welcomeAfterEvaluation({ ...base, firstPass: false })
    ).toBeUndefined()
  })
})
