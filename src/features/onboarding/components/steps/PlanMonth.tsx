import { useState } from 'react'
import { ScrollView, View } from 'react-native'
import * as Crypto from 'expo-crypto'
import moment from 'moment'
import { styles } from '@/features/onboarding/components/Onboarding.styles'
import OnboardingNav from '@/features/onboarding/components/OnboardingNav'
import ServiceDayPicker from '@/features/onboarding/components/plan-month/ServiceDayPicker'
import PlanMonthPreview from '@/features/onboarding/components/plan-month/PlanMonthPreview'
import PlanMonthNextSteps from '@/features/onboarding/components/plan-month/PlanMonthNextSteps'
import usePlanMonth from '@/features/onboarding/hooks/usePlanMonth'
import {
  otherWeekdays,
  PLAN_DAY_DEFAULT_MINUTES,
  planTargetMonth,
} from '@/features/onboarding/lib/planMonth'
import Text from '@/components/ui/MyText'
import Wrapper from '@/components/ui/layout/Wrapper'
import ActionButton from '@/components/ui/ActionButton'
import Button from '@/components/ui/Button'
import InfoPopover from '@/components/ui/InfoPopover'
import useTheme from '@/contexts/theme'
import useStartOfWeek from '@/hooks/useStartOfWeek'
import { analytics } from '@/lib/analytics'
import Haptics from '@/lib/haptics'
import i18n from '@/lib/locales'
import { usePreferences } from '@/stores/preferences'
import useServiceReport from '@/stores/serviceReport'

interface Props {
  goBack: () => void
  goNext: () => void
}

/**
 * Onboarding's hands-on moment: the publisher taps the days they usually go out
 * and watches the Assistant plan their month toward the goal, then taps any day
 * to change it. Adding the plan saves real Plans and makes the unpicked days
 * Off Days, so the Schedule screen picks up exactly where this leaves off.
 * Leaving it for later is just as fine: planning lives on the Schedule tab.
 */
const PlanMonth = ({ goBack, goNext }: Props) => {
  const theme = useTheme()
  const startOfWeek = useStartOfWeek()
  const addDayPlan = useServiceReport((s) => s.addDayPlan)
  const {
    offDays,
    hasSeenAvailabilityOnboarding,
    planAlwaysNotify,
    setOffDays,
    setHasSeenAvailabilityOnboarding,
    recordAssistantEvent,
    setHasDismissedRecommendationHash,
  } = usePreferences()
  const [target] = useState(() => planTargetMonth(new Date()))
  // Coming back after adding a plan shows the days picked last time.
  const [serviceDays, setServiceDays] = useState<number[]>(() =>
    hasSeenAvailabilityOnboarding ? otherWeekdays(offDays) : []
  )
  const [edits, setEdits] = useState<ReadonlyMap<number, number>>(
    () => new Map()
  )
  const [selectedDay, setSelectedDay] = useState<number | null>(null)
  const plan = usePlanMonth(target, serviceDays, edits)
  const monthName = moment({ ...target, day: 1 }).format('MMMM')

  const toggleDay = (weekday: number) => {
    Haptics.selection()
    setServiceDays((days) =>
      days.includes(weekday)
        ? days.filter((day) => day !== weekday)
        : [...days, weekday]
    )
  }

  const setDayMinutes = (day: number, minutes: number) =>
    setEdits((current) => new Map(current).set(day, minutes))

  // Tapping a day with nothing planned plans it, so one tap is enough.
  const selectDay = (day: number | null) => {
    setSelectedDay(day)
    if (day !== null && !plan.plans.some((p) => p.day === day)) {
      setDayMinutes(day, PLAN_DAY_DEFAULT_MINUTES)
    }
  }

  const addPlan = () => {
    const { recommendation, plans } = plan
    if (plans.length === 0) return
    for (const { day, minutes, fromAssistant } of plans) {
      addDayPlan({
        id: Crypto.randomUUID(),
        date: moment({ ...target, day }).toDate(),
        minutes,
        notifyMe: planAlwaysNotify,
        source: fromAssistant ? 'recommendation' : 'manual',
      })
    }
    // Picked weekdays become availability; hand-planned days alone don't.
    if (serviceDays.length > 0) {
      setOffDays(otherWeekdays(serviceDays))
      setHasSeenAvailabilityOnboarding(true)
    }
    if (recommendation) {
      recordAssistantEvent({
        shape: recommendation.shape,
        action: 'accepted',
        at: Date.now(),
      })
    }
    setHasDismissedRecommendationHash(undefined)
    analytics.capture('assistant_recommendation_accepted', {
      source: 'onboarding',
      shape: recommendation?.shape ?? 'manual',
      plan_count: plans.length,
      edited_day_count: edits.size,
      service_day_count: serviceDays.length,
      reaches_goal: plan.reachesGoal,
      reminder_enabled: planAlwaysNotify,
    })
    Haptics.success()
    goNext()
  }

  const later = () => {
    analytics.capture('onboarding_step_skipped', { step_id: 'planMonth' })
    goNext()
  }

  return (
    <Wrapper
      style={{
        flex: 1,
        paddingHorizontal: 20,
        paddingTop: 60,
        paddingBottom: 60,
      }}
    >
      <OnboardingNav goBack={goBack} />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: 30, paddingBottom: 20, gap: 16 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text
              style={[styles.stepTitle, { marginBottom: 0, flexShrink: 1 }]}
            >
              {i18n.t('planMonth.title', { month: monthName })}
            </Text>
            <InfoPopover
              title={i18n.t('planMonth.infoTitle')}
              description={i18n.t('planMonth.infoDescription')}
            />
          </View>
          <Text
            style={{
              fontSize: theme.fontSize('md'),
              color: theme.colors.textAlt,
            }}
          >
            {i18n.t('planMonth.subtitle')}
          </Text>
        </View>
        <ServiceDayPicker
          selected={serviceDays}
          startOfWeek={startOfWeek}
          onToggle={toggleDay}
        />
        <PlanMonthPreview
          target={target}
          plan={plan}
          serviceDays={serviceDays}
          startOfWeek={startOfWeek}
          selectedDay={selectedDay}
          onSelectDay={selectDay}
          onChangeDay={setDayMinutes}
        />
        <PlanMonthNextSteps />
      </ScrollView>
      {plan.alreadyOnTrack ? (
        <ActionButton onPress={goNext}>{i18n.t('continue')}</ActionButton>
      ) : plan.plans.length === 0 ? (
        // Nothing to add yet: moving on is the main action, not a skip.
        <ActionButton onPress={later}>{i18n.t('planMonth.later')}</ActionButton>
      ) : (
        <View>
          <ActionButton onPress={addPlan}>
            {i18n.t('planMonth.add')}
          </ActionButton>
          <View style={{ alignItems: 'center', marginTop: 15 }}>
            <Button onPress={later}>
              <Text
                style={{
                  color: theme.colors.textAlt,
                  fontFamily: theme.fonts.semiBold,
                }}
              >
                {i18n.t('planMonth.later')}
              </Text>
            </Button>
          </View>
        </View>
      )}
    </Wrapper>
  )
}

export default PlanMonth
