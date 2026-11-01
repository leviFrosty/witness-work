import { ScrollView, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import ContentColumn from '@/components/ui/layout/ContentColumn'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { toast } from '@/stores/toasts'
import { Plus as PlusIcon } from 'lucide-react-native'
import useTheme from '@/contexts/theme'
import i18n, { type TranslationKey } from '@/lib/locales'
import { analytics } from '@/lib/analytics'
import confirmDestructive from '@/lib/confirmDestructive'
import { usePreferences } from '@/stores/preferences'
import { useMileageView } from '@/stores/mileageView'
import { deleteAllMileageData } from '@/stores/mileageWrites'
import useSharedCars from '@/stores/sharedCars'
import Section from '@/components/ui/inputs/Section'
import InputRowSelect from '@/components/ui/inputs/InputRowSelect'
import { inputLayout } from '@/components/ui/inputs/InputLayout'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import { effectiveEntry, toDateKey } from '@/lib/mileage/calc'
import { DISTANCE_UNITS, FUEL_ECONOMY_UNITS } from '@/lib/mileage/units'
import {
  resolveMileageUnits,
  type MileageFormatter,
} from '@/features/mileage/lib/format'
import useMileageFormatter from '@/features/mileage/hooks/useMileageFormatter'
import useMileageIndex from '@/features/mileage/hooks/useMileageIndex'
import MileageLinkRow from '@/features/mileage/components/MileageLinkRow'
import useMileageSharing, {
  useMileagePeople,
} from '@/features/mileage/hooks/useMileageSharing'
import {
  deleteAllMileage,
  hasSharedCarsToLeave,
} from '@/features/mileage/lib/deleteAllMileage'
import { fuelLabel } from '@/features/mileage/lib/fuelLabel'
import type { RootStackNavigation } from '@/types/rootStack'
import type {
  DistanceUnit,
  FuelEconomyUnit,
  MileageVehicle,
} from '@/types/mileage'

const AUTO = 'auto'

function SectionTitle({ children }: { children: string }) {
  const theme = useTheme()
  return (
    <Text
      style={{
        fontFamily: theme.fonts.semiBold,
        color: theme.colors.textAlt,
        marginLeft: 5,
      }}
    >
      {children}
    </Text>
  )
}

export default function MileageSettingsScreen() {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<RootStackNavigation>()
  const { vehicles, fuels, sharedRecordSpaces } = useMileageView()
  const people = useMileagePeople()
  const sharing = useMileageSharing()
  const hasSharedCars = useSharedCars(hasSharedCarsToLeave)
  const { distanceUnit, fuelEconomyUnit, set } = usePreferences()
  const format = useMileageFormatter()
  const index = useMileageIndex()
  const auto = resolveMileageUnits({})
  const today = toDateKey(new Date())
  const active = vehicles.filter((v) => !v.archived)
  const archived = vehicles.filter((v) => v.archived)

  const carSummary = (vehicle: MileageVehicle, f: MileageFormatter) => {
    const setup = effectiveEntry(index.setupsByVehicle.get(vehicle.id), today)
    return [
      fuels.find((fuel) => fuel.id === setup?.fuelId)?.name,
      setup?.milesPerGallon && f.economy(setup.milesPerGallon),
    ]
      .filter(Boolean)
      .join(' · ')
  }

  const carRows = (list: MileageVehicle[], withAdd: boolean) =>
    list.map((vehicle, i) => (
      <MileageLinkRow
        key={vehicle.id}
        label={vehicle.name}
        value={carSummary(vehicle, format)}
        people={
          vehicle.spaceId === undefined
            ? undefined
            : people.onCar(vehicle.spaceId).length
        }
        onPress={() =>
          navigation.navigate('MileageVehicleForm', {
            vehicleId: vehicle.id,
            source: 'mileage_settings',
          })
        }
        lastInSection={!withAdd && i === list.length - 1}
      />
    ))

  const distanceLabel = (unit: DistanceUnit) =>
    i18n.t(`mileage.unitNames.${unit}`)
  const economyLabel = (unit: FuelEconomyUnit) =>
    i18n.t(`mileage.unitNames.${unit}`)

  const deleteAll = async () => {
    const key = 'mileage-delete-all'
    if (hasSharedCars) toast.info(i18n.t('mileage.deletingAll'), { key })
    const left = deleteAllMileage({
      deleteOwn: deleteAllMileageData,
      leaveSharedCars: sharing.leaveAll,
      hasSharedCars,
    })
    analytics.capture('mileage_data_deleted')
    const { notLeft } = await left
    if (notLeft.length === 0) {
      toast.success(i18n.t('success'), { key, message: i18n.t('deleted') })
      return
    }

    const [car, ...more] = notLeft.map(({ name }) => name)
    toast.error(
      car && more.length === 0
        ? i18n.t('mileage.deleteAllCarNotLeft', { car })
        : i18n.t('mileage.deleteAllCarsNotLeft' as TranslationKey, {
            count: notLeft.length,
          }),
      { key, message: i18n.t('mileage.deleteAllNotLeft_message') }
    )
  }

  const requestDeleteAll = () =>
    confirmDestructive({
      title: i18n.t('mileage.deleteAll_title'),
      description: i18n.t(
        hasSharedCars
          ? 'mileage.deleteAll_descriptionShared'
          : 'mileage.deleteAll_description'
      ),
      confirmLabel: i18n.t('mileage.deleteAll'),
      onConfirm: () => void deleteAll(),
    })

  return (
    <ScrollView style={{ backgroundColor: theme.colors.background }}>
      <ContentColumn
        style={{
          padding: inputLayout.horizontalPadding,
          paddingBottom: insets.bottom + 30,
          gap: 24,
        }}
      >
        <View style={{ gap: 8 }}>
          <SectionTitle>{i18n.t('mileage.cars')}</SectionTitle>
          <Section>
            {carRows(active, true)}
            <MileageLinkRow
              label={i18n.t('mileage.addCar')}
              leftIcon={PlusIcon}
              onPress={() =>
                navigation.navigate('MileageVehicleForm', {
                  source: 'mileage_settings',
                })
              }
              lastInSection
            />
          </Section>
        </View>

        {archived.length > 0 && (
          <View style={{ gap: 8 }}>
            <SectionTitle>{i18n.t('mileage.archivedCars')}</SectionTitle>
            <Section>{carRows(archived, false)}</Section>
          </View>
        )}

        <View style={{ gap: 8 }}>
          <SectionTitle>{i18n.t('mileage.fuels')}</SectionTitle>
          <Section>
            {fuels.map((fuel) => {
              const price = effectiveEntry(
                index.pricesByFuel.get(fuel.id),
                today
              )
              return (
                <MileageLinkRow
                  key={fuel.id}
                  label={fuelLabel(fuel, { vehicles, sharedRecordSpaces })}
                  value={price ? format.price(price.pricePerGallon) : undefined}
                  onPress={() =>
                    navigation.navigate('MileageFuelForm', { fuelId: fuel.id })
                  }
                />
              )
            })}
            <MileageLinkRow
              label={i18n.t('mileage.addFuel')}
              leftIcon={PlusIcon}
              onPress={() => navigation.navigate('MileageFuelForm')}
              lastInSection
            />
          </Section>
        </View>

        <View style={{ gap: 8 }}>
          <SectionTitle>{i18n.t('mileage.units.title')}</SectionTitle>
          <Section>
            {}
            <InputRowSelect
              label={i18n.t('mileage.distanceUnit')}
              controlWidth='auto'
              selectProps={{
                data: [
                  {
                    label: i18n.t('mileage.autoUnit', {
                      unit: distanceLabel(auto.distanceUnit),
                    }),
                    value: AUTO,
                  },
                  ...DISTANCE_UNITS.map((unit) => ({
                    label: distanceLabel(unit),
                    value: unit,
                  })),
                ],
                value: distanceUnit ?? AUTO,
                onChange: ({ value }) => {
                  set({
                    distanceUnit:
                      value === AUTO ? undefined : (value as DistanceUnit),
                  })
                },
                accessibilityLabel: i18n.t('mileage.distanceUnit'),
              }}
            />
            <InputRowSelect
              label={i18n.t('mileage.fuelEconomyUnit')}
              controlWidth='auto'
              lastInSection
              selectProps={{
                data: [
                  {
                    label: i18n.t('mileage.autoUnit', {
                      unit: economyLabel(auto.economyUnit),
                    }),
                    value: AUTO,
                  },
                  ...FUEL_ECONOMY_UNITS.map((unit) => ({
                    label: economyLabel(unit),
                    value: unit,
                  })),
                ],
                value: fuelEconomyUnit ?? AUTO,
                onChange: ({ value }) => {
                  set({
                    fuelEconomyUnit:
                      value === AUTO ? undefined : (value as FuelEconomyUnit),
                  })
                },
                accessibilityLabel: i18n.t('mileage.fuelEconomyUnit'),
              }}
            />
          </Section>
        </View>

        <Button
          noTransform
          accessibilityRole='button'
          onPress={requestDeleteAll}
          style={{ alignItems: 'center', paddingVertical: 12 }}
        >
          <Text
            style={{
              color: theme.colors.error,
              fontFamily: theme.fonts.semiBold,
              fontSize: theme.fontSize('md'),
            }}
          >
            {i18n.t('mileage.deleteAllEllipsis')}
          </Text>
        </Button>
      </ContentColumn>
    </ScrollView>
  )
}
