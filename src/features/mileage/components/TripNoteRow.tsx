import i18n from '@/lib/locales'
import Section from '@/components/ui/inputs/Section'
import NoteInputRow from '@/components/ui/inputs/NoteInputRow'
import type { NoteUpdate } from '@/lib/richText/notes'
import { tripNoteSharing } from '@/features/mileage/lib/tripNoteSharing'
import type { NoteFields } from '@/types/richText'

type Props = {
  note: NoteFields
  onChange: (note: NoteUpdate) => void
  /**
   * On a Shared Car: how many others are on it, who see the note. No photos can
   * be added there (`tripNoteSharing`).
   */
  sharedWith?: number
}

/** Optional note, e.g. a destination or territory. */
export default function TripNoteRow({ note, onChange, sharedWith }: Props) {
  const { allowImages, description } = tripNoteSharing(note, sharedWith)

  return (
    <Section>
      <NoteInputRow
        label={i18n.t('note')}
        note={note}
        onChange={onChange}
        surface='trip'
        placeholder={i18n.t('mileage.notePlaceholder')}
        description={description}
        allowImages={allowImages}
        maxLength={500}
        lastInSection
        testID='trip-note'
      />
    </Section>
  )
}
