import type { Colors } from '@/constants/theme'
import i18n from '@/lib/locales'
import {
  PostHogPersistedProperty,
  type PostHog,
  type Survey,
  type SurveyModalProps,
} from 'posthog-react-native'
import {
  SurveyPosition,
  SurveyQuestionDescriptionContentType,
} from '@posthog/core'
import {
  canSurveyActivateRepeatedly,
  getSurveyInteractionProperty,
  getSurveyIterationKey,
  isSurveyKeyForSurvey,
} from '@posthog/core/surveys'

export function seenSurveys(client: PostHog): string[] {
  try {
    const value = JSON.parse(
      client.getPersistedProperty<string>(
        PostHogPersistedProperty.SurveysSeen
      ) ?? '[]'
    )
    return Array.isArray(value)
      ? value.filter((key): key is string => typeof key === 'string')
      : []
  } catch {
    return []
  }
}

export function surveyAvailable(
  survey: Survey,
  flags: Record<string, string | boolean>,
  seen: string[]
) {
  if (survey.type !== 'api' || !survey.start_date || survey.end_date)
    return false

  const repeats = canSurveyActivateRepeatedly(survey)
  if (!repeats && seen.includes(getSurveyIterationKey(survey))) return false

  const requiredFlags = [
    survey.linked_flag_key,
    survey.targeting_flag_key,
    ...(repeats ? [] : [survey.internal_targeting_flag_key]),
    ...(survey.feature_flag_keys ?? []).map(({ value }) => value),
  ]
  if (requiredFlags.some((key) => key && !flags[key])) return false

  const variant = survey.conditions?.linkedFlagVariant
  if (!variant || variant === 'any') return true
  return !!survey.linked_flag_key && flags[survey.linked_flag_key] === variant
}

export function surveyEventProperties(survey: Survey) {
  return {
    $survey_id: survey.id,
    $survey_name: survey.name,
    ...(survey.current_iteration != null
      ? {
          $survey_iteration: survey.current_iteration,
          $survey_iteration_start_date: survey.current_iteration_start_date,
        }
      : {}),
  }
}

export function closeSurvey(
  client: PostHog,
  survey: Survey,
  submitted: boolean
) {
  const seen = [
    getSurveyIterationKey(survey),
    ...seenSurveys(client).filter(
      (key) => !isSurveyKeyForSurvey(key, survey.id)
    ),
  ].slice(0, 20)
  client.setPersistedProperty(
    PostHogPersistedProperty.SurveysSeen,
    JSON.stringify(seen)
  )
  if (!submitted)
    client.capture('survey dismissed', {
      ...surveyEventProperties(survey),
      $survey_partially_completed: false,
      $set: { [getSurveyInteractionProperty(survey, 'dismissed')]: true },
    })
}

// The public SurveyModal requires a complete appearance. Use the current app
// theme as the fallback; remote appearance overrides it.
export const surveyAppearance = (
  colors: Colors
): SurveyModalProps['appearance'] => ({
  backgroundColor: colors.background,
  textColor: colors.text,
  submitButtonColor: colors.text,
  submitButtonTextColor: colors.textInverse,
  ratingButtonColor: colors.card,
  ratingButtonActiveColor: colors.text,
  inputBackground: colors.card,
  borderColor: colors.border,
  placeholder: i18n.t('supporterFeedback_placeholder'),
  displayThankYouMessage: true,
  thankYouMessageHeader: i18n.t('supporterFeedback_thankYou'),
  position: SurveyPosition.Center,
  submitButtonText: i18n.t('submit'),
  autoDisappear: false,
  thankYouMessageDescription: '',
  thankYouMessageDescriptionContentType:
    SurveyQuestionDescriptionContentType.Text,
  thankYouMessageCloseButtonText: i18n.t('close'),
  displayIntroScreen: false,
  introScreenHeader: '',
  introScreenDescription: '',
  introScreenDescriptionContentType: SurveyQuestionDescriptionContentType.Text,
  introScreenButtonText: i18n.t('getStarted'),
  surveyPopupDelaySeconds: 0,
  allowGoBack: false,
  backButtonText: i18n.t('goBack'),
})
