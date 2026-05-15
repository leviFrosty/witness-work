import { Fragment, useCallback, useMemo, useState } from 'react'
import { View } from 'react-native'
import moment from 'moment'
import { useNavigation } from '@react-navigation/native'

import Text from '@/components/ui/MyText'
import Button from '@/components/ui/Button'
import IconButton from '@/components/ui/IconButton'
import useTheme from '@/contexts/theme'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import { faGear, faLightbulb } from '@fortawesome/free-solid-svg-icons'
import { RootStackNavigation } from '@/types/rootStack'

import i18n, { TranslationKey } from '@/lib/locales'
import {
  generateRecommendation,
  type Recommendation,
} from '@/lib/assistantRecommendation'
import { computeRecommendationInputsHash } from '@/lib/assistantState'
import { usePreferences } from '@/stores/preferences'
import useServiceReport from '@/stores/serviceReport'
import useConversations from '@/stores/conversationStore'
import { momentStoredDate, normalizeDateForStorage } from '@/lib/normalizeDate'
import { getMonthsReports } from '@/lib/serviceReport'
import { segmentBoldMarkup } from '@/lib/projectedTotalCopy'
import type {
  ProjectedTotalResult,
  ProjectedTotalState,
} from '@/lib/projectedTotal'
import AssistantPreviewSheet from '@/components/AssistantPreviewSheet'
import AvailabilityOnboardingSheet from '@/components/AvailabilityOnboardingSheet'

type Props = {
  /** Calendar year of the month being shown. */
  year: number
  /** 0-11 month index. */
  month: number
  /** "Today" — passed in so the parent and child agree. */
  today: Date
  monthlyGoalHours: number
  /** Resolved per the parent's publisher capabilities. */
  loggedAdjustedMinutes: number
  /** Projection result the parent already computed. */
  projection: ProjectedTotalResult
  /**
   * When true, omit the top divider/padding the section uses to separate itself
   * from sibling content above. Use when the section is the sole occupant of
   * its container (e.g. its own Card).
   */
  standalone?: boolean
}

const ASSISTANT_VISIBLE_STATES: ReadonlySet<ProjectedTotalState> = new Set([
  'empty',
  'reachable_gap',
  'unreachable_gap',
])

const AssistantSection = ({
  year,
  month,
  today,
  monthlyGoalHours,
  loggedAdjustedMinutes,
  projection,
  standalone = false,
}: Props) => {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const {
    excludedWeekdays,
    meetingWeekdays,
    assistantHistory,
    hasDismissedRecommendationHash,
    hasSeenAvailabilityOnboarding,
    recordAssistantEvent,
    replaceLastAssistantEvent,
    setHasDismissedRecommendationHash,
  } = usePreferences()
  const { dayPlans, recurringPlans, serviceReports } = useServiceReport()
  const { conversations } = useConversations()

  const minutesLoggedInPriorDays = useMemo(() => {
    const start = momentStoredDate(normalizeDateForStorage(today))
      .clone()
      .subtract(3, 'day')
    const end = momentStoredDate(normalizeDateForStorage(today))
      .clone()
      .subtract(1, 'day')
    // Use months reports for current month — for early-month boundaries the
    // few extra reports we'd miss don't materially shift the tiredness signal.
    const reports = getMonthsReports(serviceReports, month, year)
    return reports.reduce((sum, r) => {
      const d = momentStoredDate(r.date)
      if (d.isSameOrAfter(start, 'day') && d.isSameOrBefore(end, 'day')) {
        return sum + r.hours * 60 + r.minutes
      }
      return sum
    }, 0)
  }, [today, month, year, serviceReports])

  const recommendation: Recommendation | null = useMemo(() => {
    if (!ASSISTANT_VISIBLE_STATES.has(projection.state)) return null
    return generateRecommendation({
      year,
      month,
      today,
      monthlyGoalHours,
      loggedAdjustedMinutes,
      dayPlans,
      recurringPlans,
      conversations,
      excludedWeekdays,
      meetingWeekdays,
      assistantHistory,
      minutesLoggedInPriorDays,
    })
  }, [
    projection.state,
    year,
    month,
    today,
    monthlyGoalHours,
    loggedAdjustedMinutes,
    dayPlans,
    recurringPlans,
    conversations,
    excludedWeekdays,
    meetingWeekdays,
    assistantHistory,
    minutesLoggedInPriorDays,
  ])

  // Stable fingerprint of the inputs that should "re-arm" the Assistant
  // after a dismissal. When the user logs hours, plans days, edits
  // availability, etc., the hash changes and the card returns.
  const inputsHash = useMemo(
    () =>
      computeRecommendationInputsHash({
        loggedAdjustedMinutes,
        dayPlanFingerprints: dayPlans.map(
          (p) => `${momentStoredDate(p.date).format('YYYY-MM-DD')}:${p.minutes}`
        ),
        recurringPlanFingerprints: recurringPlans.map(
          (r) =>
            `${r.id}:${momentStoredDate(r.startDate).format('YYYY-MM-DD')}:${r.minutes}`
        ),
        conversationDayKeys: conversations
          .flatMap((c) => [
            c.date ? momentStoredDate(c.date).format('YYYY-MM-DD') : null,
            c.followUp?.date && c.followUp.dismissed !== true
              ? momentStoredDate(c.followUp.date).format('YYYY-MM-DD')
              : null,
          ])
          .filter((s): s is string => s !== null),
        excludedWeekdays,
        meetingWeekdays,
      }),
    [
      loggedAdjustedMinutes,
      dayPlans,
      recurringPlans,
      conversations,
      excludedWeekdays,
      meetingWeekdays,
    ]
  )

  const isDismissedForCurrentInputs =
    hasDismissedRecommendationHash !== undefined &&
    hasDismissedRecommendationHash === inputsHash

  const [previewOpen, setPreviewOpen] = useState(false)
  const [availabilityOpen, setAvailabilityOpen] = useState(false)

  const openPlanPreferences = useCallback(() => {
    navigation.navigate('PreferencesPlans')
  }, [navigation])

  const handleDismiss = useCallback(() => {
    if (!recommendation) return
    recordAssistantEvent({
      shape: recommendation.shape,
      action: 'dismissed',
      at: Date.now(),
    })
    setHasDismissedRecommendationHash(inputsHash)
  }, [
    recommendation,
    recordAssistantEvent,
    setHasDismissedRecommendationHash,
    inputsHash,
  ])

  const handleAccepted = useCallback(() => {
    if (!recommendation) return
    recordAssistantEvent({
      shape: recommendation.shape,
      action: 'accepted',
      at: Date.now(),
    })
    // Clear any previous dismissal so a future re-arm-without-accept doesn't
    // confuse the gating.
    setHasDismissedRecommendationHash(undefined)
  }, [recommendation, recordAssistantEvent, setHasDismissedRecommendationHash])

  const handleUndo = useCallback(() => {
    // Rewrite the just-recorded accepted event as a dismissal so history
    // weighting reflects the user's actual final intent.
    if (!recommendation) return
    replaceLastAssistantEvent({
      shape: recommendation.shape,
      action: 'dismissed',
      at: Date.now(),
    })
  }, [recommendation, replaceLastAssistantEvent])

  // Acceptance collapse — when the user has just accepted and the gap is
  // closed, show the "you've planned enough" affirmation. Detect this by:
  // - engine returns null (no gap)
  // - last history event is `accepted`
  if (!recommendation) {
    const last = assistantHistory[assistantHistory.length - 1]
    const justAccepted =
      last?.action === 'accepted' && projection.state === 'projected_over_goal'
    if (!justAccepted) return null
    return (
      <View
        style={
          standalone
            ? {}
            : {
                paddingTop: 12,
                borderTopWidth: 1,
                borderTopColor: theme.colors.border,
              }
        }
      >
        <Text
          style={{
            color: theme.colors.accent,
            fontFamily: theme.fonts.semiBold,
            fontSize: theme.fontSize('sm'),
          }}
        >
          {i18n.t('assistant.collapsedAfterAccept')}
        </Text>
      </View>
    )
  }

  if (isDismissedForCurrentInputs) return null

  // Pre-onboarding: show an explicit CTA instead of instantly prompting for
  // unavailable days. The user opts in by tapping "Set up Assistant".
  if (!hasSeenAvailabilityOnboarding) {
    return (
      <View
        style={{
          gap: 10,
          ...(standalone
            ? {}
            : {
                paddingTop: 12,
                borderTopWidth: 1,
                borderTopColor: theme.colors.border,
              }),
        }}
      >
        <AssistantHeader onPressSettings={openPlanPreferences} />
        <Text
          style={{
            fontFamily: theme.fonts.semiBold,
            fontSize: theme.fontSize('sm'),
            color: theme.colors.text,
          }}
        >
          {i18n.t('assistant.intro.title')}
        </Text>
        <Text
          style={{
            fontSize: theme.fontSize('xs'),
            color: theme.colors.textAlt,
            lineHeight: theme.fontSize('xs') * 1.45,
          }}
        >
          {i18n.t('assistant.intro.body')}
        </Text>
        <Button
          onPress={() => setAvailabilityOpen(true)}
          style={{
            alignItems: 'center',
            backgroundColor: theme.colors.accent,
            paddingVertical: 10,
            borderRadius: theme.numbers.borderRadiusSm,
            marginTop: 4,
          }}
        >
          <Text
            style={{
              color: theme.colors.textInverse,
              fontFamily: theme.fonts.semiBold,
              fontSize: theme.fontSize('sm'),
            }}
          >
            {i18n.t('assistant.intro.cta')}
          </Text>
        </Button>

        <AvailabilityOnboardingSheet
          open={availabilityOpen}
          onOpenChange={setAvailabilityOpen}
        />
      </View>
    )
  }

  const headlineText = i18n.t(
    `assistant.headline.${recommendation.shape}` as TranslationKey,
    {
      hours: recommendation.headline.values.hours,
      days: recommendation.headline.values.days,
      day: recommendation.headline.values.day
        ? moment(recommendation.headline.values.day).format('ddd, MMM D')
        : '',
      weekdayList: recommendation.headline.values.weekdayList,
      weeks: recommendation.headline.values.weeks,
    }
  )

  const rationaleText = i18n.t(
    `assistant.rationale.${recommendation.rationale.code}` as TranslationKey,
    { ...recommendation.rationale.values }
  )

  const headlineSegments = segmentBoldMarkup(headlineText)

  return (
    <View
      style={{
        gap: 10,
        ...(standalone
          ? {}
          : {
              paddingTop: 12,
              borderTopWidth: 1,
              borderTopColor: theme.colors.border,
            }),
      }}
    >
      <AssistantHeader onPressSettings={openPlanPreferences} />

      <Text
        style={{
          fontSize: theme.fontSize('sm'),
          color: theme.colors.text,
          lineHeight: theme.fontSize('sm') * 1.4,
        }}
      >
        {headlineSegments.map((s, i) => (
          <Fragment key={i}>
            <Text
              style={
                s.bold
                  ? {
                      fontFamily: theme.fonts.bold,
                      fontSize: theme.fontSize('sm'),
                    }
                  : { fontSize: theme.fontSize('sm') }
              }
            >
              {s.text}
            </Text>
          </Fragment>
        ))}
      </Text>
      <Text
        style={{
          fontSize: theme.fontSize('xs'),
          color: theme.colors.textAlt,
        }}
      >
        {rationaleText}
      </Text>

      <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>
        <Button
          onPress={() => setPreviewOpen(true)}
          style={{
            flex: 1,
            alignItems: 'center',
            backgroundColor: theme.colors.accent,
            paddingVertical: 10,
            borderRadius: theme.numbers.borderRadiusSm,
          }}
        >
          <Text
            style={{
              color: theme.colors.textInverse,
              fontFamily: theme.fonts.semiBold,
              fontSize: theme.fontSize('sm'),
            }}
          >
            {i18n.t('assistant.button.preview')}
          </Text>
        </Button>
        <Button
          onPress={handleDismiss}
          style={{
            flex: 1,
            alignItems: 'center',
            borderColor: theme.colors.border,
            borderWidth: 1,
            paddingVertical: 10,
            borderRadius: theme.numbers.borderRadiusSm,
          }}
          noTransform
        >
          <Text
            style={{
              color: theme.colors.textAlt,
              fontFamily: theme.fonts.semiBold,
              fontSize: theme.fontSize('sm'),
            }}
          >
            {i18n.t('assistant.button.dismiss')}
          </Text>
        </Button>
      </View>

      <AssistantPreviewSheet
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        recommendation={recommendation}
        projection={projection}
        onAccepted={handleAccepted}
        onUndo={handleUndo}
      />

      <AvailabilityOnboardingSheet
        open={availabilityOpen}
        onOpenChange={setAvailabilityOpen}
      />
    </View>
  )
}

const AssistantHeader = ({
  onPressSettings,
}: {
  onPressSettings: () => void
}) => {
  const theme = useTheme()
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <FontAwesomeIcon
        icon={faLightbulb}
        size={12}
        style={{ color: theme.colors.warn }}
      />
      <Text
        style={{
          fontFamily: theme.fonts.semiBold,
          fontSize: theme.fontSize('xs'),
          color: theme.colors.textAlt,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          flex: 1,
        }}
      >
        {i18n.t('assistant.label')}
      </Text>
      <IconButton
        icon={faGear}
        size='xs'
        color={theme.colors.textAlt}
        onPress={onPressSettings}
        accessibilityLabel={i18n.t('assistant.settingsA11y')}
      />
    </View>
  )
}

export default AssistantSection
