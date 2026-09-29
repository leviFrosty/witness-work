import { create } from 'zustand'
import type { Survey } from 'posthog-react-native'
import { surveyClient } from '@/lib/analytics'
import { closeSurvey, seenSurveys } from '@/lib/surveySdk'

export type SurveyInvite = { survey: Survey; matchedKey: string | null }

type SupporterSurveysState = {
  /** Survey iteration keys already answered or dismissed on this device. */
  seen: string[]
  /** The feedback survey the User is invited to, shown in the tray. */
  invite: SurveyInvite | null
  /** The invite being answered in the survey modal. */
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

/** Records the survey as seen, so each iteration is only offered once. */
export function finishSupporterSurvey(survey: Survey, submitted: boolean) {
  if (!surveyClient) return
  closeSurvey(surveyClient, survey, submitted)
  useSupporterSurveys.setState({
    seen: seenSurveys(surveyClient),
    opened: null,
  })
}
