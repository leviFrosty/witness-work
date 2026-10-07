import { ReactNode, useEffect, useState } from 'react'
import { Keyboard, Modal, Platform, View } from 'react-native'
import Sheet from '@/components/ui/Sheet'
import RNDateTimePicker, {
  DateTimePickerAndroid,
} from '@react-native-community/datetimepicker'
import { getLocales } from 'expo-localization'
import moment from 'moment'
import {
  Calendar as CalendarIcon,
  Calendar1 as Calendar1Icon,
  Clock as ClockIcon,
  Repeat as RepeatIcon,
  Timer as TimerIcon,
} from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Button from '@/components/ui/Button'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
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
  showKindToggle: boolean
  oneTime: boolean
  setOneTime: (oneTime: boolean) => void
  date: Date
  setDate: (date: Date) => void
  hours: number
  minutes: number
  setDuration: (hours: number, minutes: number) => void
  /** Frequency controls, shown for recurring plans. */
  recurrence?: ReactNode
  saveButton: ReactNode
}

type PickerKind = 'date' | 'time' | 'duration'

const hourItems = [...Array(24).keys()].map((value) => ({
  label: value.toString(),
  value,
}))
const minuteItems = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map(
  (value) => ({ label: value.toString(), value })
)

// Matches the fill of the native iOS date and time pills.
const PILL_FILL = 'rgba(118,118,128,0.24)'

const uses24HourClock = () =>
  !/a/i.test(moment.localeData().longDateFormat('LT'))

/** Copies the picked date's day or clock time onto the plan's date. */
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

/** A bottom sheet with Cancel and Done, so every picker opens under the thumb. */
const PickerSheet = (props: {
  open: boolean
  onCancel: () => void
  onDone: () => void
  children: ReactNode
}) => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  // Keep the Modal mounted through the sheet's dismiss animation.
  const [mounted, setMounted] = useState(props.open)

  useEffect(() => {
    if (props.open) {
      setMounted(true)
      return
    }
    const timeout = setTimeout(() => setMounted(false), 300)
    return () => clearTimeout(timeout)
  }, [props.open])

  return (
    // The RN Modal hosts the sheet in its own window; without it the sheet
    // renders behind this screen's native modal presentation.
    <Modal
      visible={mounted}
      transparent
      statusBarTranslucent
      animationType='none'
      onRequestClose={props.onCancel}
    >
      <Sheet
        open={props.open}
        modal={false}
        snapPointsMode='fit'
        onOpenChange={(next: boolean) => {
          if (!next) props.onDone()
        }}
        transition='quick'
        disableDrag
      >
        <Sheet.Overlay zIndex={100_000 - 1} />
        <Sheet.Frame
          backgroundColor={theme.colors.background}
          paddingBottom={insets.bottom}
        >
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingHorizontal: 16,
              paddingVertical: 12,
              borderBottomWidth: 1,
              borderBottomColor: theme.colors.border,
            }}
          >
            <Button noTransform onPress={props.onCancel} hitSlop={8}>
              <Text style={{ color: theme.colors.accent, fontSize: 16 }}>
                {i18n.t('cancel')}
              </Text>
            </Button>
            <Button
              noTransform
              onPress={props.onDone}
              hitSlop={8}
              testID='plan-picker-done'
            >
              <Text
                style={{
                  color: theme.colors.accent,
                  fontSize: 16,
                  fontFamily: theme.fonts.semiBold,
                }}
              >
                {i18n.t('done')}
              </Text>
            </Button>
          </View>
          {props.children}
        </Sheet.Frame>
      </Sheet>
    </Modal>
  )
}

const KindToggle = (props: {
  oneTime: boolean
  setOneTime: (oneTime: boolean) => void
}) => {
  const theme = useTheme()
  const option = (oneTime: boolean, icon: AppIcon, label: string) => {
    const active = props.oneTime === oneTime
    const color = active ? theme.colors.accent : theme.colors.text
    return (
      <Button
        noTransform
        onPress={() => props.setOneTime(oneTime)}
        accessibilityRole='button'
        accessibilityLabel={label}
        accessibilityState={{ selected: active }}
        testID={oneTime ? 'plan-kind-one-time' : 'plan-kind-recurring'}
        style={{
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          minHeight: 40,
          borderRadius: 999,
          backgroundColor: active ? theme.colors.accentTranslucent : undefined,
          borderWidth: active ? 1 : 0,
          borderColor: theme.colors.accent,
        }}
      >
        <LucideIcon icon={icon} size={16} color={color} />
        <Text style={{ color }}>{label}</Text>
      </Button>
    )
  }

  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: theme.colors.background,
        borderRadius: 999,
        padding: 4,
      }}
    >
      {option(true, Calendar1Icon, i18n.t('oneTime'))}
      {option(false, RepeatIcon, i18n.t('recurring'))}
    </View>
  )
}

/** One of the three big targets the thumb lands on. */
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
 * The quick half of the Plan form, pinned to the bottom of the screen where the
 * thumb already is: One Time / Recurring, the Date, Time and Duration pills,
 * and Save. Each pill opens its picker from the bottom too.
 */
const PlanWhenDock = (props: Props) => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const { colorScheme } = usePreferences()
  const [picker, setPicker] = useState<PickerKind | null>(null)
  const [draftDate, setDraftDate] = useState(props.date)
  const [draftHours, setDraftHours] = useState(props.hours)
  const [draftMinutes, setDraftMinutes] = useState(props.minutes)
  const totalMinutes = props.hours * 60 + props.minutes
  const { formatted: duration } = useFormattedMinutes(totalMinutes)

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
        {props.showKindToggle && (
          <KindToggle oneTime={props.oneTime} setOneTime={props.setOneTime} />
        )}
        {props.recurrence}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <WhenPill
            icon={CalendarIcon}
            value={dayLabel(props.date)}
            accessibilityLabel={i18n.t('date')}
            testID='plan-date-pill'
            onPress={() => openPicker('date')}
          />
          <WhenPill
            icon={ClockIcon}
            value={formatTime(props.date)}
            accessibilityLabel={i18n.t('time')}
            testID='plan-time-pill'
            onPress={() => openPicker('time')}
          />
          <WhenPill
            icon={TimerIcon}
            value={totalMinutes ? duration : i18n.t('planForm_duration')}
            placeholder={!totalMinutes}
            accessibilityLabel={i18n.t('planForm_duration')}
            testID='plan-duration-pill'
            onPress={() => openPicker('duration')}
          />
        </View>
        {props.saveButton}
      </View>

      <PickerSheet
        open={picker !== null}
        onCancel={() => setPicker(null)}
        onDone={commitPicker}
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
                testID='plan-duration-hours'
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
                testID='plan-duration-minutes'
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

export default PlanWhenDock
