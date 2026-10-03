import { ScrollView, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useToastController } from '@tamagui/toast'
import { Plus as PlusIcon } from 'lucide-react-native'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { analytics } from '@/lib/analytics'
import confirmDestructive from '@/lib/confirmDestructive'
import { usePreferences } from '@/stores/preferences'
import useMileage from '@/stores/mileage'
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
import type { RootStackNavigation } from '@/types/rootStack'
import type { DistanceUnit, FuelEconomyUnit, Vehicle } from '@/types/mileage'

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

/** Cars, fuels, units, and delete-all for Mileage Tracking. */
export default function MileageSettingsScreen() {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const toast = useToastController()
  const navigation = useNavigation<RootStackNavigation>()
  const { vehicles, fuels, deleteAllMileageData } = useMileage()
  const { distanceUnit, fuelEconomyUnit, set } = usePreferences()
  const format = useMileageFormatter()
  const index = useMileageIndex()
  const auto = resolveMileageUnits({})
  const today = toDateKey(new Date())
  const active = vehicles.filter((v) => !v.archived)
  const archived = vehicles.filter((v) => v.archived)

  const carSummary = (vehicle: Vehicle, f: MileageFormatter) => {
    const setup = effectiveEntry(index.setupsByVehicle.get(vehicle.id), today)
    return [
      fuels.find((fuel) => fuel.id === setup?.fuelId)?.name,
      setup?.milesPerGallon && f.economy(setup.milesPerGallon),
    ]
      .filter(Boolean)
      .join(' · ')
  }

  const carRows = (list: Vehicle[], withAdd: boolean) =>
    list.map((vehicle, i) => (
      <MileageLinkRow
        key={vehicle.id}
        label={vehicle.name}
        value={carSummary(vehicle, format)}
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

  const requestDeleteAll = () =>
    confirmDestructive({
      title: i18n.t('mileage.deleteAll_title'),
      description: i18n.t('mileage.deleteAll_description'),
      confirmLabel: i18n.t('mileage.deleteAll'),
      onConfirm: () => {
        deleteAllMileageData()
        analytics.capture('mileage_data_deleted')
        toast.show(i18n.t('success'), {
          message: i18n.t('deleted'),
          native: true,
        })
      },
    })

  return (
    <ScrollView
      style={{ backgroundColor: theme.colors.background }}
      contentContainerStyle={{
        padding: inputLayout.horizontalPadding,
        paddingBottom: insets.bottom + 30,
        width: '100%',
        maxWidth: inputLayout.contentMaxWidth,
        alignSelf: 'center',
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
            const price = effectiveEntry(index.pricesByFuel.get(fuel.id), today)
            return (
              <MileageLinkRow
                key={fuel.id}
                label={fuel.name}
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
          <InputRowSelect
            label={i18n.t('mileage.distanceUnit')}
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
                analytics.capture('mileage_units_changed', {
                  setting: 'distance',
                  unit: value,
                })
              },
              accessibilityLabel: i18n.t('mileage.distanceUnit'),
            }}
          />
          <InputRowSelect
            label={i18n.t('mileage.fuelEconomyUnit')}
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
                analytics.capture('mileage_units_changed', {
                  setting: 'fuel_economy',
                  unit: value,
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
    </ScrollView>
  )
}
