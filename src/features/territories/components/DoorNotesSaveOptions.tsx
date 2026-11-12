import { View } from 'react-native'
import DateTimePicker from '@/components/ui/DateTimePicker'
import InputRowContainer from '@/components/ui/inputs/InputRowContainer'
import Section from '@/components/ui/inputs/Section'
import TextInputRow from '@/components/ui/inputs/TextInputRow'
import i18n from '@/lib/locales'
import DoorNotesAuthorChip from '@/features/territories/components/DoorNotesAuthorChip'
import type { NotesAuthor } from '@/features/territories/lib/addFromNotes'
import type { TerritoryPerson } from '@/features/territories/types/territory'

export default function DoorNotesSaveOptions({
  date,
  onChangeDate,
  author,
  onChangeAuthor,
  people,
}: {
  date: Date
  onChangeDate: (date: Date) => void
  author: NotesAuthor
  onChangeAuthor: (author: NotesAuthor) => void
  people: readonly TerritoryPerson[]
}) {
  const other = author.kind === 'other'
  return (
    <Section>
      <InputRowContainer
        label={i18n.t('territories.notes.when')}
        controlStyle={{ alignItems: 'flex-end' }}
      >
        <DateTimePicker
          value={date}
          maximumDate={new Date()}
          onChange={(_event, value) => value && onChangeDate(value)}
          testID='notes-date'
        />
      </InputRowContainer>
      <InputRowContainer
        label={i18n.t('territories.notes.who')}
        info={i18n.t('territories.notes.who_info')}
        controlWidth='full'
        lastInSection={!other}
      >
        <View
          accessibilityRole='radiogroup'
          style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}
        >
          <DoorNotesAuthorChip
            label={i18n.t('territories.notes.whoMe')}
            picked={author.kind === 'me'}
            onPress={() => onChangeAuthor({ kind: 'me' })}
            testID='notes-author-me'
          />
          {people.map((person) => (
            <DoorNotesAuthorChip
              key={person.id}
              label={person.name}
              picked={author.kind === 'person' && author.personId === person.id}
              onPress={() =>
                onChangeAuthor({ kind: 'person', personId: person.id })
              }
              testID={`notes-person-${person.id}`}
            />
          ))}
          <DoorNotesAuthorChip
            label={i18n.t('territories.notes.whoSomeoneElse')}
            picked={other}
            onPress={() =>
              !other && onChangeAuthor({ kind: 'other', name: '' })
            }
            testID='notes-author-other'
          />
        </View>
      </InputRowContainer>
      {other && (
        <TextInputRow
          label={i18n.t('territories.notes.whoName')}
          lastInSection
          textInputProps={{
            value: author.name,
            onChangeText: (name) => onChangeAuthor({ kind: 'other', name }),
            placeholder: i18n.t('territories.notes.whoName_placeholder'),
            autoCapitalize: 'words',
            autoCorrect: false,
            autoFocus: true,
            maxLength: 40,
            testID: 'notes-recorded-by',
          }}
        />
      )}
    </Section>
  )
}
