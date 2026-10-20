import { describe, expect, it } from 'vitest'
import {
  passesRestoreStep,
  reachedStep,
  resumedRestoreOffer,
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
  restoreOffered: false,
  calendarAvailable: true,
  ...overrides,
})

const ids = (c: StepShowIfContext) => visibleOnboardingSteps(c).map((s) => s.id)

describe('visibleOnboardingSteps', () => {
  it('asks a publisher no maps, report-method or Buddies question', () => {
    expect(ids(ctx('publisher'))).toEqual([
      'hero',
      'featureTour',
      'publisherType',
      'dataProtection',
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
      'publisherType',
      'pioneerDate',
      'planMonth',
      'dataProtection',
      'notifications',
      'calendarSync',
      'onboardingBackfill',
      'profileSetup',
      'founderNote',
    ])
  })

  it('offers the restore step after the tour when there is something to restore', () => {
    expect(ids(ctx('publisher', { restoreOffered: true })).slice(0, 4)).toEqual(
      ['hero', 'featureTour', 'pickUpWhereLeftOff', 'publisherType']
    )
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

  it('resumes on the restore step when it was open', () => {
    const c = ctx('publisher', {
      restoreOffered: resumedRestoreOffer('pickUpWhereLeftOff', false) ?? false,
    })
    expect(resume('pickUpWhereLeftOff', c)).toBe('pickUpWhereLeftOff')
  })

  it('resumes on what follows the restore step when it is left out', () => {
    expect(resume('pickUpWhereLeftOff', ctx('publisher'))).toBe('publisherType')
  })
})

describe('resumedRestoreOffer', () => {
  it('stays open until the user is past the tour', () => {
    expect(resumedRestoreOffer(null, false)).toBeNull()
    expect(resumedRestoreOffer('hero', false)).toBeNull()
    expect(resumedRestoreOffer('featureTour', false)).toBeNull()
  })

  it('keeps the step for someone on it, and leaves it out behind anyone past it', () => {
    expect(resumedRestoreOffer('pickUpWhereLeftOff', false)).toBe(true)
    expect(resumedRestoreOffer('publisherType', false)).toBe(false)
    expect(resumedRestoreOffer('buddies', false)).toBe(false)
  })

  it('keeps it for retired steps that resume on it', () => {
    expect(resumedRestoreOffer('privacyFirst', false)).toBe(true)
    expect(resumedRestoreOffer('founderNote', false)).toBe(true)
    expect(resumedRestoreOffer('founderNote', true)).toBe(false)
  })
})

describe('passesRestoreStep', () => {
  it('settles when leaving the tour, not the welcome', () => {
    expect(passesRestoreStep('featureTour')).toBe(false)
    expect(passesRestoreStep('pickUpWhereLeftOff')).toBe(true)
    expect(passesRestoreStep('publisherType')).toBe(true)
  })
})

describe('retired step ids', () => {
  const resume = (
    saved: string,
    c: StepShowIfContext,
    hasCompletedProfileSetup = false
  ) => {
    // As onboarding does: a retired step that resumes on the restore step
    // keeps it in the flow.
    const visible = visibleOnboardingSteps({
      ...c,
      restoreOffered:
        resumedRestoreOffer(saved, hasCompletedProfileSetup) ?? false,
    })
    return visible[resumeStepIndex(saved, visible, hasCompletedProfileSetup)]
      ?.id
  }

  it.each([
    ['privacyFirst', 'pickUpWhereLeftOff'],
    ['intentPicker', 'pioneerDate'],
    ['yourPlanPreview', 'planMonth'],
    ['badges', 'notifications'],
    ['buddies', 'notifications'],
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
    'counts a saved %s as past notifications',
    (saved) => {
      expect(reachedStep(saved, 'notifications', false)).toBe(true)
    }
  )

  it.each(['privacyFirst', 'intentPicker', 'yourPlanPreview'])(
    'counts a saved %s as before notifications',
    (saved) => {
      expect(reachedStep(saved, 'notifications', false)).toBe(false)
    }
  )

  it('counts a saved Buddies step as past the restore step', () => {
    expect(reachedStep('buddies', 'pickUpWhereLeftOff', false)).toBe(true)
  })
})
