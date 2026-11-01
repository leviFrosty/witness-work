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

import Text from '@/components/ui/MyText'
import TextInput from '@/components/ui/TextInput'
import ActionButton from '@/components/ui/ActionButton'
import Button from '@/components/ui/Button'
import InfoPopover from '@/components/ui/InfoPopover'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { formatPlainNumber } from '@/lib/numbers'
import { parseHours } from '@/features/service-reports/lib/serviceHistoryDrafts'
import { usePreferences } from '@/stores/preferences'
import useServiceReport from '@/stores/serviceReport'
import { getServiceYearFromDate, serviceYearBounds } from '@/lib/serviceYear'
import { isCountableEntry } from '@/lib/serviceReport'
import { TimeEntriesByYear } from '@/types/timeEntry'
import { LDC_BUILTIN_CATEGORY_ID } from '@/constants/categories'
import { inputLayout } from '@/components/ui/inputs/InputLayout'
import { formatDisplay } from '@/lib/dates'

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

export const buildCatchUpRows = (installedOn: Date): MonthRow[] => {
  const installMoment = moment(installedOn)
  const sy = getServiceYearFromDate(installMoment)
  const installStart = installMoment.clone().startOf('month')

  const rows: MonthRow[] = []
  const cursor = serviceYearBounds(sy).start
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

export const hasReportsInCatchUpWindow = (
  serviceReports: TimeEntriesByYear,
  installedOn: Date
): boolean => {
  const installMoment = moment(installedOn)
  const sy = getServiceYearFromDate(installMoment)
  const installStart = installMoment.clone().startOf('month')
  const cursor = serviceYearBounds(sy).start
  while (cursor.isBefore(installStart)) {
    const monthReports = serviceReports[cursor.year()]?.[cursor.month()]
    if (monthReports?.some(isCountableEntry)) return true
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
    paddingVertical: 10,
    borderRadius: theme.numbers.borderRadiusSm,
    minWidth: 90,
    width: 120,
    maxWidth: inputLayout.controlMaxWidth,
    minHeight: inputLayout.controlMinHeight,
    borderWidth: 1,
    borderColor: theme.colors.border,
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
        {formatDisplay(
          moment().month(row.monthIndex).year(row.year),
          'MMMM YYYY'
        )}
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
          accessibilityLabel={i18n.t('onboardingBackfillHoursLabel')}
          style={{ flex: 1 }}
        >
          <Text style={labelStyle}>
            {i18n.t('onboardingBackfillHoursLabel')}
          </Text>
        </Pressable>
        <TextInput
          ref={hoursInput}
          style={inputStyle}
          inputMode='decimal'
          value={row.hours}
          onChangeText={(v) => onChange(index, 'hours', v)}
          placeholder={formatPlainNumber(0)}
          textAlign='end'
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
          accessibilityLabel={i18n.t('onboardingBackfillCreditLabel')}
          style={{ flex: 1 }}
        >
          <Text style={labelStyle}>
            {i18n.t('onboardingBackfillCreditLabel')}
          </Text>
        </Pressable>
        <TextInput
          ref={creditInput}
          style={inputStyle}
          inputMode='decimal'
          value={row.creditHours}
          onChangeText={(v) => onChange(index, 'creditHours', v)}
          placeholder={formatPlainNumber(0)}
          textAlign='end'
        />
      </View>
    </View>
  )
}

const OnboardingBackfillForm = ({
  onComplete,
  onSkip,
  setSkippedStatusOnSkip = true,
}: Props) => {
  const theme = useTheme()
  const { installedOn, set } = usePreferences()
  const { addServiceReport } = useServiceReport()

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
      const hours = parseHours(row.hours)
      const creditHours = parseHours(row.creditHours)
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
          credit: false,
        })
      }
      if (creditHours > 0) {
        addServiceReport({
          id: Crypto.randomUUID(),
          date,
          hours: creditHours,
          minutes: 0,
          categoryId: LDC_BUILTIN_CATEGORY_ID,
          credit: true,
        })
      }
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
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            marginBottom: 12,
          }}
        >
          <Text
            accessibilityRole='header'
            style={{
              fontSize: 32,
              fontFamily: theme.fonts.bold,
              color: theme.colors.text,
              flexShrink: 1,
            }}
          >
            {i18n.t('onboardingBackfillTitle')}
          </Text>
          <InfoPopover
            title={i18n.t('onboardingBackfillTitle')}
            description={i18n.t('onboardingBackfillHelper')}
          />
        </View>
        <Text
          style={{
            fontSize: 14,
            color: theme.colors.textAlt,
            lineHeight: 20,
            marginBottom: 24,
          }}
        >
          {i18n.t('onboardingBackfillSubtitle')}
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
              {i18n.t('onboardingBackfillSkip')}
            </Text>
          </Button>
        </View>
      </View>
    </View>
  )
}

export default OnboardingBackfillForm
