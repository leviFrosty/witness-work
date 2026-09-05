import { useState } from 'react'
import { Alert, View } from 'react-native'
import * as Crypto from 'expo-crypto'
import { useLocales } from 'expo-localization'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useToastController } from '@tamagui/toast'
import ActionButton from '@/components/ui/ActionButton'
import Button from '@/components/ui/Button'
import DateTimePicker from '@/components/ui/DateTimePicker'
import Text from '@/components/ui/MyText'
import SegmentedControl from '@/components/ui/SegmentedControl'
import InputRowContainer from '@/components/ui/inputs/InputRowContainer'
import InputRowSelect from '@/components/ui/inputs/InputRowSelect'
import Section from '@/components/ui/inputs/Section'
import TextInputRow from '@/components/ui/inputs/TextInputRow'
import useTheme from '@/contexts/theme'
import useMileageUnit from '@/hooks/useMileageUnit'
import i18n from '@/lib/locales'
import {
  defaultMileageVehicle,
  formatMileageInput,
  formatMileageDistance,
  localMileageDate,
  mileageDateToLocalDate,
  MileageValidationError,
  parseMileageNumber,
  toMeters,
  validateMileageEntry,
} from '@/lib/mileage'
import useMileage from '@/stores/mileage'
import { usePreferences } from '@/stores/preferences'
import {
  MileageDistanceUnit,
  MileageEntry,
  MileageEntryMode,
} from '@/types/mileage'
import PendingMileageTrips from '@/features/mileage/components/PendingMileageTrips'
import MileageMeasurementField from '@/features/mileage/components/MileageMeasurementField'

export interface MileageEntryEditorProps {
  entryId?: string
  date?: string
  vehicleId?: string
  onDone: () => void
  onCreateVehicle?: () => void
}

/**
 * Keep precise physical values when displaying rounded readings or switching
 * units.
 */
function useMeasurement(
  initialMeters: number | undefined,
  unit: MileageDistanceUnit
) {
  const locale = useLocales()[0]
  const [value, setValue] = useState({
    meters: initialMeters,
    raw: undefined as string | undefined,
    unit,
  })
  const text =
    value.raw !== undefined && value.unit === unit
      ? value.raw
      : value.meters === undefined
        ? ''
        : formatMileageInput(
            value.meters,
            unit,
            locale?.languageTag,
            locale?.decimalSeparator
          )
  return {
    text,
    meters: value.meters,
    invalid:
      value.raw !== undefined &&
      value.raw.trim() !== '' &&
      value.meters === undefined,
    onChangeText: (raw: string) => {
      const number = parseMileageNumber(
        raw,
        locale?.languageTag,
        locale?.decimalSeparator
      )
      setValue({
        raw,
        unit,
        meters: number === null ? undefined : toMeters(number, unit),
      })
    },
  }
}

export default function MileageEntryEditor(props: MileageEntryEditorProps) {
  const [resumedId, setResumedId] = useState<string>()
  const entryId = resumedId ?? props.entryId
  return (
    <EntryForm
      key={entryId ?? 'new'}
      {...props}
      entryId={entryId}
      onResume={setResumedId}
    />
  )
}

function EntryForm({
  entryId,
  date: initialDate,
  vehicleId: initialVehicleId,
  onDone,
  onCreateVehicle,
  onResume,
}: MileageEntryEditorProps & { onResume: (id: string) => void }) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const toast = useToastController()
  const data = useMileage()
  const preferences = usePreferences()
  const unit = useMileageUnit()
  const original = data.entries.find((entry) => entry.id === entryId)
  const [id] = useState(() => original?.id ?? Crypto.randomUUID())
  const [date, setDate] = useState(
    original?.date ?? initialDate ?? localMileageDate()
  )
  const [vehicleId, setVehicleId] = useState(
    original?.vehicleId ??
      defaultMileageVehicle(
        data.vehicles,
        initialVehicleId ?? preferences.mileageLastVehicleId
      )?.id ??
      ''
  )
  const [categoryId, setCategoryId] = useState(original?.categoryId ?? '')
  const [note, setNote] = useState(original?.note ?? '')
  const [mode, setMode] = useState<MileageEntryMode>(
    original?.mode ?? preferences.mileageLastEntryMode
  )
  const [creatingCategory, setCreatingCategory] = useState(false)
  const [categoryName, setCategoryName] = useState('')
  const distance = useMeasurement(original?.distanceMeters, unit)
  const start = useMeasurement(original?.startOdometerMeters, unit)
  const end = useMeasurement(original?.endOdometerMeters, unit)
  const selectedVehicleId =
    vehicleId ||
    defaultMileageVehicle(data.vehicles, preferences.mileageLastVehicleId)
      ?.id ||
    ''
  const pending = data.entries.find(
    (entry) =>
      entry.id !== id &&
      entry.vehicleId === selectedVehicleId &&
      entry.status === 'inProgress'
  )
  const candidate: MileageEntry = {
    ...original,
    id,
    date,
    vehicleId: selectedVehicleId,
    categoryId: categoryId || undefined,
    note,
    mode,
    status:
      mode === 'odometer' && !end.text.trim() ? 'inProgress' : 'completed',
    distanceMeters: distance.meters,
    startOdometerMeters: start.meters,
    endOdometerMeters: end.meters,
    createdAt: original?.createdAt ?? Date.now(),
    updatedAt: Date.now(),
  }
  let error: string | undefined
  try {
    if (mode === 'odometer' && (start.invalid || end.invalid))
      throw new MileageValidationError('odometer')
    if (!original && mode === 'odometer' && pending)
      throw new MileageValidationError('inProgress')
    validateMileageEntry(candidate, data)
  } catch (caught) {
    error =
      caught instanceof MileageValidationError
        ? i18n.t(`mileage.entries.errors.${caught.code}`)
        : i18n.t('mileage.entries.errors.distance')
  }
  if (entryId && !original) error = i18n.t('mileage.entries.unavailable')
  const save = () => {
    try {
      if (error) return
      if (original) data.updateEntry(candidate)
      else data.addEntry(candidate)
      preferences.setMileageLastVehicleId(selectedVehicleId)
      preferences.setMileageLastEntryMode(mode)
      toast.show(i18n.t('success'), {
        message: i18n.t('mileage.entries.saved'),
        native: true,
      })
      onDone()
    } catch (caught) {
      Alert.alert(
        i18n.t('mileage.entries.cannotSave'),
        caught instanceof MileageValidationError
          ? i18n.t(`mileage.entries.errors.${caught.code}`)
          : i18n.t('mileage.entries.errors.distance')
      )
    }
  }
  const remove = () =>
    Alert.alert(
      i18n.t('mileage.entries.deleteTitle'),
      i18n.t('mileage.entries.deleteDescription'),
      [
        { text: i18n.t('cancel'), style: 'cancel' },
        {
          text: i18n.t('delete'),
          style: 'destructive',
          onPress: () => {
            data.deleteEntry(id)
            onDone()
          },
        },
      ]
    )
  return (
    <KeyboardAwareScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      keyboardShouldPersistTaps='handled'
      contentContainerStyle={{
        padding: 20,
        paddingBottom: insets.bottom + 30,
        gap: 24,
      }}
    >
      <Text style={{ fontSize: 28, fontFamily: theme.fonts.bold }}>
        {i18n.t(original ? 'mileage.entries.edit' : 'mileage.entries.add')}
      </Text>
      {!original && <PendingMileageTrips onResume={onResume} />}
      {!data.vehicles.some((vehicle) => vehicle.archivedAt === undefined) &&
        !original && (
          <View style={{ gap: 12 }}>
            <Text>{i18n.t('mileage.entries.vehicleNeeded')}</Text>
            {onCreateVehicle && (
              <ActionButton onPress={onCreateVehicle}>
                {i18n.t('mileage.entries.createVehicle')}
              </ActionButton>
            )}
          </View>
        )}
      <Section>
        <InputRowContainer
          label={i18n.t('date')}
          justifyContent='space-between'
        >
          <DateTimePicker
            value={mileageDateToLocalDate(date)}
            maximumDate={new Date()}
            onChange={(_, value) => value && setDate(localMileageDate(value))}
          />
        </InputRowContainer>
        <InputRowSelect
          label={i18n.t('mileage.common.vehicle')}
          selectProps={{
            value: selectedVehicleId,
            placeholder: i18n.t('mileage.entries.selectVehicle'),
            data: data.vehicles
              .filter(
                (vehicle) =>
                  vehicle.archivedAt === undefined ||
                  vehicle.id === original?.vehicleId
              )
              .map((vehicle) => ({ value: vehicle.id, label: vehicle.name })),
            onChange: ({ value }) => setVehicleId(value),
          }}
        />
        <InputRowSelect
          label={i18n.t('mileage.common.category')}
          lastInSection
          selectProps={{
            value: categoryId,
            data: [
              { value: '', label: i18n.t('mileage.common.uncategorized') },
              ...data.categories
                .filter(
                  (category) =>
                    category.archivedAt === undefined ||
                    category.id === original?.categoryId
                )
                .map((category) => ({
                  value: category.id,
                  label: category.name,
                })),
              { value: '__create__', label: i18n.t('mileage.categories.add') },
            ],
            onChange: ({ value }) => {
              if (value === '__create__') setCreatingCategory(true)
              else setCategoryId(value)
            },
          }}
        />
      </Section>
      {creatingCategory && (
        <View style={{ gap: 12 }}>
          <Section>
            <TextInputRow
              label={i18n.t('mileage.categories.name')}
              lastInSection
              textInputProps={{
                value: categoryName,
                onChangeText: setCategoryName,
                maxLength: 100,
              }}
            />
          </Section>
          <ActionButton
            disabled={!categoryName.trim()}
            onPress={() => {
              const categoryId = Crypto.randomUUID()
              data.addCategory({
                id: categoryId,
                name: categoryName,
                createdAt: Date.now(),
                updatedAt: Date.now(),
              })
              setCategoryId(categoryId)
              setCreatingCategory(false)
              setCategoryName('')
            }}
          >
            {i18n.t('mileage.categories.add')}
          </ActionButton>
        </View>
      )}
      <SegmentedControl
        value={mode}
        onChange={(value) => setMode(value as MileageEntryMode)}
        options={[
          { key: 'distance', label: i18n.t('mileage.entries.distanceMode') },
          { key: 'odometer', label: i18n.t('mileage.entries.odometerMode') },
        ]}
      />
      <Section>
        {mode === 'distance' ? (
          <MileageMeasurementField
            label={i18n.t('mileage.entries.distance', { unit })}
            value={distance.text}
            onChangeText={distance.onChangeText}
            placeholder='0'
          />
        ) : (
          <>
            <MileageMeasurementField
              label={i18n.t('mileage.entries.startOdometer', { unit })}
              value={start.text}
              onChangeText={start.onChangeText}
              placeholder='0'
            />
            <MileageMeasurementField
              label={i18n.t('mileage.entries.endOdometer', { unit })}
              value={end.text}
              onChangeText={end.onChangeText}
              placeholder={i18n.t('mileage.entries.finishLater')}
            />
          </>
        )}
      </Section>
      {mode === 'odometer' &&
        start.meters !== undefined &&
        end.meters !== undefined &&
        end.meters > start.meters && (
          <Text style={{ fontFamily: theme.fonts.semiBold }}>
            {i18n.t('mileage.entries.calculatedDistance', {
              distance: formatMileageDistance(end.meters - start.meters, unit),
            })}
          </Text>
        )}
      {mode === 'odometer' && (
        <Text style={{ color: theme.colors.textAlt, fontSize: 13 }}>
          {i18n.t('mileage.entries.odometerHelp')}
        </Text>
      )}
      {mode === 'odometer' && pending && !original && (
        <ActionButton onPress={() => onResume(pending.id)}>
          {i18n.t('mileage.entries.resume')}
        </ActionButton>
      )}
      <Section>
        <TextInputRow
          label={i18n.t('note')}
          lastInSection
          textInputProps={{
            value: note,
            onChangeText: setNote,
            multiline: true,
            maxLength: 500,
            placeholder: i18n.t('mileage.entries.notePlaceholder'),
          }}
        />
      </Section>
      {error && (
        <Text style={{ fontSize: 13, color: theme.colors.textAlt }}>
          {error}
        </Text>
      )}
      <ActionButton onPress={save} disabled={!!error}>
        {i18n.t(
          candidate.status === 'inProgress'
            ? 'mileage.entries.saveStart'
            : 'save'
        )}
      </ActionButton>
      {original && (
        <Button onPress={remove}>
          <Text
            style={{
              color: theme.colors.error,
              textAlign: 'center',
              padding: 12,
            }}
          >
            {i18n.t('delete')}
          </Text>
        </Button>
      )}
    </KeyboardAwareScrollView>
  )
}
