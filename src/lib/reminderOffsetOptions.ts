import i18n from '@/lib/locales'
import { reminderLead } from '@/lib/reminderContent'

/** The lead times the Visit and Plan forms offer for a reminder, in minutes. */
export const REMINDER_PRESET_MINUTES = [0, 5, 10, 15, 30, 60, 120, 1440]

/** The menu entry that opens the amount and unit pickers for any lead time. */
export const REMINDER_OFFSET_OTHER = 'other'

export const isReminderPreset = (minutes: number | null) =>
  minutes !== null && REMINDER_PRESET_MINUTES.includes(minutes)

/** "At the scheduled time", "30 minutes before", "1 day before". */
export function reminderOffsetLabel(minutes: number): string {
  const lead = reminderLead(new Date(minutes * 60_000), new Date(0))
  return lead
    ? i18n.t('reminderOffset_before', { lead })
    : i18n.t('reminderOffset_atTime')
}

/** The presets as menu options, then "Other…" for any other lead time. */
export function reminderOffsetOptions(): {
  label: string
  value: number | typeof REMINDER_OFFSET_OTHER
}[] {
  return [
    ...REMINDER_PRESET_MINUTES.map((value) => ({
      label: reminderOffsetLabel(value),
      value,
    })),
    {
      label: i18n.t('reminderOffset_otherLeadTime'),
      value: REMINDER_OFFSET_OTHER,
    },
  ]
}
