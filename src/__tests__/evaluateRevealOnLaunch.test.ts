import { describe, it, expect } from 'vitest'
import {
  evaluateRevealOnLaunch,
  getReleaseAnnounceBetween,
} from '@/features/updates/lib/evaluateRevealOnLaunch'

const baseInput = {
  currentVersion: '1.38.2',
  lastAppVersion: '1.37.0',
  revealVersion: '1.38.2',
  revealEngaged: false,
  releaseAnnounce: 'passive',
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

  it('suppresses every intro with "stamp-only" when crossing the Reveal version but the reveal was already engaged', () => {
    const action = evaluateRevealOnLaunch({
      ...baseInput,
      lastAppVersion: '1.37.0',
      currentVersion: '1.38.2',
      revealVersion: '1.38.2',
      revealEngaged: true,
    })
    expect(action).toBe('stamp-only')
  })

  it('plays the update reveal when crossing the Reveal version on a fresh first sighting', () => {
    const action = evaluateRevealOnLaunch({
      ...baseInput,
      lastAppVersion: '1.37.0',
      currentVersion: '1.38.2',
      revealVersion: '1.38.2',
      revealEngaged: false,
    })
    expect(action).toBe('update-reveal')
  })

  it('plays the update reveal when jumping past the Reveal version', () => {
    const action = evaluateRevealOnLaunch({
      ...baseInput,
      lastAppVersion: '1.43.0',
      currentVersion: '2.0.0',
      revealVersion: '1.44.0',
    })
    expect(action).toBe('update-reveal')
  })

  it('does not replay the update reveal on later updates', () => {
    const action = evaluateRevealOnLaunch({
      ...baseInput,
      lastAppVersion: '1.44.0',
      currentVersion: '1.44.1',
      revealVersion: '1.44.0',
      releaseAnnounce: 'passive',
    })
    expect(action).toBe('whats-new-card')
  })

  it("shows the passive What's New card on a normal version bump with passive release notes between", () => {
    const action = evaluateRevealOnLaunch({
      ...baseInput,
      lastAppVersion: '1.39.0',
      currentVersion: '1.39.1',
      revealVersion: '1.38.2',
      releaseAnnounce: 'passive',
    })
    expect(action).toBe('whats-new-card')
  })

  it('shows WhatsNewSheet when a release between is announced as a sheet', () => {
    const action = evaluateRevealOnLaunch({
      ...baseInput,
      lastAppVersion: '1.39.0',
      currentVersion: '1.40.0',
      revealVersion: '1.38.2',
      releaseAnnounce: 'sheet',
    })
    expect(action).toBe('whats-new')
  })

  it('only stamps when every release between is silent', () => {
    const action = evaluateRevealOnLaunch({
      ...baseInput,
      lastAppVersion: '1.39.0',
      currentVersion: '1.39.1',
      revealVersion: '1.38.2',
      releaseAnnounce: 'silent',
    })
    expect(action).toBe('stamp-only')
  })

  it('returns "none" when the version did not change at all', () => {
    const action = evaluateRevealOnLaunch({
      ...baseInput,
      lastAppVersion: '1.39.1',
      currentVersion: '1.39.1',
      revealVersion: '1.38.2',
      releaseAnnounce: null,
    })
    expect(action).toBe('none')
  })

  it('only stamps on a version bump that has no release notes between', () => {
    const action = evaluateRevealOnLaunch({
      ...baseInput,
      lastAppVersion: '1.39.0',
      currentVersion: '1.39.1',
      revealVersion: '1.38.2',
      releaseAnnounce: null,
    })
    expect(action).toBe('stamp-only')
  })
})

describe('getReleaseAnnounceBetween', () => {
  const notes = [
    { version: '1.40.0', announce: 'sheet' as const },
    { version: '1.39.2' },
    { version: '1.39.1', announce: 'silent' as const },
    { version: '1.39.0', announce: 'sheet' as const },
  ]

  it('returns null when no release falls in (last, current]', () => {
    expect(getReleaseAnnounceBetween(notes, '1.40.0', '1.40.1')).toBeNull()
  })

  it('excludes the last seen version and includes the current one', () => {
    expect(getReleaseAnnounceBetween(notes, '1.39.0', '1.39.1')).toBe('silent')
  })

  it('treats releases without an explicit level as passive', () => {
    expect(getReleaseAnnounceBetween(notes, '1.39.0', '1.39.2')).toBe('passive')
  })

  it('picks the loudest level across every unseen release', () => {
    expect(getReleaseAnnounceBetween(notes, '1.39.0', '1.40.0')).toBe('sheet')
  })
})
