import useTheme from '@/contexts/theme'
import useNow from '@/hooks/useNow'
import usePublisher from '@/hooks/usePublisher'
import useMonthlyGoal from '@/hooks/useMonthlyGoal'
import i18n from '@/lib/locales'
import {
  adjustedMinutesForSpecificMonth,
  getMonthsReports,
} from '@/lib/serviceReport'
import { usePreferences } from '@/stores/preferences'
import { useServiceReport } from '@/stores/serviceReport'
import Text from '@/components/ui/MyText'
import useDailyMinutes from '@/features/profile/hooks/useDailyMinutes'
import { pickGreeting } from '@/features/profile/lib/greeting'
import { consecutiveDaysStreak } from '@/features/profile/lib/profileStats'
import { useShallow } from 'zustand/react/shallow'

/** A one-line welcome at the top of Home that reads the clock and progress. */
const HomeGreeting = () => {
  const theme = useTheme()
  // The shared minute clock: a Home left open since morning doesn't still say
  // "Good morning" in the evening, or last month's goal after midnight.
  const now = new Date(useNow().now)
  const month = now.getMonth()
  const year = now.getFullYear()
  const { type: role, showsTimeEntry } = usePublisher({ month, year })
  const { effectiveGoalHours } = useMonthlyGoal({ month, year })
  const { overrideCreditLimit, customCreditLimitHours, showStreaks } =
    usePreferences(
      useShallow((s) => ({
        overrideCreditLimit: s.overrideCreditLimit,
        customCreditLimitHours: s.customCreditLimitHours,
        showStreaks: s.showStreaks,
      }))
    )
  const { serviceReports } = useServiceReport()
  const daily = useDailyMinutes()

  const goalReached =
    showsTimeEntry &&
    effectiveGoalHours > 0 &&
    adjustedMinutesForSpecificMonth(
      getMonthsReports(serviceReports, month, year),
      month,
      year,
      role,
      { enabled: overrideCreditLimit, customLimitHours: customCreditLimitHours }
    ).value >=
      effectiveGoalHours * 60

  const greeting = pickGreeting({
    now,
    streakDays: showStreaks ? consecutiveDaysStreak(daily, now) : 0,
    goalReached,
  })

  return (
    <Text
      style={{
        fontFamily: theme.fonts.semiBold,
        fontSize: theme.fontSize('lg'),
        color: theme.colors.text,
        marginHorizontal: 5,
        marginBottom: 15,
      }}
    >
      {i18n.t(greeting.key, { count: greeting.count })}
    </Text>
  )
}

export default HomeGreeting
