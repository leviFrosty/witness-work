import useFormValidation from '@/hooks/useFormValidation'
import { useEffect, useState } from 'react'
import ContentColumn from '@/components/ui/layout/ContentColumn'
import { View } from 'react-native'
import * as Crypto from 'expo-crypto'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import KeyboardAwareScrollView from '@/components/ui/layout/KeyboardAwareScrollView'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import useTheme from '@/contexts/theme'
import i18n, { type TranslationKey } from '@/lib/locales'
import { formatPlainNumber } from '@/lib/numbers'
import { analytics } from '@/lib/analytics'
import { formatDate } from '@/lib/dates'
import Haptics from '@/lib/haptics'
import { usePreferences } from '@/stores/preferences'
import { useMileageView } from '@/stores/mileageView'
import { saveTrip } from '@/stores/mileageWrites'
import useSharedCars from '@/stores/sharedCars'
import { toast } from '@/stores/toasts'
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
  formatEditableNumber,
  milesToDistance,
  parseDecimal,
} from '@/lib/mileage/units'
import { sharedTripFits } from '@/lib/mileage/sharedCar'
import useMileageFormatter from '@/features/mileage/hooks/useMileageFormatter'
import useTripActions from '@/features/mileage/hooks/useTripActions'
import { useMileagePeople } from '@/features/mileage/hooks/useMileageSharing'
import { overlappingOdometerTrip } from '@/features/mileage/lib/odometerOverlap'
import { tripsLoggedByMe } from '@/lib/mileage/people'
import TripNoteRow from '@/features/mileage/components/TripNoteRow'
import { richTextImages } from '@/lib/richText/inspect'
import { getNoteDoc, hasNote, noteFields } from '@/lib/richText/notes'
import type { NoteFields } from '@/types/richText'
import type { RootStackParamList } from '@/types/rootStack'
import type { MileageEntryMode, Trip } from '@/types/mileage'

type Props = NativeStackScreenProps<RootStackParamList, 'MileageTripForm'>

export default function MileageTripFormScreen({ route, navigation }: Props) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const { trips, vehicles } = useMileageView()
  const { mileageEntryMode, set: setPreferences } = usePreferences()
  const format = useMileageFormatter()
  const { requestDelete } = useTripActions()
  const people = useMileagePeople()
  const editing = route.params?.tripId !== undefined
  const existing = trips.find((t) => t.id === route.params?.tripId)
  const template =
    existing ?? trips.find((t) => t.id === route.params?.duplicateOf)

  const gone = editing && !existing
  useEffect(() => {
    if (gone && navigation.canGoBack()) navigation.goBack()
  }, [gone, navigation])
  const unit = format.distanceUnit
  const toInput = (miles?: number) =>
    miles === undefined
      ? ''
      : formatEditableNumber(milesToDistance(miles, unit), 1)

  const [date, setDate] = useState(() =>
    existing ? fromDateKey(existing.date).toDate() : new Date()
  )

  const [chosenVehicleId, setVehicleId] = useState(
    () =>
      template?.vehicleId ??
      defaultVehicleId(
        tripsLoggedByMe(trips, useSharedCars.getState().cars),
        vehicles
      )
  )

  const vehicleId = vehicles.some((v) => v.id === chosenVehicleId)
    ? chosenVehicleId
    : undefined
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

  const [odometerStart, setOdometerStart] = useState<string | null>(() =>
    existing?.odometerStartMiles !== undefined
      ? toInput(existing.odometerStartMiles)
      : null
  )
  const [odometerEnd, setOdometerEnd] = useState(() =>
    toInput(existing?.odometerEndMiles)
  )
  const [note, setNote] = useState<NoteFields>({
    note: template?.note,
    noteDoc: template?.noteDoc,
  })

  const dateKey = toDateKey(date)
  const suggestedStart = vehicleId
    ? latestOdometerMiles(trips, vehicleId, dateKey, existing?.id)
    : undefined
  const startText = odometerStart ?? toInput(suggestedStart)

  const peopleOn = (spaceId?: string) =>
    spaceId === undefined ? undefined : people.onCar(spaceId).length
  const carOptions = vehicles
    .filter((v) => !v.archived || v.id === vehicleId)
    .map((v) => {
      const count = peopleOn(v.spaceId)
      return count === undefined
        ? { label: v.name, value: v.id }
        : {
            label: i18n.t('mileage.sharedCarOption', {
              name: v.name,
              people: i18n.t('buddies_carPeople' as TranslationKey, { count }),
            }),
            value: v.id,
            systemImage: 'person.2' as const,
          }
    })

  const chosenSpace = vehicles.find((v) => v.id === vehicleId)?.spaceId
  const sharedWith =
    chosenSpace === undefined
      ? undefined
      : people.onCar(chosenSpace).filter((person) => !person.me).length

  const odometer = mode === 'odometer'
  const distanceValue = parseDecimal(distance)
  const startValue = parseDecimal(startText)
  const endValue = parseDecimal(odometerEnd)
  const startMiles =
    odometer && startValue !== undefined
      ? distanceToMiles(startValue, unit)
      : undefined
  const endMiles =
    odometer && endValue !== undefined
      ? distanceToMiles(endValue, unit)
      : undefined
  const odometerError =
    startMiles !== undefined && endMiles !== undefined && endMiles <= startMiles
  const distanceMiles = !odometer
    ? distanceValue && distanceValue > 0
      ? distanceToMiles(distanceValue, unit) * (roundTrip ? 2 : 1)
      : undefined
    : startMiles !== undefined && endMiles !== undefined && !odometerError
      ? endMiles - startMiles
      : undefined

  const overlap =
    vehicleId &&
    startMiles !== undefined &&
    endMiles !== undefined &&
    !odometerError
      ? overlappingOdometerTrip(trips, {
          vehicleId,
          startMiles,
          endMiles,
          excludeTripId: existing?.id,
        })
      : undefined

  const tripWith = (id: string, onVehicle: string): Trip => ({
    id,
    vehicleId: onVehicle,
    date: dateKey,
    distanceMiles: distanceMiles ?? 0,
    roundTrip: !odometer && roundTrip ? true : undefined,
    odometerStartMiles: startMiles,
    odometerEndMiles: endMiles,
    ...noteFields(getNoteDoc(note)),
    createdAt: existing?.createdAt ?? Date.now(),
    updatedAt: existing?.updatedAt,
  })

  const tooLargeToShare =
    chosenSpace !== undefined &&
    vehicleId !== undefined &&
    !sharedTripFits(tripWith(existing?.id ?? '', vehicleId))

  const validation = useFormValidation(
    {
      vehicle: !vehicleId,
      distance: mode === 'distance' && !distanceMiles,
      odometerStart: odometer && startValue === undefined,
      odometerEnd: odometer && (endValue === undefined || odometerError),
      note: tooLargeToShare,
    },
    'mileage_trip'
  )

  const save = () => {
    if (!validation.validate() || !vehicleId || !distanceMiles) return
    const trip = tripWith(existing?.id ?? Crypto.randomUUID(), vehicleId)

    if (!saveTrip(trip)) {
      toast.error(i18n.t('mileage.carUnavailable'))
      return
    }
    if (mode !== mileageEntryMode) setPreferences({ mileageEntryMode: mode })
    Haptics.success().catch(() => {})
    if (!existing)
      analytics.capture('mileage_trip_added', {
        entry_mode: mode,
        round_trip: !!trip.roundTrip,
        has_note: hasNote(trip),
        has_formatting: !!trip.noteDoc,
        note_photos: trip.noteDoc ? richTextImages(trip.noteDoc.doc).length : 0,
        logged_again: !existing && !!template,
        source: route.params?.source,
      })
    navigation.goBack()
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
          <Section>
            <InputRowContainer
              label={i18n.t('date')}
              controlStyle={{ alignItems: 'flex-end' }}
              lastInSection={carOptions.length < 2 && !!vehicleId}
            >
              <DateTimePicker
                value={date}
                onChange={(_e, picked) => picked && setDate(picked)}
              />
            </InputRowContainer>
            {(carOptions.length > 1 || !vehicleId) && (
              <InputRowSelect
                invalid={validation.invalid('vehicle')}
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
                    label={i18n.t('mileage.distanceWithUnit', {
                      unit: format.distanceSuffix,
                    })}
                    textInputProps={{
                      invalid: validation.invalid('distance'),
                      value: distance,
                      onChangeText: setDistance,
                      inputMode: 'decimal',
                      placeholder: formatPlainNumber(0),
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
                    label={i18n.t('mileage.odometerStartWithUnit', {
                      unit: format.distanceSuffix,
                    })}
                    info={i18n.t('mileage.odometerStart_info')}
                    textInputProps={{
                      invalid: validation.invalid('odometerStart'),
                      value: startText,
                      onChangeText: setOdometerStart,
                      inputMode: 'decimal',
                      placeholder: formatPlainNumber(0),
                      maxLength: 10,
                    }}
                  />
                  <TextInputRow
                    label={i18n.t('mileage.odometerEndWithUnit', {
                      unit: format.distanceSuffix,
                    })}
                    lastInSection
                    textInputProps={{
                      invalid: validation.invalid('odometerEnd'),
                      value: odometerEnd,
                      onChangeText: setOdometerEnd,
                      inputMode: 'decimal',
                      placeholder: formatPlainNumber(0),
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
            ) : odometer && distanceMiles ? (
              <Text style={{ color: theme.colors.textAlt, fontSize: 12 }}>
                {i18n.t('mileage.odometerDistance', {
                  distance: format.distance(distanceMiles),
                })}
              </Text>
            ) : null}
            {overlap && (
              <Text
                testID='trip-odometer-overlap'
                style={{ color: theme.colors.warnText, fontSize: 12 }}
              >
                {i18n.t('mileage.odometerOverlap', {
                  date: formatDate(fromDateKey(overlap.date)),
                })}
              </Text>
            )}
          </View>

          <View style={{ gap: 10 }}>
            <TripNoteRow
              note={note}
              onChange={setNote}
              sharedWith={sharedWith}
            />
            {tooLargeToShare && (
              <Text
                testID='trip-note-too-large'
                style={{ color: theme.colors.error, fontSize: 12 }}
              >
                {i18n.t('mileage.noteTooLargeToShare')}
              </Text>
            )}
          </View>

          <View style={{ gap: 8 }}>
            <ActionButton onPress={save}>{i18n.t('save')}</ActionButton>
            {existing && (
              <Button
                noTransform
                accessibilityRole='button'
                onPress={() => requestDelete(existing)}
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
        </ContentColumn>
      </KeyboardAwareScrollView>
    </Wrapper>
  )
}
