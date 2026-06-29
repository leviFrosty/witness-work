import { forwardRef } from 'react'
import { TextInput, View } from 'react-native'
import { faArrowUp, faStop } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import Button from '@/components/ui/Button'
import useTheme from '@/contexts/theme'

export interface NotesImportChatInputProps {
  value: string
  onChangeText: (value: string) => void
  onSubmit: () => void
  placeholder: string
  accessibilityLabel: string
  accessibilityHint?: string
  /** Label for the trailing send button (e.g. "Preview", "Update preview"). */
  submitAccessibilityLabel: string
  /** Disables typing and the send button (e.g. while a run is in flight). */
  editable?: boolean
  /**
   * When provided, the trailing button becomes a Stop button that calls this —
   * used while an interruptible run streams.
   */
  onStop?: () => void
  stopAccessibilityLabel?: string
}

/**
 * The one Notes Import chat input (ADR 0009). A rounded prompt pill with a
 * grow-to-fit multiline field and a single trailing action whose identity is
 * driven by props — Stop while a run is interruptible, otherwise Send. Both the
 * initial paste and the refinement prompt render this same component; callers
 * differ only in value/placeholder/onSubmit, so the footer never swaps
 * layouts.
 */
const NotesImportChatInput = forwardRef<TextInput, NotesImportChatInputProps>(
  (
    {
      value,
      onChangeText,
      onSubmit,
      placeholder,
      accessibilityLabel,
      accessibilityHint,
      submitAccessibilityLabel,
      editable = true,
      onStop,
      stopAccessibilityLabel,
    },
    ref
  ) => {
    const theme = useTheme()
    const canSubmit = !!value.trim() && editable

    const trailing = onStop ? (
      <Button
        onPress={onStop}
        accessibilityRole='button'
        accessibilityLabel={stopAccessibilityLabel}
        style={{
          width: 32,
          height: 32,
          borderRadius: 16,
          // Pin the action to the bottom (ChatGPT-style) so it stays anchored
          // to the last line as the field grows, while the row stays centered
          // for the common single-line case.
          alignSelf: 'flex-end',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.colors.accent,
        }}
      >
        <FontAwesomeIcon
          icon={faStop}
          size={14}
          color={theme.colors.textInverse}
        />
      </Button>
    ) : (
      <Button
        disabled={!canSubmit}
        onPress={onSubmit}
        accessibilityRole='button'
        accessibilityLabel={submitAccessibilityLabel}
        style={{
          width: 32,
          height: 32,
          borderRadius: 16,
          alignSelf: 'flex-end',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: canSubmit
            ? theme.colors.accent
            : theme.colors.accentAlt,
        }}
      >
        <FontAwesomeIcon
          icon={faArrowUp}
          size={18}
          color={theme.colors.textInverse}
        />
      </Button>
    )

    return (
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          borderRadius: 22,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.card,
          paddingLeft: 18,
          paddingRight: 5,
          paddingVertical: 5,
          shadowOffset: { width: 0, height: 1 },
          shadowColor: theme.colors.shadow,
          shadowOpacity: theme.numbers.shadowOpacity,
        }}
      >
        <TextInput
          ref={ref}
          value={value}
          onChangeText={onChangeText}
          editable={editable}
          multiline
          accessibilityLabel={accessibilityLabel}
          accessibilityHint={accessibilityHint}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.textAlt}
          style={{
            flex: 1,
            // Starts a single line, grows with content, then caps near ten
            // lines and scrolls internally.
            maxHeight: 220,
            textAlignVertical: 'top',
            color: theme.colors.text,
            fontFamily: theme.fonts.regular,
            fontSize: theme.fontSize('md'),
            // iOS renders the multiline placeholder lower than typed text when a
            // lineHeight is set, so only apply it once there's real text — the
            // placeholder then centers on natural font metrics.
            lineHeight: value ? 22 : undefined,
            paddingTop: 0,
            paddingBottom: 2,
          }}
        />
        {trailing}
      </View>
    )
  }
)

NotesImportChatInput.displayName = 'NotesImportChatInput'

export default NotesImportChatInput
