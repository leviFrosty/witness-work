import { useMemo } from 'react'
import { View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'

import useServiceReport from '@/stores/serviceReport'
import { getLifetimeHours } from '@/lib/serviceReport'
import { TimeEntry } from '@/types/timeEntry'
import i18n from '@/lib/locales'

import Empty from '@/components/ui/Empty'
import LifetimeHoursCard from '@/features/progress/components/LifetimeHoursCard'
import YearByYearList from '@/features/progress/components/YearByYearList'

/**
 * Progress screen's "All-time" tab. Aggregates every service report the user
 * has ever logged into:
 *
 * - A hero `LifetimeHoursCard` (raw unadjusted lifetime hours + span metadata).
 * - A `YearByYearList` of every service year in the continuous span from the
 *   earliest report to the current service year.
 *
 * Renders a centered `Empty` state instead when no reports exist.
 */
interface ProgressAllTimeTabProps {
  /** Invoked when the user taps a year row — parent switches to Year tab. */
  onYearPress: (endYear: number) => void
}

const ProgressAllTimeTab = ({ onYearPress }: ProgressAllTimeTabProps) => {
  const insets = useSafeAreaInsets()
  const { serviceReports } = useServiceReport()

  const flat = useMemo<TimeEntry[]>(() => {
    const arr: TimeEntry[] = []
    for (const year in serviceReports) {
      const months = serviceReports[year]
      for (const month in months) {
        const reports = months[month]
        if (reports) arr.push(...reports)
      }
    }
    return arr
  }, [serviceReports])

  // Empty state keys off reports existing at all — not `getLifetimeHours`
  // alone — so users with only zero-hour entries (e.g. placeholder reports)
  // still see the aggregated view instead of the empty state. Spec also
  // allows hiding when lifetime hours is exactly 0; falling back to length
  // keeps behavior defensive for both cases.
  const isEmpty = flat.length === 0 || getLifetimeHours(flat) === 0

  if (isEmpty) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingBottom: insets.bottom,
        }}
      >
        <Empty
          title={i18n.t('emptyAllTime_title')}
          description={i18n.t('emptyAllTime_description')}
        />
      </View>
    )
  }

  return (
    <KeyboardAwareScrollView
      contentContainerStyle={{
        paddingTop: 15,
        paddingBottom: insets.bottom + 100,
        gap: 24,
      }}
    >
      <View style={{ paddingHorizontal: 15 }}>
        <LifetimeHoursCard />
      </View>
      <YearByYearList onYearPress={onYearPress} />
    </KeyboardAwareScrollView>
  )
}

export default ProgressAllTimeTab
