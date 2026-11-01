import round from 'lodash/round'
import { usePreferences } from '@/stores/preferences'
import { MinuteDisplayFormat } from '@/types/timeEntry'
import i18n, { type TranslationKey } from '@/lib/locales'
import { formatPlainNumber } from '@/lib/numbers'

export const formatMinutes = (
  totalMinutes: number,
  format: MinuteDisplayFormat
) => {
  let formatted: string

  const wholeMinutes = round(totalMinutes, 0)

  const sign = wholeMinutes < 0 ? -1 : 1
  const magnitude = Math.abs(wholeMinutes)
  const absHours = Math.floor(magnitude / 60)
  const absMinutes = magnitude % 60
  const absDecimalHours = round(magnitude / 60, 1)

  switch (format) {
    case 'decimal': {
      formatted = `${i18n.t('hoursShort', { count: absDecimalHours })}`
      break
    }
    case 'short':
      formatted = i18n.t('hoursAndMinutesShort', {
        hours: i18n.t('hoursShort', { count: absHours }),

        minutes: i18n.t('minutesShort', { count: absMinutes }),
      })
  }

  return {
    formatted: sign < 0 ? `−${formatted}` : formatted,

    minutes: sign * absMinutes + 0,
    hours: sign * absHours + 0,
    decimalHours: sign * absDecimalHours + 0,
  }
}

export const useFormattedMinutes = (minutes: number) => {
  const timeDisplayFormat = usePreferences((s) => s.timeDisplayFormat)
  return formatMinutes(minutes, timeDisplayFormat)
}

export type CompactDurationOptions = {
  unit?: 'minutes' | 'hours'
}

export const formatMinutesCompact = (
  value: number,
  options: CompactDurationOptions = {}
): string => {
  if (options.unit === 'hours') {
    return `${formatPlainNumber(value)}${i18n.t('hoursCompact')}`
  }

  const totalMinutes = round(value, 0)
  if (totalMinutes === 0) return ''

  const decimalHours = totalMinutes / 60

  if (totalMinutes < 60) {
    return `${formatPlainNumber(totalMinutes)}${i18n.t('minutesCompact')}`
  }

  if (totalMinutes % 60 === 0) {
    const hours = Math.floor(decimalHours)
    return `${formatPlainNumber(hours)}${i18n.t('hoursCompact')}`
  }

  return `${formatPlainNumber(Math.round(decimalHours * 10) / 10)}${i18n.t('hoursCompact')}`
}

type SpokenUnit = 'hours' | 'minutes' | 'seconds'

const spokenDuration = (
  totalSeconds: number,
  smallest: SpokenUnit,
  zero: SpokenUnit
) => {
  const magnitude = Math.abs(totalSeconds)
  const counts: [SpokenUnit, number][] = [
    ['hours', Math.floor(magnitude / 3600)],
    ['minutes', Math.floor(magnitude / 60) % 60],
    ['seconds', magnitude % 60],
  ]
  const units = counts.slice(0, smallest === 'seconds' ? 3 : 2)
  const shown = units.filter(([, count]) => count > 0)
  const spoken = (shown.length ? shown : [[zero, 0] as const])
    .map(([unit, count]) =>
      i18n.t(`durationSpoken.${unit}` as TranslationKey, { count })
    )
    .join(' ')
  return totalSeconds < 0 ? `−${spoken}` : spoken
}

export const formatMinutesSpoken = (totalMinutes: number): string =>
  spokenDuration(round(totalMinutes, 0) * 60, 'minutes', 'hours')

export const formatSecondsSpoken = (totalSeconds: number): string =>
  spokenDuration(Math.trunc(totalSeconds), 'seconds', 'seconds')
