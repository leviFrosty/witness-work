import { useEffect, useRef, useState } from 'react'
import { getLocales } from 'expo-localization'
import { PostHogPersistedProperty, type Survey } from 'posthog-react-native'
import { applySurveyTranslation } from '@posthog/core/surveys'
import { surveyClient } from '@/lib/analytics'
import { handleLangFallback } from '@/lib/locales'
import {
  seenSurveys,
  surveyAvailable,
  surveyEventProperties,
} from '@/lib/surveySdk'
import { usePreferences } from '@/stores/preferences'
import { LAPSE_SURVEY_ID } from '@/features/supporter/lib/supporterSurvey'
import {
  finishSupporterSurvey,
  type SurveyInvite,
} from '@/features/supporter/stores/supporterSurveys'

export const CANCEL_SURVEY_SOURCE = 'manage_cancel'

export type CancelSurvey = {
  available: boolean
  sent: boolean
  opened: SurveyInvite | null
  open: () => void
  shown: () => void
  finish: (submitted: boolean) => void
}

const useCancelSurvey = (sheetOpen: boolean): CancelSurvey => {
  const { locale } = usePreferences()
  const [survey, setSurvey] = useState<Survey | null>(null)
  const [opened, setOpened] = useState<SurveyInvite | null>(null)
  const [sent, setSent] = useState(false)
  const shownRef = useRef(false)

  useEffect(() => {
    const client = surveyClient
    if (!sheetOpen || !client) return
    let cancelled = false
    setSent(false)
    void client
      .ready()
      .then(() => client._onSurveysReady())
      .then(() => client.getSurveys())
      .then((items) => {
        if (cancelled) return
        const flags = client.getFeatureFlags() ?? {}
        const seen = seenSurveys(client)
        setSurvey(
          items.find(
            (item) =>
              item.id === LAPSE_SURVEY_ID && surveyAvailable(item, flags, seen)
          ) ?? null
        )
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [sheetOpen])

  const open = () => {
    const client = surveyClient
    if (!survey || !client || opened) return
    const language = handleLangFallback(
      locale ?? getLocales()[0].languageTag.toLowerCase()
    ).locale
    client.registerForSession({ survey_source: CANCEL_SURVEY_SOURCE })
    shownRef.current = false
    setOpened(applySurveyTranslation(survey, language))
  }

  const shown = () => {
    const client = surveyClient
    if (!client || !opened || shownRef.current) return
    shownRef.current = true
    client.capture('survey shown', surveyEventProperties(opened.survey))
    client.setPersistedProperty(
      PostHogPersistedProperty.SurveyLastSeenDate,
      new Date().toISOString()
    )
  }

  const finish = (submitted: boolean) => {
    if (!opened) return
    surveyClient?.unregisterForSession('survey_source')
    finishSupporterSurvey(opened.survey, submitted)
    setOpened(null)
    setSurvey(null)
    if (submitted) setSent(true)
  }

  return {
    available: survey !== null,
    sent,
    opened,
    open,
    shown,
    finish,
  }
}

export default useCancelSurvey
