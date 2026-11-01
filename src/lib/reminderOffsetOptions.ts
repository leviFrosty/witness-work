import i18n from '@/lib/locales'
import { reminderLead } from '@/lib/reminderContent'

export const REMINDER_PRESET_MINUTES = [0, 5, 10, 15, 30, 60, 120, 1440]

export const REMINDER_OFFSET_OTHER = 'other'

export const isReminderPreset = (minutes: number | null) =>
  minutes !== null && REMINDER_PRESET_MINUTES.includes(minutes)

export function reminderOffsetLabel(minutes: number): string {
  const lead = reminderLead(new Date(minutes * 60_000), new Date(0))
  return lead
    ? i18n.t('reminderOffset_before', { lead })
    : i18n.t('reminderOffset_atTime')
}

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
