import { describe, expect, it, vi } from 'vitest'
import {
  PostHogPersistedProperty,
  SurveySchedule,
  SurveyType,
} from '@posthog/core'
import type { PostHog, Survey } from 'posthog-react-native'
import {
  closeSurvey,
  seenSurveys,
  surveyAvailable,
} from '@/features/supporter/lib/surveySdk'

vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))

vi.mock('posthog-react-native', async () => ({
  PostHogPersistedProperty: (await import('@posthog/core'))
    .PostHogPersistedProperty,
}))
const survey: Survey = {
  id: 'survey',
  name: 'Feedback',
  type: SurveyType.API,
  questions: [],
  start_date: '2026-09-01',
  internal_targeting_flag_key: 'eligible',
}
function client() {
  const data = new Map<string, unknown>()
  return {
    capture: vi.fn(),
    getPersistedProperty: (key: string) => data.get(key),
    setPersistedProperty: (key: string, value: unknown) => data.set(key, value),
  } as unknown as PostHog
}

describe('PostHog invitation adapter', () => {
  it('requires a launched campaign and resolved targeting', () => {
    expect(surveyAvailable(survey, {}, [])).toBe(false)
    expect(
      surveyAvailable(
        { ...survey, start_date: undefined },
        { eligible: true },
        []
      )
    ).toBe(false)
    expect(
      surveyAvailable(
        { ...survey, end_date: '2026-09-16' },
        { eligible: true },
        []
      )
    ).toBe(false)
    expect(surveyAvailable(survey, { eligible: true }, [])).toBe(true)
  })
  it('persists dismissal using SDK keys and tells PostHog without sending text', () => {
    const sdk = client()
    closeSurvey(sdk, survey, false)
    expect(surveyAvailable(survey, { eligible: true }, seenSurveys(sdk))).toBe(
      false
    )
    expect(sdk.capture).toHaveBeenCalledWith('survey dismissed', {
      $survey_id: 'survey',
      $survey_name: 'Feedback',
      $survey_partially_completed: false,
      $set: { '$survey_dismissed/survey': true },
    })
  })
  it('does not duplicate submission events already sent by the SDK modal', () => {
    const sdk = client()
    closeSurvey(sdk, survey, true)
    expect(sdk.capture).not.toHaveBeenCalled()
    expect(surveyAvailable(survey, { eligible: true }, seenSurveys(sdk))).toBe(
      false
    )
  })
  it('uses PostHog repeat and iteration rules instead of a custom cooldown', () => {
    const sdk = client()
    closeSurvey(sdk, survey, false)
    expect(
      surveyAvailable(
        { ...survey, current_iteration: 1 },
        { eligible: true },
        seenSurveys(sdk)
      )
    ).toBe(true)
    expect(
      surveyAvailable(
        { ...survey, schedule: SurveySchedule.Always },
        {},
        seenSurveys(sdk)
      )
    ).toBe(true)
  })
  it('honors additional targeting flags and flag variants', () => {
    const targeted = {
      ...survey,
      linked_flag_key: 'audience',
      conditions: { linkedFlagVariant: 'test' },
    }
    expect(
      surveyAvailable(targeted, { eligible: true, audience: 'control' }, [])
    ).toBe(false)
    expect(
      surveyAvailable(targeted, { eligible: true, audience: 'test' }, [])
    ).toBe(true)
  })
  it('keeps repeat campaigns subject to audience and additional flags', () => {
    const repeating = {
      ...survey,
      schedule: SurveySchedule.Always,
      targeting_flag_key: 'audience',
      feature_flag_keys: [{ key: 'Feature', value: 'feature' }],
    }
    expect(surveyAvailable(repeating, { audience: true }, ['survey'])).toBe(
      false
    )
    expect(surveyAvailable(repeating, { feature: true }, ['survey'])).toBe(
      false
    )
    expect(
      surveyAvailable(repeating, { audience: true, feature: true }, ['survey'])
    ).toBe(true)
  })
  it('requires a linked flag for a specific variant but accepts any enabled variant', () => {
    expect(
      surveyAvailable(
        { ...survey, conditions: { linkedFlagVariant: 'test' } },
        { eligible: true },
        []
      )
    ).toBe(false)
    expect(
      surveyAvailable(
        {
          ...survey,
          linked_flag_key: 'audience',
          conditions: { linkedFlagVariant: 'any' },
        },
        { eligible: true, audience: 'control' },
        []
      )
    ).toBe(true)
  })
  it('excludes automatic popovers from custom invitations', () => {
    expect(
      surveyAvailable(
        { ...survey, type: SurveyType.Popover },
        { eligible: true },
        []
      )
    ).toBe(false)
  })
  it('ignores malformed persisted state', () => {
    const sdk = client()
    sdk.setPersistedProperty(PostHogPersistedProperty.SurveysSeen, 'bad json')
    expect(seenSurveys(sdk)).toEqual([])
  })
})
