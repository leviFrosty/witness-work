import { Platform, View } from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import ActionButton from '../components/ActionButton'
import useServiceReport from '../stores/serviceReport'
import * as Crypto from 'expo-crypto'
import { useState, useEffect, useMemo } from 'react'
import { useToastController } from '@tamagui/toast'
import i18n from '../lib/locales'
import Text from '../components/MyText'
import useTheme from '../contexts/theme'
import Section from '../components/inputs/Section'
import InputRowContainer from '../components/inputs/InputRowContainer'
import XView from '../components/layout/XView'
import Button from '../components/Button'
import IconButton from '../components/IconButton'
import { faCalendarDay, faRepeat } from '@fortawesome/free-solid-svg-icons'
import RNDateTimePicker from '@react-native-community/datetimepicker'
import DateTimePicker from '../components/DateTimePicker'
import Select from '../components/Select'
import { getLocales } from 'expo-localization'
import Wrapper from '../components/layout/Wrapper'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import moment from 'moment'
import Checkbox from 'expo-checkbox'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import {
  RecurringPlanFrequencies,
  getMonthsReports,
} from '../lib/serviceReport'

import TextInput from '../components/TextInput'
import { RootStackParamList } from '../types/rootStack'
import DayHistoryView from '../components/DayHistoryView'

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

const OneTimePlan = (props: {
  date: Date
  setDate: React.Dispatch<React.SetStateAction<Date>>
  hours: number
  setHours: React.Dispatch<React.SetStateAction<number>>
  minutes: number
  setMinutes: React.Dispatch<React.SetStateAction<number>>
  note?: string
  setNote: React.Dispatch<React.SetStateAction<string>>
}) => {
  const theme = useTheme()

  return (
    <>
      <InputRowContainer label={i18n.t('date')} justifyContent='space-between'>
        <DateTimePicker
          value={props.date}
          onChange={(_, newDate) => newDate && props.setDate(newDate)}
        />
      </InputRowContainer>
      <InputRowContainer label={i18n.t('note')}>
        <View style={{ flex: 1 }}>
          <TextInput
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
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <View style={{ width: '50%' }}>
          <InputRowContainer label={i18n.t('hours')} lastInSection>
            <View style={{ flex: 1 }}>
              <Select
                data={hourOptions}
                placeholder={props.hours.toString()}
                onChange={({ value }) => props.setHours(value)}
                value={props.hours.toString()}
              />
            </View>
          </InputRowContainer>
        </View>
        <View style={{ width: '50%' }}>
          <InputRowContainer label={i18n.t('minutes')} lastInSection>
            <View style={{ flex: 1 }}>
              <Select
                data={minuteOptions}
                placeholder={props.minutes.toString()}
                onChange={({ value }) => props.setMinutes(value)}
                value={props.minutes.toString()}
              />
            </View>
          </InputRowContainer>
        </View>
      </View>
    </>
  )
}

const RecurringPlan = (props: {
  date: Date
  setDate: React.Dispatch<React.SetStateAction<Date>>
  hours: number
  setHours: React.Dispatch<React.SetStateAction<number>>
  minutes: number
  setMinutes: React.Dispatch<React.SetStateAction<number>>
  endDate: Date | null
  setEndDate: React.Dispatch<React.SetStateAction<Date | null>>
  interval: number
  setInterval: React.Dispatch<React.SetStateAction<number>>
  frequency: RecurringPlanFrequencies
  setFrequency: React.Dispatch<React.SetStateAction<RecurringPlanFrequencies>>
  weekday: number
  setWeekday: React.Dispatch<React.SetStateAction<number>>
  weekOfMonth: number
  setWeekOfMonth: React.Dispatch<React.SetStateAction<number>>
  note?: string
  setNote: React.Dispatch<React.SetStateAction<string>>
  getRecurringDescription: () => string
}) => {
  const [willEnd, setWillEnd] = useState(!!props.endDate)
  const theme = useTheme()

  const handleSetWillEnd = () => {
    if (!willEnd === true) {
      props.setEndDate(props.date)
    } else {
      props.setEndDate(null)
    }
    setWillEnd(!willEnd)
  }

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

  return (
    <>
      <InputRowContainer
        label={i18n.t('startDate')}
        justifyContent='space-between'
      >
        <DateTimePicker
          value={props.date}
          onChange={(_, newDate) => newDate && props.setDate(newDate)}
        />
      </InputRowContainer>
      <InputRowContainer label={i18n.t('frequency')}>
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
          <Checkbox value={willEnd} onValueChange={handleSetWillEnd} />
          {willEnd &&
            props.endDate &&
            (Platform.OS !== 'android' ? (
              <RNDateTimePicker
                locale={getLocales()[0].languageCode || undefined}
                value={props.endDate}
                onChange={(_, newDate) => newDate && props.setEndDate(newDate)}
              />
            ) : (
              <DateTimePicker
                value={props.endDate}
                onChange={(_, newDate) => newDate && props.setEndDate(newDate)}
              />
            ))}
        </XView>
      </InputRowContainer>
      <InputRowContainer label={i18n.t('note')}>
        <View style={{ flex: 1 }}>
          <TextInput
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
      {(props.frequency === RecurringPlanFrequencies.MONTHLY ||
        props.frequency === RecurringPlanFrequencies.MONTHLY_BY_WEEKDAY) && (
        <View style={{ paddingHorizontal: 20, paddingVertical: 8 }}>
          <Text
            style={{
              fontSize: theme.fontSize('sm'),
              color: theme.colors.textAlt,
              fontStyle: 'italic',
            }}
          >
            {props.getRecurringDescription()}
          </Text>
        </View>
      )}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <View style={{ width: '50%' }}>
          <InputRowContainer label={i18n.t('hours')} lastInSection>
            <View style={{ flex: 1 }}>
              <Select
                data={hourOptions}
                placeholder={props.hours.toString()}
                onChange={({ value }) => props.setHours(value)}
                value={props.hours.toString()}
              />
            </View>
          </InputRowContainer>
        </View>
        <View style={{ width: '50%' }}>
          <InputRowContainer label={i18n.t('minutes')} lastInSection>
            <View style={{ flex: 1 }}>
              <Select
                data={minuteOptions}
                placeholder={props.minutes.toString()}
                onChange={({ value }) => props.setMinutes(value)}
                value={props.minutes.toString()}
              />
            </View>
          </InputRowContainer>
        </View>
      </View>
    </>
  )
}

type PlanDayScreenProps = NativeStackScreenProps<RootStackParamList, 'PlanDay'>

const PlanDayScreen = ({ route, navigation }: PlanDayScreenProps) => {
  const defaultDate = useMemo(
    () => moment(route.params.date).toDate(),
    [route.params.date]
  )
  const {
    serviceReports,
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
    restoreRecurringPlanInstance,
  } = useServiceReport()

  // Find existing plan if editing
  const existingDayPlan = route.params.existingDayPlanId
    ? dayPlans.find((p) => p.id === route.params.existingDayPlanId)
    : null
  const existingRecurringPlan = route.params.existingRecurringPlanId
    ? recurringPlans.find((p) => p.id === route.params.existingRecurringPlanId)
    : null

  // Check if we're editing a recurring plan override vs the entire plan
  const editingDate =
    existingRecurringPlan && route.params.recurringPlanDate
      ? moment(route.params.recurringPlanDate).toDate()
      : defaultDate

  const isRecurringPlanOverride =
    existingRecurringPlan &&
    !moment(editingDate).isSame(existingRecurringPlan.startDate, 'day')

  // Get the actual plan data (with overrides applied if applicable)
  const recurringPlanData =
    existingRecurringPlan && isRecurringPlanOverride
      ? getRecurringPlanForDate(existingRecurringPlan.id, editingDate)
      : existingRecurringPlan

  const isEditMode = !!(existingDayPlan || existingRecurringPlan)
  const isOverrideMode = isRecurringPlanOverride

  // Initialize state with existing plan data or defaults
  const [oneTime, setOneTime] = useState(existingRecurringPlan ? false : true)
  const [date, setDate] = useState(
    existingDayPlan
      ? moment(existingDayPlan.date).toDate()
      : existingRecurringPlan
        ? editingDate
        : defaultDate
  )
  const [endDate, setEndDate] = useState<Date | null>(
    existingRecurringPlan?.recurrence.endDate
      ? moment(existingRecurringPlan.recurrence.endDate).toDate()
      : null
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

  // Helper function to calculate week of month for a given date
  const calculateWeekOfMonth = (targetDate: Date): number => {
    const momentDate = moment(targetDate)
    const targetWeekday = momentDate.day()
    const targetDateNum = momentDate.date()

    // Find the first occurrence of this weekday in the month
    const firstDayOfMonth = momentDate.clone().startOf('month')
    const firstWeekdayOfMonth = firstDayOfMonth.clone()

    while (firstWeekdayOfMonth.day() !== targetWeekday) {
      firstWeekdayOfMonth.add(1, 'day')
    }

    // Calculate which occurrence this is (1st, 2nd, 3rd, 4th)
    const weeksBetween = momentDate.diff(firstWeekdayOfMonth, 'weeks')
    const occurrence = weeksBetween + 1

    // Check if this is the last occurrence of this weekday in the month
    const lastDayOfMonth = momentDate.clone().endOf('month')
    const daysFromEnd = lastDayOfMonth.date() - targetDateNum
    const isLastWeek = daysFromEnd < 7 && targetWeekday === momentDate.day()

    return isLastWeek ? -1 : occurrence
  }

  // Auto-populate weekday and week of month when switching to MONTHLY_BY_WEEKDAY
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

  // Auto-populate weekday and week of month when date changes and frequency is MONTHLY_BY_WEEKDAY
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

  // Helper function to get ordinal suffix for numbers
  const getOrdinalSuffix = (num: number): string => {
    const j = num % 10
    const k = num % 100
    if (j === 1 && k !== 11) return `${num}st`
    if (j === 2 && k !== 12) return `${num}nd`
    if (j === 3 && k !== 13) return `${num}rd`
    return `${num}th`
  }

  // Helper function to get descriptive text for recurring frequency
  const getRecurringDescription = (): string => {
    if (frequency === RecurringPlanFrequencies.MONTHLY) {
      const dayOfMonth = moment(date).date()
      return `${i18n.t('repeatsOnThe')} ${getOrdinalSuffix(dayOfMonth)} ${i18n.t('ofEachMonth')}`
    } else if (frequency === RecurringPlanFrequencies.MONTHLY_BY_WEEKDAY) {
      const weekdayNames = [
        i18n.t('sunday'),
        i18n.t('monday'),
        i18n.t('tuesday'),
        i18n.t('wednesday'),
        i18n.t('thursday'),
        i18n.t('friday'),
        i18n.t('saturday'),
      ]
      const weekdayName = weekdayNames[weekday]

      if (weekOfMonth === -1) {
        return `${i18n.t('repeatsOnThe_weekday')} ${i18n.t('lastWeek').toLowerCase()} ${weekdayName} ${i18n.t('ofEveryMonth')}`
      } else {
        const weekNames = [
          i18n.t('firstWeek'),
          i18n.t('secondWeek'),
          i18n.t('thirdWeek'),
          i18n.t('fourthWeek'),
        ]
        const weekName =
          weekNames[weekOfMonth - 1]?.toLowerCase() ||
          `${getOrdinalSuffix(weekOfMonth)}`
        return `${i18n.t('repeatsOnThe_weekday')} ${weekName} ${weekdayName} ${i18n.t('ofEveryMonth')}`
      }
    }
    return ''
  }

  const [note, setNote] = useState(
    existingDayPlan?.note ?? recurringPlanData?.note ?? ''
  )

  // Get service reports for the selected date's month so DayHistoryView can show time entries
  const monthsReports = useMemo(() => {
    const currentMonth = moment(date).month()
    const currentYear = moment(date).year()
    return getMonthsReports(serviceReports, currentMonth, currentYear)
  }, [serviceReports, date])

  const toast = useToastController()
  const theme = useTheme()
  const insets = useSafeAreaInsets()

  // Create a unique key representing what we're editing to detect changes
  const editingContext = useMemo(() => {
    return `${route.params.existingDayPlanId || 'new'}-${route.params.existingRecurringPlanId || 'new'}-${route.params.recurringPlanDate || route.params.date}`
  }, [
    route.params.existingDayPlanId,
    route.params.existingRecurringPlanId,
    route.params.recurringPlanDate,
    route.params.date,
  ])

  // Reset state when editing context changes (navigating to edit different plans)
  useEffect(() => {
    // Reset all state using the existing variables that are already calculated
    setOneTime(existingRecurringPlan ? false : true)
    setDate(
      existingDayPlan
        ? moment(existingDayPlan.date).toDate()
        : existingRecurringPlan
          ? editingDate
          : defaultDate
    )
    setEndDate(
      existingRecurringPlan?.recurrence.endDate
        ? moment(existingRecurringPlan.recurrence.endDate).toDate()
        : null
    )
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
    // eslint-disable-next-line react-compiler/react-compiler
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingContext]) // Only depend on the stable editing context key

  const handleAddPlan = () => {
    if (isEditMode) {
      // Update existing plan
      if (existingDayPlan) {
        updateDayPlan({
          id: existingDayPlan.id,
          date,
          minutes: hours * 60 + minutes,
          note: note || undefined,
        })
      } else if (existingRecurringPlan) {
        if (isOverrideMode) {
          // Create or update override for specific date
          const override = {
            date: editingDate,
            minutes: hours * 60 + minutes,
            note: note || undefined,
          }

          const existingOverride = existingRecurringPlan.overrides?.find((o) =>
            moment(o.date).isSame(editingDate, 'day')
          )

          if (existingOverride) {
            updateRecurringPlanOverride(existingRecurringPlan.id, override)
          } else {
            addRecurringPlanOverride(existingRecurringPlan.id, override)
          }
        } else {
          // Update the entire recurring plan
          updateRecurringPlan({
            id: existingRecurringPlan.id,
            startDate: date,
            minutes: hours * 60 + minutes,
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
          })
        }
      }

      toast.show(i18n.t('success'), {
        message: isOverrideMode
          ? i18n.t('overrideCreated')
          : i18n.t('updatedPlan'),
        native: true,
        duration: 2500,
      })
    } else {
      // Create new plan
      if (oneTime) {
        addDayPlan({
          id: Crypto.randomUUID(),
          date,
          minutes: hours * 60 + minutes,
          note: note || undefined,
        })
      } else {
        addRecurringPlan({
          id: Crypto.randomUUID(),
          startDate: date,
          minutes: hours * 60 + minutes,
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
        })
      }

      toast.show(i18n.t('success'), {
        message: i18n.t('addedPlan'),
        native: true,
        duration: 2500,
      })
    }

    navigation.goBack()
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
      <View
        style={{
          flex: 1,
        }}
      >
        <KeyboardAwareScrollView
          contentContainerStyle={{
            minHeight: 10,
            gap: 20,
          }}
        >
          {isEditMode && (
            <View style={{ paddingHorizontal: 20, paddingTop: 10 }}>
              <View
                style={{
                  backgroundColor: theme.colors.accent3Alt,
                  padding: 15,
                  borderRadius: theme.numbers.borderRadiusMd,
                  borderWidth: 1,
                  borderColor: theme.colors.accent3,
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    marginBottom: 8,
                  }}
                >
                  <IconButton
                    icon={existingDayPlan ? faCalendarDay : faRepeat}
                    color={theme.colors.accent3}
                    size={18}
                  />
                  <Text
                    style={{
                      fontFamily: theme.fonts.semiBold,
                      color: theme.colors.accent3,
                      marginLeft: 8,
                      fontSize: theme.fontSize('md'),
                    }}
                  >
                    {existingDayPlan
                      ? i18n.t('editingDayPlan')
                      : isOverrideMode
                        ? `${i18n.t('editingOverride')} • ${i18n.t('recurring')}`
                        : i18n.t('editingRecurringPlan')}
                  </Text>
                </View>
                <Text
                  style={{
                    fontSize: theme.fontSize('sm'),
                    color: theme.colors.text,
                    lineHeight: theme.fontSize('sm') * 1.4,
                  }}
                >
                  {isOverrideMode
                    ? i18n.t('editingOverride_description')
                    : i18n.t('editingPlan_description')}
                </Text>
              </View>
            </View>
          )}
          <Section>
            <View style={{ flexDirection: 'column', gap: 10 }}>
              {isEditMode ? (
                <InputRowContainer label={i18n.t('currentPlanType')}>
                  <View
                    style={{
                      backgroundColor: theme.colors.backgroundLighter,
                      borderRadius: theme.numbers.borderRadiusMd,
                      padding: 12,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'flex-end',
                      gap: 8,
                      flex: 1,
                    }}
                  >
                    <IconButton
                      icon={existingDayPlan ? faCalendarDay : faRepeat}
                      color={theme.colors.accent}
                      size={16}
                    />
                    <Text
                      style={{
                        color: theme.colors.accent,
                        fontFamily: theme.fonts.semiBold,
                        fontSize: theme.fontSize('md'),
                      }}
                    >
                      {existingDayPlan
                        ? i18n.t('oneTime')
                        : i18n.t('recurring')}
                    </Text>
                  </View>
                </InputRowContainer>
              ) : (
                <>
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
                          backgroundColor: oneTime
                            ? theme.colors.accentTranslucent
                            : undefined,
                          borderColor: oneTime
                            ? theme.colors.accent
                            : undefined,
                          borderWidth: oneTime ? 1 : 0,
                          paddingHorizontal: 30,
                          paddingVertical: 10,
                          borderRadius: theme.numbers.borderRadiusXl,
                          justifyContent: 'center',
                          flex: 1,
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 5,
                        }}
                        onPress={() => setOneTime(true)}
                      >
                        <IconButton
                          icon={faCalendarDay}
                          color={
                            oneTime ? theme.colors.accent : theme.colors.text
                          }
                        />
                        <Text
                          style={{
                            textAlign: 'center',
                            color: oneTime
                              ? theme.colors.accent
                              : theme.colors.text,
                          }}
                        >
                          {i18n.t('oneTime')}
                        </Text>
                      </Button>
                      <Button
                        style={{
                          backgroundColor: !oneTime
                            ? theme.colors.accentTranslucent
                            : undefined,
                          borderColor: !oneTime
                            ? theme.colors.accent
                            : undefined,
                          borderWidth: !oneTime ? 1 : 0,
                          paddingHorizontal: 30,
                          paddingVertical: 10,
                          borderRadius: theme.numbers.borderRadiusXl,
                          justifyContent: 'center',
                          flex: 1,
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 5,
                        }}
                        onPress={() => setOneTime(false)}
                      >
                        <IconButton
                          icon={faRepeat}
                          color={
                            !oneTime ? theme.colors.accent : theme.colors.text
                          }
                        />
                        <Text
                          style={{
                            textAlign: 'center',
                            color: !oneTime
                              ? theme.colors.accent
                              : theme.colors.text,
                          }}
                        >
                          {i18n.t('recurring')}
                        </Text>
                      </Button>
                    </XView>
                  </InputRowContainer>
                  {oneTime && (
                    <Text
                      style={{
                        fontSize: theme.fontSize('sm'),
                        color: theme.colors.textAlt,
                      }}
                    >
                      {i18n.t('oneTimeSchedule_description')}
                    </Text>
                  )}
                </>
              )}
            </View>
            {oneTime ? (
              <OneTimePlan
                date={date}
                hours={hours}
                minutes={minutes}
                setMinutes={setMinutes}
                setDate={setDate}
                setHours={setHours}
                note={note}
                setNote={setNote}
              />
            ) : (
              <RecurringPlan
                date={date}
                hours={hours}
                minutes={minutes}
                setMinutes={setMinutes}
                setDate={handleDateChange}
                setHours={setHours}
                endDate={endDate}
                setEndDate={setEndDate}
                interval={interval}
                setInterval={setInterval}
                frequency={frequency}
                setFrequency={handleFrequencyChange}
                weekday={weekday}
                setWeekday={setWeekday}
                weekOfMonth={weekOfMonth}
                setWeekOfMonth={setWeekOfMonth}
                note={note}
                setNote={setNote}
                getRecurringDescription={getRecurringDescription}
              />
            )}

            <View style={{ paddingRight: 20, paddingVertical: 15 }}>
              <ActionButton
                onPress={handleAddPlan}
                disabled={hours === 0 && minutes === 0}
              >
                <Text
                  style={{
                    color: theme.colors.textInverse,
                    fontFamily: theme.fonts.bold,
                    fontSize: theme.fontSize('lg'),
                  }}
                >
                  {isEditMode
                    ? isOverrideMode
                      ? existingRecurringPlan?.overrides?.some((o) =>
                          moment(o.date).isSame(editingDate, 'day')
                        )
                        ? i18n.t('updateOverride')
                        : i18n.t('createOverride')
                      : i18n.t('updatePlan')
                    : `${i18n.t('add')} ${i18n.t(oneTime ? 'oneTime' : 'recurring')} ${i18n.t('plan')}`}
                </Text>
              </ActionButton>
            </View>
          </Section>

          <View style={{ paddingHorizontal: 20 }}>
            <DayHistoryView
              date={date}
              serviceReports={monthsReports}
              onDayPlanPress={(plan) => {
                navigation.navigate('PlanDay', {
                  date: date.toISOString(),
                  existingDayPlanId: plan.id,
                })
              }}
              onRecurringPlanPress={(plan) => {
                navigation.navigate('PlanDay', {
                  date: date.toISOString(),
                  existingRecurringPlanId: plan.id,
                  recurringPlanDate: date.toISOString(),
                })
              }}
            />
          </View>

          {existingRecurringPlan && (
            <View style={{ paddingHorizontal: 20, gap: 15 }}>
              {isOverrideMode && (
                <View
                  style={{
                    backgroundColor: theme.colors.accentTranslucent,
                    padding: 15,
                    borderRadius: theme.numbers.borderRadiusSm,
                    borderWidth: 1,
                    borderColor: theme.colors.accent,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: theme.fonts.semiBold,
                      color: theme.colors.accent,
                      marginBottom: 5,
                    }}
                  >
                    {i18n.t('editingOverride')}
                  </Text>
                  <Text
                    style={{
                      fontSize: theme.fontSize('sm'),
                      color: theme.colors.text,
                      marginBottom: 8,
                    }}
                  >
                    {i18n.t('editingOverride_description')}
                  </Text>
                  <Button
                    onPress={() => {
                      if (
                        existingRecurringPlan.overrides?.some((o) =>
                          moment(o.date).isSame(editingDate, 'day')
                        )
                      ) {
                        removeRecurringPlanOverride(
                          existingRecurringPlan.id,
                          editingDate
                        )
                        toast.show(i18n.t('success'), {
                          message: i18n.t('overrideRemoved'),
                          native: true,
                          duration: 2500,
                        })
                        navigation.goBack()
                      } else {
                        navigation.goBack()
                      }
                    }}
                    style={{
                      backgroundColor: theme.colors.backgroundLighter,
                      paddingHorizontal: 15,
                      paddingVertical: 8,
                      borderRadius: theme.numbers.borderRadiusSm,
                      alignSelf: 'flex-start',
                    }}
                  >
                    <Text
                      style={{
                        color: theme.colors.text,
                        fontSize: theme.fontSize('sm'),
                        fontFamily: theme.fonts.semiBold,
                      }}
                    >
                      {i18n.t('removeOverride')}
                    </Text>
                  </Button>
                </View>
              )}
              {existingRecurringPlan.overrides &&
                existingRecurringPlan.overrides.length > 0 && (
                  <View
                    style={{
                      backgroundColor: theme.colors.backgroundLighter,
                      padding: 15,
                      borderRadius: theme.numbers.borderRadiusSm,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: theme.fonts.semiBold,
                        marginBottom: 10,
                        fontSize: theme.fontSize('md'),
                      }}
                    >
                      {i18n.t('existingOverrides')} (
                      {existingRecurringPlan.overrides.length})
                    </Text>
                    <View style={{ gap: 8 }}>
                      {existingRecurringPlan.overrides.map(
                        (override, index) => (
                          <View
                            key={index}
                            style={{
                              flexDirection: 'row',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              paddingVertical: 5,
                            }}
                          >
                            <View>
                              <Text
                                style={{ fontFamily: theme.fonts.semiBold }}
                              >
                                {moment(override.date).format('MMM D, YYYY')}
                              </Text>
                              <Text
                                style={{
                                  fontSize: theme.fontSize('sm'),
                                  color: theme.colors.textAlt,
                                }}
                              >
                                {Math.floor(override.minutes / 60)}h{' '}
                                {override.minutes % 60}m
                                {override.note && ` • ${override.note}`}
                              </Text>
                            </View>
                            <Button
                              onPress={() => {
                                removeRecurringPlanOverride(
                                  existingRecurringPlan.id,
                                  override.date
                                )
                                toast.show(i18n.t('success'), {
                                  message: i18n.t('overrideRemoved'),
                                  native: true,
                                  duration: 1500,
                                })
                              }}
                              style={{
                                backgroundColor: theme.colors.card,
                                paddingHorizontal: 10,
                                paddingVertical: 5,
                                borderRadius: theme.numbers.borderRadiusSm,
                              }}
                            >
                              <Text
                                style={{
                                  color: theme.colors.textAlt,
                                  fontSize: theme.fontSize('sm'),
                                }}
                              >
                                {i18n.t('remove')}
                              </Text>
                            </Button>
                          </View>
                        )
                      )}
                    </View>
                  </View>
                )}
              {existingRecurringPlan.deletedDates &&
                existingRecurringPlan.deletedDates.length > 0 && (
                  <View
                    style={{
                      backgroundColor: theme.colors.backgroundLighter,
                      padding: 15,
                      borderRadius: theme.numbers.borderRadiusSm,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: theme.fonts.semiBold,
                        marginBottom: 10,
                        fontSize: theme.fontSize('md'),
                      }}
                    >
                      {i18n.t('deletedInstances')} (
                      {existingRecurringPlan.deletedDates.length})
                    </Text>
                    <Text
                      style={{
                        fontSize: theme.fontSize('sm'),
                        color: theme.colors.textAlt,
                        marginBottom: 15,
                      }}
                    >
                      {i18n.t('deletedInstances_description')}
                    </Text>
                    <View style={{ gap: 8 }}>
                      {existingRecurringPlan.deletedDates.map(
                        (deletedDate, index) => (
                          <View
                            key={index}
                            style={{
                              flexDirection: 'row',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              paddingVertical: 5,
                              paddingHorizontal: 10,
                              backgroundColor: theme.colors.card,
                              borderRadius: theme.numbers.borderRadiusSm,
                            }}
                          >
                            <Text style={{ fontFamily: theme.fonts.semiBold }}>
                              {moment(deletedDate).format('MMM D, YYYY')}
                            </Text>
                            <Button
                              onPress={() => {
                                restoreRecurringPlanInstance(
                                  existingRecurringPlan.id,
                                  deletedDate
                                )
                                toast.show(i18n.t('success'), {
                                  message: i18n.t('instanceRestored'),
                                  native: true,
                                  duration: 1500,
                                })
                              }}
                              style={{
                                backgroundColor: theme.colors.accentTranslucent,
                                paddingHorizontal: 12,
                                paddingVertical: 6,
                                borderRadius: theme.numbers.borderRadiusSm,
                                borderWidth: 1,
                                borderColor: theme.colors.accent,
                              }}
                            >
                              <Text
                                style={{
                                  color: theme.colors.accent,
                                  fontSize: theme.fontSize('sm'),
                                  fontFamily: theme.fonts.semiBold,
                                }}
                              >
                                {i18n.t('restore')}
                              </Text>
                            </Button>
                          </View>
                        )
                      )}
                    </View>
                  </View>
                )}
            </View>
          )}
        </KeyboardAwareScrollView>
      </View>
    </Wrapper>
  )
}

export default PlanDayScreen
