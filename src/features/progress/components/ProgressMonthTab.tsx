import React, { useMemo } from 'react'
import { View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'

import useServiceReport from '@/stores/serviceReport'
import useTheme from '@/contexts/theme'
import { getMonthsReports } from '@/lib/serviceReport'
import i18n from '@/lib/locales'

import Text from '@/components/MyText'
import MonthSummary from '@/features/service-reports/components/MonthSummary'
import AllDaysList from '@/features/service-reports/components/AllDaysList'
import SwipeMonthNavigator from '@/components/SwipeMonthNavigator'

interface ProgressMonthTabProps {
  month: number
  year: number
  onSwipeForward: () => void
  onSwipeBack: () => void
}

/**
 * Month tab for `ProgressScreen`. Renders the full `MonthSummary` card
 * (categories, hero stats, "+ Add Time") followed by a flat "ALL DAYS" list of
 * every day in the month (most-recent first; current-month caps at today).
 * Wraps its own `KeyboardAwareScrollView` — the parent shell does not scroll.
 */
const ProgressMonthTab = ({
  month,
  year,
  onSwipeForward,
  onSwipeBack,
}: ProgressMonthTabProps) => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const { serviceReports } = useServiceReport()

  const thisMonthsReports = useMemo(
    () => getMonthsReports(serviceReports, month, year),
    [month, serviceReports, year]
  )

  return (
    <KeyboardAwareScrollView
      contentContainerStyle={{
        paddingTop: 15,
        paddingBottom: insets.bottom + 100,
        gap: 24,
      }}
    >
      <SwipeMonthNavigator
        onSwipeForward={onSwipeForward}
        onSwipeBack={onSwipeBack}
        style={{ paddingHorizontal: 15, paddingBottom: 20 }}
      >
        <MonthSummary
          month={month}
          year={year}
          monthsReports={thisMonthsReports}
          showReportButton
          hideTitle
        />
      </SwipeMonthNavigator>

      <View style={{ gap: 8 }}>
        <Text
          style={{
            fontFamily: theme.fonts.semiBold,
            color: theme.colors.textAlt,
            fontSize: theme.fontSize('sm'),
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            paddingHorizontal: 15,
          }}
        >
          {i18n.t('allDays')}
        </Text>
        <AllDaysList month={month} year={year} />
      </View>
    </KeyboardAwareScrollView>
  )
}

export default ProgressMonthTab
