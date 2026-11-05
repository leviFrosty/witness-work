import { describe, expect, it } from 'vitest'
import { stepDuration } from '@/features/service-reports/lib/durationInput'

describe('stepDuration', () => {
  it('moves by 15 minutes from a mark', () => {
    expect(stepDuration(0, 1)).toBe(15)
    expect(stepDuration(60, 1)).toBe(75)
    expect(stepDuration(60, -1)).toBe(45)
  })

  it('snaps an exact time to the next mark in that direction', () => {
    expect(stepDuration(110, 1)).toBe(120)
    expect(stepDuration(110, -1)).toBe(105)
  })

  it('stays within zero and the longest entry', () => {
    expect(stepDuration(0, -1)).toBe(0)
    expect(stepDuration(10, -1)).toBe(0)
    expect(stepDuration(99 * 60 + 50, 1)).toBe(99 * 60 + 59)
    expect(stepDuration(99 * 60 + 59, 1)).toBe(99 * 60 + 59)
  })
})
