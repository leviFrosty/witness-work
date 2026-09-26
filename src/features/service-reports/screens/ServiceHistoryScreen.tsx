import { useEffect, useState } from 'react'
import { Keyboard, View } from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import {
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
} from 'lucide-react-native'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import * as Crypto from 'expo-crypto'
import moment from 'moment'

import Wrapper from '@/components/ui/layout/Wrapper'
import XView from '@/components/ui/layout/XView'
import Text from '@/components/ui/MyText'
import ActionButton from '@/components/ui/ActionButton'
import Button from '@/components/ui/Button'
import IconButton from '@/components/ui/IconButton'
import Section from '@/components/ui/inputs/Section'
import InputRowContainer from '@/components/ui/inputs/InputRowContainer'
import InputRowSelect from '@/components/ui/inputs/InputRowSelect'
import InputRowSwitch from '@/components/ui/inputs/InputRowSwitch'
import TextInputRow from '@/components/ui/inputs/TextInputRow'
import { inputLayout } from '@/components/ui/inputs/InputLayout'
import type { SelectData } from '@/components/ui/Select'
import { LDC_BUILTIN_CATEGORY_ID } from '@/constants/categories'
import useTheme from '@/contexts/theme'
import { analytics } from '@/lib/analytics'
import i18n from '@/lib/locales'
import { formatMinutes } from '@/lib/minutes'
import { monthlyGoalKey, type CalendarMonth } from '@/lib/monthlyGoals'
import {
  monthStatusLabel,
  monthStatusOf,
  monthStatuses,
  roleOfMonthStatus,
  type MonthStatus,
} from '@/lib/monthStatus'
import { getEntryMode } from '@/lib/publisherCapabilities'
import {
  calendarMonthOf,
  roleForMonth,
  serviceYearMonths,
  serviceYearOfMonth,
} from '@/lib/roleHistory'
import { getMonthsReports } from '@/lib/serviceReport'
import { usePreferences } from '@/stores/preferences'
import useServiceReport from '@/stores/serviceReport'
import type { RootStackParamList } from '@/types/rootStack'

type Props = NativeStackScreenProps<RootStackParamList, 'ServiceHistory'>

/** How many Service Years back the editor reaches. */
const MAX_YEARS_BACK = 10

type Row = {
  target: CalendarMonth
  savedStatus: MonthStatus
  status: MonthStatus
  /** Raw logged minutes; `null` when the month has no Time Entries. */
  loggedMinutes: number | null
  hours: string
  creditHours: string
  shared: boolean
}

/** The latest Service Year that has at least one finished month. */
const latestServiceYear = (): number => {
  const previousMonth = moment().subtract(1, 'month')
  return serviceYearOfMonth({
    year: previousMonth.year(),
    month: previousMonth.month(),
  })
}

const parseHours = (value: string): number => {
  const hours = Number.parseFloat(value.replace(',', '.'))
  return Number.isFinite(hours) && hours > 0 ? hours : 0
}

/**
 * **Service History** editor: one row per finished month of a Service Year,
 * where the User sets that month's status (Role History) and fills in time for
 * months with nothing logged yet. Months already logged show their total —
 * their Time Entries are edited from the month itself.
 */
const ServiceHistoryScreen = ({ navigation, route }: Props) => {
  const theme = useTheme()
  const newestServiceYear = latestServiceYear()
  const requestedServiceYear = Math.min(
    route.params?.serviceYear ?? newestServiceYear,
    newestServiceYear
  )
  // "Add earlier year" may open a year further back than the default reach.
  const oldestServiceYear = Math.min(
    newestServiceYear - MAX_YEARS_BACK,
    requestedServiceYear
  )
  const [serviceYear, setServiceYear] = useState(requestedServiceYear)
  const source = route.params?.source ?? 'settings'

  const {
    role,
    roleHistory,
    monthlyGoalOverrides,
    publisherHours,
    timeDisplayFormat,
    setMonthStatus,
  } = usePreferences()
  const { serviceReports, addServiceReport } = useServiceReport()

  const buildRows = (sy: number): Row[] => {
    const currentKey = monthlyGoalKey(calendarMonthOf())
    return serviceYearMonths(sy)
      .filter((target) => monthlyGoalKey(target) < currentKey)
      .map((target) => {
        const savedStatus = monthStatusOf(
          roleForMonth(roleHistory, role, target),
          monthlyGoalOverrides[monthlyGoalKey(target)]
        )
        const reports = getMonthsReports(
          serviceReports,
          target.month,
          target.year
        )
        return {
          target,
          savedStatus,
          status: savedStatus,
          loggedMinutes: reports.length
            ? reports.reduce((sum, r) => sum + r.hours * 60 + r.minutes, 0)
            : null,
          hours: '',
          creditHours: '',
          shared: false,
        }
      })
  }

  const [rows, setRows] = useState<Row[]>(() => buildRows(serviceYear))

  // Once per opened Service Year.
  useEffect(() => {
    analytics.capture('service_history_viewed', {
      source,
      service_years_back: newestServiceYear - serviceYear,
    })
  }, [source, newestServiceYear, serviceYear])

  const hasChanges = rows.some(
    (r) =>
      r.status !== r.savedStatus ||
      (r.loggedMinutes === null &&
        (parseHours(r.hours) > 0 || parseHours(r.creditHours) > 0 || r.shared))
  )

  const changeServiceYear = (next: number) => {
    Keyboard.dismiss()
    setServiceYear(next)
    setRows(buildRows(next))
  }

  const updateRow = (index: number, patch: Partial<Row>) =>
    setRows((prev) =>
      prev.map((r, i) => (i === index ? { ...r, ...patch } : r))
    )

  const applyToLaterMonths = (index: number) =>
    setRows((prev) =>
      prev.map((r, i) => (i > index ? { ...r, status: prev[index].status } : r))
    )

  const handleSave = () => {
    Keyboard.dismiss()
    let monthsStatusChanged = 0
    let monthsTimeAdded = 0

    for (const row of rows) {
      if (row.status !== row.savedStatus) {
        setMonthStatus(row.target, row.status, 'month')
        monthsStatusChanged++
      }
      if (row.loggedMinutes !== null) continue

      // The 1st at noon, like the Onboarding Backfill, so no time zone can
      // move the entry into the previous month.
      const date = new Date(row.target.year, row.target.month, 1, 12)
      const isCheckbox =
        getEntryMode(roleOfMonthStatus(row.status)) === 'checkbox'
      if (isCheckbox) {
        if (!row.shared) continue
        // A 0h Time Entry is the checkbox "shared" marker.
        addServiceReport({
          id: Crypto.randomUUID(),
          date,
          hours: 0,
          minutes: 0,
        })
        monthsTimeAdded++
        continue
      }

      const hours = parseHours(row.hours)
      const creditHours = parseHours(row.creditHours)
      if (hours > 0) {
        addServiceReport({
          id: Crypto.randomUUID(),
          date,
          hours: Math.floor(hours),
          minutes: Math.round((hours % 1) * 60),
          credit: false,
        })
      }
      if (creditHours > 0) {
        // Same credit routing as the Onboarding Backfill: the LDC builtin
        // Category counts toward the credit bucket.
        addServiceReport({
          id: Crypto.randomUUID(),
          date,
          hours: Math.floor(creditHours),
          minutes: Math.round((creditHours % 1) * 60),
          categoryId: LDC_BUILTIN_CATEGORY_ID,
          credit: true,
        })
      }
      if (hours > 0 || creditHours > 0) monthsTimeAdded++
    }

    analytics.capture('service_history_saved', {
      source,
      service_years_back: newestServiceYear - serviceYear,
      months_status_changed: monthsStatusChanged,
      months_time_added: monthsTimeAdded,
    })
    navigation.goBack()
  }

  const statusItems: SelectData<MonthStatus> = monthStatuses.map((s) => ({
    label: monthStatusLabel(s, publisherHours),
    value: s,
  }))

  return (
    <Wrapper insets='bottom' style={{ flex: 1 }}>
      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        keyboardShouldPersistTaps='handled'
        showsVerticalScrollIndicator={false}
        extraScrollHeight={20}
        contentContainerStyle={{
          paddingHorizontal: inputLayout.horizontalPadding,
          width: '100%',
          maxWidth: inputLayout.contentMaxWidth,
          alignSelf: 'center',
          paddingTop: 16,
          paddingBottom: 32,
          gap: 16,
        }}
      >
        <XView style={{ justifyContent: 'space-between', gap: 12 }}>
          <IconButton
            icon={ChevronLeftIcon}
            accessibilityLabel={i18n.t('serviceHistory.previousYear')}
            color={
              serviceYear > oldestServiceYear ? undefined : theme.colors.border
            }
            onPress={
              serviceYear > oldestServiceYear
                ? () => changeServiceYear(serviceYear - 1)
                : undefined
            }
          />
          <Text
            accessibilityRole='header'
            style={{
              fontFamily: theme.fonts.semiBold,
              fontSize: theme.fontSize('xl'),
            }}
          >
            {`${serviceYear}–${serviceYear + 1}`}
          </Text>
          <IconButton
            icon={ChevronRightIcon}
            accessibilityLabel={i18n.t('serviceHistory.nextYear')}
            color={
              serviceYear < newestServiceYear ? undefined : theme.colors.border
            }
            onPress={
              serviceYear < newestServiceYear
                ? () => changeServiceYear(serviceYear + 1)
                : undefined
            }
          />
        </XView>

        <Text
          style={{
            color: theme.colors.textAlt,
            fontSize: theme.fontSize('sm'),
            paddingHorizontal: inputLayout.horizontalPadding,
          }}
        >
          {i18n.t('serviceHistory.description')}
        </Text>

        {rows.map((row, index) => {
          const monthLabel = moment(row.target).format('MMMM YYYY')
          const isCheckbox =
            getEntryMode(roleOfMonthStatus(row.status)) === 'checkbox'
          const canApplyLater =
            index < rows.length - 1 &&
            row.status !== row.savedStatus &&
            rows.slice(index + 1).some((r) => r.status !== row.status)

          return (
            <View key={monthlyGoalKey(row.target)} style={{ gap: 6 }}>
              <Text
                style={{
                  fontFamily: theme.fonts.semiBold,
                  color: theme.colors.textAlt,
                  fontSize: theme.fontSize('xs'),
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  paddingHorizontal: inputLayout.horizontalPadding,
                }}
              >
                {monthLabel}
              </Text>
              <Section>
                <InputRowSelect
                  label={i18n.t('status')}
                  selectProps={{
                    data: statusItems,
                    value: row.status,
                    onChange: ({ value }) =>
                      updateRow(index, { status: value }),
                  }}
                />
                {row.loggedMinutes !== null ? (
                  <InputRowContainer
                    label={
                      isCheckbox
                        ? i18n.t('sharedInMinistry')
                        : i18n.t('serviceHistory.logged')
                    }
                    info={i18n.t('serviceHistory.loggedDescription')}
                    controlWidth='auto'
                    lastInSection
                  >
                    <Text
                      style={{
                        color: theme.colors.textAlt,
                        fontSize: theme.fontSize('lg'),
                      }}
                    >
                      {isCheckbox
                        ? i18n.t('yes')
                        : formatMinutes(row.loggedMinutes, timeDisplayFormat)
                            .formatted}
                    </Text>
                  </InputRowContainer>
                ) : isCheckbox ? (
                  <InputRowSwitch
                    label={i18n.t('sharedInMinistry')}
                    value={row.shared}
                    onValueChange={(shared) => updateRow(index, { shared })}
                    lastInSection
                  />
                ) : (
                  <>
                    <TextInputRow
                      label={i18n.t('onboardingBackfillHoursLabel')}
                      controlStyle={{ width: 96 }}
                      textInputProps={{
                        accessibilityLabel: `${monthLabel} ${i18n.t('onboardingBackfillHoursLabel')}`,
                        inputMode: 'decimal',
                        maxLength: 6,
                        placeholder: '0',
                        value: row.hours,
                        onChangeText: (hours) => updateRow(index, { hours }),
                        textAlign: 'right',
                      }}
                    />
                    <TextInputRow
                      label={i18n.t('onboardingBackfillCreditLabel')}
                      controlStyle={{ width: 96 }}
                      lastInSection
                      textInputProps={{
                        accessibilityLabel: `${monthLabel} ${i18n.t('onboardingBackfillCreditLabel')}`,
                        inputMode: 'decimal',
                        maxLength: 6,
                        placeholder: '0',
                        value: row.creditHours,
                        onChangeText: (creditHours) =>
                          updateRow(index, { creditHours }),
                        textAlign: 'right',
                      }}
                    />
                  </>
                )}
              </Section>
              {canApplyLater ? (
                <Button
                  noTransform
                  accessibilityRole='button'
                  onPress={() => applyToLaterMonths(index)}
                  style={{
                    alignSelf: 'flex-start',
                    paddingHorizontal: inputLayout.horizontalPadding,
                    paddingVertical: 4,
                  }}
                >
                  <Text
                    style={{
                      color: theme.colors.accent,
                      fontFamily: theme.fonts.semiBold,
                      fontSize: theme.fontSize('sm'),
                    }}
                  >
                    {i18n.t('serviceHistory.applyToLaterMonths', {
                      status: monthStatusLabel(row.status, publisherHours),
                    })}
                  </Text>
                </Button>
              ) : null}
            </View>
          )
        })}
      </KeyboardAwareScrollView>

      <View
        style={{
          paddingHorizontal: inputLayout.horizontalPadding,
          paddingTop: 12,
          width: '100%',
          maxWidth: inputLayout.contentMaxWidth,
          alignSelf: 'center',
        }}
      >
        <ActionButton
          noTransform
          accessibilityRole='button'
          disabled={!hasChanges}
          onPress={handleSave}
        >
          {i18n.t('save')}
        </ActionButton>
      </View>
    </Wrapper>
  )
}

export default ServiceHistoryScreen
