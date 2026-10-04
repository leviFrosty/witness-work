import { useState } from 'react'
import { View } from 'react-native'
import * as Crypto from 'expo-crypto'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { analytics } from '@/lib/analytics'
import Haptics from '@/lib/haptics'
import { usePreferences } from '@/stores/preferences'
import useMileage from '@/stores/mileage'
import Wrapper from '@/components/ui/layout/Wrapper'
import Section from '@/components/ui/inputs/Section'
import InputRowContainer from '@/components/ui/inputs/InputRowContainer'
import InputRowSwitch from '@/components/ui/inputs/InputRowSwitch'
import InputRowSelect from '@/components/ui/inputs/InputRowSelect'
import TextInputRow from '@/components/ui/inputs/TextInputRow'
import { inputLayout } from '@/components/ui/inputs/InputLayout'
import DateTimePicker from '@/components/ui/DateTimePicker'
import SegmentedControl from '@/components/ui/SegmentedControl'
import ActionButton from '@/components/ui/ActionButton'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import {
  defaultVehicleId,
  fromDateKey,
  latestOdometerMiles,
  toDateKey,
} from '@/lib/mileage/calc'
import {
  distanceToMiles,
  formatInputNumber,
  milesToDistance,
  parseDecimal,
} from '@/lib/mileage/units'
import useMileageFormatter from '@/features/mileage/hooks/useMileageFormatter'
import useTripActions from '@/features/mileage/hooks/useTripActions'
import TripNoteRow from '@/features/mileage/components/TripNoteRow'
import type { RootStackParamList } from '@/types/rootStack'
import type { MileageEntryMode, Trip } from '@/types/mileage'

type Props = NativeStackScreenProps<RootStackParamList, 'MileageTripForm'>

/** Log a trip, edit one (`tripId`), or log one again (`duplicateOf`). */
export default function MileageTripFormScreen({ route, navigation }: Props) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const { trips, vehicles, saveTrip } = useMileage()
  const { mileageEntryMode, set: setPreferences } = usePreferences()
  const format = useMileageFormatter()
  const { requestDelete } = useTripActions()
  const existing = trips.find((t) => t.id === route.params?.tripId)
  const template =
    existing ?? trips.find((t) => t.id === route.params?.duplicateOf)
  const unit = format.distanceUnit
  const toInput = (miles?: number) =>
    miles === undefined
      ? ''
      : formatInputNumber(milesToDistance(miles, unit), 1)

  const [date, setDate] = useState(() =>
    existing ? fromDateKey(existing.date).toDate() : new Date()
  )
  const [vehicleId, setVehicleId] = useState(
    () => template?.vehicleId ?? defaultVehicleId(trips, vehicles)
  )
  const [mode, setMode] = useState<MileageEntryMode>(() =>
    template
      ? template.odometerEndMiles !== undefined
        ? 'odometer'
        : 'distance'
      : mileageEntryMode
  )
  const [roundTrip, setRoundTrip] = useState(template?.roundTrip ?? false)
  const [distance, setDistance] = useState(() =>
    template && template.odometerEndMiles === undefined
      ? toInput(
          template.roundTrip
            ? template.distanceMiles / 2
            : template.distanceMiles
        )
      : ''
  )
  // Odometer Start follows the car's latest reading until the user types one.
  const [odometerStart, setOdometerStart] = useState<string | null>(() =>
    existing?.odometerStartMiles !== undefined
      ? toInput(existing.odometerStartMiles)
      : null
  )
  const [odometerEnd, setOdometerEnd] = useState(() =>
    toInput(existing?.odometerEndMiles)
  )
  const [note, setNote] = useState(template?.note ?? '')

  const dateKey = toDateKey(date)
  const suggestedStart = vehicleId
    ? latestOdometerMiles(trips, vehicleId, dateKey, existing?.id)
    : undefined
  const startText = odometerStart ?? toInput(suggestedStart)

  const carOptions = vehicles
    .filter((v) => !v.archived || v.id === vehicleId)
    .map((v) => ({ label: v.name, value: v.id }))

  const distanceValue = parseDecimal(distance)
  const startValue = parseDecimal(startText)
  const endValue = parseDecimal(odometerEnd)
  const odometerError =
    mode === 'odometer' &&
    startValue !== undefined &&
    endValue !== undefined &&
    endValue <= startValue
  const distanceMiles =
    mode === 'distance'
      ? distanceValue && distanceValue > 0
        ? distanceToMiles(distanceValue, unit) * (roundTrip ? 2 : 1)
        : undefined
      : startValue !== undefined && endValue !== undefined && !odometerError
        ? distanceToMiles(endValue, unit) - distanceToMiles(startValue, unit)
        : undefined
  const submittable = !!vehicleId && !!distanceMiles

  const save = () => {
    if (!vehicleId || !distanceMiles) return
    const odometer = mode === 'odometer'
    const trip: Trip = {
      id: existing?.id ?? Crypto.randomUUID(),
      vehicleId,
      date: dateKey,
      distanceMiles,
      roundTrip: !odometer && roundTrip ? true : undefined,
      odometerStartMiles:
        odometer && startValue !== undefined
          ? distanceToMiles(startValue, unit)
          : undefined,
      odometerEndMiles:
        odometer && endValue !== undefined
          ? distanceToMiles(endValue, unit)
          : undefined,
      note: note.trim() || undefined,
      createdAt: existing?.createdAt ?? Date.now(),
      updatedAt: existing?.updatedAt,
    }
    saveTrip(trip)
    if (mode !== mileageEntryMode) setPreferences({ mileageEntryMode: mode })
    Haptics.success().catch(() => {})
    if (!existing)
      analytics.capture('mileage_trip_added', {
        entry_mode: mode,
        round_trip: !!trip.roundTrip,
        has_note: !!trip.note,
        logged_again: !existing && !!template,
        source: route.params?.source,
      })
    navigation.goBack()
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
          <InputRowContainer
            label={i18n.t('date')}
            controlStyle={{ alignItems: 'flex-end' }}
            lastInSection={carOptions.length < 2}
          >
            <DateTimePicker
              value={date}
              maximumDate={new Date()}
              onChange={(_e, picked) => picked && setDate(picked)}
            />
          </InputRowContainer>
          {carOptions.length > 1 && (
            <InputRowSelect
              label={i18n.t('mileage.car')}
              lastInSection
              selectProps={{
                data: carOptions,
                value: vehicleId,
                onChange: (item) => {
                  setVehicleId(item.value)
                  setOdometerStart(null)
                },
                accessibilityLabel: i18n.t('mileage.car'),
              }}
            />
          )}
        </Section>

        <View style={{ gap: 10 }}>
          <SegmentedControl<MileageEntryMode>
            value={mode}
            onChange={setMode}
            options={[
              { key: 'distance', label: i18n.t('mileage.distance') },
              { key: 'odometer', label: i18n.t('mileage.odometer') },
            ]}
          />
          <Section>
            {mode === 'distance' ? (
              <>
                <TextInputRow
                  label={`${i18n.t('mileage.distance')} (${format.distanceSuffix})`}
                  textInputProps={{
                    value: distance,
                    onChangeText: setDistance,
                    inputMode: 'decimal',
                    placeholder: '0',
                    autoFocus: !existing && !template,
                    maxLength: 8,
                  }}
                />
                <InputRowSwitch
                  label={i18n.t('mileage.roundTrip')}
                  info={i18n.t('mileage.roundTrip_info')}
                  value={roundTrip}
                  onValueChange={setRoundTrip}
                  lastInSection
                />
              </>
            ) : (
              <>
                <TextInputRow
                  label={`${i18n.t('mileage.odometerStart')} (${format.distanceSuffix})`}
                  info={i18n.t('mileage.odometerStart_info')}
                  textInputProps={{
                    value: startText,
                    onChangeText: setOdometerStart,
                    inputMode: 'decimal',
                    placeholder: '0',
                    maxLength: 10,
                  }}
                />
                <TextInputRow
                  label={`${i18n.t('mileage.odometerEnd')} (${format.distanceSuffix})`}
                  lastInSection
                  textInputProps={{
                    value: odometerEnd,
                    onChangeText: setOdometerEnd,
                    inputMode: 'decimal',
                    placeholder: '0',
                    maxLength: 10,
                  }}
                />
              </>
            )}
          </Section>
          {odometerError ? (
            <Text style={{ color: theme.colors.error, fontSize: 12 }}>
              {i18n.t('mileage.odometerError')}
            </Text>
          ) : mode === 'odometer' && distanceMiles ? (
            <Text style={{ color: theme.colors.textAlt, fontSize: 12 }}>
              {i18n.t('mileage.odometerDistance', {
                distance: format.distance(distanceMiles),
              })}
            </Text>
          ) : null}
        </View>

        <TripNoteRow value={note} onChangeText={setNote} />

        <View style={{ gap: 8 }}>
          <ActionButton disabled={!submittable} onPress={save}>
            {i18n.t('save')}
          </ActionButton>
          {existing && (
            <Button
              noTransform
              accessibilityRole='button'
              onPress={() => requestDelete(existing, () => navigation.goBack())}
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
          )}
        </View>
      </KeyboardAwareScrollView>
    </Wrapper>
  )
}
