import React, { useMemo } from 'react'
import { View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import AdaptiveSplitScrollView from '@/components/ui/layout/AdaptiveSplitScrollView'

import useServiceReport from '@/stores/serviceReport'
import useAdaptiveLayout from '@/hooks/useAdaptiveLayout'
import { getMonthsReports } from '@/lib/serviceReport'
import type { ProjectedTotalScope } from '@/lib/projectedTotal'

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
 * Summary and records scroll independently in wide windows and together in
 * compact windows.
 */
const ProgressMonthTab = ({
  month,
  year,
  onSwipeForward,
  onSwipeBack,
}: ProgressMonthTabProps) => {
  const insets = useSafeAreaInsets()
  const { isWide, hasSidebar } = useAdaptiveLayout()
  const serviceReports = useServiceReport((s) => s.serviceReports)

  const thisMonthsReports = useMemo(
    () => getMonthsReports(serviceReports, month, year),
    [month, serviceReports, year]
  )

  // Stable reference so ProjectedTotalCard's memoized derivations don't
  // invalidate every render of this tab.
  const scope = useMemo<ProjectedTotalScope>(
    () => ({ kind: 'month', month, year }),
    [month, year]
  )

  return (
    <SwipeMonthNavigator
      onSwipeForward={onSwipeForward}
      onSwipeBack={onSwipeBack}
      style={{ flex: 1 }}
    >
      <AdaptiveSplitScrollView
        paddingBottom={insets.bottom + (hasSidebar ? 30 : 100)}
        compactPaddingHorizontal={0}
        leading={
          <View
            style={{
              paddingHorizontal: isWide ? 0 : 15,
              paddingBottom: 20,
              gap: 12,
            }}
          >
            <MonthReport
              month={month}
              year={year}
              monthsReports={thisMonthsReports}
              showReportButton
              hideTitle
              allowGoalEditing
            />
            <ProjectedTotalCard scope={scope} />
          </View>
        }
        trailing={<AllDaysList month={month} year={year} />}
      />
    </SwipeMonthNavigator>
  )
}

export default ProgressMonthTab
