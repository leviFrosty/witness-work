import { formatMinutes } from '@/lib/minutes'
import i18n from '@/lib/locales'
import type { MinuteDisplayFormat } from '@/types/timeEntry'

/**
 * A time still needed, rounded up to what the format can show (a tenth of an
 * hour, or a minute), so following the figure is always enough.
 */
export const formatNeededMinutes = (
  minutes: number,
  format: MinuteDisplayFormat
) =>
  formatMinutes(
    format === 'decimal' ? Math.ceil(minutes / 6) * 6 : Math.ceil(minutes),
    format
  ).formatted

/** A goal in whole hours as the User set it, e.g. "50h". */
export const formatGoalHours = (goalMinutes: number) =>
  // @ts-expect-error TranslationKey doesn't handle keys that contain objects.
  i18n.t('hoursShort', { count: Math.round((goalMinutes / 60) * 10) / 10 })
