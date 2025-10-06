import { ScrollView, View } from 'react-native'
import Text from '../components/MyText'
import useTheme from '../contexts/theme'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import i18n from '../lib/locales'
import Wrapper from '../components/layout/Wrapper'
import XView from '../components/layout/XView'
import { useCallback, useEffect, useMemo, useState } from 'react'
import moment from 'moment'
import { Calendar, DateData } from 'react-native-calendars'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import CalendarDay from '../components/CalendarDay'
import SimpleProgressBar from '../components/SimpleProgressBar'
import _ from 'lodash'
import CalendarKey from '../components/CalendarKey'
import useServiceReport from '../stores/serviceReport'
import usePublisher from '../hooks/usePublisher'
import {
  getServiceYearFromDate,
  getMonthsReports,
  calculateAnnualPlannedMinutesOptimized,
  calculateMonthlyPlannedMinutesOptimized,
  generatePlanHash,
} from '../lib/serviceReport'
import {
  useTimeCache,
  getMonthCacheKey,
  getAnnualCacheKey,
} from '../stores/timeCache'
import { logger } from '../lib/logger'
import Header from '../components/layout/Header'
import Button from '../components/Button'
import IconButton from '../components/IconButton'
import { faArrowLeft, faArrowRight } from '@fortawesome/free-solid-svg-icons'
import Card from '../components/Card'
import MonthPlansList from '../components/MonthPlansList'

import { RootStackParamList } from '../types/rootStack'

type PlanScheduleScreenProps = NativeStackScreenProps<
  RootStackParamList,
  'PlanSchedule'
>

const PlanScheduleScreen = ({ route, navigation }: PlanScheduleScreenProps) => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()

  const [month, setMonth] = useState(route.params.month)
  const [year, setYear] = useState(route.params.year)
  const selectedMonth = moment().month(month).year(year)
  const monthToView = selectedMonth.format('YYYY-MM-DD')

  // Get service reports for the calendar display
  const { serviceReports } = useServiceReport()
  const thisMonthsReports = useMemo(
    () => getMonthsReports(serviceReports, month, year),
    [serviceReports, month, year]
  )

  const handleArrowNavigate = useCallback(
    (direction: 'forward' | 'back') => {
      if (direction === 'forward') {
        if (month === 11) {
          setMonth(0)
          setYear(year + 1)
        } else {
          setMonth(month + 1)
        }
      } else {
        if (month === 0) {
          setMonth(11)
          setYear(year - 1)
        } else {
          setMonth(month - 1)
        }
      }
    },
    [month, year]
  )

  useEffect(() => {
    navigation.setOptions({
      header: () => (
        <Header
          noInsets
          title={selectedMonth.format('MMMM YYYY')}
          buttonType='back'
        />
      ),
    })
  }, [
    selectedMonth,
    month,
    navigation,
    theme.colors.accent3,
    theme.colors.text,
    theme.colors.textInverse,
    year,
  ])

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
      <View style={{ flexGrow: 1 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 15,
            paddingVertical: 10,
          }}
        >
          <Button
            onPress={() => handleArrowNavigate('back')}
            style={{
              borderColor: theme.colors.accent,
              borderWidth: 1,
              borderRadius: theme.numbers.borderRadiusLg,
              paddingHorizontal: 15,
              paddingVertical: 5,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                gap: 5,
                alignItems: 'center',
              }}
            >
              <IconButton
                icon={faArrowLeft}
                size={15}
                color={theme.colors.accent}
              />
              <Text
                style={{
                  color: theme.colors.accent,
                  fontFamily: theme.fonts.semiBold,
                  textDecorationLine: 'underline',
                }}
              >
                {moment(selectedMonth).subtract(1, 'month').format('MMM')}
              </Text>
            </View>
          </Button>
          {(month !== moment().month() || year !== moment().year()) && (
            <Button
              style={{
                backgroundColor: theme.colors.accentTranslucent,
                paddingVertical: 5,
                paddingHorizontal: 15,
                borderRadius: theme.numbers.borderRadiusSm,
              }}
              onPress={() => {
                setYear(moment().year())
                setMonth(moment().month())
              }}
            >
              <Text style={{ textDecorationLine: 'underline' }}>
                {i18n.t('today')}
              </Text>
            </Button>
          )}
          <Button
            onPress={() => handleArrowNavigate('forward')}
            style={{
              borderColor: theme.colors.accent,
              borderWidth: 1,
              borderRadius: theme.numbers.borderRadiusLg,
              paddingHorizontal: 15,
              paddingVertical: 5,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                gap: 5,
                alignItems: 'center',
              }}
            >
              <Text
                style={{
                  color: theme.colors.accent,
                  fontFamily: theme.fonts.semiBold,
                  textDecorationLine: 'underline',
                }}
              >
                {moment(selectedMonth).add(1, 'month').format('MMM')}
              </Text>
              <IconButton
                icon={faArrowRight}
                size={15}
                color={theme.colors.accent}
              />
            </View>
          </Button>
        </View>
        <ScrollView
          contentInset={{
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
          }}
          contentContainerStyle={{
            paddingBottom: 200,
            gap: 10,
          }}
        >
          <View style={{ paddingHorizontal: 10 }}>
            <Card style={{ gap: 10 }}>
              <View style={{ gap: 4 }}>
                <Text
                  style={{
                    fontFamily: theme.fonts.bold,
                    fontSize: theme.fontSize('xl'),
                  }}
                >
                  {i18n.t('plannedHours')}
                </Text>
                <Text
                  style={{
                    color: theme.colors.textAlt,
                    fontSize: theme.fontSize('sm'),
                  }}
                >
                  {i18n.t('timePlanned_description2')}
                </Text>
              </View>
              <XView style={{ flex: 1, gap: 10 }}>
                <MonthScheduleSection month={month} year={year} />
                <AnnualScheduleSection month={month} year={year} />
              </XView>
            </Card>
          </View>
          <View
            style={{ paddingHorizontal: 10, position: 'relative', gap: 10 }}
          >
            <Calendar
              key={monthToView}
              current={monthToView}
              disableMonthChange
              hideArrows
              renderHeader={() => (
                <View style={{ width: '100%', gap: 10 }}>
                  <View style={{ gap: 4 }}>
                    <Text
                      style={{
                        fontSize: theme.fontSize('lg'),
                        fontFamily: theme.fonts.semiBold,
                      }}
                    >
                      {i18n.t('tapDayToSchedule')}
                    </Text>
                    <Text
                      style={{
                        color: theme.colors.textAlt,
                        fontSize: theme.fontSize('sm'),
                      }}
                    >
                      {i18n.t('tapDayToSchedule_description')}
                    </Text>
                  </View>
                  <CalendarKey />
                </View>
              )}
              style={{
                borderRadius: theme.numbers.borderRadiusLg,
                paddingBottom: 10,
                paddingTop: 10,
                paddingLeft: 10,
                paddingRight: 10,
              }}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              dayComponent={(props: any) => (
                <CalendarDay
                  {...props}
                  planMode={true}
                  monthsReports={thisMonthsReports}
                  onPress={(day: DateData) => {
                    navigation.navigate('PlanDay', {
                      date: moment(day.dateString).toISOString(),
                    })
                  }}
                />
              )}
              theme={{
                backgroundColor: theme.colors.card,
                calendarBackground: theme.colors.card,
                dayTextColor: theme.colors.text,
                textDisabledColor: theme.colors.textAlt,
                textDayHeaderFontSize: theme.fontSize('md'),
                selectedDayBackgroundColor: theme.colors.accent,
                todayTextColor: theme.colors.text,
                todayBackgroundColor: theme.colors.accentTranslucent,
              }}
            />
          </View>
          <View style={{ paddingHorizontal: 10 }}>
            <View style={{ gap: 10 }}>
              <View style={{ gap: 4 }}>
                <Text
                  style={{
                    fontFamily: theme.fonts.bold,
                    fontSize: theme.fontSize('xl'),
                  }}
                >
                  {i18n.t('scheduledPlans')}
                </Text>
                <Text
                  style={{
                    color: theme.colors.textAlt,
                    fontSize: theme.fontSize('sm'),
                  }}
                >
                  {i18n.t('scheduledPlans_description')}
                </Text>
              </View>
              <MonthPlansList month={month} year={year} />
            </View>
          </View>
        </ScrollView>
      </View>
    </Wrapper>
  )
}

const AnnualScheduleSection = (props: { month: number; year: number }) => {
  const { month, year } = props
  const theme = useTheme()
  const { dayPlans, recurringPlans } = useServiceReport()
  const { annualGoalHours, hasAnnualGoal } = usePublisher()
  const serviceYear = getServiceYearFromDate(moment().month(month).year(year))
  const { getCachedPlannedMinutes, setCachedPlannedMinutes } = useTimeCache()

  const { annualPlannedMinutes, cacheKey, planHash, needsCache } =
    useMemo(() => {
      const perfNow = performance.now()
      const cacheKey = getAnnualCacheKey(serviceYear)
      const planHash = generatePlanHash(dayPlans, recurringPlans)

      logger.log(
        `[AnnualSchedule] Service year ${serviceYear} - Checking cache (key: ${cacheKey})`
      )
      logger.log(`[AnnualSchedule] Current plan hash: ${planHash}`)

      // Check cache first
      const cached = getCachedPlannedMinutes(cacheKey)
      if (cached && cached.planHash === planHash) {
        logger.log(
          `[AnnualSchedule] ✅ CACHE HIT - Retrieved ${cached.plannedMinutes} minutes in ~0ms`
        )
        logger.log(
          `[AnnualSchedule] Cache last updated: ${new Date(cached.lastUpdated).toISOString()}`
        )
        return {
          annualPlannedMinutes: cached.plannedMinutes,
          cacheKey,
          planHash,
          needsCache: false,
        }
      }

      if (cached) {
        logger.log(
          `[AnnualSchedule] ⚠️ CACHE INVALIDATED - Plan hash mismatch (cached: ${cached.planHash})`
        )
      } else {
        logger.log('[AnnualSchedule] ❌ CACHE MISS - No cached data found')
      }

      logger.log('[AnnualSchedule] Starting fresh calculation...')

      // Calculate using optimized function
      const minutes = calculateAnnualPlannedMinutesOptimized(
        serviceYear,
        dayPlans,
        recurringPlans
      )

      logger.log(
        `[AnnualSchedule] Total time: ${(performance.now() - perfNow).toFixed(2)}ms`
      )
      return {
        annualPlannedMinutes: minutes,
        cacheKey,
        planHash,
        needsCache: true,
      }
      // eslint-disable-next-line react-compiler/react-compiler
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dayPlans, recurringPlans, serviceYear])

  // Cache the result after render
  useEffect(() => {
    if (needsCache) {
      setCachedPlannedMinutes(cacheKey, annualPlannedMinutes, planHash)
      logger.log(`[AnnualSchedule] Cached result for future use`)
    }
  }, [
    needsCache,
    cacheKey,
    annualPlannedMinutes,
    planHash,
    setCachedPlannedMinutes,
  ])

  const percentPlanned = annualPlannedMinutes / (annualGoalHours * 60)

  if (!hasAnnualGoal) {
    return null
  }

  return (
    <View style={{ gap: 5, flex: 1 }}>
      <XView style={{ justifyContent: 'space-between' }}>
        <Text
          style={{
            fontFamily: theme.fonts.semiBold,
          }}
        >
          {i18n.t('year')}
        </Text>
        <Text
          style={{
            fontFamily: theme.fonts.semiBold,
            color: theme.colors.textAlt,
            fontSize: theme.fontSize('xs'),
          }}
        >
          {`${_.round(
            annualPlannedMinutes / 60,
            1
          )} ${i18n.t('of')} ${annualGoalHours} ${i18n.t('hours')}`}
        </Text>
      </XView>
      <SimpleProgressBar
        percentage={percentPlanned}
        color={percentPlanned < 1 ? theme.colors.warn : theme.colors.accent}
      />
    </View>
  )
}

const MonthScheduleSection = (props: { month: number; year: number }) => {
  const theme = useTheme()
  const { dayPlans, recurringPlans } = useServiceReport()
  const { goalHours } = usePublisher()
  const { getCachedPlannedMinutes, setCachedPlannedMinutes } = useTimeCache()

  const { plannedMinutes, cacheKey, planHash, needsCache } = useMemo(() => {
    const perfNow = performance.now()
    const cacheKey = getMonthCacheKey(props.month, props.year)
    const planHash = generatePlanHash(dayPlans, recurringPlans)

    const monthName = moment().month(props.month).format('MMMM')
    logger.log(
      `[MonthSchedule] ${monthName} ${props.year} (index: ${props.month}) - Checking cache (key: ${cacheKey})`
    )
    logger.log(`[MonthSchedule] Current plan hash: ${planHash}`)

    // Check cache first
    const cached = getCachedPlannedMinutes(cacheKey)
    if (cached && cached.planHash === planHash) {
      logger.log(
        `[MonthSchedule] ✅ CACHE HIT - Retrieved ${cached.plannedMinutes} minutes in ~0ms`
      )
      logger.log(
        `[MonthSchedule] Cache last updated: ${new Date(cached.lastUpdated).toISOString()}`
      )
      return {
        plannedMinutes: cached.plannedMinutes,
        cacheKey,
        planHash,
        needsCache: false,
      }
    }

    if (cached) {
      logger.log(
        `[MonthSchedule] ⚠️ CACHE INVALIDATED - Plan hash mismatch (cached: ${cached.planHash})`
      )
    } else {
      logger.log('[MonthSchedule] ❌ CACHE MISS - No cached data found')
    }

    logger.log('[MonthSchedule] Starting fresh calculation...')

    // Calculate using optimized function
    const minutes = calculateMonthlyPlannedMinutesOptimized(
      props.month,
      props.year,
      dayPlans,
      recurringPlans
    )

    logger.log(
      `[MonthSchedule] Total time: ${(performance.now() - perfNow).toFixed(2)}ms`
    )
    return {
      plannedMinutes: minutes,
      cacheKey,
      planHash,
      needsCache: true,
    }
    // eslint-disable-next-line react-compiler/react-compiler
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.month, props.year, dayPlans, recurringPlans])

  // Cache the result after render
  useEffect(() => {
    if (needsCache) {
      setCachedPlannedMinutes(cacheKey, plannedMinutes, planHash)
      logger.log(`[MonthSchedule] Cached result for future use`)
    }
  }, [needsCache, cacheKey, plannedMinutes, planHash, setCachedPlannedMinutes])

  const percentPlanned = plannedMinutes / goalHours / 60
  return (
    <View style={{ gap: 5, flex: 1 }}>
      <XView style={{ justifyContent: 'space-between' }}>
        <Text
          style={{
            fontFamily: theme.fonts.semiBold,
          }}
        >
          {i18n.t('month')}
        </Text>
        <XView>
          <Text
            style={{
              fontFamily: theme.fonts.semiBold,
              color: theme.colors.textAlt,
              fontSize: theme.fontSize('xs'),
            }}
          >
            {`${_.round(
              plannedMinutes / 60,
              1
            )} ${i18n.t('of')} ${goalHours} ${i18n.t('hours')}`}
          </Text>
        </XView>
      </XView>
      <SimpleProgressBar
        percentage={percentPlanned}
        color={percentPlanned < 1 ? theme.colors.warn : theme.colors.accent}
      />
    </View>
  )
}

export default PlanScheduleScreen
