import useFormValidation from '@/hooks/useFormValidation'
import {
  ArrowUp as ArrowUpIcon,
  Square as SquareIcon,
} from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import { forwardRef, type ReactNode } from 'react'
import { TextInput, View } from 'react-native'
import { TextArea, InputProps } from 'tamagui'
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
   * Overrides `editable` for the send button alone, e.g. to send while a voice
   * log locks the field.
   */
  canSubmit?: boolean
  /**
   * When provided, the trailing button becomes a Stop button that calls this —
   * used while an interruptible run streams.
   */
  onStop?: () => void
  stopAccessibilityLabel?: string
  /**
   * Optional control pinned to the LEFT of the bottom row (e.g. the "View
   * imports" callout), opposite the trailing actions.
   */
  leading?: ReactNode
  /**
   * Optional control rendered in the bottom row just left of Send — the compact
   * Import Credit balance lives here instead of in a pinned banner.
   */
  accessory?: ReactNode
  /** Control rendered just left of the trailing action, e.g. the voice-log mic. */
  secondaryAction?: ReactNode
  /** Replaces the trailing Send/Stop action, e.g. a spinner while loading. */
  trailingAction?: ReactNode
}

/**
 * The one Notes Import chat input (ADR 0009). A rounded prompt card with a
 * grow-to-fit multiline field on top and a control row beneath it (ChatGPT
 * style): the field never has to share its line with the buttons, so long
 * pastes stay readable. The trailing action's identity is driven by props —
 * Stop while a run is interruptible, otherwise Send — and an optional
 * `accessory` sits to its left. Both the initial paste and the refinement
 * prompt render this same component; callers differ only in
 * value/placeholder/onSubmit, so the footer never swaps layouts. The optional
 * `accessory` keeps the Import Credit balance beside the trailing action.
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
      canSubmit = editable,
      onStop,
      stopAccessibilityLabel,
      leading,
      accessory,
      secondaryAction,
      trailingAction,
    },
    ref
  ) => {
    const theme = useTheme()
    const validation = useFormValidation(
      { text: !value.trim() },
      'notes_import_prompt'
    )
    const submit = () => {
      if (canSubmit && validation.validate()) onSubmit()
    }

    const trailing = trailingAction ? (
      trailingAction
    ) : onStop ? (
      <Button
        onPress={onStop}
        accessibilityRole='button'
        accessibilityLabel={stopAccessibilityLabel}
        style={{
          width: 32,
          height: 32,
          borderRadius: 16,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.colors.accent,
        }}
      >
        <LucideIcon
          icon={SquareIcon}
          size={14}
          color={theme.colors.textInverse}
        />
      </Button>
    ) : (
      <Button
        disabled={!canSubmit}
        onPress={submit}
        accessibilityRole='button'
        accessibilityLabel={submitAccessibilityLabel}
        style={{
          width: 32,
          height: 32,
          borderRadius: 16,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: canSubmit
            ? theme.colors.accent
            : theme.colors.accentAlt,
        }}
      >
        <LucideIcon
          icon={ArrowUpIcon}
          size={18}
          color={theme.colors.textInverse}
        />
      </Button>
    )

    return (
      <View
        style={{
          gap: 8,
          borderRadius: 24,
          borderWidth: 1,
          borderColor: validation.invalid('text')
            ? theme.colors.error
            : theme.colors.border,
          backgroundColor: theme.colors.card,
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: 8,
          shadowOffset: { width: 0, height: 1 },
          shadowColor: theme.colors.shadow,
          shadowOpacity: theme.numbers.shadowOpacity,
        }}
      >
        <TextArea
          unstyled
          ref={ref}
          value={value}
          onChangeText={onChangeText}
          disabled={!editable}
          multiline
          accessibilityLabel={accessibilityLabel}
          accessibilityHint={accessibilityHint}
          placeholder={placeholder}
          placeholderTextColor={
            theme.colors.textAlt as InputProps['placeholderTextColor']
          }
          textAlignVertical='top'
          style={{
            // Starts a single line, grows with content, then caps near nine
            // lines and scrolls internally.
            maxHeight: 200,
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
        {/* Control row beneath the field: the leading control fills the left,
            pushing the balance, the secondary action, and Send to the trailing
            edge. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
            }}
          >
            {leading}
          </View>
          {accessory}
          {secondaryAction}
          {trailing}
        </View>
      </View>
    )
  }
)

NotesImportChatInput.displayName = 'NotesImportChatInput'

export default NotesImportChatInput
