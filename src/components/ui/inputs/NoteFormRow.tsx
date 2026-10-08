import { useRef, useState } from 'react'
import { Keyboard } from 'react-native'
import type { InputRef } from 'tamagui'
import { NotebookPen as NotebookPenIcon } from 'lucide-react-native'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import TextInput from '@/components/ui/TextInput'
import FormRow, {
  FORM_ROW_MIN_HEIGHT,
  FORM_ROW_PADDING_X,
  FormRowAddBadge,
  FormRowChevron,
  FormRowLabel,
  formRowInputStyle,
} from '@/components/ui/inputs/FormRow'
import { useDockedFormLayout } from '@/components/ui/layout/DockedFormLayout'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'

const NOTE_MAX_HEIGHT = 184

/**
 * A docked form's Note: a "+" row that opens into a multiline field with the
 * cursor in it, and shows the start of the note once it's closed.
 */
const NoteFormRow = (props: {
  note: string
  setNote: (note: string) => void
  first?: boolean
  maxLength?: number
  /** Prefixes the row's testIDs, e.g. `plan-note-row`. */
  testID: string
}) => {
  const theme = useTheme()
  const layout = useDockedFormLayout()
  const [open, setOpen] = useState(false)
  const [focused, setFocused] = useState(false)
  const input = useRef<InputRef>(null)
  // Opening the row is how the note gets added, so the cursor goes in it.
  // Focusing waits for the field's first layout: Android drops the keyboard
  // request for a field that isn't attached yet.
  const focusOnLayout = useRef(false)

  if (open) {
    return (
      <FormRow
        icon={NotebookPenIcon}
        first={props.first}
        trailing={
          // Return adds a line in a note, and a full keyboard covers the
          // dock, so Done is the way out while typing.
          focused ? (
            <Button
              noTransform
              onPress={() => {
                Keyboard.dismiss()
                if (!props.note) setOpen(false)
              }}
              accessibilityRole='button'
              // Set explicitly: Android otherwise keeps the label of the Note
              // button this one replaces.
              accessibilityLabel={i18n.t('done')}
              testID={`${props.testID}-done`}
              style={{
                height: FORM_ROW_MIN_HEIGHT,
                paddingHorizontal: FORM_ROW_PADDING_X,
                marginRight: -FORM_ROW_PADDING_X,
                justifyContent: 'center',
              }}
            >
              <Text
                style={{
                  color: theme.colors.accent,
                  fontFamily: theme.fonts.semiBold,
                }}
              >
                {i18n.t('done')}
              </Text>
            </Button>
          ) : (
            <Button
              noTransform
              onPress={() => setOpen(false)}
              accessibilityRole='button'
              accessibilityLabel={i18n.t('note')}
              accessibilityState={{ expanded: true }}
              style={{
                width: 44,
                height: FORM_ROW_MIN_HEIGHT,
                marginRight: -FORM_ROW_PADDING_X,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <FormRowChevron open />
            </Button>
          )
        }
      >
        <TextInput
          ref={input}
          multiline
          value={props.note}
          onChangeText={props.setNote}
          maxLength={props.maxLength}
          onFocus={() => {
            setFocused(true)
            layout.fieldFocused()
          }}
          onBlur={() => setFocused(false)}
          onLayout={() => {
            if (!focusOnLayout.current) return
            focusOnLayout.current = false
            requestAnimationFrame(() => input.current?.focus())
          }}
          placeholder={i18n.t('optional')}
          placeholderTextColor={theme.colors.textAlt}
          accessibilityLabel={i18n.t('note')}
          testID={`${props.testID}-input`}
          textAlign='left'
          textAlignVertical='top'
          // Past a few lines the note scrolls inside itself, which keeps the
          // caret in view; a field taller than the space above the keyboard
          // can't be.
          style={{
            ...formRowInputStyle,
            minHeight: 88,
            maxHeight: NOTE_MAX_HEIGHT,
            paddingVertical: 14,
          }}
        />
      </FormRow>
    )
  }

  return (
    <FormRow
      icon={NotebookPenIcon}
      first={props.first}
      onPress={() => {
        focusOnLayout.current = true
        setOpen(true)
      }}
      accessibilityLabel={i18n.t('note')}
      accessibilityExpanded={false}
      testID={`${props.testID}-row`}
      trailing={
        props.note ? <FormRowChevron open={false} /> : <FormRowAddBadge />
      }
    >
      {props.note ? (
        <Text numberOfLines={2} style={{ paddingVertical: 8 }}>
          {props.note}
        </Text>
      ) : (
        <FormRowLabel>{i18n.t('note')}</FormRowLabel>
      )}
    </FormRow>
  )
}

export default NoteFormRow
