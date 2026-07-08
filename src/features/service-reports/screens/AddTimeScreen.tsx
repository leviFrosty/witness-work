import { Trash2 as Trash2Icon } from 'lucide-react-native'
import { View, Alert, TextInput as RNTextInput } from 'react-native'
import { useCallback, useEffect, useRef, useState } from 'react'
import Section from '@/components/ui/inputs/Section'
import InputRowContainer from '@/components/ui/inputs/InputRowContainer'
import useTheme from '@/contexts/theme'
import Text from '@/components/ui/MyText'
import ActionButton from '@/components/ui/ActionButton'
import useServiceReport from '@/stores/serviceReport'
import * as Crypto from 'expo-crypto'
import { DateTimePickerEvent } from '@react-native-community/datetimepicker'
import moment from 'moment'
import { TimeEntry } from '@/types/timeEntry'
import { useNavigation } from '@react-navigation/native'
import i18n from '@/lib/locales'
import DateTimePicker from '@/components/ui/DateTimePicker'
import Wrapper from '@/components/ui/layout/Wrapper'
import SelectWheel from '@/components/ui/SelectWheel'
import { usePreferences } from '@/stores/preferences'
import useCategories from '@/stores/categories'
import TypeSelectorRow, {
  CUSTOM_TYPE_VALUE,
  STANDARD_TYPE_VALUE,
  type TypeSelection,
} from '@/components/TypeSelectorRow'
import TextInput from '@/components/ui/TextInput'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useToastController } from '@tamagui/toast'
import Header from '@/components/ui/layout/Header'
import IconButton from '@/components/ui/IconButton'
import {
  adjustedMinutesForSpecificMonth,
  getMonthsReports,
  getReport,
} from '@/lib/serviceReport'
import useAnimation from '@/hooks/useAnimation'
import { RootStackNavigation, RootStackParamList } from '@/types/rootStack'
import Haptics from '@/lib/haptics'
import { CONFETTI_DELAY_MS } from '@/providers/AnimationViewProvider'
import useCelebrationQueue from '@/features/service-reports/stores/celebrationQueue'
import { didCrossMonthlyGoal } from '@/features/service-reports/lib/monthlyGoalCelebration'
import { resolveMonthlyGoalHours } from '@/lib/monthlyGoals'

type AddTimeScreenProps = NativeStackScreenProps<RootStackParamList, 'Add Time'>

const AddTimeScreen = ({ route }: AddTimeScreenProps) => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<RootStackNavigation>()
  const noteInput = useRef<RNTextInput>(null)
  const {
    role,
    publisherHours,
    monthlyGoalOverrides,
    overrideCreditLimit,
    customCreditLimitHours,
  } = usePreferences()
  const { playConfetti } = useAnimation()
  const { categories } = useCategories()

  const {
    addServiceReport,
    serviceReports,
    updateServiceReport,
    deleteServiceReport,
  } = useServiceReport()
  const existingServiceReport = route.params?.existingReport
    ? getReport(serviceReports, JSON.parse(route.params.existingReport))
    : undefined

  // Initial picker value: the referenced Category id (post-migration), else
  // fall back to legacy `tag` string for unmigrated entries, else Standard.
  // LDC is no longer special-cased — entries that point at the LDC builtin
  // Category id pick it up here like any other Category.
  const initialPickerValue: string = (() => {
    if (existingServiceReport?.report.categoryId) {
      return existingServiceReport.report.categoryId
    }
    if (existingServiceReport?.report.tag) {
      // Try to resolve by name — entries that pre-date the migration but the
      // user added a Category with the same name will collapse onto it.
      const match = categories.find(
        (c) => c.name === existingServiceReport.report.tag
      )
      if (match) return match.id
      return existingServiceReport.report.tag
    }
    return STANDARD_TYPE_VALUE
  })()

  const [selectedValue, setSelectedValue] = useState<string>(initialPickerValue)
  const [serviceReport, setServiceReport] = useState<TimeEntry>({
    id: existingServiceReport?.report.id ?? Crypto.randomUUID(),
    hours: existingServiceReport?.report.hours || route.params?.hours || 0,
    minutes:
      existingServiceReport?.report.minutes ?? (route.params?.minutes || 0),
    date: moment(
      existingServiceReport?.report.date ?? route.params?.date
    ).toDate(),
    credit: existingServiceReport?.report.credit ?? false,
    categoryId: existingServiceReport?.report.categoryId,
    note: existingServiceReport?.report.note ?? '',
  })
  const toast = useToastController()

  // Maps the Type row's report back onto the in-progress entry. The row owns
  // the Category-store side (create/delete/credit-flip + global re-stamp);
  // the entry only records the reference and the legacy `credit` stamp.
  const handleTypeChange = ({ value, category }: TypeSelection) => {
    setSelectedValue(value)
    setServiceReport({
      ...serviceReport,
      categoryId: category?.id,
      tag: undefined,
      credit: category?.isCredit ?? false,
    })
  }

  const setHours = (hours: number) => {
    setServiceReport({
      ...serviceReport,
      hours,
    })
  }

  const setMinutes = (minutes: number) => {
    setServiceReport({
      ...serviceReport,
      minutes,
    })
  }

  const setNote = (note: string) => {
    setServiceReport({
      ...serviceReport,
      note,
    })
  }

  const handleDateChange = (_: DateTimePickerEvent, date: Date | undefined) => {
    if (!date) {
      return
    }
    setServiceReport({
      ...serviceReport,
      date,
    })
  }

  const hourOptions = [...Array(100).keys()].map((value) => ({
    label: `${value}`,
    value,
  }))

  const minuteOptions = [...Array(60).keys()].map((value) => ({
    label: `${value}`,
    value,
  }))

  const submit = () => {
    playConfetti()
    Haptics.heavy()
    setTimeout(() => {
      Haptics.success()
    }, CONFETTI_DELAY_MS + 100)

    // Multi-burst Skia fireworks on the Progress month tab are reserved for
    // *crossing* the monthly goal — the moment the report's target month
    // goes from below goal to at-or-above goal. Adding more time after the
    // goal is already met (or adding time that doesn't reach goal) doesn't
    // queue anything, so the fireworks don't fire on every submission. The
    // queue is keyed by `(month, year)` so it only pops when the user is
    // actually viewing the month they crossed.
    const reportMoment = moment(serviceReport.date)
    const reportMonth = reportMoment.month()
    const reportYear = reportMoment.year()
    const goalTarget = { month: reportMonth, year: reportYear }
    const effectiveGoalHours = resolveMonthlyGoalHours(
      publisherHours[role],
      monthlyGoalOverrides,
      goalTarget
    )
    if (effectiveGoalHours > 0) {
      const creditOverride = {
        enabled: overrideCreditLimit,
        customLimitHours: customCreditLimitHours,
      }
      const beforeReports = getMonthsReports(
        serviceReports,
        reportMonth,
        reportYear
      )
      const beforeMinutes = adjustedMinutesForSpecificMonth(
        beforeReports,
        reportMonth,
        reportYear,
        role,
        creditOverride
      ).value
      const afterMinutes = adjustedMinutesForSpecificMonth(
        [...beforeReports, serviceReport],
        reportMonth,
        reportYear,
        role,
        creditOverride
      ).value
      const crossedGoal = didCrossMonthlyGoal({
        beforeMinutes,
        afterMinutes,
        baseGoalHours: publisherHours[role],
        monthlyGoalOverrides,
        target: goalTarget,
      })
      if (crossedGoal) {
        useCelebrationQueue.getState().queue(reportMonth, reportYear)
      }
    }

    addServiceReport(serviceReport)
    toast.show(i18n.t('success'), {
      message: i18n.t('timeAdded'),
      native: true,
    })
    navigation.goBack()
  }

  const save = () => {
    updateServiceReport(serviceReport)
    toast.show(i18n.t('success'), {
      message: i18n.t('updated'),
      native: true,
    })

    navigation.goBack()
  }

  const handleRequestDelete = useCallback(() => {
    Alert.alert(i18n.t('deleteTime_title'), i18n.t('deleteTime_description'), [
      {
        text: i18n.t('cancel'),
        style: 'cancel',
      },
      {
        text: i18n.t('delete'),
        style: 'destructive',
        onPress: () => {
          deleteServiceReport(serviceReport)
          toast.show(i18n.t('success'), {
            message: i18n.t('deleted'),
            native: true,
          })
          navigation.goBack()
        },
      },
    ])
  }, [deleteServiceReport, navigation, serviceReport, toast])

  useEffect(() => {
    navigation.setOptions({
      header: () => (
        <Header
          buttonType='back'
          title={i18n.t(existingServiceReport ? 'updateTime' : 'addTime')}
          rightElement={
            existingServiceReport ? (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 20,
                  position: 'absolute',
                  right: 10,
                }}
              >
                <IconButton
                  icon={Trash2Icon}
                  color={theme.colors.text}
                  onPress={handleRequestDelete}
                />
              </View>
            ) : undefined
          }
        />
      ),
    })
  }, [
    existingServiceReport,
    handleRequestDelete,
    navigation,
    theme.colors.text,
    theme.colors.textInverse,
  ])

  const hasEnteredTime =
    serviceReport.hours !== 0 || serviceReport.minutes !== 0
  // Custom is a transient picker state — until the user names the Category,
  // we don't have anything to attach the entry to.
  const hasSelectedCategory = selectedValue !== CUSTOM_TYPE_VALUE
  const submittable = hasEnteredTime && hasSelectedCategory

  return (
    <Wrapper
      style={{
        flex: 1,
        flexGrow: 1,
        justifyContent: 'space-between',
      }}
    >
      <KeyboardAwareScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'space-between',
          paddingBottom: insets.bottom + 30,
        }}
      >
        <View style={{ gap: 30 }}>
          <View style={{ padding: 25, gap: 5 }}>
            <Text style={{ fontSize: 32, fontFamily: theme.fonts.bold }}>
              {i18n.t(existingServiceReport ? 'updateTime' : 'addTime')}
            </Text>
            <Text style={{ color: theme.colors.textAlt, fontSize: 12 }}>
              {i18n.t(
                existingServiceReport
                  ? 'updateTime_description'
                  : 'addTime_description'
              )}
            </Text>
          </View>
          <Section>
            <InputRowContainer
              label={i18n.t('date')}
              justifyContent='space-between'
            >
              <DateTimePicker
                value={serviceReport.date}
                onChange={handleDateChange}
              />
            </InputRowContainer>
            <TypeSelectorRow
              value={selectedValue}
              onChange={handleTypeChange}
              lastInSection
            />
          </Section>
          <Section>
            {!route.params?.hours &&
            route.params?.minutes !== undefined &&
            route.params.minutes < 1 &&
            serviceReport.hours === 0 &&
            serviceReport.minutes < 1 ? (
              <Text style={{ color: theme.colors.warn }}>
                {i18n.t('providedTimeIsLessThanOneMinute')}
              </Text>
            ) : null}
            <View
              style={{ flexDirection: 'row', justifyContent: 'space-between' }}
            >
              <View style={{ width: '50%' }}>
                <InputRowContainer label={i18n.t('hours')} lastInSection>
                  <View style={{ flex: 1 }}>
                    <SelectWheel
                      data={hourOptions}
                      placeholder={serviceReport.hours.toString()}
                      onChange={({ value }) => setHours(value)}
                      value={serviceReport.hours.toString()}
                    />
                  </View>
                </InputRowContainer>
              </View>
              <View style={{ width: '50%' }}>
                <InputRowContainer label={i18n.t('minutes')} lastInSection>
                  <View style={{ flex: 1 }}>
                    <SelectWheel
                      data={minuteOptions}
                      placeholder={serviceReport.minutes.toString()}
                      onChange={({ value }) => setMinutes(value)}
                      value={serviceReport.minutes.toString()}
                    />
                  </View>
                </InputRowContainer>
              </View>
            </View>
          </Section>
          <Section>
            <InputRowContainer
              label={i18n.t('note')}
              lastInSection
              justifyContent='flex-start'
              onLabelPress={() => noteInput.current?.focus()}
            >
              <View style={{ flex: 1, paddingTop: 10 }}>
                <TextInput
                  ref={noteInput}
                  multiline
                  numberOfLines={3}
                  maxLength={500}
                  style={{
                    borderColor: theme.colors.border,
                    borderWidth: 1,
                    borderRadius: theme.numbers.borderRadiusSm,
                    paddingVertical: 12,
                    paddingHorizontal: 10,
                    color: theme.colors.text,
                    minHeight: 80,
                  }}
                  textAlignVertical='top'
                  textAlign='left'
                  onChangeText={setNote}
                  value={serviceReport.note}
                  placeholder={i18n.t('optionalNote')}
                  placeholderTextColor={theme.colors.textAlt}
                />
              </View>
            </InputRowContainer>
          </Section>
        </View>
        <View style={{ paddingHorizontal: 20, gap: 8, paddingTop: 20 }}>
          {!submittable && !hasEnteredTime && (
            <Text style={{ fontSize: 12, color: theme.colors.textAlt }}>
              {i18n.t('timeNeeded')}
            </Text>
          )}
          {!submittable && !hasSelectedCategory && (
            <Text style={{ fontSize: 12, color: theme.colors.textAlt }}>
              {i18n.t('categoryNeeded')}
            </Text>
          )}
          <ActionButton
            disabled={!submittable}
            onPress={existingServiceReport ? save : submit}
          >
            {i18n.t(existingServiceReport ? 'save' : 'submit')}
          </ActionButton>
        </View>
      </KeyboardAwareScrollView>
    </Wrapper>
  )
}

export default AddTimeScreen
