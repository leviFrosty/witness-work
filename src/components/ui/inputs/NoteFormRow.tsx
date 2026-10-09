import { NotebookPen as NotebookPenIcon } from 'lucide-react-native'
import RichNote from '@/components/RichNote'
import FormRow, {
  FormRowAddBadge,
  FormRowDisclosure,
  FormRowLabel,
} from '@/components/ui/inputs/FormRow'
import useTheme from '@/contexts/theme'
import { useOpenNoteEditor } from '@/hooks/useOpenNoteEditor'
import i18n from '@/lib/locales'
import type { NoteSurface } from '@/lib/richText/noteEditorSession'
import {
  getNoteDoc,
  hasNote,
  noteFields,
  type NoteUpdate,
} from '@/lib/richText/notes'
import type { NoteFields } from '@/types/richText'

/**
 * A docked form's Note: a "+" row that opens the note editor, and shows the
 * start of the note once there is one.
 */
const NoteFormRow = (props: {
  note: NoteFields
  onChange: (note: NoteUpdate) => void
  surface: NoteSurface
  first?: boolean
  /** Most characters of text the note may hold. */
  maxLength?: number
  allowImages?: boolean
  /** Prefixes the row's testIDs, e.g. `plan-note-row`. */
  testID: string
}) => {
  const theme = useTheme()
  const openEditor = useOpenNoteEditor()
  const filled = hasNote(props.note)

  return (
    <FormRow
      icon={NotebookPenIcon}
      first={props.first}
      onPress={() =>
        openEditor({
          surface: props.surface,
          doc: getNoteDoc(props.note),
          title: i18n.t('note'),
          placeholder: i18n.t('optional'),
          characterLimit: props.maxLength,
          allowImages: props.allowImages ?? true,
          onChange: (doc) => props.onChange(noteFields(doc)),
        })
      }
      accessibilityLabel={i18n.t('note')}
      testID={`${props.testID}-row`}
      trailing={filled ? <FormRowDisclosure /> : <FormRowAddBadge />}
    >
      {filled ? (
        <RichNote
          note={props.note}
          numberOfLines={3}
          interactive={false}
          linkCards={false}
          thumbnails
          style={{ paddingVertical: 8, color: theme.colors.text }}
        />
      ) : (
        <FormRowLabel>{i18n.t('note')}</FormRowLabel>
      )}
    </FormRow>
  )
}

export default NoteFormRow
