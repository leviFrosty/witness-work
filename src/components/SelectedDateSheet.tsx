import { View } from 'react-native'
import { Sheet } from 'tamagui'
import Text from './MyText'
import i18n from '../lib/locales'
import useTheme from '../contexts/theme'
import moment from 'moment'
import { useNavigation } from '@react-navigation/native'
import { RootStackNavigation } from '../stacks/RootStack'
import { FlashList } from '@shopify/flash-list'
import { ServiceReport } from '../types/serviceReport'
import TimeReportRow from './TimeReportRow'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import ActionButton from './ActionButton'
import Card from './Card'
import { useMemo } from 'react'
import useServiceReport from '../stores/serviceReport'
import XView from './layout/XView'
import _ from 'lodash'
import Button from './Button'
import { getPlansIntersectingDay } from '../lib/serviceReport'
import DayPlanRow from './DayPlanRow'
import RecurringPlanRow from './RecurringPlanRow'
import Circle from './Circle'

export type SelectedDateSheetState = {
  open: boolean
  date: Date
}

interface Props {
  sheet: SelectedDateSheetState
  setSheet: React.Dispatch<React.SetStateAction<SelectedDateSheetState>>
  thisMonthsReports: ServiceReport[] | null
}

const SelectedDateSheet: React.FC<Props> = ({
  sheet,
  setSheet,
  thisMonthsReports,
}) => {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const thisDaysReports = useMemo(
    () =>
      thisMonthsReports?.filter((r) =>
        moment(r.date).isSame(sheet.date, 'day')
      ),
    [sheet.date, thisMonthsReports]
  )

  const { dayPlans, recurringPlans } = useServiceReport()

  const actualHours = useMemo(() => {
    if (!thisDaysReports) {
      return 0
    }

    return _.round(
      thisDaysReports.reduce(
        (acc, report) => acc + report.hours + report.minutes / 60,
        0
      ),
      1
    )
  }, [thisDaysReports])

  const dayPlansForToday = useMemo(() => {
    return dayPlans.filter((dp) => moment(dp.date).isSame(sheet.date, 'day'))
  }, [dayPlans, sheet.date])

  const recurringPlansForToday = useMemo(() => {
    return getPlansIntersectingDay(sheet.date, recurringPlans)
  }, [recurringPlans, sheet.date])

  const goalHours = useMemo(() => {
    const dayPlan = dayPlans.find((dp) =>
      moment(dp.date).isSame(sheet.date, 'day')
    )

    const highestRecurringPlanForDay = recurringPlansForToday.sort(
      (a, b) => b.minutes - a.minutes
    )[0]

    if (!dayPlan?.minutes && !highestRecurringPlanForDay?.minutes) {
      return
    }

    return _.round(
      (dayPlan?.minutes || highestRecurringPlanForDay.minutes) / 60,
      1
    )
  }, [dayPlans, recurringPlansForToday, sheet.date])

  return (
    <Sheet
      open={sheet.open}
      onOpenChange={(o: boolean) => setSheet({ ...sheet, open: o })}
      dismissOnSnapToBottom
      modal
      snapPoints={[70]}
    >
      <Sheet.Handle />
      <Sheet.Overlay zIndex={100_000 - 1} />
      <Sheet.Frame>
        <View
          style={{
            paddingHorizontal: 30,
            gap: 10,
            flex: 1,
            paddingTop: 30,
            paddingBottom: 50,
          }}
        >
          <View style={{ marginBottom: 10, gap: 5 }}>
            <XView style={{ justifyContent: 'space-between' }}>
              <Text
                style={{
                  color: theme.colors.text,
                  fontSize: theme.fontSize('xl'),
                  fontFamily: theme.fonts.bold,
                }}
              >
                {moment(sheet.date).format('LL')}
              </Text>

              <XView>
                {goalHours && (
                  <>
                    <Circle
                      color={
                        moment().isSameOrAfter(sheet.date, 'day')
                          ? actualHours === 0
                            ? theme.colors.error
                            : actualHours < goalHours
                              ? theme.colors.warn
                              : theme.colors.accent
                          : theme.colors.textAlt
                      }
                    />
                    <Text
                      style={{
                        color: theme.colors.textAlt,
                        fontSize: theme.fontSize('md'),
                        fontFamily: theme.fonts.semiBold,
                      }}
                    >
                      {`${actualHours} ${i18n.t('of')} ${goalHours} ${i18n.t(
                        'plannedHours'
                      )}`}
                    </Text>
                  </>
                )}
              </XView>
            </XView>
            <Text
              style={{
                fontSize: theme.fontSize('sm'),
                color: theme.colors.textAlt,
              }}
            >
              {i18n.t('viewAllReportAndPlansForDate')}
            </Text>
          </View>
          <KeyboardAwareScrollView
            contentContainerStyle={{ minHeight: 10, gap: 20 }}
          >
            <View style={{ gap: 5 }}>
              <Text
                style={{
                  fontFamily: theme.fonts.semiBold,
                  color: theme.colors.textAlt,
                  textTransform: 'uppercase',
                  fontSize: theme.fontSize('sm'),
                }}
              >
                {i18n.t('timeReports')}
              </Text>
              <View style={{ flex: 1, minHeight: 10 }}>
                <FlashList
                  scrollEnabled={false}
                  data={
                    thisDaysReports
                      ? thisDaysReports.sort((a, b) =>
                          moment(a.date).unix() < moment(b.date).unix() ? 1 : -1
                        )
                      : undefined
                  }
                  ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
                  renderItem={({ item }) => <TimeReportRow report={item} />}
                  estimatedItemSize={66}
                  ListEmptyComponent={
                    <Card
                      style={{ borderRadius: theme.numbers.borderRadiusSm }}
                    >
                      <Text>{i18n.t('noReportsThisDay')}</Text>
                    </Card>
                  }
                />
              </View>
            </View>

            {!!dayPlansForToday.length && (
              <View style={{ gap: 5 }}>
                <Text
                  style={{
                    fontFamily: theme.fonts.semiBold,
                    color: theme.colors.textAlt,
                    textTransform: 'uppercase',
                    fontSize: theme.fontSize('sm'),
                  }}
                >
                  {i18n.t('dayPlan')}
                </Text>
                <View style={{ flex: 1, minHeight: 10 }}>
                  <FlashList
                    scrollEnabled={false}
                    data={dayPlansForToday}
                    ItemSeparatorComponent={() => (
                      <View style={{ height: 10 }} />
                    )}
                    renderItem={({ item }) => <DayPlanRow plan={item} />}
                    estimatedItemSize={66}
                    ListEmptyComponent={
                      <Card
                        style={{ borderRadius: theme.numbers.borderRadiusSm }}
                      >
                        <Text>{i18n.t('noDayPlans')}</Text>
                      </Card>
                    }
                  />
                </View>
              </View>
            )}
            {!!recurringPlansForToday.length && (
              <View style={{ gap: 5 }}>
                <Text
                  style={{
                    fontFamily: theme.fonts.semiBold,
                    color: theme.colors.textAlt,
                    textTransform: 'uppercase',
                    fontSize: theme.fontSize('sm'),
                  }}
                >
                  {i18n.t('recurringPlans')}
                </Text>
                <View style={{ flex: 1, minHeight: 10 }}>
                  <FlashList
                    scrollEnabled={false}
                    data={recurringPlansForToday}
                    ItemSeparatorComponent={() => (
                      <View style={{ height: 10 }} />
                    )}
                    renderItem={({ item }) => <RecurringPlanRow plan={item} />}
                    estimatedItemSize={66}
                    ListEmptyComponent={
                      <Card
                        style={{ borderRadius: theme.numbers.borderRadiusSm }}
                      >
                        <Text>{i18n.t('noRecurringPlans')}</Text>
                      </Card>
                    }
                  />
                </View>
              </View>
            )}
          </KeyboardAwareScrollView>
          <XView style={{ maxHeight: 70 }}>
            <View style={{ flex: 1 }}>
              <ActionButton
                onPress={() =>
                  navigation.navigate('Add Time', {
                    date: sheet.date.toISOString(),
                  })
                }
              >
                <Text
                  style={{
                    color: theme.colors.textInverse,
                    fontSize: theme.fontSize('lg'),
                    fontFamily: theme.fonts.semiBold,
                  }}
                >
                  {i18n.t('addTime')}
                </Text>
              </ActionButton>
            </View>
            {moment().isSameOrBefore(sheet.date, 'day') && (
              <Button
                onPress={() =>
                  navigation.navigate('PlanDay', {
                    date: sheet.date.toISOString(),
                  })
                }
                style={{
                  paddingHorizontal: 40,
                  borderColor: theme.colors.border,
                  borderWidth: 1,
                  borderRadius: theme.numbers.borderRadiusSm,
                  height: '100%',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ textAlign: 'center' }}>{i18n.t('planDay')}</Text>
              </Button>
            )}
          </XView>
        </View>
      </Sheet.Frame>
    </Sheet>
  )
}

export default SelectedDateSheet
