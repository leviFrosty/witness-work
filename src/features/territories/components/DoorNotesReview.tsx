import { View } from 'react-native'
import { Ban as BanIcon } from 'lucide-react-native'
import ActionButton from '@/components/ui/ActionButton'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import DoorNotesProblems from '@/features/territories/components/DoorNotesProblems'
import DoorNotesReaderNote from '@/features/territories/components/DoorNotesReaderNote'
import DoorNotesSaveOptions from '@/features/territories/components/DoorNotesSaveOptions'
import DoorNotesStreetGroup from '@/features/territories/components/DoorNotesStreetGroup'
import {
  noteDoorCount,
  notesAuthorReady,
  type NotesAuthor,
} from '@/features/territories/lib/addFromNotes'
import {
  entriesWithoutStreet,
  groupNoteEntries,
  readyNoteDoors,
} from '@/features/territories/lib/noteReview'
import type {
  NoteEntry,
  NoteProblem,
} from '@/features/territories/lib/parseDoorNotes'
import type { NotesReader } from '@/features/territories/lib/scribeNotes'
import type {
  Territory,
  TerritoryStreet,
} from '@/features/territories/types/territory'

export default function DoorNotesReview({
  territory,
  reader,
  entries,
  problems,
  date,
  author,
  onChangeEntry,
  onRemoveEntry,
  onChooseStreet,
  onAddProblem,
  onDismissProblem,
  onChangeDate,
  onChangeAuthor,
  onSave,
}: {
  territory: Territory
  reader: NotesReader
  entries: readonly NoteEntry[]
  problems: readonly NoteProblem[]
  date: Date
  author: NotesAuthor
  onChangeEntry: (
    key: string,
    change: Partial<Pick<NoteEntry, 'label' | 'outcome'>>
  ) => void
  onRemoveEntry: (key: string) => void
  onChooseStreet: (groupKey: string, street: TerritoryStreet) => void
  onAddProblem: (problem: NoteProblem) => void
  onDismissProblem: (problem: NoteProblem) => void
  onChangeDate: (date: Date) => void
  onChangeAuthor: (author: NotesAuthor) => void
  onSave: () => void
}) {
  const theme = useTheme()
  const ready = readyNoteDoors(entries)
  const doNotCalls = noteDoorCount(ready, 'doNotCall')
  const missingStreet = entriesWithoutStreet(entries)

  return (
    <View style={{ gap: 24 }}>
      <DoorNotesReaderNote reader={reader} />
      {groupNoteEntries(entries).map((group) => (
        <DoorNotesStreetGroup
          key={group.key}
          group={group}
          entries={entries}
          territory={territory}
          savedAt={date.getTime()}
          onChange={onChangeEntry}
          onRemove={onRemoveEntry}
          onChooseStreet={(street) => onChooseStreet(group.key, street)}
        />
      ))}

      <DoorNotesProblems
        problems={problems}
        onAdd={onAddProblem}
        onDismiss={onDismissProblem}
      />

      <DoorNotesSaveOptions
        date={date}
        onChangeDate={onChangeDate}
        author={author}
        onChangeAuthor={onChangeAuthor}
        people={territory.people ?? []}
      />

      <View style={{ gap: 12 }}>
        {doNotCalls > 0 && (
          <View
            testID='notes-dnc-summary'
            style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: 8,
              paddingHorizontal: 5,
            }}
          >
            <LucideIcon
              icon={BanIcon}
              size={18}
              color={theme.colors.error}
              style={{ marginTop: 1 }}
            />
            <Text
              style={{
                flex: 1,
                color: theme.colors.error,
                fontFamily: theme.fonts.semiBold,
              }}
            >
              {i18n.t('territories.notes.doNotCallsAdded', {
                count: doNotCalls,
              })}
            </Text>
          </View>
        )}
        {missingStreet > 0 && (
          <Text
            testID='notes-need-street'
            style={{ color: theme.colors.textAlt, paddingHorizontal: 5 }}
          >
            {i18n.t('territories.notes.needStreet', { count: missingStreet })}
          </Text>
        )}
        <ActionButton
          disabled={
            ready.length === 0 || missingStreet > 0 || !notesAuthorReady(author)
          }
          onPress={onSave}
          testID='notes-save'
        >
          {i18n.t('territories.notes.save', {
            count: Math.max(ready.length, 1),
          })}
        </ActionButton>
      </View>
    </View>
  )
}
