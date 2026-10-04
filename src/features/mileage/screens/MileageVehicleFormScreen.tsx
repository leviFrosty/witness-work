import { useState } from 'react'
import { Alert, type AlertButton, View } from 'react-native'
import * as Crypto from 'expo-crypto'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useToastController } from '@tamagui/toast'
import useTheme from '@/contexts/theme'
import i18n, { type TranslationKey } from '@/lib/locales'
import { analytics } from '@/lib/analytics'
import useMileage from '@/stores/mileage'
import Wrapper from '@/components/ui/layout/Wrapper'
import Section from '@/components/ui/inputs/Section'
import TextInputRow from '@/components/ui/inputs/TextInputRow'
import InputRowSelect from '@/components/ui/inputs/InputRowSelect'
import { inputLayout } from '@/components/ui/inputs/InputLayout'
import ActionButton from '@/components/ui/ActionButton'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import {
  effectiveEntry,
  resolveHistoryWrite,
  toDateKey,
  type HistoryChangeMode,
} from '@/lib/mileage/calc'
import {
  displayToPricePerGallon,
  economyToMpg,
  formatInputNumber,
  fuelVolumeUnit,
  mpgToEconomy,
  parseDecimal,
} from '@/lib/mileage/units'
import useMileageFormatter from '@/features/mileage/hooks/useMileageFormatter'
import useMileageIndex from '@/features/mileage/hooks/useMileageIndex'
import HistoryChangeRow from '@/features/mileage/components/HistoryChangeRow'
import HistoryList from '@/features/mileage/components/HistoryList'
import type { RootStackParamList } from '@/types/rootStack'

type Props = NativeStackScreenProps<RootStackParamList, 'MileageVehicleForm'>

const NO_FUEL = '__none__'
const NEW_FUEL = '__new__'

/** Add or edit a car: name, fuel, and effective-dated fuel economy. */
export default function MileageVehicleFormScreen({ route, navigation }: Props) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const toast = useToastController()
  const {
    vehicles,
    fuels,
    trips,
    saveVehicle,
    deleteVehicle,
    saveFuel,
    saveFuelPrice,
    saveVehicleSetup,
    deleteVehicleSetup,
  } = useMileage()
  const format = useMileageFormatter()
  const index = useMileageIndex()
  const existing = vehicles.find((v) => v.id === route.params?.vehicleId)
  const history = existing ? (index.setupsByVehicle.get(existing.id) ?? []) : []
  const today = toDateKey(new Date())
  const current = effectiveEntry(history, today)
  const toEconomyInput = (mpg?: number) =>
    mpg === undefined
      ? ''
      : formatInputNumber(mpgToEconomy(mpg, format.economyUnit), 1)
  const currentFuel =
    current?.fuelId && fuels.some((f) => f.id === current.fuelId)
      ? current.fuelId
      : NO_FUEL

  const [name, setName] = useState(existing?.name ?? '')
  const [fuel, setFuel] = useState(() =>
    existing ? currentFuel : (fuels[0]?.id ?? NEW_FUEL)
  )
  const [newFuelName, setNewFuelName] = useState('')
  const [newFuelPrice, setNewFuelPrice] = useState('')
  const [economy, setEconomy] = useState(() =>
    toEconomyInput(current?.milesPerGallon)
  )
  const [changeMode, setChangeMode] = useState<HistoryChangeMode>('starting')
  const [changeDate, setChangeDate] = useState(() => new Date())

  const economyValue = parseDecimal(economy)
  const setupChanged =
    fuel !== currentFuel || economy !== toEconomyInput(current?.milesPerGallon)
  const askHowToApply = !!current && setupChanged
  const creatingFuel = fuel === NEW_FUEL && newFuelName.trim().length > 0
  const submittable =
    name.trim().length > 0 && (economyValue === undefined || economyValue > 0)

  const fuelOptions = [
    { label: i18n.t('none'), value: NO_FUEL },
    ...fuels.map((f) => ({ label: f.name, value: f.id })),
    { label: i18n.t('mileage.newFuel'), value: NEW_FUEL },
  ]

  const save = () => {
    if (!submittable) return
    const vehicleId = existing?.id ?? Crypto.randomUUID()
    saveVehicle({
      id: vehicleId,
      name: name.trim(),
      archived: existing?.archived,
      createdAt: existing?.createdAt ?? Date.now(),
    })

    let fuelId = fuel === NO_FUEL || fuel === NEW_FUEL ? undefined : fuel
    if (creatingFuel) {
      fuelId = Crypto.randomUUID()
      saveFuel({ id: fuelId, name: newFuelName.trim(), createdAt: Date.now() })
      const price = parseDecimal(newFuelPrice)
      if (price !== undefined)
        saveFuelPrice({
          id: Crypto.randomUUID(),
          fuelId,
          effectiveFrom: today,
          pricePerGallon: displayToPricePerGallon(price, format.economyUnit),
        })
    }
    const milesPerGallon =
      economyValue !== undefined
        ? economyToMpg(economyValue, format.economyUnit)
        : undefined

    if (current && (setupChanged || creatingFuel)) {
      const { target, effectiveFrom } = resolveHistoryWrite(
        history,
        changeMode,
        toDateKey(changeDate),
        today
      )
      saveVehicleSetup({
        id: target?.id ?? Crypto.randomUUID(),
        vehicleId,
        effectiveFrom,
        fuelId,
        milesPerGallon,
      })
    } else if (!current && (fuelId || milesPerGallon)) {
      saveVehicleSetup({
        id: Crypto.randomUUID(),
        vehicleId,
        effectiveFrom: today,
        fuelId,
        milesPerGallon,
      })
    }

    if (!existing)
      analytics.capture('mileage_vehicle_added', {
        has_fuel: !!fuelId,
        has_fuel_economy: milesPerGallon !== undefined,
        created_fuel: creatingFuel,
        setup_change: askHowToApply ? changeMode : undefined,
        source: route.params?.source,
      })
    if (route.params?.thenLogTrip)
      navigation.replace('MileageTripForm', { source: route.params.source })
    else navigation.goBack()
  }

  const tripCount = existing
    ? trips.filter((t) => t.vehicleId === existing.id).length
    : 0

  const setArchived = (archived: boolean) => {
    if (!existing) return
    saveVehicle({ ...existing, archived: archived || undefined })

    toast.show(
      i18n.t(archived ? 'mileage.carArchived' : 'mileage.carUnarchived'),
      { native: true }
    )
    navigation.goBack()
  }

  const remove = () => {
    if (!existing) return
    deleteVehicle(existing.id)

    navigation.goBack()
  }

  const requestRemove = () => {
    if (!existing) return
    const buttons: (AlertButton | false)[] = [
      { text: i18n.t('cancel'), style: 'cancel' },
      !existing.archived && {
        text: i18n.t('archive'),
        onPress: () => setArchived(true),
      },
      {
        text:
          tripCount > 0
            ? i18n.t('mileage.deleteCarAndTrips' as TranslationKey, {
                count: tripCount,
              })
            : i18n.t('delete'),
        style: 'destructive',
        onPress: remove,
      },
    ]
    Alert.alert(
      i18n.t('mileage.removeCar_title'),
      i18n.t(
        existing.archived
          ? 'mileage.deleteCar_description'
          : 'mileage.removeCar_description'
      ),
      buttons.filter((button): button is AlertButton => !!button)
    )
  }

  return (
    <Wrapper insets='bottom'>
      <KeyboardAwareScrollView
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={{
          paddingTop: 20,
          paddingBottom: insets.bottom + 30,
          paddingHorizontal: inputLayout.horizontalPadding,
          width: '100%',
          maxWidth: inputLayout.contentMaxWidth,
          alignSelf: 'center',
          gap: 20,
        }}
      >
        <Section>
          <TextInputRow
            label={i18n.t('name')}
            required
            lastInSection
            textInputProps={{
              value: name,
              onChangeText: setName,
              placeholder: i18n.t('mileage.carNamePlaceholder'),
              autoFocus: !existing,
              maxLength: 60,
            }}
          />
        </Section>

        <View style={{ gap: 8 }}>
          <Section>
            <InputRowSelect
              label={i18n.t('mileage.fuel')}
              info={i18n.t('mileage.carFuel_info')}
              lastInSection={fuel !== NEW_FUEL}
              selectProps={{
                data: fuelOptions,
                value: fuel,
                onChange: (item) => setFuel(item.value),
                accessibilityLabel: i18n.t('mileage.fuel'),
              }}
            />
            {fuel === NEW_FUEL && (
              <>
                <TextInputRow
                  label={i18n.t('mileage.fuelName')}
                  textInputProps={{
                    value: newFuelName,
                    onChangeText: setNewFuelName,
                    placeholder: i18n.t('mileage.fuelNamePlaceholder'),
                    maxLength: 60,
                  }}
                />
                <TextInputRow
                  label={i18n.t(
                    `mileage.pricePer_${fuelVolumeUnit(format.economyUnit)}`
                  )}
                  info={i18n.t('mileage.fuelPrice_info')}
                  lastInSection
                  textInputProps={{
                    value: newFuelPrice,
                    onChangeText: setNewFuelPrice,
                    inputMode: 'decimal',
                    placeholder: i18n.t('mileage.optional'),
                    maxLength: 8,
                  }}
                />
              </>
            )}
          </Section>
          <Section>
            <TextInputRow
              label={`${i18n.t('mileage.fuelEconomy')} (${format.economySuffix})`}
              info={i18n.t('mileage.fuelEconomy_info')}
              lastInSection
              textInputProps={{
                value: economy,
                onChangeText: setEconomy,
                inputMode: 'decimal',
                placeholder: i18n.t('mileage.optional'),
                maxLength: 6,
              }}
            />
          </Section>
        </View>

        {askHowToApply && (
          <HistoryChangeRow
            mode={changeMode}
            onChangeMode={setChangeMode}
            date={changeDate}
            onChangeDate={setChangeDate}
          />
        )}

        <HistoryList
          entries={history.map((entry) => ({
            id: entry.id,
            effectiveFrom: entry.effectiveFrom,
            value:
              [
                fuels.find((f) => f.id === entry.fuelId)?.name,
                entry.milesPerGallon && format.economy(entry.milesPerGallon),
              ]
                .filter(Boolean)
                .join(' · ') || i18n.t('none'),
          }))}
          onDelete={deleteVehicleSetup}
        />

        <View style={{ gap: 8 }}>
          <ActionButton disabled={!submittable} onPress={save}>
            {i18n.t(route.params?.thenLogTrip ? 'mileage.next' : 'save')}
          </ActionButton>
          {existing?.archived && (
            <Button
              noTransform
              accessibilityRole='button'
              onPress={() => setArchived(false)}
              style={{ alignItems: 'center', paddingVertical: 12 }}
            >
              <Text
                style={{
                  color: theme.colors.accent,
                  fontFamily: theme.fonts.semiBold,
                  fontSize: theme.fontSize('md'),
                }}
              >
                {i18n.t('mileage.unarchive')}
              </Text>
            </Button>
          )}
          {existing && (
            <Button
              noTransform
              accessibilityRole='button'
              onPress={requestRemove}
              style={{ alignItems: 'center', paddingVertical: 12 }}
            >
              <Text
                style={{
                  color: theme.colors.error,
                  fontFamily: theme.fonts.semiBold,
                  fontSize: theme.fontSize('md'),
                }}
              >
                {i18n.t(
                  existing.archived ? 'deleteEllipsis' : 'mileage.removeCar'
                )}
              </Text>
            </Button>
          )}
        </View>
      </KeyboardAwareScrollView>
    </Wrapper>
  )
}
