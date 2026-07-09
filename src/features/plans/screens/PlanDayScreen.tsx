import { Modal, Pressable, TextInput as RNTextInput, View } from 'react-native'
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import ActionButton from '@/components/ui/ActionButton'
import useServiceReport from '@/stores/serviceReport'
import * as Crypto from 'expo-crypto'
import * as Notifications from 'expo-notifications'
import * as Sentry from '@sentry/react-native'
import { useEffect, useRef, useState } from 'react'
import { useToastController } from '@tamagui/toast'
import i18n, { TranslationKey } from '@/lib/locales'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import Section from '@/components/ui/inputs/Section'
import InputRowContainer from '@/components/ui/inputs/InputRowContainer'
import CheckboxWithLabel from '@/components/ui/inputs/CheckboxWithLabel'
import XView from '@/components/ui/layout/XView'
import Button from '@/components/ui/Button'
import IconButton from '@/components/ui/IconButton'
import { faArrowTurnDown } from '@fortawesome/free-solid-svg-icons/faArrowTurnDown'
import { faCalendarDay } from '@fortawesome/free-solid-svg-icons/faCalendarDay'
import { faRepeat } from '@fortawesome/free-solid-svg-icons/faRepeat'
import { faXmark } from '@fortawesome/free-solid-svg-icons/faXmark'
import RNDateTimePicker from '@react-native-community/datetimepicker'
import DateTimePicker from '@/components/ui/DateTimePicker'
import Select from '@/components/ui/Select'
import SelectWheel from '@/components/ui/SelectWheel'
import { getLocales } from 'expo-localization'
import Wrapper from '@/components/ui/layout/Wrapper'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import moment from 'moment'
import Checkbox from 'expo-checkbox'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { RecurringPlanFrequencies } from '@/lib/serviceReport'
import { formatMinutes } from '@/lib/minutes'
import {
  combineDateAndStartTime,
  localDayFromUtcCursor,
  momentStoredDate,
  preserveOrNormalizeStoredDate,
  splitDateAndStartTime,
} from '@/lib/normalizeDate'
import { deriveOffsetFromDates } from '@/lib/notificationOffset'
import {
  DEFAULT_PLAN_NOTIFICATION_OFFSET,
  usePreferences,
} from '@/stores/preferences'
import useCategories from '@/stores/categories'
import useNotifications from '@/hooks/notifications'
import { Notification } from '@/types/visit'

import TextInput from '@/components/ui/TextInput'
import TypeSelectorRow, {
  CUSTOM_TYPE_VALUE,
  STANDARD_TYPE_VALUE,
  type TypeSelection,
} from '@/components/TypeSelectorRow'
import { RootStackParamList } from '@/types/rootStack'

type NotifyMeOffset = {
  amount: number
  unit: moment.unitOfTime.DurationConstructor
}

type RecurringSaveScope = 'instance' | 'future' | 'all'

const hourOptions = [...Array(24).keys()].map((value) => ({
  label: `${value}`,
  value,
}))
const minuteOptions = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map(
  (value) => ({
    label: `${value}`,
    value,
  })
)

const offsetAmountOptions = [...Array(1000).keys()].map((value) => ({
  label: `${value}`,
  value,
}))
const offsetUnitOptions: {
  label: string
  value: moment.unitOfTime.DurationConstructor
}[] = ['minutes', 'hours', 'days', 'weeks'].map((value) => ({
  label: i18n.t(`${value}_lowercase` as TranslationKey),
  value: value as moment.unitOfTime.DurationConstructor,
}))

const frequencyOptions = [
  {
    label: i18n.t('weekly'),
    value: RecurringPlanFrequencies.WEEKLY,
  },
  {
    label: i18n.t('bi-weekly'),
    value: RecurringPlanFrequencies.BI_WEEKLY,
  },
  {
    label: i18n.t('monthly'),
    value: RecurringPlanFrequencies.MONTHLY,
  },
  {
    label: i18n.t('monthlyByWeekday'),
    value: RecurringPlanFrequencies.MONTHLY_BY_WEEKDAY,
  },
]

const storedDateFor = (date: Date) => preserveOrNormalizeStoredDate(date)

const storedDay = (date: Date) => momentStoredDate(storedDateFor(date))

const localDateForWrite = (date: Date) => localDayFromUtcCursor(storedDay(date))

const sameDay = (a: Date, b: Date) => storedDay(a).isSame(storedDay(b), 'day')

const PlanKindToggle = (props: {
  oneTime: boolean
  setOneTime: React.Dispatch<React.SetStateAction<boolean>>
}) => {
  const theme = useTheme()

  return (
    <InputRowContainer>
      <XView
        style={{
          backgroundColor: theme.colors.background,
          borderRadius: theme.numbers.borderRadiusXl,
          padding: 10,
        }}
      >
        <Button
          style={{
            backgroundColor: props.oneTime
              ? theme.colors.accentTranslucent
              : undefined,
            borderColor: props.oneTime ? theme.colors.accent : undefined,
            borderWidth: props.oneTime ? 1 : 0,
            paddingHorizontal: 30,
            paddingVertical: 10,
            borderRadius: theme.numbers.borderRadiusXl,
            justifyContent: 'center',
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 5,
          }}
          onPress={() => props.setOneTime(true)}
        >
          <IconButton
            icon={faCalendarDay}
            color={props.oneTime ? theme.colors.accent : theme.colors.text}
          />
          <Text
            style={{
              textAlign: 'center',
              color: props.oneTime ? theme.colors.accent : theme.colors.text,
            }}
          >
            {i18n.t('oneTime')}
          </Text>
        </Button>
        <Button
          style={{
            backgroundColor: !props.oneTime
              ? theme.colors.accentTranslucent
              : undefined,
            borderColor: !props.oneTime ? theme.colors.accent : undefined,
            borderWidth: !props.oneTime ? 1 : 0,
            paddingHorizontal: 30,
            paddingVertical: 10,
            borderRadius: theme.numbers.borderRadiusXl,
            justifyContent: 'center',
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 5,
          }}
          onPress={() => props.setOneTime(false)}
        >
          <IconButton
            icon={faRepeat}
            color={!props.oneTime ? theme.colors.accent : theme.colors.text}
          />
          <Text
            style={{
              textAlign: 'center',
              color: !props.oneTime ? theme.colors.accent : theme.colors.text,
            }}
          >
            {i18n.t('recurring')}
          </Text>
        </Button>
      </XView>
    </InputRowContainer>
  )
}

const DurationFields = (props: {
  hours: number
  setHours: React.Dispatch<React.SetStateAction<number>>
  minutes: number
  setMinutes: React.Dispatch<React.SetStateAction<number>>
  lastInSection?: boolean
}) => (
  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
    <View style={{ width: '50%' }}>
      <InputRowContainer
        label={i18n.t('hours')}
        lastInSection={props.lastInSection}
      >
        <View style={{ flex: 1 }}>
          <SelectWheel
            data={hourOptions}
            placeholder={props.hours.toString()}
            onChange={({ value }) => props.setHours(value)}
            value={props.hours.toString()}
          />
        </View>
      </InputRowContainer>
    </View>
    <View style={{ width: '50%' }}>
      <InputRowContainer
        label={i18n.t('minutes')}
        lastInSection={props.lastInSection}
      >
        <View style={{ flex: 1 }}>
          <SelectWheel
            data={minuteOptions}
            placeholder={props.minutes.toString()}
            onChange={({ value }) => props.setMinutes(value)}
            value={props.minutes.toString()}
          />
        </View>
      </InputRowContainer>
    </View>
  </View>
)

const NotificationFields = (props: {
  notifyMe: boolean
  setNotifyMe: React.Dispatch<React.SetStateAction<boolean>>
  notifyMeOffset: NotifyMeOffset
  setNotifyMeOffset: React.Dispatch<React.SetStateAction<NotifyMeOffset>>
  notificationsAllowed: boolean
}) => {
  const theme = useTheme()

  return (
    <InputRowContainer label={i18n.t('notification')} lastInSection>
      <View style={{ gap: 15, flex: 1 }}>
        <View
          style={{
            justifyContent: 'flex-end',
            flex: 1,
            flexDirection: 'row',
          }}
        >
          <CheckboxWithLabel
            label={i18n.t('notifyMe')}
            value={props.notifyMe}
            setValue={props.setNotifyMe}
            disabled={!props.notificationsAllowed}
            description={i18n.t('notifyMe_description')}
            descriptionOnlyOnDisabled
          />
        </View>
        {props.notificationsAllowed && props.notifyMe && (
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Select
                data={offsetAmountOptions}
                onChange={({ value: amount }) =>
                  props.setNotifyMeOffset({
                    ...props.notifyMeOffset,
                    amount,
                  })
                }
                placeholder={props.notifyMeOffset.amount.toString()}
                value={props.notifyMeOffset.amount.toString()}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Select
                data={offsetUnitOptions}
                onChange={({ value: unit }) =>
                  props.setNotifyMeOffset({
                    ...props.notifyMeOffset,
                    unit,
                  })
                }
                value={props.notifyMeOffset.unit}
              />
            </View>
            <Text style={{ color: theme.colors.textAlt }}>
              {i18n.t('before')}
            </Text>
          </View>
        )}
      </View>
    </InputRowContainer>
  )
}

const RecurrenceFields = (props: {
  date: Date
  endDate: Date | null
  setEndDate: React.Dispatch<React.SetStateAction<Date | null>>
  willEnd: boolean
  setWillEnd: React.Dispatch<React.SetStateAction<boolean>>
  frequency: RecurringPlanFrequencies
  setFrequency: React.Dispatch<React.SetStateAction<RecurringPlanFrequencies>>
  weekday: number
  setWeekday: React.Dispatch<React.SetStateAction<number>>
  weekOfMonth: number
  setWeekOfMonth: React.Dispatch<React.SetStateAction<number>>
}) => {
  const handleSetWillEnd = () => {
    if (!props.willEnd) {
      props.setEndDate(props.date)
    } else {
      props.setEndDate(null)
    }
    props.setWillEnd(!props.willEnd)
  }

  return (
    <>
      <InputRowContainer label={i18n.t('recurrence')}>
        <View style={{ flex: 1 }}>
          <Select
            data={frequencyOptions}
            placeholder={
              frequencyOptions.find((f) => f.value === props.frequency)?.label
            }
            onChange={({ value }) => props.setFrequency(value)}
            value={props.frequency.toString()}
          />
        </View>
      </InputRowContainer>

      {props.frequency === RecurringPlanFrequencies.MONTHLY_BY_WEEKDAY && (
        <>
          <InputRowContainer label={i18n.t('selectWeekday')}>
            <View style={{ flex: 1 }}>
              <Select
                data={[
                  { label: i18n.t('sunday'), value: 0 },
                  { label: i18n.t('monday'), value: 1 },
                  { label: i18n.t('tuesday'), value: 2 },
                  { label: i18n.t('wednesday'), value: 3 },
                  { label: i18n.t('thursday'), value: 4 },
                  { label: i18n.t('friday'), value: 5 },
                  { label: i18n.t('saturday'), value: 6 },
                ]}
                placeholder={
                  [
                    i18n.t('sunday'),
                    i18n.t('monday'),
                    i18n.t('tuesday'),
                    i18n.t('wednesday'),
                    i18n.t('thursday'),
                    i18n.t('friday'),
                    i18n.t('saturday'),
                  ][props.weekday]
                }
                onChange={({ value }) => props.setWeekday(value)}
                value={props.weekday.toString()}
              />
            </View>
          </InputRowContainer>
          <InputRowContainer label={i18n.t('selectWeekOfMonth')}>
            <View style={{ flex: 1 }}>
              <Select
                data={[
                  { label: i18n.t('firstWeek'), value: 1 },
                  { label: i18n.t('secondWeek'), value: 2 },
                  { label: i18n.t('thirdWeek'), value: 3 },
                  { label: i18n.t('fourthWeek'), value: 4 },
                  { label: i18n.t('lastWeek'), value: -1 },
                ]}
                placeholder={
                  props.weekOfMonth === -1
                    ? i18n.t('lastWeek')
                    : [
                        i18n.t('firstWeek'),
                        i18n.t('secondWeek'),
                        i18n.t('thirdWeek'),
                        i18n.t('fourthWeek'),
                      ][props.weekOfMonth - 1]
                }
                onChange={({ value }) => props.setWeekOfMonth(value)}
                value={props.weekOfMonth.toString()}
              />
            </View>
          </InputRowContainer>
        </>
      )}

      <InputRowContainer
        label={i18n.t('endDate')}
        style={{ justifyContent: 'space-between' }}
      >
        <XView>
          <Checkbox value={props.willEnd} onValueChange={handleSetWillEnd} />
          {props.willEnd && props.endDate && (
            <RNDateTimePicker
              locale={getLocales()[0].languageCode || undefined}
              value={props.endDate}
              onChange={(_, newDate) => newDate && props.setEndDate(newDate)}
            />
          )}
        </XView>
      </InputRowContainer>
    </>
  )
}

const PlanFields = (props: {
  isRecurring: boolean
  date: Date
  setDate: React.Dispatch<React.SetStateAction<Date>>
  hours: number
  setHours: React.Dispatch<React.SetStateAction<number>>
  minutes: number
  setMinutes: React.Dispatch<React.SetStateAction<number>>
  note?: string
  setNote: React.Dispatch<React.SetStateAction<string>>
  typeSelector: React.ReactNode
  endDate: Date | null
  setEndDate: React.Dispatch<React.SetStateAction<Date | null>>
  willEnd: boolean
  setWillEnd: React.Dispatch<React.SetStateAction<boolean>>
  frequency: RecurringPlanFrequencies
  setFrequency: React.Dispatch<React.SetStateAction<RecurringPlanFrequencies>>
  weekday: number
  setWeekday: React.Dispatch<React.SetStateAction<number>>
  weekOfMonth: number
  setWeekOfMonth: React.Dispatch<React.SetStateAction<number>>
  notifyMe: boolean
  setNotifyMe: React.Dispatch<React.SetStateAction<boolean>>
  notifyMeOffset: NotifyMeOffset
  setNotifyMeOffset: React.Dispatch<React.SetStateAction<NotifyMeOffset>>
  notificationsAllowed: boolean
}) => {
  const theme = useTheme()
  const noteInput = useRef<RNTextInput>(null)

  return (
    <>
      <InputRowContainer label={i18n.t('date')} justifyContent='space-between'>
        <DateTimePicker
          value={props.date}
          onChange={(_, newDate) => newDate && props.setDate(newDate)}
          iOSMode='datetime'
        />
      </InputRowContainer>
      {props.typeSelector}
      {props.isRecurring && (
        <RecurrenceFields
          date={props.date}
          endDate={props.endDate}
          setEndDate={props.setEndDate}
          willEnd={props.willEnd}
          setWillEnd={props.setWillEnd}
          frequency={props.frequency}
          setFrequency={props.setFrequency}
          weekday={props.weekday}
          setWeekday={props.setWeekday}
          weekOfMonth={props.weekOfMonth}
          setWeekOfMonth={props.setWeekOfMonth}
        />
      )}
      <InputRowContainer
        label={i18n.t('note')}
        onLabelPress={() => noteInput.current?.focus()}
      >
        <View style={{ flex: 1 }}>
          <TextInput
            ref={noteInput}
            value={props.note}
            onChangeText={props.setNote}
            placeholder={i18n.t('optional')}
            placeholderTextColor={theme.colors.textAlt}
            multiline
            style={{
              borderColor: theme.colors.border,
              borderWidth: 1,
              borderRadius: theme.numbers.borderRadiusSm,
              paddingHorizontal: 10,
              paddingTop: 10,
              paddingBottom: 10,
              alignItems: 'center',
              color: theme.colors.text,
            }}
            textAlign='left'
            clearButtonMode='while-editing'
          />
        </View>
      </InputRowContainer>
      <DurationFields
        hours={props.hours}
        setHours={props.setHours}
        minutes={props.minutes}
        setMinutes={props.setMinutes}
        lastInSection={props.isRecurring}
      />
      {!props.isRecurring && (
        <NotificationFields
          notifyMe={props.notifyMe}
          setNotifyMe={props.setNotifyMe}
          notifyMeOffset={props.notifyMeOffset}
          setNotifyMeOffset={props.setNotifyMeOffset}
          notificationsAllowed={props.notificationsAllowed}
        />
      )}
    </>
  )
}

type ScopeOptionConfig = {
  scope: RecurringSaveScope
  title: string
  icon: IconDefinition
  dots: [boolean, boolean, boolean]
  lines: [boolean, boolean]
}

const ScopeTimelineDot = (props: { active: boolean }) => {
  const theme = useTheme()

  return (
    <View
      style={{
        width: 10,
        height: 10,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: props.active ? theme.colors.accent : theme.colors.border,
        backgroundColor: props.active ? theme.colors.accent : theme.colors.card,
      }}
    />
  )
}

const ScopeTimelineLine = (props: { active: boolean }) => {
  const theme = useTheme()

  return (
    <View
      style={{
        flex: 1,
        height: 1,
        backgroundColor: props.active
          ? theme.colors.accent
          : theme.colors.border,
      }}
    />
  )
}

const ScopeTimeline = (props: Pick<ScopeOptionConfig, 'dots' | 'lines'>) => (
  <View style={{ marginTop: 9 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
      <ScopeTimelineDot active={props.dots[0]} />
      <ScopeTimelineLine active={props.lines[0]} />
      <ScopeTimelineDot active={props.dots[1]} />
      <ScopeTimelineLine active={props.lines[1]} />
      <ScopeTimelineDot active={props.dots[2]} />
    </View>
  </View>
)

const ScopeOption = (props: {
  option: ScopeOptionConfig
  selected: boolean
  onPress: (scope: RecurringSaveScope) => void
}) => {
  const theme = useTheme()

  return (
    <Pressable
      accessibilityRole='radio'
      accessibilityState={{ selected: props.selected }}
      onPress={() => props.onPress(props.option.scope)}
      style={({ pressed }) => ({
        borderColor: props.selected ? theme.colors.accent : theme.colors.border,
        borderWidth: 1,
        borderRadius: theme.numbers.borderRadiusMd,
        backgroundColor: props.selected
          ? theme.colors.accentTranslucent
          : theme.colors.backgroundLighter,
        padding: 14,
        opacity: pressed ? 0.78 : 1,
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: theme.numbers.borderRadiusMd,
            borderWidth: 1,
            borderColor: props.selected
              ? theme.colors.accent
              : theme.colors.border,
            backgroundColor: theme.colors.card,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <FontAwesomeIcon
            icon={props.option.icon}
            size={18}
            color={props.selected ? theme.colors.accent : theme.colors.textAlt}
          />
        </View>

        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontFamily: theme.fonts.semiBold,
              fontSize: theme.fontSize('md'),
              color: theme.colors.text,
            }}
          >
            {props.option.title}
          </Text>
          <ScopeTimeline dots={props.option.dots} lines={props.option.lines} />
        </View>
      </View>
    </Pressable>
  )
}

const RecurringSaveScopeModal = (props: {
  open: boolean
  selectedScope: RecurringSaveScope | null
  setSelectedScope: React.Dispatch<
    React.SetStateAction<RecurringSaveScope | null>
  >
  onCancel: () => void
  onConfirm: () => void
}) => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const scopeOptions: ScopeOptionConfig[] = [
    {
      scope: 'instance',
      title: i18n.t('saveScope_instance_title'),
      icon: faCalendarDay,
      dots: [false, true, false],
      lines: [false, false],
    },
    {
      scope: 'future',
      title: i18n.t('saveScope_future_title'),
      icon: faArrowTurnDown,
      dots: [false, true, true],
      lines: [false, true],
    },
    {
      scope: 'all',
      title: i18n.t('saveScope_all_title'),
      icon: faRepeat,
      dots: [true, true, true],
      lines: [true, true],
    },
  ]

  return (
    <Modal
      visible={props.open}
      transparent
      animationType='fade'
      onRequestClose={props.onCancel}
    >
      <View
        style={{
          flex: 1,
          justifyContent: 'flex-end',
          backgroundColor: 'rgba(0, 0, 0, 0.28)',
        }}
      >
        <Pressable style={{ flex: 1 }} onPress={props.onCancel} />
        <View
          style={{
            backgroundColor: theme.colors.backgroundLighter,
            borderTopLeftRadius: theme.numbers.borderRadiusLg,
            borderTopRightRadius: theme.numbers.borderRadiusLg,
            borderColor: theme.colors.border,
            borderTopWidth: 1,
            padding: 20,
            paddingBottom: Math.max(28, insets.bottom + 12),
            gap: 12,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <View style={{ flex: 1, gap: 4 }}>
              <Text
                style={{
                  fontFamily: theme.fonts.bold,
                  fontSize: theme.fontSize('lg'),
                  color: theme.colors.text,
                }}
              >
                {i18n.t('saveRecurringPlanScopeTitle')}
              </Text>
              <Text
                style={{
                  color: theme.colors.textAlt,
                  fontSize: theme.fontSize('sm'),
                }}
              >
                {i18n.t('saveRecurringPlanScopeDescription')}
              </Text>
            </View>
            <Button
              noTransform
              accessibilityLabel={i18n.t('cancel')}
              onPress={props.onCancel}
              style={{ padding: 8 }}
            >
              <FontAwesomeIcon
                icon={faXmark}
                size={22}
                color={theme.colors.text}
              />
            </Button>
          </View>

          <View style={{ gap: 10 }}>
            {scopeOptions.map((option) => (
              <ScopeOption
                key={option.scope}
                option={option}
                selected={props.selectedScope === option.scope}
                onPress={props.setSelectedScope}
              />
            ))}
          </View>

          <View style={{ gap: 10, marginTop: 2 }}>
            <ActionButton
              noTransform
              disabled={!props.selectedScope}
              onPress={props.onConfirm}
            >
              <Text
                style={{
                  color: theme.colors.textInverse,
                  fontFamily: theme.fonts.bold,
                  fontSize: theme.fontSize('lg'),
                }}
              >
                {i18n.t('saveChanges')}
              </Text>
            </ActionButton>
          </View>
        </View>
      </View>
    </Modal>
  )
}

type PlanDayScreenProps = NativeStackScreenProps<RootStackParamList, 'PlanDay'>

const PlanDayScreen = ({ route, navigation }: PlanDayScreenProps) => {
  const defaultDate = moment(route.params.date).toDate()
  const defaultStoredDate = storedDateFor(defaultDate)
  const {
    dayPlans,
    recurringPlans,
    addDayPlan,
    addRecurringPlan,
    updateDayPlan,
    updateRecurringPlan,
    addRecurringPlanOverride,
    updateRecurringPlanOverride,
    removeRecurringPlanOverride,
    getRecurringPlanForDate,
    deleteSingleEventFromRecurringPlan,
  } = useServiceReport()

  const existingDayPlan = route.params.existingDayPlanId
    ? dayPlans.find((p) => p.id === route.params.existingDayPlanId)
    : null
  const existingRecurringPlan = route.params.existingRecurringPlanId
    ? recurringPlans.find((p) => p.id === route.params.existingRecurringPlanId)
    : null

  const editingDate =
    existingRecurringPlan && route.params.recurringPlanDate
      ? moment(route.params.recurringPlanDate).toDate()
      : defaultDate
  const editingStoredDate = storedDateFor(editingDate)
  const editingWriteDate = localDateForWrite(editingDate)

  const recurringPlanData = existingRecurringPlan
    ? getRecurringPlanForDate(existingRecurringPlan.id, editingWriteDate)
    : null

  const isEditMode = !!(existingDayPlan || existingRecurringPlan)

  const [oneTime, setOneTime] = useState(existingRecurringPlan ? false : true)
  const [date, setDate] = useState(
    existingDayPlan
      ? combineDateAndStartTime(
          existingDayPlan.date,
          existingDayPlan.startTimeInMinutes
        )
      : existingRecurringPlan
        ? combineDateAndStartTime(
            editingStoredDate,
            recurringPlanData?.startTimeInMinutes
          )
        : combineDateAndStartTime(defaultStoredDate, undefined)
  )
  const [endDate, setEndDate] = useState<Date | null>(
    existingRecurringPlan?.recurrence.endDate
      ? localDateForWrite(existingRecurringPlan.recurrence.endDate)
      : null
  )
  const [willEnd, setWillEnd] = useState(
    !!existingRecurringPlan?.recurrence.endDate
  )
  const [hours, setHours] = useState(
    existingDayPlan
      ? Math.floor(existingDayPlan.minutes / 60)
      : recurringPlanData
        ? Math.floor(recurringPlanData.minutes / 60)
        : 0
  )
  const [minutes, setMinutes] = useState(
    existingDayPlan
      ? existingDayPlan.minutes % 60
      : recurringPlanData
        ? recurringPlanData.minutes % 60
        : 0
  )
  const [interval, setInterval] = useState<number>(
    existingRecurringPlan?.recurrence.interval ?? 1
  )
  const [frequency, setFrequency] = useState<RecurringPlanFrequencies>(
    existingRecurringPlan?.recurrence.frequency ??
      RecurringPlanFrequencies.WEEKLY
  )
  const [weekday, setWeekday] = useState(
    existingRecurringPlan?.recurrence.monthlyByWeekdayConfig?.weekday ?? 0
  )
  const [weekOfMonth, setWeekOfMonth] = useState(
    existingRecurringPlan?.recurrence.monthlyByWeekdayConfig?.weekOfMonth ?? 1
  )
  const [saveScopeModalOpen, setSaveScopeModalOpen] = useState(false)
  const [selectedSaveScope, setSelectedSaveScope] =
    useState<RecurringSaveScope | null>(null)

  const { categories } = useCategories()

  const resolveInitialTypeValue = (): string => {
    const categoryId =
      existingDayPlan?.categoryId ?? existingRecurringPlan?.categoryId
    if (categoryId && categories.some((c) => c.id === categoryId)) {
      return categoryId
    }
    return STANDARD_TYPE_VALUE
  }
  const [typeValue, setTypeValue] = useState<string>(resolveInitialTypeValue)

  const handleTypeChange = ({ value }: TypeSelection) => {
    setTypeValue(value)
  }

  const existingCategoryId =
    existingDayPlan?.categoryId ?? existingRecurringPlan?.categoryId
  const danglingExistingCategoryId =
    existingCategoryId && !categories.some((c) => c.id === existingCategoryId)
      ? existingCategoryId
      : undefined
  const selectedCategoryId =
    typeValue !== STANDARD_TYPE_VALUE &&
    typeValue !== CUSTOM_TYPE_VALUE &&
    categories.some((c) => c.id === typeValue)
      ? typeValue
      : typeValue === STANDARD_TYPE_VALUE
        ? danglingExistingCategoryId
        : undefined

  const calculateWeekOfMonth = (targetDate: Date): number => {
    const momentDate = moment(targetDate)
    const targetWeekday = momentDate.day()
    const targetDateNum = momentDate.date()
    const firstDayOfMonth = momentDate.clone().startOf('month')
    const firstWeekdayOfMonth = firstDayOfMonth.clone()

    while (firstWeekdayOfMonth.day() !== targetWeekday) {
      firstWeekdayOfMonth.add(1, 'day')
    }

    const weeksBetween = momentDate.diff(firstWeekdayOfMonth, 'weeks')
    const occurrence = weeksBetween + 1
    const lastDayOfMonth = momentDate.clone().endOf('month')
    const daysFromEnd = lastDayOfMonth.date() - targetDateNum
    const isLastWeek = daysFromEnd < 7 && targetWeekday === momentDate.day()

    return isLastWeek ? -1 : occurrence
  }

  const handleFrequencyChange = (
    value: React.SetStateAction<RecurringPlanFrequencies>
  ) => {
    const newFrequency = typeof value === 'function' ? value(frequency) : value
    setFrequency(newFrequency)

    if (newFrequency === RecurringPlanFrequencies.MONTHLY_BY_WEEKDAY) {
      const selectedWeekday = moment(date).day()
      const selectedWeekOfMonth = calculateWeekOfMonth(date)

      setWeekday(selectedWeekday)
      setWeekOfMonth(selectedWeekOfMonth)
    }
  }

  const handleDateChange = (value: React.SetStateAction<Date>) => {
    const newDate = typeof value === 'function' ? value(date) : value
    setDate(newDate)

    if (frequency === RecurringPlanFrequencies.MONTHLY_BY_WEEKDAY) {
      const selectedWeekday = moment(newDate).day()
      const selectedWeekOfMonth = calculateWeekOfMonth(newDate)

      setWeekday(selectedWeekday)
      setWeekOfMonth(selectedWeekOfMonth)
    }
  }

  const [note, setNote] = useState(
    existingDayPlan?.note ?? recurringPlanData?.note ?? ''
  )

  const { planNotificationOffset, planAlwaysNotify, timeDisplayFormat } =
    usePreferences()
  const { allowed: notificationsAllowed } = useNotifications()

  const defaultNotifyOffset: NotifyMeOffset = {
    amount:
      planNotificationOffset?.amount ?? DEFAULT_PLAN_NOTIFICATION_OFFSET.amount,
    unit: planNotificationOffset?.unit ?? DEFAULT_PLAN_NOTIFICATION_OFFSET.unit,
  }

  const initialNotifyOffset = (): NotifyMeOffset => {
    const saved = existingDayPlan?.notifications?.[0]
    if (existingDayPlan && saved) {
      const anchor = combineDateAndStartTime(
        existingDayPlan.date,
        existingDayPlan.startTimeInMinutes
      )
      const derived = deriveOffsetFromDates(anchor, new Date(saved.date))
      if (derived) return derived
    }
    return defaultNotifyOffset
  }

  const [notifyMe, setNotifyMe] = useState<boolean>(
    existingDayPlan ? !!existingDayPlan.notifyMe : planAlwaysNotify
  )
  const [notifyMeOffset, setNotifyMeOffset] = useState<NotifyMeOffset>(
    initialNotifyOffset()
  )

  const toast = useToastController()
  const theme = useTheme()
  const insets = useSafeAreaInsets()

  const editingContext = `${route.params.existingDayPlanId || 'new'}-${route.params.existingRecurringPlanId || 'new'}-${route.params.recurringPlanDate || route.params.date}`

  useEffect(() => {
    setOneTime(existingRecurringPlan ? false : true)
    setDate(
      existingDayPlan
        ? combineDateAndStartTime(
            existingDayPlan.date,
            existingDayPlan.startTimeInMinutes
          )
        : existingRecurringPlan
          ? combineDateAndStartTime(
              editingStoredDate,
              recurringPlanData?.startTimeInMinutes
            )
          : combineDateAndStartTime(defaultStoredDate, undefined)
    )
    setEndDate(
      existingRecurringPlan?.recurrence.endDate
        ? localDateForWrite(existingRecurringPlan.recurrence.endDate)
        : null
    )
    setWillEnd(!!existingRecurringPlan?.recurrence.endDate)
    setHours(
      existingDayPlan
        ? Math.floor(existingDayPlan.minutes / 60)
        : recurringPlanData
          ? Math.floor(recurringPlanData.minutes / 60)
          : 0
    )
    setMinutes(
      existingDayPlan
        ? existingDayPlan.minutes % 60
        : recurringPlanData
          ? recurringPlanData.minutes % 60
          : 0
    )
    setInterval(existingRecurringPlan?.recurrence.interval ?? 1)
    setFrequency(
      existingRecurringPlan?.recurrence.frequency ??
        RecurringPlanFrequencies.WEEKLY
    )
    setWeekday(
      existingRecurringPlan?.recurrence.monthlyByWeekdayConfig?.weekday ?? 0
    )
    setWeekOfMonth(
      existingRecurringPlan?.recurrence.monthlyByWeekdayConfig?.weekOfMonth ?? 1
    )
    setNote(existingDayPlan?.note ?? recurringPlanData?.note ?? '')
    setNotifyMe(existingDayPlan ? !!existingDayPlan.notifyMe : planAlwaysNotify)
    setNotifyMeOffset(initialNotifyOffset())
    setTypeValue(resolveInitialTypeValue())
    setSaveScopeModalOpen(false)
    setSelectedSaveScope(null)
    // eslint-disable-next-line react-compiler/react-compiler
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingContext])

  const scheduleDayPlanNotification = async (
    storedDate: Date,
    startTimeInMinutes: number,
    plannedMinutes: number,
    plannedNote: string | undefined,
    existingNotifications: Notification[] | undefined
  ): Promise<Notification[]> => {
    if (existingNotifications) {
      for (const n of existingNotifications) {
        try {
          await Notifications.cancelScheduledNotificationAsync(n.id)
        } catch (error) {
          Sentry.captureException(error)
        }
      }
    }
    if (!notifyMe || !notificationsAllowed) return []

    const planStart = combineDateAndStartTime(storedDate, startTimeInMinutes)
    const fireAt = moment(planStart)
      .subtract(notifyMeOffset.amount, notifyMeOffset.unit)
      .toDate()
    if (!moment(fireAt).isAfter(moment())) {
      return []
    }

    const formatDuration = () =>
      formatMinutes(plannedMinutes, timeDisplayFormat).formatted

    try {
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: i18n.t('plan_reminder_title'),
          body: `${i18n.t('plan_notification_part1')} ${
            notifyMeOffset.amount
          } ${i18n.t(
            `${notifyMeOffset.unit}_lowercase` as TranslationKey
          )}. (${formatDuration()})${plannedNote ? `\n${plannedNote}` : ''}`,
          sound: true,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: fireAt,
        },
      })
      return [{ date: fireAt, id }]
    } catch (error) {
      Sentry.captureException(error)
      return []
    }
  }

  const buildRecurringPayload = () => {
    const { date: storedDate, startTimeInMinutes } = splitDateAndStartTime(date)
    return {
      startDate: storedDate,
      startTimeInMinutes,
      minutes: hours * 60 + minutes,
      categoryId: selectedCategoryId,
      recurrence: {
        endDate,
        frequency,
        interval,
        monthlyByWeekdayConfig:
          frequency === RecurringPlanFrequencies.MONTHLY_BY_WEEKDAY
            ? { weekday, weekOfMonth }
            : undefined,
      },
      note: note || undefined,
    }
  }

  const saveExistingRecurringPlan = (scope: RecurringSaveScope) => {
    if (!existingRecurringPlan) return

    const payload = buildRecurringPayload()
    const instanceDate = editingWriteDate
    const categoryChanged =
      (payload.categoryId ?? undefined) !==
      (existingRecurringPlan.categoryId ?? undefined)

    if (scope === 'instance') {
      const selectedDateMatchesInstance = sameDay(
        payload.startDate,
        editingDate
      )

      if (!selectedDateMatchesInstance || categoryChanged) {
        removeRecurringPlanOverride(existingRecurringPlan.id, instanceDate)
        deleteSingleEventFromRecurringPlan(
          existingRecurringPlan.id,
          instanceDate
        )
        addDayPlan({
          id: Crypto.randomUUID(),
          date: payload.startDate,
          startTimeInMinutes: payload.startTimeInMinutes,
          minutes: payload.minutes,
          categoryId: payload.categoryId,
          note: payload.note,
          notifyMe: false,
          notifications: [],
        })
        return
      }

      const override = {
        date: instanceDate,
        minutes: payload.minutes,
        startTimeInMinutes: payload.startTimeInMinutes,
        note: payload.note,
      }

      const existingOverride = existingRecurringPlan.overrides?.some((o) =>
        sameDay(o.date, instanceDate)
      )

      if (existingOverride) {
        updateRecurringPlanOverride(existingRecurringPlan.id, override)
      } else {
        addRecurringPlanOverride(existingRecurringPlan.id, override)
      }
      return
    }

    if (scope === 'future') {
      if (sameDay(editingDate, existingRecurringPlan.startDate)) {
        updateRecurringPlan({
          id: existingRecurringPlan.id,
          ...payload,
        })
        return
      }

      const lastOldDate = localDayFromUtcCursor(
        storedDay(editingDate).clone().subtract(1, 'day')
      )
      updateRecurringPlan({
        id: existingRecurringPlan.id,
        recurrence: {
          ...existingRecurringPlan.recurrence,
          endDate: lastOldDate,
        },
        overrides: existingRecurringPlan.overrides?.filter((override) =>
          storedDay(override.date).isBefore(storedDay(editingDate), 'day')
        ),
        deletedDates: existingRecurringPlan.deletedDates?.filter(
          (deletedDate) =>
            storedDay(deletedDate).isBefore(storedDay(editingDate), 'day')
        ),
      })
      addRecurringPlan({
        id: Crypto.randomUUID(),
        ...payload,
      })
      return
    }

    updateRecurringPlan({
      id: existingRecurringPlan.id,
      ...payload,
    })
  }

  const savePlan = async (scope?: RecurringSaveScope) => {
    const { date: storedDate, startTimeInMinutes } = splitDateAndStartTime(date)
    const plannedMinutes = hours * 60 + minutes
    const plannedNote = note || undefined

    if (isEditMode) {
      if (existingDayPlan) {
        const notifications = await scheduleDayPlanNotification(
          storedDate,
          startTimeInMinutes,
          plannedMinutes,
          plannedNote,
          existingDayPlan.notifications
        )
        updateDayPlan({
          id: existingDayPlan.id,
          date: storedDate,
          startTimeInMinutes,
          minutes: plannedMinutes,
          categoryId: selectedCategoryId,
          note: plannedNote,
          notifyMe,
          notifications,
        })
      } else if (existingRecurringPlan && scope) {
        saveExistingRecurringPlan(scope)
      }

      toast.show(i18n.t('success'), {
        message: i18n.t('updatedPlan'),
        native: true,
        duration: 2500,
      })
    } else {
      if (oneTime) {
        const notifications = await scheduleDayPlanNotification(
          storedDate,
          startTimeInMinutes,
          plannedMinutes,
          plannedNote,
          undefined
        )
        addDayPlan({
          id: Crypto.randomUUID(),
          date: storedDate,
          startTimeInMinutes,
          minutes: plannedMinutes,
          categoryId: selectedCategoryId,
          note: plannedNote,
          notifyMe,
          notifications,
        })
      } else {
        addRecurringPlan({
          id: Crypto.randomUUID(),
          ...buildRecurringPayload(),
        })
      }

      toast.show(i18n.t('success'), {
        message: i18n.t('addedPlan'),
        native: true,
        duration: 2500,
      })
    }

    setSaveScopeModalOpen(false)
    navigation.goBack()
  }

  const saveDisabled =
    (hours === 0 && minutes === 0) || typeValue === CUSTOM_TYPE_VALUE

  const handlePrimarySave = () => {
    if (existingRecurringPlan) {
      setSelectedSaveScope(null)
      setSaveScopeModalOpen(true)
      return
    }

    savePlan()
  }

  return (
    <Wrapper
      style={{
        flex: 1,
        flexGrow: 1,
        justifyContent: 'space-between',
        paddingBottom: insets.bottom,
        paddingTop: 0,
      }}
    >
      <View style={{ flex: 1 }}>
        <KeyboardAwareScrollView
          contentContainerStyle={{
            minHeight: 10,
            gap: 20,
            paddingTop: 10,
          }}
        >
          <Section>
            {!isEditMode && (
              <PlanKindToggle oneTime={oneTime} setOneTime={setOneTime} />
            )}
            <PlanFields
              isRecurring={!oneTime}
              date={date}
              setDate={handleDateChange}
              hours={hours}
              setHours={setHours}
              minutes={minutes}
              setMinutes={setMinutes}
              note={note}
              setNote={setNote}
              typeSelector={
                <TypeSelectorRow
                  value={typeValue}
                  onChange={handleTypeChange}
                />
              }
              endDate={endDate}
              setEndDate={setEndDate}
              willEnd={willEnd}
              setWillEnd={setWillEnd}
              frequency={frequency}
              setFrequency={handleFrequencyChange}
              weekday={weekday}
              setWeekday={setWeekday}
              weekOfMonth={weekOfMonth}
              setWeekOfMonth={setWeekOfMonth}
              notifyMe={notifyMe}
              setNotifyMe={setNotifyMe}
              notifyMeOffset={notifyMeOffset}
              setNotifyMeOffset={setNotifyMeOffset}
              notificationsAllowed={notificationsAllowed}
            />

            {typeValue === CUSTOM_TYPE_VALUE && (
              <Text style={{ fontSize: 12, color: theme.colors.textAlt }}>
                {i18n.t('categoryNeeded')}
              </Text>
            )}
            <View style={{ paddingRight: 20, paddingVertical: 15 }}>
              <ActionButton onPress={handlePrimarySave} disabled={saveDisabled}>
                <Text
                  style={{
                    color: theme.colors.textInverse,
                    fontFamily: theme.fonts.bold,
                    fontSize: theme.fontSize('lg'),
                  }}
                >
                  {isEditMode
                    ? i18n.t('save')
                    : `${i18n.t('add')} ${i18n.t(oneTime ? 'oneTime' : 'recurring')} ${i18n.t('plan')}`}
                </Text>
              </ActionButton>
            </View>
          </Section>
        </KeyboardAwareScrollView>
      </View>

      <RecurringSaveScopeModal
        open={saveScopeModalOpen}
        selectedScope={selectedSaveScope}
        setSelectedScope={setSelectedSaveScope}
        onCancel={() => setSaveScopeModalOpen(false)}
        onConfirm={() => {
          if (!selectedSaveScope) return
          savePlan(selectedSaveScope)
        }}
      />
    </Wrapper>
  )
}

export default PlanDayScreen
