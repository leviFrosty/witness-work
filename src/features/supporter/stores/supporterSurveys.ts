import { create } from 'zustand'
import type { Survey } from 'posthog-react-native'
import { surveyClient } from '@/lib/analytics'
import { closeSurvey, seenSurveys } from '@/lib/surveySdk'

export type SurveyInvite = { survey: Survey; matchedKey: string | null }

type SupporterSurveysState = {
  seen: string[]

  invite: SurveyInvite | null

  opened: SurveyInvite | null
}

export const useSupporterSurveys = create<SupporterSurveysState>(() => ({
  seen: [],
  invite: null,
  opened: null,
}))

export function openSupporterSurvey(invite: SurveyInvite) {
  useSupporterSurveys.setState({ opened: invite })
}

export function finishSupporterSurvey(survey: Survey, submitted: boolean) {
  if (!surveyClient) return
  closeSurvey(surveyClient, survey, submitted)
  useSupporterSurveys.setState({
    seen: seenSurveys(surveyClient),
    opened: null,
  })
}
