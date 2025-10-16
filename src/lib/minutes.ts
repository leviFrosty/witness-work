import _ from 'lodash'
import { usePreferences } from '../stores/preferences'
import { MinuteDisplayFormat } from '../types/serviceReport'
import i18n from './locales'

/**
 * Formats minutes for display based on user preference.
 *
 * @example
 *   const formattedTime = formatMinute(minutes, preference)
 *
 *   return (<View>
 *   <Text>{formattedTime.long}</Text>
 *   <Text>{formattedTime.short}</Text>
 *   </View>)
 */
export const useFormattedMinutes = (minutes: number) => {
  const { timeDisplayFormat } = usePreferences()
  return formatMinutes(minutes, timeDisplayFormat)
}

/**
 * Formats minutes for ultra-compact display in space-constrained UI elements.
 * Prioritizes fitting over verbose formatting.
 *
 * @example
 *   const compactTime = useCompactFormattedMinutes(90) // "1.5h"
 *   const compactTime = useCompactFormattedMinutes(30) // "30m"
 *   const compactTime = useCompactFormattedMinutes(120) // "2h"
 */
export const useCompactFormattedMinutes = (minutes: number) => {
  return formatMinutesCompact(minutes)
}

export const formatMinutes = (
  totalMinutes: number,
  format: MinuteDisplayFormat
) => {
  let formatted: string
  const hours = Math.floor(totalMinutes / 60)
  const minutes = _.round(totalMinutes % 60, 0)
  const decimalHours = _.round(totalMinutes / 60, 1)

  switch (format) {
    case 'decimal': {
      // @ts-expect-error TranslationKey doesn't handle keys that contain objects.
      formatted = `${i18n.t('hoursShort', { count: decimalHours })}`
      break
    }
    // case 'long':
    //   // @ts-expect-error TranslationKey doesn't handle keys that contain objects.
    //   formatted = `${i18n.t('hoursLong', { count: hours })} ${i18n.t('minutesLong', { count: minutes })}`
    //   break
    case 'short':
      // @ts-expect-error TranslationKey doesn't handle keys that contain objects.
      formatted = `${i18n.t('hoursShort', { count: hours })} ${i18n.t('minutesShort', { count: minutes })}`
  }

  return {
    formatted,
    minutes,
    hours,
    decimalHours,
  }
}

/**
 * Formats minutes into ultra-compact string for space-constrained UI elements.
 *
 * @example
 *   formatMinutesCompact(30) // "30m" (under 1 hour)
 *   formatMinutesCompact(120) // "2h"   (whole hours)
 *   formatMinutesCompact(90) // "1.5h" (fractional hours)
 *   formatMinutesCompact(630) // "11h"  (10+ hours rounded)
 *
 * @param totalMinutes - Total minutes to format
 * @returns Ultra-compact time string (e.g., "30m", "2h", "1.5h", "12h")
 */
export const formatMinutesCompact = (totalMinutes: number): string => {
  if (totalMinutes === 0) return ''

  const decimalHours = totalMinutes / 60

  // For times under 1 hour, show minutes with localized abbreviation (e.g., "30m")
  if (totalMinutes < 60) {
    return `${totalMinutes}${i18n.t('minutesCompact')}`
  }

  // For whole hours, show number with localized abbreviation (e.g., "2h")
  if (totalMinutes % 60 === 0) {
    const hours = Math.floor(decimalHours)
    return `${hours}${i18n.t('hoursCompact')}`
  }

  // For fractional hours, show 1 decimal place with localized abbreviation (e.g., "2.5h")
  // For very long times (10+), round to whole hours to save space
  if (decimalHours >= 10) {
    return `${Math.round(decimalHours)}${i18n.t('hoursCompact')}`
  }

  return `${Math.round(decimalHours * 10) / 10}${i18n.t('hoursCompact')}`
}
