import React, { useMemo } from 'react'
import { View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'

import useServiceReport from '@/stores/serviceReport'
import { getMonthsReports } from '@/lib/serviceReport'

import MonthReport from '@/features/service-reports/components/MonthReport'
import ProjectedTotalCard from '@/components/ProjectedTotalCard'
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
  const insets = useSafeAreaInsets()
  const { serviceReports } = useServiceReport()

  const thisMonthsReports = useMemo(
    () => getMonthsReports(serviceReports, month, year),
    [month, serviceReports, year]
  )

  return (
    <SwipeMonthNavigator
      onSwipeForward={onSwipeForward}
      onSwipeBack={onSwipeBack}
      style={{ flex: 1 }}
    >
      <KeyboardAwareScrollView
        contentContainerStyle={{
          paddingTop: 15,
          paddingBottom: insets.bottom + 100,
          gap: 24,
        }}
      >
        <View style={{ paddingHorizontal: 15, paddingBottom: 20, gap: 12 }}>
          <MonthReport
            month={month}
            year={year}
            monthsReports={thisMonthsReports}
            showReportButton
            hideTitle
          />
          <ProjectedTotalCard scope={{ kind: 'month', month, year }} />
        </View>

        <AllDaysList month={month} year={year} />
      </KeyboardAwareScrollView>
    </SwipeMonthNavigator>
  )
}

export default ProgressMonthTab
