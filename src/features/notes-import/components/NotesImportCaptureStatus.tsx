import { useEffect, useState } from 'react'
import { ActivityIndicator, View } from 'react-native'
import Animated, {
  useAnimatedStyle,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'
import { X as XIcon } from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import Button from '@/components/ui/Button'
import PointerTooltip from '@/components/ui/PointerTooltip'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import type { VoiceLogPhase } from '@/features/notes-import/hooks/useNotesImportVoiceLog'

interface Props {
  voicePhase: VoiceLogPhase
  startedAt: number | null
  downloadProgress: number | null
  level: SharedValue<number>
  readingPhoto: boolean
  onCancelVoice: () => void
}

const formatElapsed = (ms: number) => {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

const Elapsed = ({ startedAt }: { startedAt: number }) => {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [])
  return <>{formatElapsed(now - startedAt)}</>
}

/** A red dot that swells with the microphone level. */
const LevelDot = ({ level }: { level: SharedValue<number> }) => {
  const theme = useTheme()
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: withTiming(1 + level.value * 0.8, { duration: 90 }) }],
  }))
  return (
    <Animated.View
      style={[
        {
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: theme.colors.error,
        },
        style,
      ]}
    />
  )
}

/**
 * Leading side of the composer while a capture owns it: discard + live status
 * for a voice log (preparing, elapsed time, finishing), or progress while a
 * photo is read.
 */
const NotesImportCaptureStatus = ({
  voicePhase,
  startedAt,
  downloadProgress,
  level,
  readingPhoto,
  onCancelVoice,
}: Props) => {
  const theme = useTheme()
  const labelStyle = {
    color: theme.colors.textAlt,
    fontFamily: theme.fonts.semiBold,
    fontSize: theme.fontSize('sm'),
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
    voicePhase === 'recording' && startedAt ? (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <LevelDot level={level} />
        <Text
          style={[labelStyle, { fontVariant: ['tabular-nums'] }]}
          accessibilityLabel={i18n.t('notesImport_voiceListening')}
        >
          <Elapsed startedAt={startedAt} />
        </Text>
      </View>
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
        flexShrink: 1,
      }}
    >
      {voicePhase !== 'finishing' && (
        <PointerTooltip
          label={i18n.t('notesImport_voiceDiscard')}
          effect='none'
          placement='top'
        >
          <Button
            onPress={onCancelVoice}
            accessibilityRole='button'
            accessibilityLabel={i18n.t('notesImport_voiceDiscard')}
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
      )}
      {status}
    </View>
  )
}

export default NotesImportCaptureStatus
