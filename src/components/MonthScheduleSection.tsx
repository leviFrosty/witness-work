import useTheme from '../contexts/theme'
import i18n from '../lib/locales'
import AheadOrBehindOfMonthSchedule from './AheadOrBehindOfSchedule'
import Text from './MyText'
import Button from './Button'
import { useNavigation } from '@react-navigation/native'
import { useMemo, useEffect } from 'react'
import moment from 'moment'
import useServiceReport from '../stores/serviceReport'
import {
  plannedMinutesToCurrentDayForMonth,
  calculateMonthlyPlannedMinutesOptimized,
  generatePlanHash,
} from '../lib/serviceReport'
import usePublisher from '../hooks/usePublisher'
import Circle from './Circle'
import XView from './layout/XView'
import { View } from 'react-native'
import _ from 'lodash'
import { useFormattedMinutes } from '../lib/minutes'
import { RootStackNavigation } from '../types/rootStack'
import { useTimeCache, getMonthCacheKey } from '../stores/timeCache'
import { logger } from '../lib/logger'

type MonthScheduleSectionProps = {
  month: number
  year: number
}

export default function MonthScheduleSection(props: MonthScheduleSectionProps) {
  const { month, year } = props
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const { dayPlans, recurringPlans } = useServiceReport()
  const { goalHours } = usePublisher()
  const { getCachedPlannedMinutes, setCachedPlannedMinutes } = useTimeCache()

  const { plannedMinutes, cacheKey, planHash, needsCache } = useMemo(() => {
    const perfNow = performance.now()
    const cacheKey = getMonthCacheKey(month, year)
    const planHash = generatePlanHash(dayPlans, recurringPlans)

    const monthName = moment().month(month).format('MMMM')
    logger.log(
      `[MonthScheduleSection] ${monthName} ${year} - Checking cache (key: ${cacheKey})`
    )
    logger.log(`[MonthScheduleSection] Current plan hash: ${planHash}`)

    // Check cache first
    const cached = getCachedPlannedMinutes(cacheKey)
    if (cached && cached.planHash === planHash) {
      logger.log(
        `[MonthScheduleSection] ✅ CACHE HIT - Retrieved ${cached.plannedMinutes} minutes in ~0ms`
      )
      logger.log(
        `[MonthScheduleSection] Cache last updated: ${new Date(cached.lastUpdated).toISOString()}`
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
        `[MonthScheduleSection] ⚠️ CACHE INVALIDATED - Plan hash mismatch (cached: ${cached.planHash})`
      )
    } else {
      logger.log('[MonthScheduleSection] ❌ CACHE MISS - No cached data found')
    }

    logger.log('[MonthScheduleSection] Starting fresh calculation...')

    // Calculate using optimized function
    const minutes = calculateMonthlyPlannedMinutesOptimized(
      month,
      year,
      dayPlans,
      recurringPlans
    )

    logger.log(
      `[MonthScheduleSection] Total time: ${(performance.now() - perfNow).toFixed(2)}ms`
    )

    return {
      plannedMinutes: minutes,
      cacheKey,
      planHash,
      needsCache: true,
    }
    // eslint-disable-next-line react-compiler/react-compiler
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, year, dayPlans, recurringPlans])

  // Cache the result after render
  useEffect(() => {
    if (needsCache) {
      setCachedPlannedMinutes(cacheKey, plannedMinutes, planHash)
      logger.log(`[MonthScheduleSection] Cached result for future use`)
    }
  }, [needsCache, cacheKey, plannedMinutes, planHash, setCachedPlannedMinutes])

  const plannedMinutesWithFormat = useFormattedMinutes(plannedMinutes)

  const percentPlanned = plannedMinutes / 60 / goalHours

  const plannedMinutesToCurrentDay = useMemo(() => {
    return plannedMinutesToCurrentDayForMonth(
      month,
      year,
      dayPlans,
      recurringPlans
    )
  }, [dayPlans, month, recurringPlans, year])

  return (
    <View
      style={{
        borderTopWidth: 1,
        borderTopColor: theme.colors.border,
        paddingTop: 10,
        gap: 15,
      }}
    >
      <View style={{ gap: 10 }}>
        {plannedMinutesToCurrentDay !== 0 && (
          <View style={{ gap: 3 }}>
            <Text
              style={{
                fontFamily: theme.fonts.semiBold,
                color: theme.colors.textAlt,
                fontSize: theme.fontSize('sm'),
              }}
            >
              {i18n.t('today')}
            </Text>
            <AheadOrBehindOfMonthSchedule month={month} year={year} />
          </View>
        )}
        <View style={{ gap: 3 }}>
          <Text
            style={{
              fontFamily: theme.fonts.semiBold,
              color: theme.colors.textAlt,
              fontSize: theme.fontSize('sm'),
            }}
          >
            {i18n.t('planned')}
          </Text>
          <XView>
            <Text style={{ fontFamily: theme.fonts.semiBold }}>
              {plannedMinutesWithFormat.formatted} {i18n.t('of')}{' '}
              {_.round(goalHours, 1)} {i18n.t('hours')}
            </Text>
            <Circle
              color={
                !percentPlanned
                  ? theme.colors.textAlt
                  : percentPlanned >= 1
                    ? theme.colors.accent
                    : theme.colors.warn
              }
            />
          </XView>
          {percentPlanned < 1 && (
            <Text
              style={{
                fontSize: theme.fontSize('xs'),
                color: theme.colors.textAlt,
              }}
            >
              {i18n.t('tryToPlanAtLeast100Percent')}
            </Text>
          )}
        </View>
      </View>
      <Button
        style={{
          flexDirection: 'row',
          justifyContent: 'center',
          alignItems: 'center',
          borderColor: theme.colors.accent,
          borderWidth: 2,
          paddingVertical: 12,
          paddingHorizontal: 24,
          borderRadius: theme.numbers.borderRadiusSm,
        }}
        onPress={() =>
          navigation.navigate('PlanSchedule', {
            month,
            year,
          })
        }
      >
        <Text
          style={{
            color: theme.colors.accent,
            fontFamily: theme.fonts.semiBold,
            fontSize: theme.fontSize('sm'),
            textAlign: 'center',
          }}
        >
          {i18n.t('planSchedule')}
        </Text>
      </Button>
    </View>
  )
}
