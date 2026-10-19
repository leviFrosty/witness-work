import { describe, expect, it } from 'vitest'
import {
  reachedStep,
  resumeStepIndex,
  type StepShowIfContext,
  visibleOnboardingSteps,
} from '@/features/onboarding/lib/onboardingSteps'
import type { Publisher } from '@/types/publisher'

const ctx = (
  publisher: Publisher,
  overrides: Partial<StepShowIfContext> = {}
): StepShowIfContext => ({
  publisher,
  publisherHours: {
    publisher: 0,
    regularAuxiliary: 30,
    regularPioneer: 50,
    circuitOverseer: 50,
    specialPioneer: 100,
    custom: 50,
  },
  logsHours: false,
  // Mid-service-year install, so annual-goal roles see the backfill step.
  installedOn: new Date(2026, 1, 10),
  userSpecifiedHasAnnualGoal: 'default',
  hasCatchUpReports: false,
  buddiesAvailable: true,
  calendarAvailable: true,
  ...overrides,
})

const ids = (c: StepShowIfContext) => visibleOnboardingSteps(c).map((s) => s.id)

describe('visibleOnboardingSteps', () => {
  it('asks a publisher no maps or report-method question', () => {
    expect(ids(ctx('publisher'))).toEqual([
      'hero',
      'featureTour',
      'pickUpWhereLeftOff',
      'publisherType',
      'dataProtection',
      'buddies',
      'notifications',
      'calendarSync',
      'profileSetup',
      'founderNote',
    ])
  })

  it('adds tenure, planning, and backfill for a mid-year regular pioneer', () => {
    expect(ids(ctx('regularPioneer'))).toEqual([
      'hero',
      'featureTour',
      'pickUpWhereLeftOff',
      'publisherType',
      'pioneerDate',
      'planMonth',
      'dataProtection',
      'buddies',
      'notifications',
      'calendarSync',
      'onboardingBackfill',
      'profileSetup',
      'founderNote',
    ])
  })

  it('drops the backfill step for a September install', () => {
    expect(
      ids(ctx('regularPioneer', { installedOn: new Date(2026, 8, 3) }))
    ).not.toContain('onboardingBackfill')
  })
})

describe('resumeStepIndex', () => {
  const resume = (saved: string | null, c: StepShowIfContext) => {
    const visible = visibleOnboardingSteps(c)
    return visible[resumeStepIndex(saved, visible, false)]?.id
  }

  it.each(['defaultNav', 'defaultExportMethod'])(
    'resumes a saved %s on the backfill step when it shows',
    (saved) => {
      expect(resume(saved, ctx('regularPioneer'))).toBe('onboardingBackfill')
    }
  )

  it.each(['defaultNav', 'defaultExportMethod'])(
    'resumes a saved %s on the name step when backfill is hidden',
    (saved) => {
      expect(resume(saved, ctx('publisher'))).toBe('profileSetup')
    }
  )

  it('starts at the beginning with nothing saved', () => {
    expect(resume(null, ctx('publisher'))).toBe('hero')
  })

  it('resumes on a step that still exists', () => {
    expect(resume('notifications', ctx('publisher'))).toBe('notifications')
  })
})

describe('retired step ids', () => {
  const resume = (
    saved: string,
    c: StepShowIfContext,
    hasCompletedProfileSetup = false
  ) => {
    const visible = visibleOnboardingSteps(c)
    return visible[resumeStepIndex(saved, visible, hasCompletedProfileSetup)]
      ?.id
  }

  it.each([
    ['privacyFirst', 'pickUpWhereLeftOff'],
    ['intentPicker', 'pioneerDate'],
    ['yourPlanPreview', 'planMonth'],
    ['badges', 'notifications'],
    ['defaultNav', 'onboardingBackfill'],
    ['defaultExportMethod', 'onboardingBackfill'],
    ['supporter', 'founderNote'],
  ])('resumes a saved %s on %s', (saved, expected) => {
    expect(resume(saved, ctx('regularPioneer'))).toBe(expected)
  })

  it('resumes an early founder note before personalizing, a late one in place', () => {
    expect(resume('founderNote', ctx('publisher'))).toBe('pickUpWhereLeftOff')
    expect(resume('founderNote', ctx('publisher'), true)).toBe('founderNote')
  })

  it('resumes a plan preview on notifications when planning is hidden', () => {
    expect(resume('yourPlanPreview', ctx('publisher'))).toBe('notifications')
  })

  it.each(['defaultNav', 'defaultExportMethod'])(
    'counts a saved %s as past Buddies, so its answer holds',
    (saved) => {
      expect(reachedStep(saved, 'buddies', false)).toBe(true)
    }
  )

  it.each(['privacyFirst', 'intentPicker', 'yourPlanPreview'])(
    'counts a saved %s as before Buddies',
    (saved) => {
      expect(reachedStep(saved, 'buddies', false)).toBe(false)
    }
  )

  it('keeps the backfill step when Buddies drops out after resuming', () => {
    // The answer is held once reached, so Buddies can't vanish beneath the
    // resumed index; if it did, the saved id would still resume on backfill.
    const withoutBuddies = ctx('regularPioneer', { buddiesAvailable: false })
    expect(resume('defaultNav', withoutBuddies)).toBe('onboardingBackfill')
  })
})
