import { View } from 'react-native'
import { Maximize2 as Maximize2Icon } from 'lucide-react-native'
import RichNote from '@/components/RichNote'
import Button from '@/components/ui/Button'
import InputRowContainer from '@/components/ui/inputs/InputRowContainer'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import { useOpenNoteEditor } from '@/hooks/useOpenNoteEditor'
import i18n from '@/lib/locales'
import type { NoteSurface } from '@/lib/richText/noteEditorSession'
import {
  getNoteDoc,
  getNoteText,
  hasNote,
  noteFields,
  type NoteUpdate,
} from '@/lib/richText/notes'
import type { NoteFields } from '@/types/richText'

const PREVIEW_LINES = 6

const NoteInputRow = (props: {
  label: string
  note: NoteFields
  onChange: (note: NoteUpdate) => void
  surface: NoteSurface
  placeholder: string
  description?: string
  info?: string
  lastInSection?: boolean
  maxLength?: number
  allowImages?: boolean
  testID?: string
}) => {
  const theme = useTheme()
  const openEditor = useOpenNoteEditor()
  const filled = hasNote(props.note)
  const open = () =>
    openEditor({
      surface: props.surface,
      doc: getNoteDoc(props.note),
      title: props.label,
      placeholder: props.placeholder,
      characterLimit: props.maxLength,
      allowImages: props.allowImages ?? true,
      onChange: (doc) => props.onChange(noteFields(doc)),
    })

  return (
    <InputRowContainer
      label={props.label}
      description={props.description}
      info={props.info}
      lastInSection={props.lastInSection}
      controlWidth='full'
      onLabelPress={open}
    >
      <Button
        noTransform
        onPress={open}
        accessibilityRole='button'
        accessibilityLabel={props.label}
        accessibilityValue={{
          text: (filled && getNoteText(props.note)) || props.placeholder,
        }}
        accessibilityHint={i18n.t('richText_editHint')}
        testID={props.testID}
        style={{
          flex: 1,
          minHeight: 88,
          flexDirection: 'row',
          gap: 8,
          borderWidth: 1,
          borderColor: theme.colors.border,
          borderRadius: theme.numbers.borderRadiusMd,
          backgroundColor: theme.colors.background,
          paddingHorizontal: 12,
          paddingVertical: 10,
        }}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          {filled ? (
            <RichNote
              note={props.note}
              numberOfLines={PREVIEW_LINES}
              interactive={false}
              linkCards={false}
              thumbnails
            />
          ) : (
            <Text style={{ color: theme.colors.textAlt }}>
              {props.placeholder}
            </Text>
          )}
        </View>
        <LucideIcon
          icon={Maximize2Icon}
          size={14}
          color={theme.colors.textAlt}
          style={{ marginTop: 3 }}
        />
      </Button>
    </InputRowContainer>
  )
}

export default NoteInputRow
