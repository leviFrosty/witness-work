import { useState } from 'react'
import { ScrollView, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  Plus as PlusIcon,
  Settings as SettingsIcon,
  Share as ShareIcon,
} from 'lucide-react-native'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'

import useStartOfWeek from '@/hooks/useStartOfWeek'
import useMileage from '@/stores/mileage'
import Header from '@/components/ui/layout/Header'
import Card from '@/components/ui/Card'
import IconButton from '@/components/ui/IconButton'
import PullDownMenu from '@/components/ui/PullDownMenu'
import SwipeMonthNavigator from '@/components/SwipeMonthNavigator'
import {
  fromDateKey,
  type MileageBucket,
  periodContaining,
  periodContainsDate,
  shiftPeriod,
  summarizeTrips,
  toDateKey,
  tripsInPeriod,
} from '@/lib/mileage/calc'
import PeriodNavigator from '@/features/mileage/components/PeriodNavigator'
import MileageSummary from '@/features/mileage/components/MileageSummary'
import MileagePeriodChart from '@/features/mileage/components/MileagePeriodChart'
import { getVehicleChartColors } from '@/features/mileage/lib/chartColors'
import TripRow from '@/features/mileage/components/TripRow'
import MileageEmptyState from '@/features/mileage/components/MileageEmptyState'
import LogTripButton from '@/features/mileage/components/LogTripButton'
import useMileageFormatter from '@/features/mileage/hooks/useMileageFormatter'
import useMileageIndex from '@/features/mileage/hooks/useMileageIndex'
import useMileageExport from '@/features/mileage/hooks/useMileageExport'
import useLogTrip from '@/features/mileage/hooks/useLogTrip'
import type { RootStackNavigation } from '@/types/rootStack'
import type { MileagePeriodKind } from '@/types/mileage'

/** Trip history and report for a Day, Week, Month, or Service Year. */
export default function MileageScreen() {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<RootStackNavigation>()
  const { vehicles, fuels, trips } = useMileage()
  const index = useMileageIndex()
  const format = useMileageFormatter()
  const startOfWeek = useStartOfWeek()
  const { exportReport } = useMileageExport()
  const logTrip = useLogTrip('mileage_screen')
  const [kind, setKind] = useState<MileagePeriodKind>('month')
  const [anchor, setAnchor] = useState(() => toDateKey(new Date()))

  const period = periodContaining(kind, fromDateKey(anchor), startOfWeek)
  const isCurrent = periodContainsDate(period, toDateKey(new Date()))
  const periodTrips = tripsInPeriod(trips, period)
  const summary = summarizeTrips(periodTrips, index, vehicles)
  const report = { period, trips: periodTrips, vehicles, fuels, index, format }
  const showCarNames = vehicles.length > 1
  const vehicleColors = getVehicleChartColors(
    theme.colors,
    summary.byVehicle.map((car) => car.vehicleId)
  )

  const shift = (delta: number) =>
    setAnchor(toDateKey(shiftPeriod(period, delta, startOfWeek).start))

  const openSettings = () => navigation.navigate('MileageSettings')

  // A bar opens its day (Week, Month) or month (Service Year).
  const openBucket = (bucket: MileageBucket) => {
    setKind(bucket.kind)
    setAnchor(bucket.start)
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Header
        buttonType='back'
        title={i18n.t('mileage.title')}
        rightElement={
          <View
            style={{
              position: 'absolute',
              right: 0,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 16,
            }}
          >
            <PullDownMenu
              accessibilityLabel={i18n.t('mileage.shareReport')}
              actions={[
                {
                  id: 'copy',
                  title: i18n.t('copy'),
                  systemImage: 'doc.on.doc',
                  onPress: () => void exportReport('copy', report),
                },
                {
                  id: 'share',
                  title: i18n.t('shareEllipsis'),
                  systemImage: 'square.and.arrow.up',
                  onPress: () => void exportReport('share', report),
                },
                {
                  id: 'csv',
                  title: i18n.t('mileage.exportCsv'),
                  systemImage: 'tablecells',
                  onPress: () => void exportReport('csv', report),
                },
              ]}
            >
              <View>
                <IconButton icon={ShareIcon} size={20} />
              </View>
            </PullDownMenu>
            <IconButton
              icon={SettingsIcon}
              size={20}
              onPress={openSettings}
              accessibilityLabel={i18n.t('mileage.settings')}
            />
          </View>
        }
      />
      <SwipeMonthNavigator
        onSwipeForward={() => shift(1)}
        onSwipeBack={() => shift(-1)}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{
            padding: 15,
            gap: 16,
            paddingBottom: insets.bottom + 100,
            width: '100%',
            maxWidth: 720,
            alignSelf: 'center',
          }}
        >
          <PeriodNavigator
            period={period}
            isCurrent={isCurrent}
            onChangeKind={setKind}
            onShift={shift}
            onToday={() => setAnchor(toDateKey(new Date()))}
          />
          {vehicles.length === 0 ? (
            <MileageEmptyState />
          ) : (
            <>
              <Card>
                <MileageSummary
                  summary={summary}
                  vehicles={vehicles}
                  format={format}
                  showBreakdown
                  vehicleColors={
                    vehicleColors.length > 1 ? vehicleColors : undefined
                  }
                  chart={
                    <MileagePeriodChart
                      period={period}
                      trips={periodTrips}
                      vehicleColors={vehicleColors}
                      format={format}
                      onSelectBucket={openBucket}
                    />
                  }
                />
              </Card>
              {periodTrips.length > 0 && summary.cost === undefined && (
                <MileageEmptyState variant='costHint' />
              )}
              {periodTrips.length === 0 ? (
                <MileageEmptyState variant='noTrips' />
              ) : (
                <View style={{ gap: 8 }}>
                  {periodTrips.map((trip) => (
                    <TripRow
                      key={trip.id}
                      trip={trip}
                      vehicleName={
                        showCarNames
                          ? vehicles.find((v) => v.id === trip.vehicleId)?.name
                          : undefined
                      }
                    />
                  ))}
                </View>
              )}
            </>
          )}
        </ScrollView>
      </SwipeMonthNavigator>
      {vehicles.length > 0 && (
        <View
          style={{
            position: 'absolute',
            left: 15,
            right: 15,
            bottom: insets.bottom + 15,
            alignItems: 'center',
          }}
        >
          <LogTripButton
            onPress={logTrip}
            icon={PlusIcon}
            style={{ width: '100%', maxWidth: 690 }}
          />
        </View>
      )}
    </View>
  )
}
