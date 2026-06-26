import _ from 'lodash'
import { usePreferences } from '@/stores/preferences'
import { MinuteDisplayFormat } from '@/types/timeEntry'
import i18n from '@/lib/locales'

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
 * {@link useFormattedMinutes} is the only React entry point: a thin reader that
 * supplies the user's display preference to {@link formatMinutes}. The compact
 * variant is preference-independent, so it has no hook — call the pure function
 * directly from render.
 */

/**
 * Full Duration Format, respecting the caller-supplied display preference.
 *
 * @param totalMinutes - Duration in minutes.
 * @param format - `'decimal'` → `"1.5h"`, `'short'` → `"1h 30m"`.
 */
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
 * Hook form of {@link formatMinutes}: a thin reader that supplies the user's
 * `timeDisplayFormat` preference. No behavior of its own.
 */
export const useFormattedMinutes = (minutes: number) => {
  const { timeDisplayFormat } = usePreferences()
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
 *   formatMinutesCompact(630) // "11h"  (10+ hours rounded)
 *   formatMinutesCompact(2, { unit: 'hours' }) // "2h" (value is already hours)
 *
 * @param value - Duration in minutes, or in whole hours when `unit: 'hours'`.
 * @param options - See {@link CompactDurationOptions}.
 * @returns Ultra-compact time string (e.g., "30m", "2h", "1.5h", "12h").
 */
export const formatMinutesCompact = (
  value: number,
  options: CompactDurationOptions = {}
): string => {
  if (options.unit === 'hours') {
    return `${value}${i18n.t('hoursCompact')}`
  }

  const totalMinutes = value
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
