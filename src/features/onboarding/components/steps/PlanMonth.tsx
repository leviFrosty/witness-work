import { useState } from 'react'
import { ScrollView, View } from 'react-native'
import * as Crypto from 'expo-crypto'
import moment from 'moment'
import { styles } from '@/features/onboarding/components/Onboarding.styles'
import OnboardingNav from '@/features/onboarding/components/OnboardingNav'
import ServiceDayPicker from '@/features/onboarding/components/plan-month/ServiceDayPicker'
import PlanMonthPreview from '@/features/onboarding/components/plan-month/PlanMonthPreview'
import usePlanMonth from '@/features/onboarding/hooks/usePlanMonth'
import {
  otherWeekdays,
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
import { proposedPlanLocalDay } from '@/lib/assistantRecommendation'
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
 * and watches the Assistant plan their month toward the goal. Adding the plan
 * saves real Plans and makes the unpicked days Off Days, so the Schedule screen
 * picks up exactly where this leaves off.
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
  const plan = usePlanMonth(target, serviceDays)
  const monthName = moment({ ...target, day: 1 }).format('MMMM')

  const toggleDay = (weekday: number) => {
    Haptics.selection()
    setServiceDays((days) =>
      days.includes(weekday)
        ? days.filter((day) => day !== weekday)
        : [...days, weekday]
    )
  }

  const addPlan = () => {
    const { recommendation } = plan
    if (!recommendation) return
    for (const proposed of recommendation.plans) {
      addDayPlan({
        id: Crypto.randomUUID(),
        date: proposedPlanLocalDay(proposed),
        minutes: proposed.minutes,
        notifyMe: planAlwaysNotify,
        source: 'recommendation',
      })
    }
    setOffDays(otherWeekdays(serviceDays))
    setHasSeenAvailabilityOnboarding(true)
    recordAssistantEvent({
      shape: recommendation.shape,
      action: 'accepted',
      at: Date.now(),
    })
    setHasDismissedRecommendationHash(undefined)
    analytics.capture('assistant_recommendation_accepted', {
      source: 'onboarding',
      shape: recommendation.shape,
      plan_count: recommendation.plans.length,
      service_day_count: serviceDays.length,
      reaches_goal: plan.reachesGoal,
      reminder_enabled: planAlwaysNotify,
    })
    Haptics.success()
    goNext()
  }

  const skip = () => {
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
        />
      </ScrollView>
      {plan.alreadyOnTrack ? (
        <ActionButton onPress={goNext}>{i18n.t('continue')}</ActionButton>
      ) : (
        <View>
          <ActionButton disabled={!plan.recommendation} onPress={addPlan}>
            {i18n.t('planMonth.add')}
          </ActionButton>
          <View style={{ alignItems: 'center', marginTop: 15 }}>
            <Button onPress={skip}>
              <Text style={styles.navSkip}>{i18n.t('skip')}</Text>
            </Button>
          </View>
        </View>
      )}
    </Wrapper>
  )
}

export default PlanMonth
