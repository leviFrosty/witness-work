import { View } from 'react-native'
import Text from './MyText'
import i18n from '../lib/locales'
import useTheme from '../contexts/theme'
import moment from 'moment'
import { FlashList } from '@shopify/flash-list'
import { ServiceReport, DayPlan } from '../types/serviceReport'
import TimeReportRow from './TimeReportRow'
import Card from './Card'
import { useMemo } from 'react'
import useServiceReport from '../stores/serviceReport'
import XView from './layout/XView'
import _ from 'lodash'
import { getPlansIntersectingDay, RecurringPlan } from '../lib/serviceReport'
import DayPlanRow from './DayPlanRow'
import RecurringPlanRow from './RecurringPlanRow'
import Circle from './Circle'
import { getDateStatusColor } from './CalendarDay'

interface DayHistoryViewProps {
  date: Date
  serviceReports?: ServiceReport[]
  showHeader?: boolean
  onDayPlanPress?: (plan: DayPlan, date: Date) => void
  onRecurringPlanPress?: (plan: RecurringPlan, date: Date) => void
}

const DayHistoryView: React.FC<DayHistoryViewProps> = ({
  date,
  serviceReports = [],
  showHeader = false,
  onDayPlanPress,
  onRecurringPlanPress,
}) => {
  const theme = useTheme()
  const { dayPlans, recurringPlans } = useServiceReport()

  const thisDaysReports = useMemo(
    () => serviceReports?.filter((r) => moment(r.date).isSame(date, 'day')),
    [date, serviceReports]
  )

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
    return dayPlans.filter((dp) => moment(dp.date).isSame(date, 'day'))
  }, [dayPlans, date])

  const recurringPlansForToday = useMemo(() => {
    return getPlansIntersectingDay(date, recurringPlans)
  }, [recurringPlans, date])

  const goalHours = useMemo(() => {
    const dayPlan = dayPlans.find((dp) => moment(dp.date).isSame(date, 'day'))

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
  }, [dayPlans, recurringPlansForToday, date])

  const wentInService = !!thisDaysReports?.length
  const isToday = moment().isSame(date, 'day')
  const dateInPast = moment(date).isSameOrBefore(moment(), 'day')
  const hitGoal = actualHours >= (goalHours || 0)

  const statusColor = getDateStatusColor(
    theme,
    wentInService,
    isToday,
    dateInPast,
    hitGoal
  )

  return (
    <View style={{ gap: 20 }}>
      {showHeader && (
        <View style={{ marginBottom: 10, gap: 5 }}>
          <XView style={{ justifyContent: 'space-between' }}>
            <Text
              style={{
                color: theme.colors.text,
                fontSize: theme.fontSize('xl'),
                fontFamily: theme.fonts.bold,
              }}
            >
              {moment(date).format('LL')}
            </Text>

            <XView>
              {goalHours && (
                <>
                  <Circle color={statusColor.bg} />
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
      )}

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
              <Card style={{ borderRadius: theme.numbers.borderRadiusSm }}>
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
              ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
              renderItem={({ item }) => (
                <DayPlanRow
                  plan={item}
                  date={date}
                  onPress={
                    onDayPlanPress
                      ? () => onDayPlanPress(item, date)
                      : undefined
                  }
                />
              )}
              estimatedItemSize={66}
              ListEmptyComponent={
                <Card style={{ borderRadius: theme.numbers.borderRadiusSm }}>
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
              ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
              renderItem={({ item }) => (
                <RecurringPlanRow
                  plan={item}
                  date={date}
                  onPress={
                    onRecurringPlanPress
                      ? () => onRecurringPlanPress(item, date)
                      : undefined
                  }
                />
              )}
              estimatedItemSize={66}
              ListEmptyComponent={
                <Card style={{ borderRadius: theme.numbers.borderRadiusSm }}>
                  <Text>{i18n.t('noRecurringPlans')}</Text>
                </Card>
              }
            />
          </View>
        </View>
      )}
    </View>
  )
}

export default DayHistoryView
