import i18n from '@/lib/locales'
import Section from '@/components/ui/inputs/Section'
import NoteInputRow from '@/components/ui/inputs/NoteInputRow'
import type { NoteUpdate } from '@/lib/richText/notes'
import type { NoteFields } from '@/types/richText'

type Props = { note: NoteFields; onChange: (note: NoteUpdate) => void }

/** Optional note, e.g. a destination or territory. */
export default function TripNoteRow({ note, onChange }: Props) {
  return (
    <Section>
      <NoteInputRow
        label={i18n.t('note')}
        note={note}
        onChange={onChange}
        surface='trip'
        placeholder={i18n.t('mileage.notePlaceholder')}
        maxLength={500}
        lastInSection
        testID='trip-note'
      />
    </Section>
  )
}
