import { useEffect } from 'react'
import { ScrollView, View } from 'react-native'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Pencil as PencilIcon, Share as ShareIcon } from 'lucide-react-native'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { formatDate } from '@/lib/dates'
import useMileage from '@/stores/mileage'
import Header from '@/components/ui/layout/Header'
import Section from '@/components/ui/inputs/Section'
import InputRowContainer from '@/components/ui/inputs/InputRowContainer'
import IconButton from '@/components/ui/IconButton'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import { estimateTrip, fromDateKey } from '@/lib/mileage/calc'
import useMileageFormatter from '@/features/mileage/hooks/useMileageFormatter'
import useMileageIndex from '@/features/mileage/hooks/useMileageIndex'
import useTripActions from '@/features/mileage/hooks/useTripActions'
import type { RootStackParamList } from '@/types/rootStack'

type Props = NativeStackScreenProps<RootStackParamList, 'MileageTripDetails'>

function DetailRow({
  label,
  value,
  last,
}: {
  label: string
  value: string
  last?: boolean
}) {
  const theme = useTheme()
  return (
    <InputRowContainer label={label} lastInSection={last} controlWidth='auto'>
      <Text
        style={{ color: theme.colors.textAlt, textAlign: 'right' }}
        selectable
      >
        {value}
      </Text>
    </InputRowContainer>
  )
}

/** One trip, with Edit, Share, and Delete. */
export default function MileageTripDetailsScreen({ route, navigation }: Props) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const { trips, vehicles, fuels } = useMileage()
  const format = useMileageFormatter()
  const index = useMileageIndex()
  const actions = useTripActions('details')
  const trip = trips.find((t) => t.id === route.params.tripId)

  // Deleted here, from the edit form, or on another device.
  useEffect(() => {
    if (!trip && navigation.canGoBack()) navigation.goBack()
  }, [trip, navigation])

  if (!trip) return null

  const estimate = estimateTrip(trip, index)
  const vehicle = vehicles.find((v) => v.id === trip.vehicleId)
  const fuel = fuels.find((f) => f.id === estimate.fuelId)
  const odometer = trip.odometerEndMiles !== undefined
  const rows = [
    { label: i18n.t('date'), value: formatDate(fromDateKey(trip.date)) },
    {
      label: i18n.t('mileage.car'),
      value: vehicle
        ? vehicle.archived
          ? i18n.t('mileage.archivedCarName', { name: vehicle.name })
          : vehicle.name
        : i18n.t('mileage.unknownCar'),
    },
    {
      label: i18n.t('mileage.distance'),
      value: trip.roundTrip
        ? `${format.distance(trip.distanceMiles)} (${i18n.t('mileage.roundTrip')})`
        : format.distance(trip.distanceMiles),
    },
    odometer &&
      trip.odometerStartMiles !== undefined && {
        label: i18n.t('mileage.odometerStart'),
        value: format.distance(trip.odometerStartMiles),
      },
    odometer && {
      label: i18n.t('mileage.odometerEnd'),
      value: format.distance(trip.odometerEndMiles!),
    },
  ].filter((row): row is { label: string; value: string } => !!row)
  const costRows = [
    fuel && { label: i18n.t('mileage.fuel'), value: fuel.name },
    estimate.milesPerGallon && {
      label: i18n.t('mileage.fuelEconomy'),
      value: format.economy(estimate.milesPerGallon),
    },
    estimate.price && {
      label: i18n.t('mileage.fuelPrice'),
      value: format.price(estimate.price.pricePerGallon),
    },
    estimate.cost !== undefined && {
      label: i18n.t('mileage.estimatedCost'),
      value: format.cost(estimate.cost),
    },
  ].filter((row): row is { label: string; value: string } => !!row)

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Header
        buttonType='back'
        title={i18n.t('mileage.trip')}
        rightElement={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
            <IconButton
              icon={ShareIcon}
              size={20}
              onPress={() => void actions.share(trip)}
              accessibilityLabel={i18n.t('share')}
            />
            <IconButton
              icon={PencilIcon}
              size={20}
              onPress={() => actions.edit(trip)}
              accessibilityLabel={i18n.t('edit')}
            />
          </View>
        }
      />
      <ScrollView
        contentContainerStyle={{
          padding: 15,
          gap: 20,
          paddingBottom: insets.bottom + 30,
          width: '100%',
          maxWidth: 720,
          alignSelf: 'center',
        }}
      >
        <Section>
          {rows.map((row, i) => (
            <DetailRow key={row.label} {...row} last={i === rows.length - 1} />
          ))}
        </Section>
        {costRows.length > 0 && (
          <Section>
            {costRows.map((row, i) => (
              <DetailRow
                key={row.label}
                {...row}
                last={i === costRows.length - 1}
              />
            ))}
          </Section>
        )}
        {trip.note ? (
          <Section>
            <InputRowContainer
              label={i18n.t('note')}
              lastInSection
              controlWidth='full'
            >
              <Text selectable>{trip.note}</Text>
            </InputRowContainer>
          </Section>
        ) : null}
        <Button
          noTransform
          accessibilityRole='button'
          onPress={() => actions.requestDelete(trip)}
          style={{ alignItems: 'center', paddingVertical: 12 }}
        >
          <Text
            style={{
              color: theme.colors.error,
              fontFamily: theme.fonts.semiBold,
              fontSize: theme.fontSize('md'),
            }}
          >
            {i18n.t('deleteEllipsis')}
          </Text>
        </Button>
      </ScrollView>
    </View>
  )
}
