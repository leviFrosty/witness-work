import { useMemo, useRef, useState } from 'react'
import {
  Keyboard,
  Pressable,
  TextInput as RNTextInput,
  View,
} from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import * as Crypto from 'expo-crypto'
import moment from 'moment'

import Text from './MyText'
import TextInput from './TextInput'
import ActionButton from './ActionButton'
import Button from './Button'
import useTheme from '../contexts/theme'
import i18n from '../lib/locales'
import { usePreferences } from '../stores/preferences'
import useServiceReport from '../stores/serviceReport'
import {
  getServiceYearFromDate,
  getServiceYearReports,
  getTotalMinutesForServiceYear,
} from '../lib/serviceReport'
import { ServiceReportsByYears } from '../types/serviceReport'

interface MonthRow {
  monthIndex: number
  year: number
  hours: string
  creditHours: string
}

interface Props {
  onComplete: () => void
  onSkip: () => void
  setSkippedStatusOnSkip?: boolean
}

/**
 * Builds one row per month from September of the current service year through
 * the calendar month immediately before `installedOn`. Returns [] if the user
 * installed in September itself (no missed months).
 */
export const buildCatchUpRows = (installedOn: Date): MonthRow[] => {
  const installMoment = moment(installedOn)
  const sy = getServiceYearFromDate(installMoment)
  const installStart = installMoment.clone().startOf('month')

  const rows: MonthRow[] = []
  const cursor = moment().month(8).year(sy).startOf('month')
  while (cursor.isBefore(installStart)) {
    rows.push({
      monthIndex: cursor.month(),
      year: cursor.year(),
      hours: '',
      creditHours: '',
    })
    cursor.add(1, 'month')
  }
  return rows
}

/**
 * True if any service report exists in the catch-up window (Sept of the current
 * service year through the month before `installedOn`). Used to suppress the
 * catch-up prompt when an iCloud restore (or other prior data) already
 * populated those months.
 */
export const hasReportsInCatchUpWindow = (
  serviceReports: ServiceReportsByYears,
  installedOn: Date
): boolean => {
  const installMoment = moment(installedOn)
  const sy = getServiceYearFromDate(installMoment)
  const installStart = installMoment.clone().startOf('month')
  const cursor = moment().month(8).year(sy).startOf('month')
  while (cursor.isBefore(installStart)) {
    const monthReports = serviceReports[cursor.year()]?.[cursor.month()]
    if (monthReports && monthReports.length > 0) return true
    cursor.add(1, 'month')
  }
  return false
}

const CatchUpMonthRow = ({
  row,
  index,
  onChange,
}: {
  row: MonthRow
  index: number
  onChange: (i: number, key: 'hours' | 'creditHours', value: string) => void
}) => {
  const theme = useTheme()
  const hoursInput = useRef<RNTextInput>(null)
  const creditInput = useRef<RNTextInput>(null)

  const inputStyle = {
    backgroundColor: theme.colors.backgroundLighter,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.numbers.borderRadiusSm,
    minWidth: 90,
    color: theme.colors.text,
  }
  const labelStyle = { color: theme.colors.textAlt, flex: 1 }
  const labelHitSlop = { top: 8, bottom: 8 }

  return (
    <View
      style={{
        backgroundColor: theme.colors.card,
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderRadius: theme.numbers.borderRadiusMd,
        gap: 8,
      }}
    >
      <Text
        style={{
          fontFamily: theme.fonts.semiBold,
          color: theme.colors.text,
          fontSize: 16,
        }}
      >
        {moment().month(row.monthIndex).year(row.year).format('MMMM YYYY')}
      </Text>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <Pressable
          onPress={() => hoursInput.current?.focus()}
          hitSlop={labelHitSlop}
          accessibilityRole='button'
          accessibilityLabel={i18n.t('serviceYearCatchUpHoursLabel')}
          style={{ flex: 1 }}
        >
          <Text style={labelStyle}>
            {i18n.t('serviceYearCatchUpHoursLabel')}
          </Text>
        </Pressable>
        <TextInput
          ref={hoursInput}
          style={inputStyle}
          keyboardType='decimal-pad'
          value={row.hours}
          onChangeText={(v) => onChange(index, 'hours', v)}
          placeholder='0'
          textAlign='right'
        />
      </View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <Pressable
          onPress={() => creditInput.current?.focus()}
          hitSlop={labelHitSlop}
          accessibilityRole='button'
          accessibilityLabel={i18n.t('serviceYearCatchUpCreditLabel')}
          style={{ flex: 1 }}
        >
          <Text style={labelStyle}>
            {i18n.t('serviceYearCatchUpCreditLabel')}
          </Text>
        </Pressable>
        <TextInput
          ref={creditInput}
          style={inputStyle}
          keyboardType='decimal-pad'
          value={row.creditHours}
          onChangeText={(v) => onChange(index, 'creditHours', v)}
          placeholder='0'
          textAlign='right'
        />
      </View>
    </View>
  )
}

const ServiceYearCatchUpForm = ({
  onComplete,
  onSkip,
  setSkippedStatusOnSkip = true,
}: Props) => {
  const theme = useTheme()
  const { installedOn, set } = usePreferences()
  const { addServiceReport, addDayPlan } = useServiceReport()

  const initialRows = useMemo(
    () => buildCatchUpRows(installedOn),
    [installedOn]
  )
  const [rows, setRows] = useState<MonthRow[]>(initialRows)

  const updateRow = (
    i: number,
    key: 'hours' | 'creditHours',
    value: string
  ) => {
    setRows((prev) =>
      prev.map((r, idx) => (idx === i ? { ...r, [key]: value } : r))
    )
  }

  const handleSubmit = () => {
    Keyboard.dismiss()

    for (const row of rows) {
      const hours = parseFloat(row.hours) || 0
      const creditHours = parseFloat(row.creditHours) || 0
      if (hours <= 0 && creditHours <= 0) continue

      const date = moment()
        .month(row.monthIndex)
        .year(row.year)
        .startOf('month')
        .hour(12)
        .minute(0)
        .second(0)
        .millisecond(0)
        .toDate()

      if (hours > 0) {
        addServiceReport({
          id: Crypto.randomUUID(),
          date,
          hours,
          minutes: 0,
          ldc: false,
          credit: false,
        })
      }
      if (creditHours > 0) {
        // Bucket as `ldc: true` so the cap pipeline counts it as credit time
        // (see `getTotalMinutesForServiceYear`). The cap math sums ldc and
        // tag-with-credit into `credit`; we use ldc here to avoid surfacing
        // a synthetic tag in the user's tag list.
        addServiceReport({
          id: Crypto.randomUUID(),
          date,
          hours: creditHours,
          minutes: 0,
          ldc: true,
          credit: true,
        })
      }
    }

    const updatedReports = useServiceReport.getState().serviceReports
    const sy = getServiceYearFromDate(moment(installedOn))
    const syReports = getServiceYearReports(updatedReports, sy)
    const totalMinutes = getTotalMinutesForServiceYear(syReports, sy)

    if (totalMinutes > 0) {
      const planDate = moment(installedOn)
        .subtract(1, 'month')
        .endOf('month')
        .hour(12)
        .minute(0)
        .second(0)
        .millisecond(0)
        .toDate()
      const monthLabel = moment(planDate).format('MMMM YYYY')
      addDayPlan({
        id: Crypto.randomUUID(),
        date: planDate,
        minutes: totalMinutes,
        note: i18n.t('serviceYearCatchUpPlanNote', { month: monthLabel }),
      })
    }

    set({ serviceYearCatchUpStatus: 'completed' })
    onComplete()
  }

  const handleSkip = () => {
    Keyboard.dismiss()
    if (setSkippedStatusOnSkip) {
      set({ serviceYearCatchUpStatus: 'skipped' })
    }
    onSkip()
  }

  return (
    <View style={{ flex: 1 }}>
      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 24 }}
        keyboardShouldPersistTaps='handled'
        showsVerticalScrollIndicator={false}
        enableOnAndroid={true}
      >
        <Text
          style={{
            fontSize: 32,
            fontFamily: theme.fonts.bold,
            color: theme.colors.text,
            marginBottom: 12,
          }}
        >
          {i18n.t('serviceYearCatchUpTitle')}
        </Text>
        <Text
          style={{
            fontSize: 14,
            color: theme.colors.textAlt,
            lineHeight: 20,
            marginBottom: 16,
          }}
        >
          {i18n.t('serviceYearCatchUpSubtitle')}
        </Text>
        <Text
          style={{
            fontSize: 12,
            color: theme.colors.textAlt,
            lineHeight: 18,
            marginBottom: 24,
          }}
        >
          {i18n.t('serviceYearCatchUpHelper')}
        </Text>

        <View style={{ gap: 12 }}>
          {rows.map((row, i) => (
            <CatchUpMonthRow
              key={`${row.year}-${row.monthIndex}`}
              row={row}
              index={i}
              onChange={updateRow}
            />
          ))}
        </View>
      </KeyboardAwareScrollView>

      <View style={{ gap: 10, paddingTop: 12 }}>
        <ActionButton onPress={handleSubmit}>{i18n.t('continue')}</ActionButton>
        <View style={{ alignItems: 'center' }}>
          <Button onPress={handleSkip}>
            <Text
              style={{
                color: theme.colors.textAlt,
                textDecorationLine: 'underline',
              }}
            >
              {i18n.t('serviceYearCatchUpSkip')}
            </Text>
          </Button>
        </View>
      </View>
    </View>
  )
}

export default ServiceYearCatchUpForm
