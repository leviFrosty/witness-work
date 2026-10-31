import useFormValidation from '@/hooks/useFormValidation'
import { useEffect, useState, type ReactNode } from 'react'
import ContentColumn from '@/components/ui/layout/ContentColumn'
import { Alert, type AlertButton, View } from 'react-native'
import * as Crypto from 'expo-crypto'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import KeyboardAwareScrollView from '@/components/ui/layout/KeyboardAwareScrollView'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { toast } from '@/stores/toasts'
import useTheme from '@/contexts/theme'
import i18n, { type TranslationKey } from '@/lib/locales'
import { analytics } from '@/lib/analytics'
import { useMileageView } from '@/stores/mileageView'
import {
  deleteVehicle,
  deleteVehicleSetup,
  saveFuel,
  saveFuelPrice,
  saveVehicle,
  saveVehicleSetup,
} from '@/stores/mileageWrites'
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
import { fuelsForVehicle } from '@/lib/mileage/view'
import {
  displayToPricePerGallon,
  economyToMpg,
  formatEditableNumber,
  fuelVolumeUnit,
  mpgToEconomy,
  parseDecimal,
} from '@/lib/mileage/units'
import useMileageFormatter from '@/features/mileage/hooks/useMileageFormatter'
import useMileageIndex from '@/features/mileage/hooks/useMileageIndex'
import HistoryChangeRow from '@/features/mileage/components/HistoryChangeRow'
import HistoryList from '@/features/mileage/components/HistoryList'
import SharedCarsNotice from '@/features/mileage/components/SharedCarsNotice'
import { carRemoval } from '@/features/mileage/lib/carRemoval'
import type { RootStackParamList } from '@/types/rootStack'

/**
 * The car form's People section: who's on a Shared Car, or Share Car… for one
 * of the User's own. Shared Cars lives in the app tier, which supplies it.
 */
export type CarPeopleSlot = (props: { vehicleId: string }) => ReactNode

type Props = NativeStackScreenProps<
  RootStackParamList,
  'MileageVehicleForm'
> & {
  renderPeople?: CarPeopleSlot
}

const NO_FUEL = '__none__'
const NEW_FUEL = '__new__'

/**
 * Add or edit a car: name, the people on it (`renderPeople`), fuel, and
 * effective-dated fuel economy. On a Shared Car, says when its changes aren't
 * being shared, and offers archiving but never deleting.
 */
export default function MileageVehicleFormScreen({
  route,
  navigation,
  renderPeople,
}: Props) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const view = useMileageView()
  const { vehicles, trips } = view
  const format = useMileageFormatter()
  const index = useMileageIndex()
  const existing = vehicles.find((v) => v.id === route.params?.vehicleId)
  const editing = route.params?.vehicleId !== undefined

  // Deleted here or on another device, or a Shared Car that ended (left,
  // stopped, removed): its copy has another id, so this form has nothing to
  // edit. This is also how the form's own Delete closes it, so it closes once.
  const gone = editing && !existing
  useEffect(() => {
    if (!gone) return
    if (navigation.canGoBack()) navigation.goBack()
    // Opened on its own (from a link, say): the cars, not an empty form.
    else navigation.replace('MileageSettings')
  }, [gone, navigation])
  // A Shared Car's setups name its own fuels; the User's cars, theirs.
  const fuels = fuelsForVehicle(view, existing?.id)
  const history = existing ? (index.setupsByVehicle.get(existing.id) ?? []) : []
  const today = toDateKey(new Date())
  const current = effectiveEntry(history, today)
  const toEconomyInput = (mpg?: number) =>
    mpg === undefined
      ? ''
      : formatEditableNumber(mpgToEconomy(mpg, format.economyUnit), 1)
  const currentFuel =
    current?.fuelId && fuels.some((f) => f.id === current.fuelId)
      ? current.fuelId
      : NO_FUEL

  // What the User typed or picked, null until they do: until then each field
  // shows the car as it is now, so Save doesn't write back what changed
  // meanwhile. Someone else on a Shared Car may rename it or change its fuel,
  // and Share Car… moves its setups onto the car's own copies of its fuels.
  const [typedName, setName] = useState<string | null>(null)
  const [pickedFuel, setFuel] = useState<string | null>(null)
  const [typedEconomy, setEconomy] = useState<string | null>(null)
  const [newFuelName, setNewFuelName] = useState('')
  const [newFuelPrice, setNewFuelPrice] = useState('')
  const name = typedName ?? existing?.name ?? ''
  // A fuel picked before Share Car… isn't one the car can name anymore.
  const fuel =
    pickedFuel !== null &&
    (pickedFuel === NO_FUEL ||
      pickedFuel === NEW_FUEL ||
      fuels.some((f) => f.id === pickedFuel))
      ? pickedFuel
      : existing
        ? currentFuel
        : (fuels[0]?.id ?? NEW_FUEL)
  const economy = typedEconomy ?? toEconomyInput(current?.milesPerGallon)
  const [changeMode, setChangeMode] = useState<HistoryChangeMode>('starting')
  const [changeDate, setChangeDate] = useState(() => new Date())

  const economyValue = parseDecimal(economy)
  const setupChanged =
    fuel !== currentFuel || economy !== toEconomyInput(current?.milesPerGallon)
  const askHowToApply = !!current && setupChanged
  const creatingFuel = fuel === NEW_FUEL && newFuelName.trim().length > 0
  const validation = useFormValidation(
    {
      name: !name.trim(),
      economy: economyValue !== undefined && economyValue <= 0,
    },
    'mileage_vehicle'
  )

  const fuelOptions = [
    { label: i18n.t('none'), value: NO_FUEL },
    ...fuels.map((f) => ({ label: f.name, value: f.id })),
    { label: i18n.t('mileage.newFuel'), value: NEW_FUEL },
  ]

  const save = () => {
    if (!validation.validate()) return
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
      saveFuel(
        { id: fuelId, name: newFuelName.trim(), createdAt: Date.now() },
        { vehicleId }
      )
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

    toast.success(
      i18n.t(archived ? 'mileage.carArchived' : 'mileage.carUnarchived')
    )
    navigation.goBack()
  }

  // The form closes as the car goes (`gone`).
  const remove = () => {
    if (existing) deleteVehicle(existing.id)
  }

  const removal = existing ? carRemoval(existing) : null

  const requestRemove = () => {
    if (!existing || !removal) return
    // A Shared Car is everyone's: it can be archived for all, not deleted.
    if (!removal.delete) {
      Alert.alert(
        i18n.t('mileage.archiveSharedCar_title'),
        i18n.t('mileage.archiveSharedCar_description'),
        [
          { text: i18n.t('cancel'), style: 'cancel' },
          { text: i18n.t('archive'), onPress: () => setArchived(true) },
        ]
      )
      return
    }
    const buttons: (AlertButton | false)[] = [
      { text: i18n.t('cancel'), style: 'cancel' },
      removal.archive && {
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
      <KeyboardAwareScrollView automaticallyAdjustKeyboardInsets>
        <ContentColumn
          style={{
            paddingTop: 20,
            paddingBottom: insets.bottom + 30,
            paddingHorizontal: inputLayout.horizontalPadding,
            gap: 20,
          }}
        >
          {existing?.spaceId !== undefined && (
            <SharedCarsNotice hasSharedCars spaceId={existing.spaceId} />
          )}

          <Section>
            <TextInputRow
              label={i18n.t('name')}
              required
              lastInSection
              textInputProps={{
                invalid: validation.invalid('name'),
                value: name,
                onChangeText: setName,
                placeholder: i18n.t('mileage.carNamePlaceholder'),
                autoFocus: !existing,
                maxLength: 60,
              }}
            />
          </Section>

          {existing && renderPeople?.({ vehicleId: existing.id })}

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
                label={i18n.t('mileage.fuelEconomyWithUnit', {
                  unit: format.economySuffix,
                })}
                info={i18n.t('mileage.fuelEconomy_info')}
                lastInSection
                textInputProps={{
                  invalid: validation.invalid('economy'),
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
            <ActionButton onPress={save}>
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
            {removal && (removal.archive || removal.delete) && (
              <Button
                noTransform
                accessibilityRole='button'
                onPress={requestRemove}
                style={{ alignItems: 'center', paddingVertical: 12 }}
              >
                {/* Archiving a Shared Car takes nothing away from anyone, so
                    only the choice that can delete reads as destructive. */}
                <Text
                  style={{
                    color: removal.delete
                      ? theme.colors.error
                      : theme.colors.accent,
                    fontFamily: theme.fonts.semiBold,
                    fontSize: theme.fontSize('md'),
                  }}
                >
                  {i18n.t(
                    !removal.delete
                      ? 'mileage.archiveCarEllipsis'
                      : removal.archive
                        ? 'mileage.removeCar'
                        : 'deleteEllipsis'
                  )}
                </Text>
              </Button>
            )}
          </View>
        </ContentColumn>
      </KeyboardAwareScrollView>
    </Wrapper>
  )
}
