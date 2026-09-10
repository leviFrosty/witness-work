import { useState } from 'react'
import { ScrollView, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import moment from 'moment'
import SegmentedControl from '@/components/ui/SegmentedControl'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import SwipeMonthNavigator from '@/components/SwipeMonthNavigator'
import useMileage from '@/stores/mileage'
import useMileageUnit from '@/hooks/useMileageUnit'
import useTheme from '@/contexts/theme'
import i18n, { _i18n } from '@/lib/locales'
import { formatMileageDistance, localMileageDate } from '@/lib/mileage'
import type { RootStackNavigation } from '@/types/rootStack'
import MileagePeriodNavigator from '@/features/mileage/components/MileagePeriodNavigator'
import MileageVehicleFilter from '@/features/mileage/components/MileageVehicleFilter'
import MileageSummaryCard from '@/features/mileage/components/MileageSummaryCard'
import MileageHistoryRows, {
  MileageTotalRow,
} from '@/features/mileage/components/MileageHistoryRows'
import MileageBreakdownSheet from '@/features/mileage/components/MileageBreakdownSheet'
import PendingMileageTrips from '@/features/mileage/components/PendingMileageTrips'
import {
  summarizeMileage,
  mileageEntryDateForPeriod,
  mileageHistoryYears,
  mileageYearMonths,
  type MileagePeriod,
} from '@/features/mileage/lib/summary'

export default function MileageDashboard({
  initialPeriod,
}: {
  initialPeriod?: MileagePeriod
}) {
  const navigation = useNavigation<RootStackNavigation>()
  const { entries, vehicles, categories } = useMileage()
  const unit = useMileageUnit()
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const [period, setPeriod] = useState<MileagePeriod>(
    initialPeriod ?? {
      kind: 'month',
      month: moment().month(),
      year: moment().year(),
    }
  )
  const [vehicleId, setVehicleId] = useState<string>()
  const [breakdownOpen, setBreakdownOpen] = useState(false)
  const summary = summarizeMileage(entries, period, vehicleId)
  const formatDistance = (meters: number) =>
    formatMileageDistance(meters, unit, _i18n.locale)
  const edit = (entryId: string) =>
    navigation.navigate('MileageEntry', { entryId })
  const changeKind = (kind: MileagePeriod['kind']) => {
    const now = moment()
    const year =
      period.kind === 'month'
        ? period.year
        : period.kind === 'year'
          ? period.startYear
          : now.year()
    const month =
      period.kind === 'month'
        ? period.month
        : period.kind === 'year'
          ? 8
          : now.month()
    setPeriod(
      kind === 'allTime'
        ? { kind }
        : kind === 'year'
          ? { kind, startYear: month < 8 ? year - 1 : year }
          : { kind, month, year }
    )
  }
  const moveMonth = (step: number) => {
    if (period.kind !== 'month') return
    const next = moment([period.year, period.month, 1]).add(step, 'month')
    setPeriod({ kind: 'month', month: next.month(), year: next.year() })
  }
  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 15, paddingBottom: 8, gap: 10 }}>
        <SegmentedControl
          value={period.kind}
          onChange={changeKind}
          options={[
            { key: 'month', label: i18n.t('month') },
            { key: 'year', label: i18n.t('mileage.dashboard.serviceYear') },
            { key: 'allTime', label: i18n.t('allTime') },
          ]}
        />
        <MileagePeriodNavigator period={period} onChange={setPeriod} />
      </View>
      <SwipeMonthNavigator
        style={{ flex: 1 }}
        onSwipeForward={() => moveMonth(1)}
        onSwipeBack={() => moveMonth(-1)}
      >
        <ScrollView
          contentContainerStyle={{
            padding: 15,
            gap: 15,
            paddingBottom: insets.bottom + 30,
          }}
        >
          <MileageVehicleFilter vehicleId={vehicleId} onChange={setVehicleId} />
          <PendingMileageTrips vehicleId={vehicleId} onResume={edit} />
          <MileageSummaryCard
            total={formatDistance(summary.meters)}
            hasActiveVehicle={vehicles.some((vehicle) => !vehicle.archivedAt)}
            onAdd={() =>
              navigation.navigate('MileageEntry', {
                vehicleId,
                date: mileageEntryDateForPeriod(period, localMileageDate()),
              })
            }
            onVehicles={() => navigation.navigate('MileageVehicles')}
            onBreakdown={() => setBreakdownOpen(true)}
            onReport={
              period.kind === 'month'
                ? () =>
                    navigation.navigate('MileageReport', {
                      month: period.month,
                      year: period.year,
                      vehicleId,
                    })
                : undefined
            }
          />
          {period.kind === 'month' && (
            <MileageHistoryRows
              entries={summary.entries}
              vehicles={vehicles}
              categories={categories}
              formatDistance={formatDistance}
              onEdit={edit}
            />
          )}
          {period.kind === 'year' &&
            mileageYearMonths(period.startYear).map((month) => (
              <MileageTotalRow
                key={`${month.year}-${month.month}`}
                label={moment([month.year, month.month, 1]).format('MMMM YYYY')}
                meters={
                  summarizeMileage(
                    entries,
                    { kind: 'month', ...month },
                    vehicleId
                  ).meters
                }
                formatDistance={formatDistance}
                onPress={() => setPeriod({ kind: 'month', ...month })}
              />
            ))}
          {period.kind === 'allTime' &&
            mileageHistoryYears(entries, vehicleId).map((startYear) => (
              <MileageTotalRow
                key={startYear}
                label={i18n.t('mileage.dashboard.serviceYearRange', {
                  start: startYear,
                  end: startYear + 1,
                })}
                meters={
                  summarizeMileage(
                    entries,
                    { kind: 'year', startYear },
                    vehicleId
                  ).meters
                }
                formatDistance={formatDistance}
                onPress={() => setPeriod({ kind: 'year', startYear })}
              />
            ))}
          <Button onPress={() => navigation.navigate('MileageVehicles')}>
            <Text style={{ color: theme.colors.accent }}>
              {i18n.t('mileage.dashboard.manageVehicles')}
            </Text>
          </Button>
          <Button onPress={() => navigation.navigate('MileageCategories')}>
            <Text style={{ color: theme.colors.accent }}>
              {i18n.t('mileage.dashboard.manageCategories')}
            </Text>
          </Button>
        </ScrollView>
      </SwipeMonthNavigator>
      <MileageBreakdownSheet
        open={breakdownOpen}
        onClose={() => setBreakdownOpen(false)}
        totals={summary.categories}
        categories={categories}
        formatDistance={formatDistance}
      />
    </View>
  )
}
