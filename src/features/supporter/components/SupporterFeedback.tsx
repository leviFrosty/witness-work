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
import i18n, { handleLangFallback } from '@/lib/locales'
import { usePreferences } from '@/stores/preferences'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import DismissableCard from '@/components/DismissableCard'
import SupporterNudgeCard from '@/features/supporter/components/SupporterNudgeCard'
import { supporterSurveyId } from '@/features/supporter/lib/supporterSurvey'
import {
  closeSurvey,
  seenSurveys,
  surveyAppearance,
  surveyAvailable,
  surveyEventProperties,
} from '@/features/supporter/lib/surveySdk'

export default function SupporterFeedback({
  showNudge,
}: {
  showNudge: boolean
}) {
  const { accountId } = useAccount()
  if (!surveyClient) return showNudge ? <SupporterNudgeCard /> : null
  return <Feedback key={accountId} showNudge={showNudge} />
}

function Feedback({ showNudge }: { showNudge: boolean }) {
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
  const [seen, setSeen] = useState<string[]>([])
  const [opened, setOpened] = useState<{
    survey: Survey
    matchedKey: string | null
  } | null>(null)

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
            setSeen(seenSurveys(client))
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
  const finish = (survey: Survey, submitted: boolean) => {
    closeSurvey(client, survey, submitted)
    setSeen(seenSurveys(client))
    setOpened(null)
  }

  if (!translated && !opened) return showNudge ? <SupporterNudgeCard /> : null

  return (
    <PostHogProvider client={client} autocapture={false} style={{ flex: 0 }}>
      {translated ? (
        <DismissableCard
          key={translated.survey.id}
          title={<Text>{translated.survey.questions[0]?.question}</Text>}
          onDismiss={() => finish(translated.survey, false)}
          cardStyle={{
            backgroundColor: theme.colors.supporterTranslucent,
            borderColor: theme.colors.supporter,
            borderWidth: 1,
          }}
        >
          <Button
            style={{ alignSelf: 'flex-end' }}
            onPress={() => setOpened(translated)}
          >
            <Text style={{ color: theme.colors.accent }}>
              {i18n.t('supporterFeedback_open')}
            </Text>
          </Button>
        </DismissableCard>
      ) : showNudge ? (
        <SupporterNudgeCard />
      ) : null}
      {opened && focused && (
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
          onClose={(submitted) => finish(opened.survey, submitted)}
        />
      )}
    </PostHogProvider>
  )
}
