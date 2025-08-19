import { Platform, View } from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import ActionButton from '../components/ActionButton'
import useServiceReport from '../stores/serviceReport'
import * as Crypto from 'expo-crypto'
import { useState } from 'react'
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
import { RecurringPlanFrequencies } from '../lib/serviceReport'

import TextInput from '../components/TextInput'
import { RootStackParamList } from '../types/rootStack'

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
  note?: string
  setNote: React.Dispatch<React.SetStateAction<string>>
}) => {
  const [willEnd, setWillEnd] = useState(false)
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
  ]

  return (
    <>
      <InputRowContainer
        label={i18n.t('startDate')}
        justifyContent='space-between'
      >
        <DateTimePicker
          minimumDate={new Date()}
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
  const defaultDate = moment(route.params.date).toDate()
  const {
    dayPlans,
    recurringPlans,
    addDayPlan,
    addRecurringPlan,
    updateDayPlan,
    updateRecurringPlan,
  } = useServiceReport()

  // Find existing plan if editing
  const existingDayPlan = route.params.existingDayPlanId
    ? dayPlans.find((p) => p.id === route.params.existingDayPlanId)
    : null
  const existingRecurringPlan = route.params.existingRecurringPlanId
    ? recurringPlans.find((p) => p.id === route.params.existingRecurringPlanId)
    : null

  const isEditMode = !!(existingDayPlan || existingRecurringPlan)

  // Initialize state with existing plan data or defaults
  const [oneTime, setOneTime] = useState(existingRecurringPlan ? false : true)
  const [date, setDate] = useState(
    existingDayPlan
      ? moment(existingDayPlan.date).toDate()
      : existingRecurringPlan
        ? moment(route.params.recurringPlanDate).toDate()
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
      : existingRecurringPlan
        ? Math.floor(existingRecurringPlan.minutes / 60)
        : 0
  )
  const [minutes, setMinutes] = useState(
    existingDayPlan
      ? existingDayPlan.minutes % 60
      : existingRecurringPlan
        ? existingRecurringPlan.minutes % 60
        : 0
  )
  const [interval, setInterval] = useState<number>(
    existingRecurringPlan?.recurrence.interval ?? 1
  )
  const [frequency, setFrequency] = useState<RecurringPlanFrequencies>(
    existingRecurringPlan?.recurrence.frequency ??
      RecurringPlanFrequencies.WEEKLY
  )
  const [note, setNote] = useState(
    existingDayPlan?.note ?? existingRecurringPlan?.note ?? ''
  )
  const toast = useToastController()
  const theme = useTheme()
  const insets = useSafeAreaInsets()

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
        updateRecurringPlan({
          id: existingRecurringPlan.id,
          startDate: date,
          minutes: hours * 60 + minutes,
          recurrence: {
            endDate,
            frequency,
            interval,
          },
          note: note || undefined,
        })
      }

      toast.show(i18n.t('success'), {
        message: i18n.t('updatedPlan'),
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
          <Section>
            <Text
              style={{
                fontSize: theme.fontSize('xl'),
                fontFamily: theme.fonts.bold,
                paddingBottom: 5,
              }}
            >
              {isEditMode ? i18n.t('editPlan') : i18n.t('createNewPlan')}
            </Text>
            <View style={{ flexDirection: 'column', gap: 10 }}>
              {!isEditMode && (
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
                        borderColor: oneTime ? theme.colors.accent : undefined,
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
                        borderColor: !oneTime ? theme.colors.accent : undefined,
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
              )}
              {!isEditMode && oneTime && (
                <Text
                  style={{
                    fontSize: theme.fontSize('sm'),
                    color: theme.colors.textAlt,
                  }}
                >
                  {i18n.t('oneTimeSchedule_description')}
                </Text>
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
                setDate={setDate}
                setHours={setHours}
                endDate={endDate}
                setEndDate={setEndDate}
                interval={interval}
                setInterval={setInterval}
                frequency={frequency}
                setFrequency={setFrequency}
                note={note}
                setNote={setNote}
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
                  {isEditMode ? i18n.t('update') : i18n.t('add')}{' '}
                  {isEditMode
                    ? i18n.t('plan')
                    : `${i18n.t(oneTime ? 'oneTime' : 'recurring')} ${i18n.t('plan')}`}
                </Text>
              </ActionButton>
            </View>
          </Section>
        </KeyboardAwareScrollView>
      </View>
    </Wrapper>
  )
}

export default PlanDayScreen
