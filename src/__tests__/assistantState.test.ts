import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/logger', () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import {
  appendAssistantEventCapped,
  computeRecommendationInputsHash,
} from '@/lib/assistantState'
import type { AssistantEvent } from '@/lib/assistantRecommendation'

describe('computeRecommendationInputsHash', () => {
  const base = {
    loggedAdjustedMinutes: 600,
    dayPlanFingerprints: ['2026-05-15:120', '2026-05-20:120'],
    recurringPlanFingerprints: ['rp-1:weekly'],
    conversationDayKeys: ['2026-05-18'],
    offDays: [0, 6] as number[],
    meetingDays: [3] as number[],
  }

  it('is stable for the same inputs', () => {
    expect(computeRecommendationInputsHash(base)).toBe(
      computeRecommendationInputsHash({ ...base })
    )
  })

  it('changes when logged minutes change', () => {
    expect(computeRecommendationInputsHash(base)).not.toBe(
      computeRecommendationInputsHash({ ...base, loggedAdjustedMinutes: 660 })
    )
  })

  it('changes when a plan is added', () => {
    expect(computeRecommendationInputsHash(base)).not.toBe(
      computeRecommendationInputsHash({
        ...base,
        dayPlanFingerprints: [...base.dayPlanFingerprints, '2026-05-25:60'],
      })
    )
  })

  it('changes when off days change', () => {
    expect(computeRecommendationInputsHash(base)).not.toBe(
      computeRecommendationInputsHash({ ...base, offDays: [0] })
    )
  })

  it('changes when meeting days change', () => {
    expect(computeRecommendationInputsHash(base)).not.toBe(
      computeRecommendationInputsHash({ ...base, meetingDays: [2] })
    )
  })

  it('hashes the same when meetingDays is omitted vs set to []', () => {
    const { meetingDays: _omit, ...withoutMeeting } = base
    expect(computeRecommendationInputsHash(withoutMeeting)).toBe(
      computeRecommendationInputsHash({
        ...withoutMeeting,
        meetingDays: [],
      })
    )
  })

  it('treats reordered fingerprints as the same set', () => {
    expect(computeRecommendationInputsHash(base)).toBe(
      computeRecommendationInputsHash({
        ...base,
        dayPlanFingerprints: ['2026-05-20:120', '2026-05-15:120'],
      })
    )
  })
})

describe('appendAssistantEventCapped', () => {
  const event = (i: number): AssistantEvent => ({
    shape: 'distributed',
    action: 'accepted',
    at: i,
  })

  it('appends a new event when under the cap', () => {
    const next = appendAssistantEventCapped([event(1), event(2)], event(3), 10)
    expect(next).toEqual([event(1), event(2), event(3)])
  })

  it('drops the oldest event when exceeding the cap', () => {
    const history = Array.from({ length: 10 }, (_, i) => event(i))
    const next = appendAssistantEventCapped(history, event(99), 10)
    expect(next).toHaveLength(10)
    expect(next[0]).toEqual(event(1))
    expect(next[next.length - 1]).toEqual(event(99))
  })
})
