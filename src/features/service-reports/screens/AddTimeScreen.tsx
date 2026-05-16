import { View, Alert, Switch, TextInput as RNTextInput } from 'react-native'
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
import { ServiceReport } from '@/types/serviceReport'
import { useNavigation } from '@react-navigation/native'
import i18n, { TranslationKey } from '@/lib/locales'
import DateTimePicker from '@/components/ui/DateTimePicker'
import Wrapper from '@/components/ui/layout/Wrapper'
import Select from '@/components/ui/Select'
import SelectWheel from '@/components/ui/SelectWheel'
import { usePreferences } from '@/stores/preferences'
import useCategories from '@/stores/categories'
import { Category } from '@/types/category'
import { LDC_BUILTIN_CATEGORY_ID } from '@/constants/categories'
import TextInput from '@/components/ui/TextInput'
import Button from '@/components/ui/Button'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useToastController } from '@tamagui/toast'
import Header from '@/components/ui/layout/Header'
import { faTrash } from '@fortawesome/free-solid-svg-icons'
import IconButton from '@/components/ui/IconButton'
import usePublisher from '@/hooks/usePublisher'
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

type AddTimeScreenProps = NativeStackScreenProps<RootStackParamList, 'Add Time'>

const AddTimeScreen = ({ route }: AddTimeScreenProps) => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<RootStackNavigation>()
  const noteInput = useRef<RNTextInput>(null)
  const { role, publisherHours, overrideCreditLimit, customCreditLimitHours } =
    usePreferences()
  const { hasAnnualGoal } = usePublisher()
  const { playConfetti } = useAnimation()
  const { categories, addCategory, updateCategory, deleteCategory } =
    useCategories()
  /**
   * Synthetic select values for the two preset entry types that don't
   * correspond to a real Category record. Real categories use their UUID as the
   * value. LDC is no longer synthetic — it's the LDC builtin Category (see
   * `LDC_BUILTIN_CATEGORY_ID`); the constant is re-exported here so the picker
   * can show it alongside the synthetic Standard / Custom presets.
   */
  const STANDARD = '__standard__'
  const LDC = LDC_BUILTIN_CATEGORY_ID
  const CUSTOM = '__custom__'

  const {
    addServiceReport,
    serviceReports,
    updateServiceReport,
    deleteServiceReport,
    set: setServiceReportStore,
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
    return STANDARD
  })()

  const [selectedValue, setSelectedValue] = useState<string>(initialPickerValue)
  const [customCategoryName, setCustomCategoryName] = useState<string>('')
  const [serviceReport, setServiceReport] = useState<ServiceReport>({
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

  // The Category currently in focus. Null when one of the synthetic preset
  // values (Standard / Custom) is selected; non-null for a real Category id
  // including the LDC builtin.
  const selectedCategory: Category | null =
    selectedValue === STANDARD || selectedValue === CUSTOM
      ? null
      : (categories.find((c) => c.id === selectedValue) ?? null)

  const handleSetSelectedValue = (value: string) => {
    setSelectedValue(value)
    switch (value) {
      case STANDARD:
        setServiceReport({
          ...serviceReport,
          categoryId: undefined,
          tag: undefined,
          credit: false,
        })
        return

      case CUSTOM:
        setServiceReport({
          ...serviceReport,
          categoryId: undefined,
          tag: undefined,
          credit: false,
        })
        return

      default: {
        // A real Category id (user-created OR the LDC builtin).
        const category = categories.find((c) => c.id === value)
        if (!category) return
        setServiceReport({
          ...serviceReport,
          categoryId: category.id,
          tag: undefined,
          credit: category.isCredit,
        })
      }
    }
  }

  const setHours = (hours: number) => {
    setServiceReport({
      ...serviceReport,
      hours,
    })
  }

  /**
   * Flips `isCredit` on the currently-selected Category record and re-stamps
   * `credit` on every ServiceReport that references it. The Category record
   * itself is now the source of truth; we re-stamp `credit` on entries only so
   * legacy credit-math readers stay consistent with the Category value during
   * the transition window.
   */
  const setCategoryIsCredit = (isCredit: boolean) => {
    if (!selectedCategory) return
    setServiceReport({
      ...serviceReport,
      credit: isCredit,
    })
    updateCategory({ id: selectedCategory.id, isCredit })

    const reports = { ...serviceReports }
    for (const year in reports) {
      for (const month in reports[year]) {
        const monthReports = getMonthsReports(
          reports,
          parseInt(month),
          parseInt(year)
        )
        const reportsWithUpdatedCredit = monthReports.map((r) => {
          if (r.categoryId === selectedCategory.id) {
            return { ...r, credit: isCredit }
          }
          return r
        })
        reports[year][month] = reportsWithUpdatedCredit
      }
    }
    setServiceReportStore({ serviceReports: reports })
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

  const handleAddCustomCategory = () => {
    const trimmed = customCategoryName.trim()
    if (!trimmed) return
    // Reuse an existing Category if the name matches (case-sensitive, mirrors
    // the rest of the app); otherwise create a new record.
    let target = categories.find((c) => c.name === trimmed)
    if (!target) {
      const newCategory: Category = {
        id: Crypto.randomUUID(),
        name: trimmed,
        isCredit: false,
      }
      addCategory(newCategory)
      target = newCategory
    }
    handleSetSelectedValue(target.id)
    setCustomCategoryName('')
  }

  const handleDeleteCurrentCategory = () => {
    if (!selectedCategory) return
    deleteCategory(selectedCategory.id)
    setSelectedValue(STANDARD)
    setServiceReport({
      ...serviceReport,
      categoryId: undefined,
      credit: false,
    })
  }

  type TypeOption = { label: string; value: string }
  // LDC is technically a Category record now (the builtin), but we still
  // surface it as a preset slot above the user's own categories — it's the
  // most common credit-bearing entry type and worth a stable position in the
  // picker. Strip it from the user-categories spread so it doesn't appear
  // twice.
  const userCategories = categories.filter(
    (c) => c.id !== LDC_BUILTIN_CATEGORY_ID
  )
  const typeOptions: TypeOption[] = [
    { label: i18n.t('standard'), value: STANDARD },
    { label: i18n.t('ldc'), value: LDC },
    ...userCategories.map((c) => ({
      // Allow i18n on preset-translatable names (e.g. legacy English-locale
      // entries seeded from the migration); fall back to the stored name.
      label: i18n.t(c.name as TranslationKey, { defaultValue: c.name }),
      value: c.id,
    })),
    { label: i18n.t('custom'), value: CUSTOM },
  ]

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
    const goalHours = publisherHours[role]
    if (goalHours > 0) {
      const reportMoment = moment(serviceReport.date)
      const reportMonth = reportMoment.month()
      const reportYear = reportMoment.year()
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
      const goalMinutes = goalHours * 60
      const crossedGoal =
        beforeMinutes < goalMinutes && afterMinutes >= goalMinutes
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
                  icon={faTrash}
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
  const hasSelectedCategory = selectedValue !== CUSTOM
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
            <InputRowContainer
              label={i18n.t('type')}
              lastInSection
              justifyContent='space-between'
            >
              <View
                style={{
                  gap: 5,
                  width: '100%',
                  flexShrink: 1,
                }}
              >
                <Select
                  data={typeOptions}
                  style={{ width: '100%', flex: 1 }}
                  onChange={({ value: c }) => {
                    handleSetSelectedValue(c)
                  }}
                  value={selectedValue}
                />
                {selectedValue === CUSTOM ? (
                  <View style={{ flexDirection: 'row', gap: 5 }}>
                    <View style={{ flex: 1, flexGrow: 1 }}>
                      <TextInput
                        maxLength={20}
                        style={{
                          borderColor: theme.colors.border,
                          borderWidth: 1,
                          borderRadius: theme.numbers.borderRadiusSm,
                          paddingVertical: 15,
                          paddingHorizontal: 10,
                          color: theme.colors.text,
                        }}
                        onChangeText={(c) => setCustomCategoryName(c)}
                        value={customCategoryName}
                        placeholder={i18n.t('enterCustomCategory')}
                      />
                    </View>
                    <Button
                      style={{
                        backgroundColor:
                          customCategoryName.trim().length === 0
                            ? theme.colors.accentAlt
                            : theme.colors.accent,
                        borderRadius: theme.numbers.borderRadiusSm,
                        paddingVertical: 15,
                      }}
                      variant='outline'
                      onPress={handleAddCustomCategory}
                      disabled={customCategoryName.trim().length === 0}
                    >
                      <Text
                        style={{
                          color: theme.colors.textInverse,
                          fontFamily: theme.fonts.semiBold,
                        }}
                      >
                        {i18n.t('add')}
                      </Text>
                    </Button>
                  </View>
                ) : (
                  selectedCategory && (
                    <View
                      style={{
                        gap: 5,
                        flexShrink: 1,
                      }}
                    >
                      {/* Builtin Categories (LDC) own their `isCredit` value
                          and can't be renamed or deleted — hide the Credit
                          toggle + remove button. The LDC builtin is always
                          credit-bearing by definition. */}
                      {hasAnnualGoal && !selectedCategory.builtin && (
                        <View
                          style={{
                            borderWidth: 1,
                            borderRadius: theme.numbers.borderRadiusSm,
                            padding: 10,
                            borderColor: theme.colors.border,
                            gap: 10,
                          }}
                        >
                          <View
                            style={{
                              flexDirection: 'row',
                              flexShrink: 1,
                              alignItems: 'center',
                              justifyContent: 'space-between',
                            }}
                          >
                            <Text
                              style={{
                                fontFamily: theme.fonts.semiBold,
                                fontSize: theme.fontSize('lg'),
                              }}
                            >
                              {i18n.t('credit')}
                            </Text>
                            <Switch
                              value={selectedCategory.isCredit}
                              onValueChange={(val) => setCategoryIsCredit(val)}
                            />
                          </View>
                          <Text
                            style={{
                              fontSize: theme.fontSize('sm'),
                              color: theme.colors.textAlt,
                            }}
                          >
                            {i18n.t('credit_description')}
                          </Text>
                        </View>
                      )}
                      {!selectedCategory.builtin && (
                        <View
                          style={{
                            flexDirection: 'row',
                            justifyContent: 'flex-end',
                          }}
                        >
                          <Button onPress={handleDeleteCurrentCategory}>
                            <Text
                              style={{
                                color: theme.colors.textAlt,
                                textDecorationLine: 'underline',
                              }}
                            >
                              {i18n.t('removeCategory')}
                            </Text>
                          </Button>
                        </View>
                      )}
                    </View>
                  )
                )}
              </View>
            </InputRowContainer>
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
                    textAlignVertical: 'top',
                    minHeight: 80,
                  }}
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
