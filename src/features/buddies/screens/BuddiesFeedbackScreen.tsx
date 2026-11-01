import { useEffect, useState } from 'react'
import { Alert, ScrollView, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { getLocales } from 'expo-localization'
import { ShieldCheck as ShieldCheckIcon } from 'lucide-react-native'
import {
  PostHogPersistedProperty,
  PostHogProvider,
  SurveyModal,
  type Survey,
} from 'posthog-react-native'
import { applySurveyTranslation } from '@posthog/core/surveys'
import ActionButton from '@/components/ui/ActionButton'
import Badge from '@/components/ui/Badge'
import Card from '@/components/ui/Card'
import Divider from '@/components/ui/Divider'
import InfoPopover from '@/components/ui/InfoPopover'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import WholeWordsText from '@/components/ui/WholeWordsText'
import Switch from '@/components/ui/Switch'
import Wrapper from '@/components/ui/layout/Wrapper'
import useTheme from '@/contexts/theme'
import useAccessibilityTextSize from '@/hooks/useAccessibilityTextSize'
import { analytics, surveyClient } from '@/lib/analytics'
import { errorTracking } from '@/lib/errorTracking'
import i18n, { handleLangFallback } from '@/lib/locales'
import {
  closeSurvey,
  surveyAppearance,
  surveyEventProperties,
} from '@/lib/surveySdk'
import { usePreferences } from '@/stores/preferences'
import { RootStackNavigation, RootStackParamList } from '@/types/rootStack'
import { useFoldColumn } from '@/components/ui/layout/FoldPane'
import {
  BUDDIES_FEEDBACK_SURVEY_ID,
  createFeedbackId,
  sendFeedbackAttachments,
} from '@/features/buddies/lib/feedback'

type Props = NativeStackScreenProps<RootStackParamList, 'Buddies Feedback'>

export default function BuddiesFeedbackScreen({ route }: Props) {
  const theme = useTheme()
  const largeText = useAccessibilityTextSize()
  const navigation = useNavigation<RootStackNavigation>()
  const source = route.params?.source ?? 'unknown'
  const { locale } = usePreferences()
  const language = handleLangFallback(
    locale ?? getLocales()[0].languageTag.toLowerCase()
  ).locale
  const [diagnostics, setDiagnostics] = useState(false)
  const [survey, setSurvey] = useState<Survey | null>(null)
  const [opened, setOpened] = useState<{
    survey: Survey
    matchedKey: string | null
    feedbackId: string
    diagnostics: boolean
  } | null>(null)

  useEffect(() => {
    const client = surveyClient
    if (!client) return
    let cancelled = false

    void client
      .ready()
      .then(() => client._onSurveysReady())
      .then(() => client.getSurveys())
      .then((items) => {
        if (cancelled) return
        setSurvey(
          items.find(
            (item) =>
              item.id === BUDDIES_FEEDBACK_SURVEY_ID &&
              !!item.start_date &&
              !item.end_date
          ) ?? null
        )
      })
      .catch(() => {})
    return () => {
      cancelled = true
      client.unregisterForSession('feedback_id')
    }
  }, [source])

  const open = () => {
    if (!survey) {
      analytics.capture('buddies_feedback_unavailable', { source })
      Alert.alert(
        i18n.t('buddies_feedbackTitle'),
        i18n.t('buddies_feedbackUnavailable')
      )
      return
    }

    const feedbackId = createFeedbackId()

    surveyClient?.registerForSession({ feedback_id: feedbackId })
    setOpened({
      ...applySurveyTranslation(survey, language),
      feedbackId,
      diagnostics,
    })
  }

  const finish = (submitted: boolean) => {
    const client = surveyClient
    if (!opened || !client) return
    client.unregisterForSession('feedback_id')
    closeSurvey(client, opened.survey, submitted)
    setOpened(null)
    if (!submitted) {
      return
    }
    analytics.capture('buddies_feedback_submitted', {
      source,
      diagnostics: opened.diagnostics,
    })
    if (opened.diagnostics) {
      void sendFeedbackAttachments(client, opened.survey, opened.feedbackId)
        .then(() => undefined)
        .catch((error) => {
          analytics.capture('buddies_feedback_attachment_failed', { source })
          errorTracking.captureException(error)
          Alert.alert(
            i18n.t('buddies_feedbackTitle'),
            i18n.t('buddies_feedbackAttachmentFailed')
          )
        })
    }
    navigation.goBack()
  }

  const foldColumn = useFoldColumn(720)
  return (
    <Wrapper insets='bottom' style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={[
          {
            padding: 20,
            gap: 20,
            width: '100%',
            maxWidth: 720,
            alignSelf: 'center',
          },
          foldColumn,
        ]}
      >
        <View style={{ gap: 10 }}>
          {}
          <View
            style={{
              flexDirection: 'row',
              flexWrap: largeText ? 'wrap' : 'nowrap',
              alignItems: 'center',
            }}
          >
            <WholeWordsText
              style={{
                flexShrink: 1,
                fontFamily: theme.fonts.bold,
                fontSize: theme.fontSize('xl'),
              }}
            >
              {i18n.t('buddies_alphaHeadline')}
            </WholeWordsText>
            <InfoPopover
              title={i18n.t('buddies_alphaInfoTitle')}
              description={i18n.t('buddies_alphaBody')}
            />
            <Badge
              color={theme.colors.accentTranslucent}
              size='xs'
              textStyle={{ color: theme.colors.accent }}
            >
              {i18n.t('alpha')}
            </Badge>
          </View>
          <Text style={{ color: theme.colors.textAlt }}>
            {i18n.t('buddies_feedbackCardBody')}
          </Text>
        </View>

        <Card style={{ gap: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <LucideIcon
              icon={ShieldCheckIcon}
              size={20}
              color={theme.colors.accent}
            />
            <View
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}
            >
              <Text style={{ flexShrink: 1, fontFamily: theme.fonts.semiBold }}>
                {i18n.t('buddies_alphaSecurityTitle')}
              </Text>
              <InfoPopover
                title={i18n.t('buddies_alphaSecurityTitle')}
                description={i18n.t('buddies_alphaSecurityBody')}
              />
            </View>
          </View>
          <Divider />
          <View style={{ gap: 4 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <View
                style={{
                  flexShrink: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                }}
              >
                <Text
                  style={{ flexShrink: 1, fontFamily: theme.fonts.semiBold }}
                >
                  {i18n.t('buddies_feedbackDiagnostics')}
                </Text>
                <InfoPopover
                  title={i18n.t('buddies_feedbackDiagnostics')}
                  description={i18n.t('buddies_feedbackDiagnosticsBody')}
                />
              </View>
              <Switch
                value={diagnostics}
                onValueChange={setDiagnostics}
                accessibilityLabel={i18n.t('buddies_feedbackDiagnostics')}
              />
            </View>
            <Text
              style={{
                color: theme.colors.textAlt,
                fontSize: theme.fontSize('sm'),
              }}
            >
              {i18n.t('buddies_feedbackDiagnosticsSummary')}
            </Text>
          </View>
        </Card>

        <ActionButton onPress={open}>
          {i18n.t('buddies_sendFeedback')}
        </ActionButton>
      </ScrollView>

      {opened && surveyClient && (
        <PostHogProvider
          client={surveyClient}
          autocapture={false}
          style={{ flex: 0 }}
        >
          <SurveyModal
            survey={opened.survey}
            surveyLanguage={opened.matchedKey}
            appearance={{
              ...surveyAppearance(theme.colors),
              ...opened.survey.appearance,
            }}
            onShow={() => {
              surveyClient?.capture(
                'survey shown',
                surveyEventProperties(opened.survey)
              )
              surveyClient?.setPersistedProperty(
                PostHogPersistedProperty.SurveyLastSeenDate,
                new Date().toISOString()
              )
            }}
            onClose={finish}
          />
        </PostHogProvider>
      )}
    </Wrapper>
  )
}
