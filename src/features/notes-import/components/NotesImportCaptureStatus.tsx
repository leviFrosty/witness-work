import { ActivityIndicator, View } from 'react-native'
import type { SharedValue } from 'react-native-reanimated'
import { X as XIcon } from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import Button from '@/components/ui/Button'
import PointerTooltip from '@/components/ui/PointerTooltip'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import NotesImportVoiceWaveform from '@/features/notes-import/components/NotesImportVoiceWaveform'
import type { VoiceLogPhase } from '@/features/notes-import/hooks/useNotesImportVoiceLog'

interface Props {
  voicePhase: VoiceLogPhase
  downloadProgress: number | null
  level: SharedValue<number>
  readingPhoto: boolean
  /** Import from Paper: pages read so far out of the batch. */
  paperProgress: { done: number; total: number } | null
  onCancelVoice: () => void
  onCancelPaper: () => void
}

const CancelButton = ({
  label,
  onPress,
}: {
  label: string
  onPress: () => void
}) => {
  const theme = useTheme()
  return (
    <PointerTooltip label={label} effect='none' placement='top'>
      <Button
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
        }}
      >
        <LucideIcon icon={XIcon} size={15} color={theme.colors.textAlt} />
      </Button>
    </PointerTooltip>
  )
}

/**
 * Leading side of the composer while a capture owns it: discard + live status
 * for a voice log (preparing, a live waveform, finishing), progress while a
 * photo is read, or page progress with a cancel while paper pages are read.
 */
const NotesImportCaptureStatus = ({
  voicePhase,
  downloadProgress,
  level,
  readingPhoto,
  paperProgress,
  onCancelVoice,
  onCancelPaper,
}: Props) => {
  const theme = useTheme()
  const labelStyle = {
    color: theme.colors.textAlt,
    fontFamily: theme.fonts.semiBold,
    fontSize: theme.fontSize('sm'),
  }

  if (paperProgress && voicePhase === 'idle') {
    return (
      <View
        accessibilityLiveRegion='polite'
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          flexShrink: 1,
        }}
      >
        <CancelButton label={i18n.t('cancel')} onPress={onCancelPaper} />
        <ActivityIndicator size='small' color={theme.colors.textAlt} />
        <Text numberOfLines={1} style={[labelStyle, { flexShrink: 1 }]}>
          {i18n.t('notesImport_paperReading', {
            current: Math.min(paperProgress.done + 1, paperProgress.total),
            total: paperProgress.total,
          })}
        </Text>
      </View>
    )
  }

  if (readingPhoto && voicePhase === 'idle') {
    return (
      <View
        accessibilityLiveRegion='polite'
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
      >
        <ActivityIndicator size='small' color={theme.colors.textAlt} />
        <Text style={labelStyle}>{i18n.t('notesImport_photoReading')}</Text>
      </View>
    )
  }

  const status =
    voicePhase === 'recording' ? (
      <NotesImportVoiceWaveform level={level} />
    ) : voicePhase === 'preparing' ? (
      <Text numberOfLines={1} style={[labelStyle, { flexShrink: 1 }]}>
        {downloadProgress != null
          ? i18n.t('notesImport_voicePreparingProgress', {
              percent: Math.round(downloadProgress * 100),
            })
          : i18n.t('notesImport_voicePreparing')}
      </Text>
    ) : (
      <ActivityIndicator size='small' color={theme.colors.textAlt} />
    )

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        flex: 1,
      }}
    >
      {voicePhase !== 'finishing' && (
        <CancelButton
          label={i18n.t('notesImport_voiceDiscard')}
          onPress={onCancelVoice}
        />
      )}
      {status}
    </View>
  )
}

export default NotesImportCaptureStatus
