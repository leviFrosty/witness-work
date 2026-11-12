import { NotebookPen as NotebookPenIcon } from 'lucide-react-native'
import RichNote from '@/components/RichNote'
import InlineNoteEditor from '@/components/richText/editor/InlineNoteEditor'
import FormRow, {
  FormRowAddBadge,
  FormRowDisclosure,
  FormRowLabel,
} from '@/components/ui/inputs/FormRow'
import useTheme from '@/contexts/theme'
import useNoteEditorMode from '@/hooks/useNoteEditorMode'
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

const NoteFormRow = (props: {
  note: NoteFields
  onChange: (note: NoteUpdate) => void
  surface: NoteSurface
  first?: boolean

  maxLength?: number
  allowImages?: boolean

  label?: string

  placeholder?: string

  testID: string
}) => {
  const theme = useTheme()
  const openEditor = useOpenNoteEditor()
  const mode = useNoteEditorMode()
  const filled = hasNote(props.note)
  const label = props.label ?? i18n.t('note')
  const placeholder = props.placeholder ?? i18n.t('optional')

  if (mode === 'inline') {
    return (
      <FormRow
        icon={NotebookPenIcon}
        first={props.first}
        testID={`${props.testID}-row`}
        expanded={
          <InlineNoteEditor
            note={props.note}
            onChange={props.onChange}
            surface={props.surface}
            label={label}
            placeholder={placeholder}
            maxLength={props.maxLength}
            allowImages={props.allowImages}
            testID={props.testID}
          />
        }
      >
        <FormRowLabel>{label}</FormRowLabel>
      </FormRow>
    )
  }

  return (
    <FormRow
      icon={NotebookPenIcon}
      first={props.first}
      onPress={() =>
        openEditor({
          surface: props.surface,
          doc: getNoteDoc(props.note),
          title: label,
          placeholder,
          characterLimit: props.maxLength,
          allowImages: props.allowImages ?? true,
          onChange: (doc) => props.onChange(noteFields(doc)),
        })
      }
      accessibilityLabel={label}
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
        <FormRowLabel>{label}</FormRowLabel>
      )}
    </FormRow>
  )
}

export default NoteFormRow
