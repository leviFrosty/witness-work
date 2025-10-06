import { useMemo, useEffect } from 'react'
import useTheme from '../contexts/theme'
import Text from './MyText'
import moment from 'moment'
import {
  adjustedMinutesForSpecificMonth,
  getMonthsReports,
  totalMinutesForSpecificMonthUpToDayOfMonth,
  calculatePlannedMinutesToCurrentDayOptimized,
  generatePlanHash,
} from '../lib/serviceReport'
import useServiceReport from '../stores/serviceReport'
import { usePreferences } from '../stores/preferences'
import i18n from '../lib/locales'
import { ThemeSizes } from '../types/theme'
import { useFormattedMinutes } from '../lib/minutes'
import { useTimeCache, getCurrentDayCacheKey } from '../stores/timeCache'
import { logger } from '../lib/logger'

type AheadOrBehindOfMonthScheduleProps = {
  month: number
  year: number
  fontSize?: ThemeSizes
}

export default function AheadOrBehindOfMonthSchedule(
  props: AheadOrBehindOfMonthScheduleProps
) {
  const { month, year } = props
  const theme = useTheme()
  const { publisher, overrideCreditLimit, customCreditLimitHours } =
    usePreferences()
  const { dayPlans, recurringPlans, serviceReports } = useServiceReport()
  const { getCachedPlannedMinutes, setCachedPlannedMinutes } = useTimeCache()

  const { plannedMinutesToCurrentDay, cacheKey, planHash, needsCache } =
    useMemo(() => {
      const perfNow = performance.now()
      const selectedMonth = moment().month(month).year(year)
      const currentDay = selectedMonth.isBefore(moment(), 'month')
        ? selectedMonth.daysInMonth()
        : moment().date()

      const cacheKey = getCurrentDayCacheKey(month, year, currentDay)
      const planHash = generatePlanHash(dayPlans, recurringPlans)

      const monthName = selectedMonth.format('MMMM')
      logger.log(
        `[AheadOrBehind] ${monthName} ${year} day ${currentDay} - Checking cache (key: ${cacheKey})`
      )
      logger.log(`[AheadOrBehind] Current plan hash: ${planHash}`)

      // Check cache first
      const cached = getCachedPlannedMinutes(cacheKey)
      if (cached && cached.planHash === planHash) {
        logger.log(
          `[AheadOrBehind] ✅ CACHE HIT - Retrieved ${cached.plannedMinutes} minutes in ~0ms`
        )
        logger.log(
          `[AheadOrBehind] Cache last updated: ${new Date(cached.lastUpdated).toISOString()}`
        )
        return {
          plannedMinutesToCurrentDay: cached.plannedMinutes,
          cacheKey,
          planHash,
          needsCache: false,
        }
      }

      if (cached) {
        logger.log(
          `[AheadOrBehind] ⚠️ CACHE INVALIDATED - Plan hash mismatch (cached: ${cached.planHash})`
        )
      } else {
        logger.log('[AheadOrBehind] ❌ CACHE MISS - No cached data found')
      }

      logger.log('[AheadOrBehind] Starting fresh calculation...')

      // Calculate using optimized function
      const minutes = calculatePlannedMinutesToCurrentDayOptimized(
        month,
        year,
        dayPlans,
        recurringPlans
      )

      logger.log(
        `[AheadOrBehind] Total time: ${(performance.now() - perfNow).toFixed(2)}ms`
      )

      return {
        plannedMinutesToCurrentDay: minutes,
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
      setCachedPlannedMinutes(cacheKey, plannedMinutesToCurrentDay, planHash)
      logger.log(`[AheadOrBehind] Cached result for future use`)
    }
  }, [
    needsCache,
    cacheKey,
    plannedMinutesToCurrentDay,
    planHash,
    setCachedPlannedMinutes,
  ])

  const monthReports = useMemo(
    () => getMonthsReports(serviceReports, month, year) ?? [],
    [month, serviceReports, year]
  )

  const actualMinutesToCurrentDay = useMemo(() => {
    const selectedMonth = moment().month(month).year(year)

    const dayOfMonth = selectedMonth.isBefore(moment(), 'month')
      ? selectedMonth.daysInMonth()
      : moment().date()

    return totalMinutesForSpecificMonthUpToDayOfMonth(
      monthReports,
      dayOfMonth,
      month,
      year
    )
  }, [month, monthReports, year])

  const adjustedMinutesForMonth = useMemo(() => {
    return adjustedMinutesForSpecificMonth(
      monthReports,
      month,
      year,
      publisher,
      { enabled: overrideCreditLimit, customLimitHours: customCreditLimitHours }
    )
  }, [
    month,
    monthReports,
    year,
    publisher,
    overrideCreditLimit,
    customCreditLimitHours,
  ])

  const minutesDiffToSchedule = useMemo(() => {
    const minutesForMonth =
      adjustedMinutesForMonth.value < actualMinutesToCurrentDay
        ? adjustedMinutesForMonth.value
        : actualMinutesToCurrentDay
    return minutesForMonth - plannedMinutesToCurrentDay
  }, [
    actualMinutesToCurrentDay,
    adjustedMinutesForMonth.value,
    plannedMinutesToCurrentDay,
  ])

  const formattedTimeDiff = useFormattedMinutes(Math.abs(minutesDiffToSchedule))

  /** Previous month has no plans or the */
  if (plannedMinutesToCurrentDay === 0) {
    return null
  }

  if (minutesDiffToSchedule === 0) {
    return (
      <Text
        style={{
          color:
            minutesDiffToSchedule >= 0
              ? theme.colors.accent
              : theme.colors.text,
          fontFamily: theme.fonts.semiBold,
          fontSize: theme.fontSize(props.fontSize ?? 'md'),
        }}
      >
        {i18n.t('onSchedule')}
      </Text>
    )
  }

  return (
    <Text
      style={{
        color:
          minutesDiffToSchedule >= 0 ? theme.colors.accent : theme.colors.error,
        fontFamily: theme.fonts.semiBold,
        fontSize: theme.fontSize(props.fontSize ?? 'md'),
        textTransform: 'lowercase',
      }}
    >
      {`${formattedTimeDiff.formatted} ${minutesDiffToSchedule > 0 ? i18n.t('aheadOfSchedule') : i18n.t('behindSchedule')}`}
    </Text>
  )
}
