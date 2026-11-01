import { ReactNode, useState } from 'react'
import { Keyboard, Platform, View } from 'react-native'
import moment from 'moment'
import {
  Calendar as CalendarIcon,
  Timer as TimerIcon,
} from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Button from '@/components/ui/Button'
import DateTimePicker, { DateTimeDialog } from '@/components/ui/DateTimePicker'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import PickerSheet from '@/components/ui/PickerSheet'
import SegmentedControl from '@/components/ui/SegmentedControl'
import WheelPicker from '@/components/ui/WheelPicker'
import { inputLayout } from '@/components/ui/inputs/InputLayout'
import useTheme from '@/contexts/theme'
import {
  formatDate,
  formatStartTime,
  formatTime,
  formatWeekdayMonthDayCompact,
} from '@/lib/dates'
import { atMinutesOfDay } from '@/lib/normalizeDate'
import i18n from '@/lib/locales'
import { useFormattedMinutes } from '@/lib/minutes'
import { entryMinutes, splitMinutes } from '@/lib/entryMinutes'
import { formatPlainNumber } from '@/lib/numbers'

type Props = {
  durationInvalid?: boolean
  date: Date
  setDate: (date: Date) => void

  timeSpan?: {
    anytime: boolean

    setWhen: (when: {
      anytime: boolean
      minutes: number
      startTimeInMinutes?: number
    }) => void
  }
  hours: number
  minutes: number
  setDuration: (hours: number, minutes: number) => void

  durationLabel: string

  maxHours: number
  minuteStep: number

  header?: ReactNode

  notice?: ReactNode
  saveButton: ReactNode

  inline?: boolean

  hideDate?: boolean

  testID: string
}

type PickerKind = 'date' | 'duration' | 'when'

const wheelItems = (values: number[]) =>
  values.map((value) => ({ label: formatPlainNumber(value), value }))

const PILL_FILL = 'rgba(118,118,128,0.24)'

const mergeDate = (base: Date, picked: Date) => {
  const next = new Date(base)
  next.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate())
  return next
}

const dayLabel = (date: Date) => {
  const day = moment(date).startOf('day')
  const today = moment().startOf('day')
  if (day.isSame(today)) return i18n.t('today')
  if (day.isSame(today.clone().add(1, 'day'), 'day')) return i18n.t('tomorrow')
  if (day.isSame(today, 'year')) return formatWeekdayMonthDayCompact(day)
  return formatDate(day, { style: 'medium' })
}

const WhenPill = (props: {
  icon: AppIcon
  value: string

  caption?: string
  accessibilityLabel: string
  invalid?: boolean
  placeholder?: boolean
  flex?: number
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
      accessibilityValue={{
        text: [props.value, props.caption].filter(Boolean).join(', '),
      }}
      testID={props.testID}
      style={{
        flex: props.flex ?? 1,
        minHeight: 56,
        borderRadius: theme.numbers.borderRadiusLg,
        backgroundColor: PILL_FILL,
        borderWidth: 1,
        borderColor: props.invalid ? theme.colors.error : 'transparent',
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
      {props.caption && (
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
          style={{
            fontSize: theme.fontSize('xs'),
            color: theme.colors.textAlt,
          }}
        >
          {props.caption}
        </Text>
      )}
    </Button>
  )
}

const DAY_MINUTES = 24 * 60
const WHEEL_STEP = 5

const steps = (from: number, to: number, keep: number) => {
  const values: number[] = []
  for (let value = from; value <= to; value += WHEEL_STEP) values.push(value)
  if (keep >= from && keep <= to && !values.includes(keep)) {
    values.push(keep)
    values.sort((a, b) => a - b)
  }
  return values
}

const clockLabel = (minutesOfDay: number) => {
  const label = formatStartTime(minutesOfDay % DAY_MINUTES)
  return minutesOfDay >= DAY_MINUTES
    ? i18n.t('planForm_nextDayTime', { time: label })
    : label
}

const timeRange = (date: Date, minutes: number) =>
  i18n.t('planForm_timeRange', {
    start: formatTime(date),

    end: formatTime(
      atMinutesOfDay(date, date.getHours() * 60 + date.getMinutes() + minutes)
    ),
  })

const SpanWheels = (props: {
  start: number
  minutes: number
  onChange: (start: number, minutes: number) => void
  testID: string
}) => {
  const theme = useTheme()
  const { formatted: total } = useFormattedMinutes(props.minutes)
  const startItems = steps(0, DAY_MINUTES - WHEEL_STEP, props.start).map(
    (value) => ({ value, label: clockLabel(value) })
  )
  const endItems = steps(
    WHEEL_STEP,
    DAY_MINUTES - WHEEL_STEP,
    props.minutes
  ).map((value) => ({ value, label: clockLabel(props.start + value) }))
  const label = (text: string) => (
    <Text
      style={{
        textAlign: 'center',
        color: theme.colors.textAlt,
        fontFamily: theme.fonts.semiBold,
        fontSize: theme.fontSize('sm'),
      }}
    >
      {text}
    </Text>
  )
  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 8, gap: 4 }}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}>
          {label(i18n.t('planForm_start'))}
          <WheelPicker
            data={startItems}
            value={props.start}
            onValueChange={(start) => props.onChange(start, props.minutes)}
            accessibilityLabel={i18n.t('planForm_start')}
            testID={`${props.testID}-span-start`}
          />
        </View>
        <View style={{ flex: 1 }}>
          {label(i18n.t('planForm_end'))}
          <WheelPicker
            data={endItems}
            value={props.minutes}
            onValueChange={(minutes) => props.onChange(props.start, minutes)}
            accessibilityLabel={i18n.t('planForm_end')}
            testID={`${props.testID}-span-end`}
          />
        </View>
      </View>
      <Text
        style={{
          textAlign: 'center',
          paddingBottom: 8,
          fontFamily: theme.fonts.semiBold,
          color: theme.colors.accent,
        }}
      >
        {total}
      </Text>
    </View>
  )
}

const WhenDock = (props: Props) => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const [picker, setPicker] = useState<PickerKind | null>(null)

  const [dateDialog, setDateDialog] = useState(false)
  const [draftDate, setDraftDate] = useState(props.date)
  const [draftHours, setDraftHours] = useState(props.hours)
  const [draftMinutes, setDraftMinutes] = useState(props.minutes)

  const [draftAnytime, setDraftAnytime] = useState(false)
  const [draftStart, setDraftStart] = useState(0)
  const [draftTotal, setDraftTotal] = useState(0)
  const totalMinutes = entryMinutes(props)
  const draftSplit = splitMinutes(draftTotal)
  const { formatted: duration } = useFormattedMinutes(totalMinutes)
  const hourItems = wheelItems([...Array(props.maxHours + 1).keys()])
  const minuteItems = wheelItems(
    [...Array(Math.ceil(60 / props.minuteStep)).keys()].map(
      (index) => index * props.minuteStep
    )
  )

  const openPicker = (kind: PickerKind) => {
    Keyboard.dismiss()
    if (kind === 'date' && Platform.OS === 'android') {
      setDateDialog(true)
      return
    }
    setDraftDate(props.date)
    setDraftHours(props.hours)
    setDraftMinutes(props.minutes)
    if (props.timeSpan) {
      setDraftAnytime(props.timeSpan.anytime)
      setDraftStart(props.date.getHours() * 60 + props.date.getMinutes())
      setDraftTotal(totalMinutes)
    }
    setPicker(kind)
  }

  const chooseMode = (anytime: boolean) => {
    setDraftAnytime(anytime)

    if (!anytime && !draftTotal) setDraftTotal(60)
  }

  const commitPicker = () => {
    if (picker === 'date') props.setDate(mergeDate(props.date, draftDate))
    if (picker === 'duration') props.setDuration(draftHours, draftMinutes)
    if (picker === 'when') {
      props.timeSpan?.setWhen({
        anytime: draftAnytime,
        minutes: draftTotal,
        startTimeInMinutes: draftAnytime ? undefined : draftStart,
      })
    }
    setPicker(null)
  }

  const durationWheels = (
    hours: number,
    setHours: (hours: number) => void,
    minutes: number,
    setMinutes: (minutes: number) => void
  ) => (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <View style={{ flex: 1 }}>
        <WheelPicker
          data={hourItems}
          value={hours}
          onValueChange={setHours}
          accessibilityLabel={i18n.t('hours')}
          testID={`${props.testID}-duration-hours`}
        />
      </View>
      <Text style={{ color: theme.colors.textAlt }}>
        {i18n.t('hours_lowercase')}
      </Text>
      <View style={{ flex: 1 }}>
        <WheelPicker
          data={minuteItems}
          value={minutes}
          onValueChange={setMinutes}
          accessibilityLabel={i18n.t('minutes')}
          testID={`${props.testID}-duration-minutes`}
        />
      </View>
      <Text style={{ color: theme.colors.textAlt, paddingRight: 16 }}>
        {i18n.t('minutes_lowercase')}
      </Text>
    </View>
  )

  return (
    <View
      style={
        props.inline
          ? undefined
          : {
              backgroundColor: theme.colors.backgroundLighter,
              borderTopStartRadius: 24,
              borderTopEndRadius: 24,
              borderTopWidth: 1,
              borderColor: theme.colors.border,
              paddingTop: 14,
              paddingHorizontal: 16,
              paddingBottom: Math.max(insets.bottom, 12),
            }
      }
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
          {!props.hideDate && (
            <WhenPill
              icon={CalendarIcon}
              value={dayLabel(props.date)}
              accessibilityLabel={i18n.t('date')}
              testID={`${props.testID}-date-pill`}
              onPress={() => openPicker('date')}
            />
          )}
          {props.timeSpan ? (
            <WhenPill
              invalid={props.durationInvalid}
              icon={TimerIcon}
              flex={2}
              value={totalMinutes ? duration : i18n.t('planForm_howLong')}
              caption={
                props.timeSpan.anytime
                  ? i18n.t('planAnytime')
                  : totalMinutes
                    ? timeRange(props.date, totalMinutes)
                    : formatTime(props.date)
              }
              placeholder={!totalMinutes}
              accessibilityLabel={i18n.t('planForm_howLong')}
              testID={`${props.testID}-duration-pill`}
              onPress={() => openPicker('when')}
            />
          ) : (
            <WhenPill
              invalid={props.durationInvalid}
              icon={TimerIcon}
              value={totalMinutes ? duration : props.durationLabel}
              placeholder={!totalMinutes}
              accessibilityLabel={props.durationLabel}
              testID={`${props.testID}-duration-pill`}
              onPress={() => openPicker('duration')}
            />
          )}
        </View>
        {props.saveButton}
      </View>

      <PickerSheet
        open={picker !== null}
        onCancel={() => setPicker(null)}
        onDone={commitPicker}
        doneTestID={`${props.testID}-picker-done`}
      >
        {picker === 'date' && (
          <View style={{ alignItems: 'center', paddingHorizontal: 8 }}>
            <DateTimePicker
              value={draftDate}
              display='inline'
              onChange={(_, picked) => picked && setDraftDate(picked)}
            />
          </View>
        )}
        {picker === 'duration' &&
          durationWheels(
            draftHours,
            setDraftHours,
            draftMinutes,
            setDraftMinutes
          )}
        {picker === 'when' && (
          <>
            <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
              <SegmentedControl
                options={[
                  {
                    key: 'hours',
                    label: i18n.t('planForm_justHours'),
                    testID: `${props.testID}-when-hours`,
                  },
                  {
                    key: 'span',
                    label: i18n.t('planForm_timeSpan'),
                    testID: `${props.testID}-when-span`,
                  },
                ]}
                value={draftAnytime ? 'hours' : 'span'}
                onChange={(key) => chooseMode(key === 'hours')}
              />
            </View>
            {draftAnytime ? (
              durationWheels(
                draftSplit.hours,
                (hours) =>
                  setDraftTotal(entryMinutes({ ...draftSplit, hours })),
                draftSplit.minutes,
                (minutes) =>
                  setDraftTotal(entryMinutes({ ...draftSplit, minutes }))
              )
            ) : (
              <SpanWheels
                start={draftStart}
                minutes={draftTotal}
                onChange={(start, minutes) => {
                  setDraftStart(start)
                  setDraftTotal(minutes)
                }}
                testID={props.testID}
              />
            )}
          </>
        )}
      </PickerSheet>
      {dateDialog && (
        <DateTimeDialog
          part='date'
          value={props.date}
          onPick={(picked) => {
            setDateDialog(false)
            props.setDate(picked)
          }}
          onDismiss={() => setDateDialog(false)}
        />
      )}
    </View>
  )
}

export default WhenDock
