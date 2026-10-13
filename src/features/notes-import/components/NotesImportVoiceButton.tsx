import { Mic as MicIcon, Square as SquareIcon } from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import Button from '@/components/ui/Button'
import PointerTooltip from '@/components/ui/PointerTooltip'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'

interface Props {
  /** While recording the button finishes the voice log instead of starting one. */
  recording: boolean
  disabled?: boolean
  onPress: () => void
}

/**
 * The composer's voice-log action, always just left of Send: a mic that starts
 * recording, then a stop that ends it and leaves the transcript to edit.
 */
const NotesImportVoiceButton = ({ recording, disabled, onPress }: Props) => {
  const theme = useTheme()
  const label = recording
    ? i18n.t('notesImport_voiceFinish')
    : i18n.t('notesImport_voiceRecord')

  return (
    <PointerTooltip label={label} effect='none' placement='top'>
      <Button
        disabled={disabled}
        onPress={onPress}
        accessibilityRole='button'
        accessibilityLabel={label}
        style={{
          width: 32,
          height: 32,
          borderRadius: 16,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.card,
          opacity: disabled ? 0.5 : 1,
        }}
      >
        {recording ? (
          <LucideIcon
            icon={SquareIcon}
            size={12}
            color={theme.colors.text}
            fill={theme.colors.text}
          />
        ) : (
          <LucideIcon icon={MicIcon} size={16} color={theme.colors.text} />
        )}
      </Button>
    </PointerTooltip>
  )
}

export default NotesImportVoiceButton
