import { ReactNode, useState } from 'react'
import { Keyboard, Platform, View } from 'react-native'
import RNDateTimePicker, {
  DateTimePickerAndroid,
} from '@react-native-community/datetimepicker'
import { getLocales } from 'expo-localization'
import moment from 'moment'
import {
  Calendar as CalendarIcon,
  Clock as ClockIcon,
  Timer as TimerIcon,
} from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Button from '@/components/ui/Button'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import PickerSheet from '@/components/ui/PickerSheet'
import WheelPicker from '@/components/ui/WheelPicker'
import { inputLayout } from '@/components/ui/inputs/InputLayout'
import useTheme from '@/contexts/theme'
import {
  formatDate,
  formatTime,
  formatWeekdayMonthDayCompact,
} from '@/lib/dates'
import i18n from '@/lib/locales'
import { useFormattedMinutes } from '@/lib/minutes'
import { usePreferences } from '@/stores/preferences'

type Props = {
  date: Date
  setDate: (date: Date) => void
  /** Adds the Time pill, for records that start at a clock time. */
  showTime?: boolean
  hours: number
  minutes: number
  setDuration: (hours: number, minutes: number) => void
  /** Names the duration pill, and fills it while the duration is zero. */
  durationLabel: string
  /** The duration wheels' range: hours up to `maxHours`, minutes in steps. */
  maxHours: number
  minuteStep: number
  /** Controls above the pills, e.g. One Time / Recurring. */
  header?: ReactNode
  /** A line just above the pills, e.g. a warning about the duration. */
  notice?: ReactNode
  saveButton: ReactNode
  /** Prefixes the pills' and pickers' testIDs, e.g. `plan-date-pill`. */
  testID: string
}

type PickerKind = 'date' | 'time' | 'duration'

const wheelItems = (values: number[]) =>
  values.map((value) => ({ label: value.toString(), value }))

// Matches the fill of the native iOS date and time pills.
const PILL_FILL = 'rgba(118,118,128,0.24)'

const uses24HourClock = () =>
  !/a/i.test(moment.localeData().longDateFormat('LT'))

/** Copies the picked date's day or clock time onto the record's date. */
const mergeDate = (base: Date, picked: Date, mode: 'date' | 'time') => {
  const next = new Date(base)
  if (mode === 'date') {
    next.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate())
  } else {
    next.setHours(picked.getHours(), picked.getMinutes())
  }
  return next
}

const dayLabel = (date: Date) => {
  const day = moment(date).startOf('day')
  const today = moment().startOf('day')
  if (day.isSame(today)) return i18n.t('today')
  if (day.isSame(today.clone().add(1, 'day'))) return i18n.t('tomorrow')
  if (day.isSame(today, 'year')) return formatWeekdayMonthDayCompact(day)
  return formatDate(day, { style: 'medium' })
}

/** One of the big targets the thumb lands on. */
const WhenPill = (props: {
  icon: AppIcon
  value: string
  accessibilityLabel: string
  placeholder?: boolean
  testID: string
  onPress: () => void
}) => {
  const theme = useTheme()
  return (
    <Button
      noTransform
      onPress={props.onPress}
      accessibilityRole='button'
      accessibilityLabel={props.accessibilityLabel}
      accessibilityValue={{ text: props.value }}
      testID={props.testID}
      style={{
        flex: 1,
        minHeight: 56,
        borderRadius: theme.numbers.borderRadiusLg,
        backgroundColor: PILL_FILL,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        paddingHorizontal: 6,
        paddingVertical: 6,
      }}
    >
      <LucideIcon icon={props.icon} size={16} color={theme.colors.textAlt} />
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
        style={{
          fontFamily: theme.fonts.semiBold,
          color: props.placeholder ? theme.colors.textAlt : theme.colors.text,
        }}
      >
        {props.value}
      </Text>
    </Button>
  )
}

/**
 * The quick half of a docked form (the Plan form, Add Time), pinned to the
 * bottom of the screen where the thumb already is: the Date, Time and Duration
 * pills, and Save. Each pill opens its picker from the bottom too.
 */
const WhenDock = (props: Props) => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const { colorScheme } = usePreferences()
  const [picker, setPicker] = useState<PickerKind | null>(null)
  const [draftDate, setDraftDate] = useState(props.date)
  const [draftHours, setDraftHours] = useState(props.hours)
  const [draftMinutes, setDraftMinutes] = useState(props.minutes)
  const totalMinutes = props.hours * 60 + props.minutes
  const { formatted: duration } = useFormattedMinutes(totalMinutes)
  const hourItems = wheelItems([...Array(props.maxHours + 1).keys()])
  const minuteItems = wheelItems(
    [...Array(Math.ceil(60 / props.minuteStep)).keys()].map(
      (index) => index * props.minuteStep
    )
  )

  const openPicker = (kind: PickerKind) => {
    Keyboard.dismiss()
    if (kind !== 'duration' && Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: props.date,
        mode: kind,
        is24Hour: uses24HourClock(),
        onValueChange: (_, picked) =>
          props.setDate(mergeDate(props.date, picked, kind)),
      })
      return
    }
    setDraftDate(props.date)
    setDraftHours(props.hours)
    setDraftMinutes(props.minutes)
    setPicker(kind)
  }

  const commitPicker = () => {
    if (picker === 'date' || picker === 'time') {
      props.setDate(mergeDate(props.date, draftDate, picker))
    }
    if (picker === 'duration') props.setDuration(draftHours, draftMinutes)
    setPicker(null)
  }

  return (
    <View
      style={{
        backgroundColor: theme.colors.backgroundLighter,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        borderTopWidth: 1,
        borderColor: theme.colors.border,
        paddingTop: 14,
        paddingHorizontal: 16,
        paddingBottom: Math.max(insets.bottom, 12),
      }}
    >
      <View
        style={{
          gap: 12,
          width: '100%',
          maxWidth: inputLayout.contentMaxWidth,
          alignSelf: 'center',
        }}
      >
        {props.header}
        {props.notice}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <WhenPill
            icon={CalendarIcon}
            value={dayLabel(props.date)}
            accessibilityLabel={i18n.t('date')}
            testID={`${props.testID}-date-pill`}
            onPress={() => openPicker('date')}
          />
          {props.showTime && (
            <WhenPill
              icon={ClockIcon}
              value={formatTime(props.date)}
              accessibilityLabel={i18n.t('time')}
              testID={`${props.testID}-time-pill`}
              onPress={() => openPicker('time')}
            />
          )}
          <WhenPill
            icon={TimerIcon}
            value={totalMinutes ? duration : props.durationLabel}
            placeholder={!totalMinutes}
            accessibilityLabel={props.durationLabel}
            testID={`${props.testID}-duration-pill`}
            onPress={() => openPicker('duration')}
          />
        </View>
        {props.saveButton}
      </View>

      <PickerSheet
        open={picker !== null}
        onCancel={() => setPicker(null)}
        onDone={commitPicker}
        doneTestID={`${props.testID}-picker-done`}
      >
        {(picker === 'date' || picker === 'time') && (
          <View style={{ alignItems: 'center', paddingHorizontal: 8 }}>
            <RNDateTimePicker
              value={draftDate}
              mode={picker}
              display={picker === 'date' ? 'inline' : 'spinner'}
              themeVariant={colorScheme || undefined}
              accentColor={theme.colors.accent}
              locale={getLocales()[0].languageCode || undefined}
              onValueChange={(_, picked) => setDraftDate(picked)}
            />
          </View>
        )}
        {picker === 'duration' && (
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <WheelPicker
                data={hourItems}
                value={draftHours}
                onValueChange={setDraftHours}
                testID={`${props.testID}-duration-hours`}
              />
            </View>
            <Text style={{ color: theme.colors.textAlt }}>
              {i18n.t('hours_lowercase')}
            </Text>
            <View style={{ flex: 1 }}>
              <WheelPicker
                data={minuteItems}
                value={draftMinutes}
                onValueChange={setDraftMinutes}
                testID={`${props.testID}-duration-minutes`}
              />
            </View>
            <Text style={{ color: theme.colors.textAlt, paddingRight: 16 }}>
              {i18n.t('minutes_lowercase')}
            </Text>
          </View>
        )}
      </PickerSheet>
    </View>
  )
}

export default WhenDock
