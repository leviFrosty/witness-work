import { formatMinutes } from '@/lib/minutes'
import i18n from '@/lib/locales'
import type { MinuteDisplayFormat } from '@/types/timeEntry'

export const formatNeededMinutes = (
  minutes: number,
  format: MinuteDisplayFormat
) =>
  formatMinutes(
    format === 'decimal' ? Math.ceil(minutes / 6) * 6 : Math.ceil(minutes),
    format
  ).formatted

export const formatGoalHours = (goalMinutes: number) =>
  i18n.t('hoursShort', { count: Math.round((goalMinutes / 60) * 10) / 10 })
