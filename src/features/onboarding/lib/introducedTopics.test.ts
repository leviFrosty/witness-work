import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = vi.hoisted(() => {
  const state = {
    onboardingIntroduced: [] as string[],
    set: (patch: { onboardingIntroduced: string[] }) =>
      Object.assign(state, patch),
  }
  return state
})

vi.mock('@/stores/preferences', () => ({
  usePreferences: { getState: () => store },
}))

import { introducedTopic, markIntroduced } from './introducedTopics'

describe('introducedTopic', () => {
  it('maps the tour pages and setup steps that cover Schedule topics', () => {
    expect(introducedTopic('plan')).toBe('plan')
    expect(introducedTopic('planMonth')).toBe('plan')
    expect(introducedTopic('buddies')).toBe('buddies')
  })

  it('ignores everything else', () => {
    expect(introducedTopic('track')).toBeNull()
    expect(introducedTopic('notifications')).toBeNull()
  })
})

describe('markIntroduced', () => {
  beforeEach(() => {
    store.onboardingIntroduced = []
  })

  it('records each topic once', () => {
    markIntroduced('plan')
    markIntroduced('buddies')
    markIntroduced('plan')
    expect(store.onboardingIntroduced).toEqual(['plan', 'buddies'])
  })
})
