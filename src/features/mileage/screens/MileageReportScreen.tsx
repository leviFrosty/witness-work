import { useState } from 'react'
import { ScrollView, View } from 'react-native'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import moment from 'moment'
import SwipeMonthNavigator from '@/components/SwipeMonthNavigator'
import useTheme from '@/contexts/theme'
import useMileage from '@/stores/mileage'
import useMileageUnit from '@/hooks/useMileageUnit'
import i18n, { _i18n } from '@/lib/locales'
import { formatMileageDistance } from '@/lib/mileage'
import type { RootStackParamList } from '@/types/rootStack'
import {
  summarizeMileage,
  buildMileageReportText,
} from '@/features/mileage/lib/summary'
import MileagePeriodNavigator from '@/features/mileage/components/MileagePeriodNavigator'
import MileageVehicleFilter from '@/features/mileage/components/MileageVehicleFilter'
import MileageReportPaper from '@/features/mileage/components/MileageReportPaper'
import MileageReportActions from '@/features/mileage/components/MileageReportActions'

type Props = NativeStackScreenProps<RootStackParamList, 'MileageReport'>
export default function MileageReportScreen({ route }: Props) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const { entries, vehicles, categories } = useMileage()
  const unit = useMileageUnit()
  const [month, setMonth] = useState(route.params.month)
  const [year, setYear] = useState(route.params.year)
  const [vehicleId, setVehicleId] = useState(route.params.vehicleId)
  const period = { kind: 'month' as const, month, year }
  const summary = summarizeMileage(entries, period, vehicleId)
  const title = moment([year, month, 1]).format('MMMM YYYY')
  const formatDistance = (meters: number) =>
    formatMileageDistance(meters, unit, _i18n.locale)
  const text = buildMileageReportText({
    summary,
    vehicles,
    categories,
    formatDistance,
    labels: {
      title: i18n.t('mileage.report.heading', { month: title }),
      total: i18n.t('mileage.report.total'),
      unknownVehicle: i18n.t('mileage.dashboard.unknownVehicle'),
      unknownCategory: i18n.t('mileage.dashboard.unknownCategory'),
      uncategorized: i18n.t('mileage.dashboard.uncategorized'),
    },
  })
  const moveMonth = (step: number) => {
    const next = moment([year, month, 1]).add(step, 'month')
    setMonth(next.month())
    setYear(next.year())
  }
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View style={{ padding: 15, gap: 12 }}>
        <MileagePeriodNavigator
          period={period}
          onChange={(next) => {
            if (next.kind === 'month') {
              setMonth(next.month)
              setYear(next.year)
            }
          }}
        />
        <MileageVehicleFilter vehicleId={vehicleId} onChange={setVehicleId} />
      </View>
      <SwipeMonthNavigator
        style={{ flex: 1 }}
        onSwipeForward={() => moveMonth(1)}
        onSwipeBack={() => moveMonth(-1)}
      >
        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + 30 }}
        >
          <MileageReportPaper
            title={title}
            summary={summary}
            vehicles={vehicles}
            categories={categories}
            formatDistance={formatDistance}
          />
          <MileageReportActions
            key={`${year}-${month}-${vehicleId}-${unit}`}
            text={text}
          />
        </ScrollView>
      </SwipeMonthNavigator>
    </View>
  )
}
