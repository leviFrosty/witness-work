import type { ComponentProps } from 'react'
import { View } from 'react-native'
import useTheme from '@/contexts/theme'
import useNow from '@/hooks/useNow'
import usePublisher from '@/hooks/usePublisher'
import useMonthlyGoal from '@/hooks/useMonthlyGoal'
import useServiceStreak from '@/hooks/useServiceStreak'
import i18n from '@/lib/locales'
import { shownStreak } from '@/lib/serviceStreak'
import {
  adjustedMinutesForSpecificMonth,
  getMonthsReports,
} from '@/lib/serviceReport'
import { usePreferences } from '@/stores/preferences'
import { useServiceReport } from '@/stores/serviceReport'
import Text from '@/components/ui/MyText'
import HomeStreakChip from '@/features/profile/components/HomeStreakChip'
import { pickGreeting } from '@/features/profile/lib/greeting'
import { useShallow } from 'zustand/react/shallow'

const HomeGreeting = ({
  buddyStreaks,
}: Pick<ComponentProps<typeof HomeStreakChip>, 'buddyStreaks'>) => {
  const theme = useTheme()

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
  const serviceStreak = useServiceStreak()

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
    streak: showStreaks ? shownStreak(serviceStreak) : 0,
    goalReached,
  })

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginHorizontal: 5,
        marginBottom: 15,
      }}
    >
      <Text
        style={{
          flex: 1,
          fontFamily: theme.fonts.semiBold,
          fontSize: theme.fontSize('lg'),
          color: theme.colors.text,
        }}
      >
        {i18n.t(greeting.key)}
      </Text>
      <HomeStreakChip streak={serviceStreak} buddyStreaks={buddyStreaks} />
    </View>
  )
}

export default HomeGreeting
