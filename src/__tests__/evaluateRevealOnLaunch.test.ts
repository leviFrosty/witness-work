import { describe, it, expect } from 'vitest'
import { evaluateRevealOnLaunch } from '@/features/updates/lib/evaluateRevealOnLaunch'

const baseInput = {
  currentVersion: '1.38.2',
  lastAppVersion: '1.37.0',
  milestoneRevealVersion: '1.38.2',
  seenMilestoneUpdateReveal: false,
  dismissedMilestoneRevealOnce: false,
  hasReleaseNotesBetween: true,
} as const

describe('evaluateRevealOnLaunch', () => {
  it('returns "none" when currentVersion is missing (fresh install before Constants resolves)', () => {
    const action = evaluateRevealOnLaunch({
      ...baseInput,
      currentVersion: null,
    })
    expect(action).toBe('none')
  })

  it('returns "none" when lastAppVersion is missing (very first launch before stamp lands)', () => {
    const action = evaluateRevealOnLaunch({
      ...baseInput,
      lastAppVersion: null,
    })
    expect(action).toBe('none')
  })

  it('suppresses every intro with "stamp-only" when crossing the Reveal version but the milestone showcase was already seen', () => {
    const action = evaluateRevealOnLaunch({
      ...baseInput,
      lastAppVersion: '1.37.0',
      currentVersion: '1.38.2',
      milestoneRevealVersion: '1.38.2',
      seenMilestoneUpdateReveal: true,
      dismissedMilestoneRevealOnce: false,
    })
    expect(action).toBe('stamp-only')
  })

  it('suppresses every intro with "stamp-only" when crossing and the overlay was skipped (recovery icon path)', () => {
    const action = evaluateRevealOnLaunch({
      ...baseInput,
      lastAppVersion: '1.37.0',
      currentVersion: '1.38.2',
      milestoneRevealVersion: '1.38.2',
      seenMilestoneUpdateReveal: false,
      dismissedMilestoneRevealOnce: true,
    })
    expect(action).toBe('stamp-only')
  })

  it('fires the milestone reveal when crossing the Reveal version on a fresh first sighting', () => {
    const action = evaluateRevealOnLaunch({
      ...baseInput,
      lastAppVersion: '1.37.0',
      currentVersion: '1.38.2',
      milestoneRevealVersion: '1.38.2',
      seenMilestoneUpdateReveal: false,
      dismissedMilestoneRevealOnce: false,
    })
    expect(action).toBe('milestone-reveal')
  })

  it('shows WhatsNewSheet on a normal version bump (no Reveal crossing) with release notes between', () => {
    const action = evaluateRevealOnLaunch({
      ...baseInput,
      lastAppVersion: '1.39.0',
      currentVersion: '1.39.1',
      milestoneRevealVersion: '1.38.2',
      hasReleaseNotesBetween: true,
    })
    expect(action).toBe('whats-new')
  })

  it('returns "none" when the version did not change at all', () => {
    const action = evaluateRevealOnLaunch({
      ...baseInput,
      lastAppVersion: '1.39.1',
      currentVersion: '1.39.1',
      milestoneRevealVersion: '1.38.2',
      hasReleaseNotesBetween: false,
    })
    expect(action).toBe('none')
  })

  it('returns "none" on a version bump that has no release notes between (silent patch)', () => {
    const action = evaluateRevealOnLaunch({
      ...baseInput,
      lastAppVersion: '1.39.0',
      currentVersion: '1.39.1',
      milestoneRevealVersion: '1.38.2',
      hasReleaseNotesBetween: false,
    })
    expect(action).toBe('none')
  })
})
