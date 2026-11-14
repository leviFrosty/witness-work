import React from 'react'
import { act, create } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => {
  vi.stubGlobal('__DEV__', false)
  return {
    surveys: [] as unknown[],
    flags: {} as Record<string, boolean>,
    seen: [] as string[],
    client: null as null | Record<string, ReturnType<typeof vi.fn>>,
    finishSupporterSurvey: vi.fn(),
  }
})

vi.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-US' }],
}))
vi.mock('posthog-react-native', () => ({
  PostHogPersistedProperty: { SurveyLastSeenDate: 'survey_last_seen_date' },
}))
vi.mock('@posthog/core/surveys', () => ({
  applySurveyTranslation: (survey: unknown, language: string) => ({
    survey,
    matchedKey: language,
  }),
}))
vi.mock('@/lib/analytics', () => ({
  get surveyClient() {
    return runtime.client
  },
}))
vi.mock('@/lib/locales', () => ({
  handleLangFallback: (locale: string) => ({ locale }),
}))
vi.mock('@/lib/surveySdk', () => ({
  seenSurveys: () => runtime.seen,
  surveyAvailable: (
    survey: { start_date?: string },
    _flags: unknown,
    seen: string[]
  ) => !!survey.start_date && !seen.includes('lapse'),
  surveyEventProperties: (survey: { id: string }) => ({
    $survey_id: survey.id,
  }),
}))
vi.mock('@/stores/preferences', () => ({
  usePreferences: () => ({ locale: 'en' }),
}))
vi.mock('@/features/supporter/lib/supporterSurvey', () => ({
  LAPSE_SURVEY_ID: 'lapse',
}))
vi.mock('@/features/supporter/stores/supporterSurveys', () => ({
  finishSupporterSurvey: runtime.finishSupporterSurvey,
}))

import useCancelSurvey, {
  type CancelSurvey,
} from '@/features/supporter/hooks/useCancelSurvey'

const lapse = { id: 'lapse', start_date: '2026-09-25' }

let result: CancelSurvey
const capture = (next: CancelSurvey) => {
  result = next
}
const Harness = ({ open }: { open: boolean }) => {
  capture(useCancelSurvey(open))
  return null
}
const render = async (open = true) => {
  await act(async () => {
    create(<Harness open={open} />)
  })
}

describe('useCancelSurvey', () => {
  beforeEach(() => {
    runtime.surveys = [lapse, { id: 'other', start_date: '2026-01-01' }]
    runtime.seen = []
    runtime.client = {
      ready: vi.fn(() => Promise.resolve()),
      _onSurveysReady: vi.fn(() => Promise.resolve()),
      getSurveys: vi.fn(() => Promise.resolve(runtime.surveys)),
      getFeatureFlags: vi.fn(() => runtime.flags),
      registerForSession: vi.fn(),
      unregisterForSession: vi.fn(),
      capture: vi.fn(),
      setPersistedProperty: vi.fn(),
    }
  })
  afterEach(() => vi.clearAllMocks())

  it('offers the lapse feedback survey while the sheet is open', async () => {
    await render()
    expect(result.available).toBe(true)
  })

  it('does not look for it while the sheet is closed', async () => {
    await render(false)
    expect(runtime.client!.getSurveys).not.toHaveBeenCalled()
    expect(result.available).toBe(false)
  })

  it('stays hidden once the survey was already answered or dismissed', async () => {
    runtime.seen = ['lapse']
    await render()
    expect(result.available).toBe(false)
  })

  it('stays hidden without a survey client', async () => {
    runtime.client = null
    await render()
    expect(result.available).toBe(false)
  })

  it('tags the responses as coming from cancel, then thanks the Supporter', async () => {
    await render()
    act(() => result.open())
    expect(runtime.client!.registerForSession).toHaveBeenCalledWith({
      survey_source: 'manage_cancel',
    })
    expect(result.opened).toEqual({ survey: lapse, matchedKey: 'en' })

    act(() => result.shown())
    act(() => result.shown())
    expect(runtime.client!.capture).toHaveBeenCalledOnce()
    expect(runtime.client!.capture).toHaveBeenCalledWith('survey shown', {
      $survey_id: 'lapse',
    })

    act(() => result.finish(true))
    expect(runtime.client!.unregisterForSession).toHaveBeenCalledWith(
      'survey_source'
    )
    expect(runtime.finishSupporterSurvey).toHaveBeenCalledWith(lapse, true)
    expect(result).toMatchObject({ opened: null, sent: true, available: false })
  })

  it('drops the row without thanks when the survey is dismissed', async () => {
    await render()
    act(() => result.open())
    act(() => result.finish(false))
    expect(runtime.finishSupporterSurvey).toHaveBeenCalledWith(lapse, false)
    expect(result).toMatchObject({ sent: false, available: false })
  })
})
