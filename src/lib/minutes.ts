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

export const formatMinutes = (
  totalMinutes: number,
  format: MinuteDisplayFormat
) => {
  let formatted: string
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
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
