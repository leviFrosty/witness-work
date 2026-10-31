import { useState } from 'react'
import { RefreshControl, ScrollView, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  Plus as PlusIcon,
  Settings as SettingsIcon,
  Share as ShareIcon,
} from 'lucide-react-native'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { analytics } from '@/lib/analytics'

import useStartOfWeek from '@/hooks/useStartOfWeek'
import { useMileageView } from '@/stores/mileageView'
import Header from '@/components/ui/layout/Header'
import Card from '@/components/ui/Card'
import IconButton from '@/components/ui/IconButton'
import PullDownMenu from '@/components/ui/PullDownMenu'
import PointerTooltip from '@/components/ui/PointerTooltip'
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
import {
  currentPersonFilter,
  EVERYONE,
  ME,
  tripsByPerson,
  type PersonFilter,
} from '@/lib/mileage/people'
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
import useMileageSharing, {
  useMileagePeople,
} from '@/features/mileage/hooks/useMileageSharing'
import MileagePersonFilter from '@/features/mileage/components/MileagePersonFilter'
import SharedCarsNotice from '@/features/mileage/components/SharedCarsNotice'
import type { RootStackNavigation } from '@/types/rootStack'
import type { MileagePeriodKind } from '@/types/mileage'
import { useFoldColumn } from '@/components/ui/layout/FoldPane'

/**
 * Trip history and report for a Day, Week, Month, or Service Year. On Shared
 * Cars it can show one person's trips, says who logged each, and pulls to sync
 * them.
 */
export default function MileageScreen() {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<RootStackNavigation>()
  const { vehicles, fuels, trips } = useMileageView()
  const index = useMileageIndex()
  const format = useMileageFormatter()
  const startOfWeek = useStartOfWeek()
  const { exportReport } = useMileageExport()
  const logTrip = useLogTrip('mileage_screen')
  const [kind, setKind] = useState<MileagePeriodKind>('month')
  // The floating Log Trip button grows with the text size; the list leaves
  // room to scroll its last row clear of it.
  const [logTripHeight, setLogTripHeight] = useState(0)
  const [anchor, setAnchor] = useState(() => toDateKey(new Date()))
  const sharing = useMileageSharing()
  const people = useMileagePeople()
  // A Shared Car on the device shows who logged its trips, and can be
  // filtered, even while Shared Cars is off here; only syncing waits.
  const shared = people.shared
  const [chosenFilter, setChosenFilter] = useState<PersonFilter>(EVERYONE)
  // Back to Everyone once the person shown has left every car.
  const personFilter = currentPersonFilter(chosenFilter, people)
  const [refreshing, setRefreshing] = useState(false)

  const period = periodContaining(kind, fromDateKey(anchor), startOfWeek)
  const isCurrent = periodContainsDate(period, toDateKey(new Date()))
  const periodTrips = tripsByPerson(
    tripsInPeriod(trips, period),
    personFilter,
    people
  )
  const summary = summarizeTrips(periodTrips, index, vehicles)
  const report = {
    period,
    trips: periodTrips,
    vehicles,
    fuels,
    index,
    format,
    sharing: shared
      ? { people, ownName: sharing.ownName, filter: personFilter }
      : undefined,
  }
  const showCarNames = vehicles.length > 1
  const vehicleColors = getVehicleChartColors(
    theme.colors,
    summary.byVehicle.map((car) => car.vehicleId)
  )

  const shift = (delta: number) =>
    setAnchor(toDateKey(shiftPeriod(period, delta, startOfWeek).start))

  const openSettings = () => navigation.navigate('MileageSettings')

  const choosePerson = (filter: PersonFilter) => {
    setChosenFilter(filter)
    // Once a session (`analyticsFrequency`): reach, not every switch.
    if (filter !== EVERYONE)
      analytics.capture('mileage_person_filter_used', {
        filter: filter === ME ? 'me' : 'person',
      })
  }

  // A pull is a deliberate ask: every Shared Car syncs now.
  const refresh = async () => {
    setRefreshing(true)
    try {
      await sharing.sync()
    } finally {
      setRefreshing(false)
    }
  }

  // A bar opens its day (Week, Month) or month (Service Year).
  const openBucket = (bucket: MileageBucket) => {
    setKind(bucket.kind)
    setAnchor(bucket.start)
  }

  const foldColumn = useFoldColumn(720)
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
            <PointerTooltip label={i18n.t('mileage.shareReport')} effect='none'>
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
            </PointerTooltip>
            <PointerTooltip label={i18n.t('mileage.settings')} effect='none'>
              <IconButton
                icon={SettingsIcon}
                size={20}
                neighborGap={16}
                onPress={openSettings}
                accessibilityLabel={i18n.t('mileage.settings')}
              />
            </PointerTooltip>
          </View>
        }
      />
      <SwipeMonthNavigator
        onSwipeForward={() => shift(1)}
        onSwipeBack={() => shift(-1)}
        style={{ flex: 1 }}
      >
        <ScrollView
          refreshControl={
            shared && sharing.enabled ? (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => void refresh()}
                tintColor={theme.colors.accent}
              />
            ) : undefined
          }
          contentContainerStyle={[
            {
              padding: 15,
              gap: 16,
              paddingBottom: insets.bottom + Math.max(100, logTripHeight + 31),
              width: '100%',
              maxWidth: 720,
              alignSelf: 'center',
            },
            foldColumn,
          ]}
        >
          <SharedCarsNotice hasSharedCars={shared} />
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
              {shared && (
                <MileagePersonFilter
                  value={personFilter}
                  onChange={choosePerson}
                  people={people}
                  vehicles={vehicles}
                />
              )}
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
                  {periodTrips.map((trip) => {
                    const author = people.loggedBy(trip)
                    return (
                      <TripRow
                        key={trip.id}
                        trip={trip}
                        vehicleName={
                          showCarNames
                            ? vehicles.find((v) => v.id === trip.vehicleId)
                                ?.name
                            : undefined
                        }
                        loggedBy={author && !author.me ? author : undefined}
                      />
                    )
                  })}
                </View>
              )}
            </>
          )}
        </ScrollView>
      </SwipeMonthNavigator>
      {vehicles.length > 0 && (
        <View
          onLayout={(e) => setLogTripHeight(e.nativeEvent.layout.height)}
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
