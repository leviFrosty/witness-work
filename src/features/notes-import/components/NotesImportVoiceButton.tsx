import { Check as CheckIcon, Mic as MicIcon } from 'lucide-react-native'
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
 * The composer's trailing voice-log action, in Send's place while the draft is
 * empty: a mic that starts recording, then a check that finishes it.
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
          backgroundColor: disabled
            ? theme.colors.accentAlt
            : theme.colors.accent,
        }}
      >
        <LucideIcon
          icon={recording ? CheckIcon : MicIcon}
          size={recording ? 18 : 16}
          color={theme.colors.textInverse}
        />
      </Button>
    </PointerTooltip>
  )
}

export default NotesImportVoiceButton
