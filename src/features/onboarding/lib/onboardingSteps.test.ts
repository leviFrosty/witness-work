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
  notificationsAvailable: true,
  ...overrides,
})

const ids = (c: StepShowIfContext) => visibleOnboardingSteps(c).map((s) => s.id)

describe('visibleOnboardingSteps', () => {
  it('asks a publisher whether to log hours, and for maps but not a report method', () => {
    expect(ids(ctx('publisher'))).toEqual([
      'hero',
      'featureTour',
      'pickUpWhereLeftOff',
      'publisherType',
      'hoursLogging',
      'dataProtection',
      'buddies',
      'notifications',
      'calendarSync',
      'defaultNav',
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
      'defaultNav',
      'onboardingBackfill',
      'profileSetup',
      'founderNote',
    ])
  })

  it('keeps the hours question in place once a publisher says yes', () => {
    const yes = ids(ctx('publisher', { logsHours: true }))
    expect(yes.indexOf('hoursLogging')).toBe(yes.indexOf('publisherType') + 1)
    expect(yes).not.toContain('planMonth')
  })

  it('plans the month for a publisher logging hours toward a goal', () => {
    const steps = ids(
      ctx('publisher', {
        logsHours: true,
        publisherHours: { ...ctx('publisher').publisherHours, publisher: 10 },
      })
    )
    expect(steps.indexOf('planMonth')).toBe(steps.indexOf('hoursLogging') + 1)
  })

  it('never asks an hours-mode role whether to log hours', () => {
    expect(ids(ctx('regularAuxiliary'))).not.toContain('hoursLogging')
    expect(ids(ctx('custom'))).not.toContain('hoursLogging')
  })

  it('drops the backfill step for a September install', () => {
    expect(
      ids(ctx('regularPioneer', { installedOn: new Date(2026, 8, 3) }))
    ).not.toContain('onboardingBackfill')
  })
})

describe('the notifications step', () => {
  it('shows only where the device has notifications', () => {
    const ids = (available: boolean) =>
      visibleOnboardingSteps(
        ctx('publisher', { notificationsAvailable: available })
      ).map((step) => step.id)
    expect(ids(true)).toContain('notifications')
    expect(ids(false)).not.toContain('notifications')
  })
})

describe('resumeStepIndex', () => {
  const resume = (saved: string | null, c: StepShowIfContext) => {
    const visible = visibleOnboardingSteps(c)
    return visible[resumeStepIndex(saved, visible, false)]?.id
  }

  it('resumes a saved defaultExportMethod on the backfill step when it shows', () => {
    expect(resume('defaultExportMethod', ctx('regularPioneer'))).toBe(
      'onboardingBackfill'
    )
  })

  it('resumes a saved defaultExportMethod on the name step when backfill is hidden', () => {
    expect(resume('defaultExportMethod', ctx('publisher'))).toBe('profileSetup')
  })

  it('resumes a saved defaultNav on the maps step', () => {
    expect(resume('defaultNav', ctx('publisher'))).toBe('defaultNav')
  })

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

  it('counts a saved defaultExportMethod as past Buddies, so its answer holds', () => {
    expect(reachedStep('defaultExportMethod', 'buddies', false)).toBe(true)
  })

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
    expect(resume('defaultExportMethod', withoutBuddies)).toBe(
      'onboardingBackfill'
    )
  })
})
