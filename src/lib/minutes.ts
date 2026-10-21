import round from 'lodash/round'
import { usePreferences } from '@/stores/preferences'
import { MinuteDisplayFormat } from '@/types/timeEntry'
import i18n, { type TranslationKey } from '@/lib/locales'
import { formatPlainNumber } from '@/lib/numbers'

/**
 * Duration Format — the single module for rendering a length-of-time as text
 * (CONTEXT.md term). Two real behaviors live here, nothing else:
 *
 * 1. {@link formatMinutes} — full, preference-aware Duration Format. Returns a
 *    localized `formatted` string (respecting the user's `MinuteDisplayFormat`)
 *    plus the raw `hours` / `minutes` / `decimalHours` breakdown.
 * 2. {@link formatMinutesCompact} — ultra-compact, single-token Duration Format
 *    ("30m" / "2h" / "1.5h") for space-constrained UI (calendar squares,
 *    contribution-graph tooltips, widgets).
 *
 * {@link formatMinutesSpoken} and {@link formatSecondsSpoken} are the
 * screen-reader counterparts: whole unit words for accessibility labels, never
 * shown on screen.
 *
 * {@link useFormattedMinutes} is the only React entry point: a thin reader that
 * supplies the user's display preference to {@link formatMinutes}. The compact
 * variant is preference-independent, so it has no hook — call the pure function
 * directly from render.
 */

/**
 * Full Duration Format, respecting the caller-supplied display preference.
 *
 * @param totalMinutes - Duration in minutes; fractions round to the nearest
 *   whole minute before formatting.
 * @param format - `'decimal'` → `"1.5h"`, `'short'` → `"1h 30m"`.
 */
export const formatMinutes = (
  totalMinutes: number,
  format: MinuteDisplayFormat
) => {
  let formatted: string
  // Round to a whole minute once, then derive every format from that, so a
  // fraction like 59.6 carries into the hour ("1h 0m", not "0h 60m") and both
  // formats describe the same duration.
  const wholeMinutes = round(totalMinutes, 0)
  // A negative duration (a Time Rollover's taken-back entry) splits its
  // magnitude, so -90 is "−1h 30m" rather than floor's "-2h -30m"; every part
  // carries the sign.
  const sign = wholeMinutes < 0 ? -1 : 1
  const magnitude = Math.abs(wholeMinutes)
  const absHours = Math.floor(magnitude / 60)
  const absMinutes = magnitude % 60
  const absDecimalHours = round(magnitude / 60, 1)

  switch (format) {
    case 'decimal': {
      // @ts-expect-error TranslationKey doesn't handle keys that contain objects.
      formatted = `${i18n.t('hoursShort', { count: absDecimalHours })}`
      break
    }
    case 'short':
      formatted = i18n.t('hoursAndMinutesShort', {
        // @ts-expect-error TranslationKey doesn't handle keys that contain objects.
        hours: i18n.t('hoursShort', { count: absHours }),
        // @ts-expect-error TranslationKey doesn't handle keys that contain objects.
        minutes: i18n.t('minutesShort', { count: absMinutes }),
      })
  }

  return {
    formatted: sign < 0 ? `−${formatted}` : formatted,
    // `+ 0` folds -0 into 0 for whole-hour or sub-hour negatives.
    minutes: sign * absMinutes + 0,
    hours: sign * absHours + 0,
    decimalHours: sign * absDecimalHours + 0,
  }
}

/**
 * Hook form of {@link formatMinutes}: a thin reader that supplies the user's
 * `timeDisplayFormat` preference. No behavior of its own.
 */
export const useFormattedMinutes = (minutes: number) => {
  const timeDisplayFormat = usePreferences((s) => s.timeDisplayFormat)
  return formatMinutes(minutes, timeDisplayFormat)
}

/** Options for {@link formatMinutesCompact}. */
export type CompactDurationOptions = {
  /**
   * Unit of the input `value`. The default (`'minutes'`) runs the full compact
   * rounding logic. `'hours'` treats `value` as a whole-hour count and renders
   * it verbatim with the localized hour abbreviation (e.g. `2` → `"2h"`, `0` →
   * `"0h"`) — note this still emits a token for zero, unlike the minutes path
   * which collapses zero to an empty string.
   */
  unit?: 'minutes' | 'hours'
}

/**
 * Ultra-compact, single-token Duration Format for space-constrained UI.
 *
 * @example
 *   formatMinutesCompact(0) // ""    (zero collapses)
 *   formatMinutesCompact(30) // "30m" (under 1 hour)
 *   formatMinutesCompact(120) // "2h"   (whole hours)
 *   formatMinutesCompact(90) // "1.5h" (fractional hours)
 *   formatMinutesCompact(690) // "11.5h"
 *   formatMinutesCompact(2, { unit: 'hours' }) // "2h" (value is already hours)
 *
 * @param value - Duration in minutes (rounded to the nearest whole minute), or
 *   in whole hours when `unit: 'hours'`.
 * @param options - See {@link CompactDurationOptions}.
 * @returns Ultra-compact time string (e.g., "30m", "2h", "1.5h", "11.5h").
 */
export const formatMinutesCompact = (
  value: number,
  options: CompactDurationOptions = {}
): string => {
  if (options.unit === 'hours') {
    return `${formatPlainNumber(value)}${i18n.t('hoursCompact')}`
  }

  // Whole minutes only, so a fraction like 59.6 reads "1h", not "59.6m".
  const totalMinutes = round(value, 0)
  if (totalMinutes === 0) return ''

  const decimalHours = totalMinutes / 60

  // For times under 1 hour, show minutes with localized abbreviation (e.g., "30m")
  if (totalMinutes < 60) {
    return `${formatPlainNumber(totalMinutes)}${i18n.t('minutesCompact')}`
  }

  // For whole hours, show number with localized abbreviation (e.g., "2h")
  if (totalMinutes % 60 === 0) {
    const hours = Math.floor(decimalHours)
    return `${formatPlainNumber(hours)}${i18n.t('hoursCompact')}`
  }

  // For fractional hours, show 1 decimal place with localized abbreviation
  // (e.g., "2.5h", "11.5h"). Long days keep the decimal too, so a calendar
  // square agrees with the day's "X of Y planned" total.
  return `${formatPlainNumber(Math.round(decimalHours * 10) / 10)}${i18n.t('hoursCompact')}`
}

type SpokenUnit = 'hours' | 'minutes' | 'seconds'

/**
 * @param zero - The unit nothing is counted in: hours beside goals and totals,
 *   seconds on a timer.
 */
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

/**
 * Spoken Duration Format for screen-reader labels: whole unit words in place of
 * the on-screen abbreviations, so "6h / 50h" isn't read as "6 h slash 50 h" and
 * "30m" isn't heard as meters. Preference-independent, like the compact
 * variant, since nobody sees it.
 *
 * @example
 *   formatMinutesSpoken(0) // "0 hours"
 *   formatMinutesSpoken(30) // "30 minutes"
 *   formatMinutesSpoken(60) // "1 hour"
 *   formatMinutesSpoken(390) // "6 hours 30 minutes"
 *
 * @param totalMinutes - Duration in minutes, rounded to the nearest whole
 *   minute.
 */
export const formatMinutesSpoken = (totalMinutes: number): string =>
  spokenDuration(round(totalMinutes, 0) * 60, 'minutes', 'hours')

/**
 * {@link formatMinutesSpoken} down to the second, for a running timer.
 *
 * @example
 *   formatSecondsSpoken(0) // "0 seconds"
 *   formatSecondsSpoken(725) // "12 minutes 5 seconds"
 *   formatSecondsSpoken(3600) // "1 hour"
 *
 * @param totalSeconds - Duration in seconds; fractions are dropped.
 */
export const formatSecondsSpoken = (totalSeconds: number): string =>
  spokenDuration(Math.trunc(totalSeconds), 'seconds', 'seconds')
