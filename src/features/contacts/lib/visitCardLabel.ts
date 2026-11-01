import i18n from '@/lib/locales'
import type { VisitOutcome } from '@/features/contacts/lib/visitTimeline'

export const visitCardAccessibilityLabel = ({
  day,
  time,
  outcome,
  note,
  fields,
}: {
  day: string
  time: string

  outcome: VisitOutcome

  note: string

  fields: { label: string; value: string }[]
}): string =>
  [
    day,
    time,
    outcome === 'study' && i18n.t('bibleStudy'),

    note.trim() ||
      (outcome === 'notAtHome' && i18n.t('contactDetails.noOneAnswered')),
    ...fields.map(
      (field) =>
        `${i18n.t('customFieldLabel', { label: field.label })} ${field.value}`
    ),
  ]
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .filter(Boolean)
    .join(', ')
