import i18n from '@/lib/locales'
import type { VisitOutcome } from '@/features/contacts/lib/visitTimeline'

/**
 * One screen-reader label for a visit card on the Contact Details timeline:
 * everything the card and its rail marker show, in reading order. The card is a
 * single accessible element, so its label replaces the text inside it.
 */
export const visitCardAccessibilityLabel = ({
  day,
  time,
  outcome,
  note,
  fields,
}: {
  day: string
  time: string
  /** The rail marker beside the card. */
  outcome: VisitOutcome
  /** The note as plain text; empty when the visit has none. */
  note: string
  /** Filled-in custom fields, with their labels. */
  fields: { label: string; value: string }[]
}): string =>
  [
    day,
    time,
    outcome === 'study' && i18n.t('bibleStudy'),
    // Like the card: a note when there is one, else Not at Home's line.
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
