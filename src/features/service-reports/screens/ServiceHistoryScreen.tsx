import { useState } from 'react'
import { Keyboard, View } from 'react-native'
import ContentColumn from '@/components/ui/layout/ContentColumn'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import {
  ChevronBackwardIcon,
  ChevronForwardIcon,
} from '@/components/ui/DirectionalIcon'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import * as Crypto from 'expo-crypto'
import moment from 'moment'

import Wrapper from '@/components/ui/layout/Wrapper'
import XView from '@/components/ui/layout/XView'
import Text from '@/components/ui/MyText'
import ActionButton from '@/components/ui/ActionButton'
import Button from '@/components/ui/Button'
import IconButton from '@/components/ui/IconButton'
import ContextMenu from '@/components/ui/ContextMenu'
import Section from '@/components/ui/inputs/Section'
import InputRowContainer from '@/components/ui/inputs/InputRowContainer'
import InputRowSelect from '@/components/ui/inputs/InputRowSelect'
import InputRowSwitch from '@/components/ui/inputs/InputRowSwitch'
import TextInputRow from '@/components/ui/inputs/TextInputRow'
import { inputLayout } from '@/components/ui/inputs/InputLayout'
import type { SelectData } from '@/components/ui/Select'
import useTheme from '@/contexts/theme'
import { analytics } from '@/lib/analytics'
import i18n from '@/lib/locales'
import { formatMinutes } from '@/lib/minutes'
import { formatPlainNumber } from '@/lib/numbers'
import { monthlyGoalKey } from '@/lib/monthlyGoals'
import {
  monthStatusItems,
  monthStatusLabel,
  roleOfMonthStatus,
  type MonthStatus,
} from '@/lib/monthStatus'
import { getEntryMode } from '@/lib/publisherCapabilities'
import { serviceYearMonths } from '@/lib/roleHistory'
import { serviceYearOf } from '@/lib/serviceYear'
import { getMonthsReports } from '@/lib/serviceReport'
import { usePreferences } from '@/stores/preferences'
import useServiceReport from '@/stores/serviceReport'
import type { RootStackParamList } from '@/types/rootStack'
import useConfirmDeleteServiceYear from '@/features/service-reports/hooks/useConfirmDeleteServiceYear'
import {
  buildServiceHistoryRows,
  clearedRow,
  rowsDiffer,
  type ServiceHistoryRow,
} from '@/features/service-reports/lib/serviceHistoryRows'
import {
  copiedFromPreviousMonth,
  discardDraft,
  dirtyServiceYears,
  draftRowsFor,
  saveServiceHistoryDrafts,
  updateDraft,
  withStatusAppliedToLaterMonths,
  type ServiceHistoryDrafts,
} from '@/features/service-reports/lib/serviceHistoryDrafts'
import { noteUserAction } from '@/lib/userAction'
import { tracking } from '@/lib/tracking'
import { formatDisplay } from '@/lib/dates'

type Props = NativeStackScreenProps<RootStackParamList, 'ServiceHistory'>

const MAX_YEARS_BACK = 10

type Row = ServiceHistoryRow

const latestServiceYear = (): number => {
  const previousMonth = moment().subtract(1, 'month')
  return serviceYearOf({
    year: previousMonth.year(),
    month: previousMonth.month(),
  })
}

const serviceYearLabel = (serviceYear: number) =>
  i18n.t('scheduleCalendar.serviceYearSpan', {
    start: formatPlainNumber(serviceYear),
    end: formatPlainNumber(serviceYear + 1),
  })

const ServiceHistoryScreen = ({ navigation, route }: Props) => {
  const theme = useTheme()
  const newestServiceYear = latestServiceYear()
  const requestedServiceYear = Math.min(
    route.params?.serviceYear ?? newestServiceYear,
    newestServiceYear
  )

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
  const confirmDeleteYear = useConfirmDeleteServiceYear()

  const buildRows = (sy: number): Row[] =>
    buildServiceHistoryRows({
      serviceYear: sy,
      role,
      roleHistory,
      monthlyGoalOverrides,
      serviceReports,
    })

  const [drafts, setDrafts] = useState<ServiceHistoryDrafts>({})
  const rows = draftRowsFor(drafts, serviceYear, buildRows)
  const dirtyYears = dirtyServiceYears(drafts)
  const otherDirtyYears = dirtyYears.filter((sy) => sy !== serviceYear)

  const changeServiceYear = (next: number) => {
    Keyboard.dismiss()
    setServiceYear(next)
  }

  const updateRows = (update: (rows: Row[]) => Row[]) =>
    setDrafts((prev) => updateDraft(prev, serviceYear, buildRows, update))

  const updateRow = (index: number, patch: Partial<Row>) =>
    updateRows((prev) =>
      prev.map((r, i) => (i === index ? { ...r, ...patch } : r))
    )

  const hasTimeThisYear = serviceYearMonths(serviceYear).some(
    (target) =>
      getMonthsReports(serviceReports, target.month, target.year).length > 0
  )

  const handleSave = () => {
    Keyboard.dismiss()
    noteUserAction('time')
    const saved = saveServiceHistoryDrafts(drafts, {
      setMonthStatus,
      addServiceReport,
      newId: Crypto.randomUUID,
    })

    for (const year of saved) {
      analytics.capture('service_history_saved', {
        source,
        service_years_back: newestServiceYear - year.serviceYear,
        months_status_changed: year.monthsStatusChanged,
        months_time_added: year.monthsTimeAdded,
      })
    }
    navigation.goBack()
  }

  const statusItems: SelectData<MonthStatus> = monthStatusItems(publisherHours)

  return (
    <Wrapper insets='bottom' style={{ flex: 1 }}>
      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        keyboardShouldPersistTaps='handled'
        showsVerticalScrollIndicator={false}
        extraScrollHeight={20}
      >
        <ContentColumn
          style={{
            paddingHorizontal: inputLayout.horizontalPadding,
            paddingTop: 16,
            paddingBottom: 32,
            gap: 16,
          }}
        >
          <XView style={{ justifyContent: 'space-between', gap: 12 }}>
            <IconButton
              icon={ChevronBackwardIcon}
              accessibilityLabel={i18n.t('serviceHistory.previousYear')}
              color={
                serviceYear > oldestServiceYear
                  ? undefined
                  : theme.colors.border
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
              {serviceYearLabel(serviceYear)}
            </Text>
            <IconButton
              icon={ChevronForwardIcon}
              accessibilityLabel={i18n.t('serviceHistory.nextYear')}
              color={
                serviceYear < newestServiceYear
                  ? undefined
                  : theme.colors.border
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
            const monthLabel = formatDisplay(row.target, 'MMMM YYYY')
            const copiedRow = copiedFromPreviousMonth(
              drafts,
              serviceYear,
              index,
              buildRows
            )
            const isCheckbox =
              getEntryMode(roleOfMonthStatus(row.status)) === 'checkbox'
            const canApplyLater =
              index < rows.length - 1 &&
              row.status !== row.savedStatus &&
              rows.slice(index + 1).some((r) => r.status !== row.status)

            return (
              <View key={monthlyGoalKey(row.target)} style={{ gap: 6 }}>
                {}
                <ContextMenu
                  actions={[
                    rowsDiffer(copiedRow, row) && {
                      id: 'copy_previous_month',
                      title: i18n.t('copyFromPreviousMonth'),
                      systemImage: 'doc.on.doc',
                      onPress: () => updateRow(index, copiedRow),
                    },
                    rowsDiffer(clearedRow(row), row) && {
                      id: 'clear_month',
                      title: i18n.t('clearMonth'),
                      systemImage: 'xmark.circle',
                      onPress: () => updateRow(index, clearedRow(row)),
                    },
                  ]}
                >
                  <Text
                    style={{
                      fontFamily: theme.fonts.semiBold,
                      color: theme.colors.textAlt,
                      fontSize: theme.fontSize('xs'),
                      textTransform: 'uppercase',
                      letterSpacing: tracking(0.5),
                      paddingHorizontal: inputLayout.horizontalPadding,
                    }}
                  >
                    {monthLabel}
                  </Text>
                </ContextMenu>
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
                          accessibilityLabel: i18n.t(
                            'onboardingBackfillHoursA11y',
                            {
                              month: monthLabel,
                            }
                          ),
                          testID: `service-history-hours-${index}`,
                          inputMode: 'decimal',
                          maxLength: 6,
                          placeholder: formatPlainNumber(0),
                          value: row.hours,
                          onChangeText: (hours) => updateRow(index, { hours }),
                          textAlign: 'end',
                        }}
                      />
                      <TextInputRow
                        label={i18n.t('onboardingBackfillCreditLabel')}
                        controlStyle={{ width: 96 }}
                        lastInSection
                        textInputProps={{
                          accessibilityLabel: i18n.t(
                            'onboardingBackfillCreditA11y',
                            {
                              month: monthLabel,
                            }
                          ),
                          inputMode: 'decimal',
                          maxLength: 6,
                          placeholder: formatPlainNumber(0),
                          value: row.creditHours,
                          onChangeText: (creditHours) =>
                            updateRow(index, { creditHours }),
                          textAlign: 'end',
                        }}
                      />
                    </>
                  )}
                </Section>
                {canApplyLater ? (
                  <Button
                    noTransform
                    accessibilityRole='button'
                    onPress={() =>
                      updateRows((prev) =>
                        withStatusAppliedToLaterMonths(prev, index)
                      )
                    }
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

          {hasTimeThisYear ? (
            <Button
              noTransform
              accessibilityRole='button'
              onPress={() =>
                confirmDeleteYear({
                  endYear: serviceYear + 1,

                  onDeleted: () =>
                    setDrafts((prev) => discardDraft(prev, serviceYear)),
                })
              }
              style={{
                alignSelf: 'center',
                paddingVertical: 8,
                paddingHorizontal: inputLayout.horizontalPadding,
              }}
            >
              <Text
                style={{
                  color: theme.colors.error,
                  fontFamily: theme.fonts.semiBold,
                  fontSize: theme.fontSize('sm'),
                }}
              >
                {i18n.t('deleteThisYearsTime')}
              </Text>
            </Button>
          ) : null}
        </ContentColumn>
      </KeyboardAwareScrollView>

      <ContentColumn
        style={{
          paddingHorizontal: inputLayout.horizontalPadding,
          paddingTop: 12,
        }}
      >
        {otherDirtyYears.length ? (
          <Text
            style={{
              color: theme.colors.textAlt,
              fontSize: theme.fontSize('sm'),
              textAlign: 'center',
              paddingBottom: 8,
            }}
          >
            {i18n.t('serviceHistoryOtherYearsUnsaved', {
              years: otherDirtyYears.map(serviceYearLabel).join(', '),
            })}
          </Text>
        ) : null}
        <ActionButton
          noTransform
          accessibilityRole='button'
          disabled={!dirtyYears.length}
          onPress={handleSave}
        >
          {i18n.t('save')}
        </ActionButton>
      </ContentColumn>
    </Wrapper>
  )
}

export default ServiceHistoryScreen
