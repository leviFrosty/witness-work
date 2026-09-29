import { useEffect, useState } from 'react'
import { AppState } from 'react-native'
import { useIsFocused } from '@react-navigation/native'
import { getLocales } from 'expo-localization'
import {
  PostHogProvider,
  PostHogPersistedProperty,
  SurveyModal,
  useFeatureFlags,
  type Survey,
} from 'posthog-react-native'
import { applySurveyTranslation } from '@posthog/core/surveys'
import { surveyClient } from '@/lib/analytics'
import useCustomer from '@/hooks/useCustomer'
import useAccount from '@/hooks/useAccount'
import useTheme from '@/contexts/theme'
import { handleLangFallback } from '@/lib/locales'
import { usePreferences } from '@/stores/preferences'
import { supporterSurveyId } from '@/features/supporter/lib/supporterSurvey'
import {
  seenSurveys,
  surveyAppearance,
  surveyAvailable,
  surveyEventProperties,
} from '@/lib/surveySdk'
import {
  finishSupporterSurvey,
  useSupporterSurveys,
} from '@/features/supporter/stores/supporterSurveys'

/**
 * Finds the Supporter or lapse feedback survey the User is invited to (the
 * notifications tray lists it) and presents the survey once they open it.
 * Renders nothing else.
 */
export default function SupporterSurveyHost() {
  const { accountId } = useAccount()
  if (!surveyClient) return null
  return <Host key={accountId} />
}

function Host() {
  const client = surveyClient!
  const { customer, ready, revalidate } = useCustomer()
  const theme = useTheme()
  const focused = useIsFocused()
  const { locale } = usePreferences()
  const language = handleLangFallback(
    locale ?? getLocales()[0].languageTag.toLowerCase()
  ).locale
  const flags = useFeatureFlags(client)
  const [surveys, setSurveys] = useState<Survey[]>([])
  const seen = useSupporterSurveys((state) => state.seen)
  const opened = useSupporterSurveys((state) => state.opened)

  useEffect(() => {
    if (!focused || !ready) return
    let cancelled = false
    const refresh = () => {
      void revalidate()
      // Same readiness gate as PostHogSurveyProvider in pinned SDK 4.68.0.
      void client
        .ready()
        .then(() => client._onSurveysReady())
        .then(() => client.getSurveys())
        .then((items) => {
          if (!cancelled) {
            useSupporterSurveys.setState({ seen: seenSurveys(client) })
            setSurveys(items)
          }
        })
        .catch(() => {})
    }
    refresh()
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh()
    })
    return () => {
      cancelled = true
      subscription.remove()
    }
  }, [client, focused, ready, revalidate])

  const id = supporterSurveyId(customer)
  const candidate = surveys.find(
    (survey) => survey.id === id && surveyAvailable(survey, flags ?? {}, seen)
  )
  const translated = candidate
    ? applySurveyTranslation(candidate, language)
    : null

  // Publishes the invite for the tray, only when it actually changes.
  useEffect(() => {
    const { invite } = useSupporterSurveys.getState()
    if (
      invite?.survey.id === translated?.survey.id &&
      invite?.matchedKey === translated?.matchedKey
    )
      return
    useSupporterSurveys.setState({ invite: translated })
  })
  useEffect(
    () => () => useSupporterSurveys.setState({ invite: null, opened: null }),
    []
  )

  if (!opened || !focused) return null

  return (
    <PostHogProvider client={client} autocapture={false} style={{ flex: 0 }}>
      <SurveyModal
        survey={opened.survey}
        surveyLanguage={opened.matchedKey}
        appearance={{
          ...surveyAppearance(theme.colors),
          ...opened.survey.appearance,
        }}
        onShow={() => {
          client.capture('survey shown', surveyEventProperties(opened.survey))
          client.setPersistedProperty(
            PostHogPersistedProperty.SurveyLastSeenDate,
            new Date().toISOString()
          )
        }}
        onClose={(submitted) => finishSupporterSurvey(opened.survey, submitted)}
      />
    </PostHogProvider>
  )
}
