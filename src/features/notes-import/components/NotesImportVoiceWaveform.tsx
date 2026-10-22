import { useState } from 'react'
import { View } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useFrameCallback,
  useReducedMotion,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import {
  initialVoiceLevelRange,
  normalizeVoiceLevel,
} from '@/features/notes-import/lib/normalizeVoiceLevel'

// Matches the native meter's ~80 ms cadence, so each new level gets one bar.
const SAMPLE_MS = 80
const BAR_WIDTH = 3
const SLOT = BAR_WIDTH * 2
const MAX_HEIGHT = 22

const barHeight = (loudness: number) => {
  'worklet'
  return BAR_WIDTH + loudness * (MAX_HEIGHT - BAR_WIDTH)
}

const Bar = ({
  index,
  history,
}: {
  index: number
  history: SharedValue<number[]>
}) => {
  const theme = useTheme()
  const style = useAnimatedStyle(() => {
    const height = barHeight(history.value[index] ?? 0)
    return { height, opacity: height > BAR_WIDTH ? 1 : 0.5 }
  })
  return (
    <Animated.View
      style={[
        {
          width: BAR_WIDTH,
          marginRight: SLOT - BAR_WIDTH,
          borderRadius: BAR_WIDTH / 2,
          backgroundColor: theme.colors.text,
        },
        style,
      ]}
    />
  )
}

/**
 * Live microphone waveform for a voice log: the newest level enters on the
 * right and scrolls left, dots while quiet and bars while the user speaks, so
 * it's clear the microphone hears them. Levels are normalized to the room and
 * the recent peak, so quiet speech shows as well as loud.
 */
const NotesImportVoiceWaveform = ({
  level,
}: {
  level: SharedValue<number>
}) => {
  const reduceMotion = useReducedMotion()
  const [count, setCount] = useState(0)
  // One extra bar slides in from the right edge between samples.
  const slots = count + 1
  const history = useSharedValue<number[]>([])
  const range = useSharedValue(initialVoiceLevelRange())
  const lastSampleAt = useSharedValue(0)
  const progress = useSharedValue(0)

  useFrameCallback(({ timestamp }) => {
    'worklet'
    const elapsed = timestamp - lastSampleAt.value
    if (elapsed >= SAMPLE_MS || history.value.length !== slots) {
      lastSampleAt.value = timestamp
      const { loudness, ...nextRange } = normalizeVoiceLevel(
        range.value,
        level.value
      )
      range.value = nextRange
      const next = [...history.value, loudness].slice(-slots)
      while (next.length < slots) next.unshift(0)
      history.value = next
    }
    progress.value = reduceMotion
      ? 1
      : Math.min((timestamp - lastSampleAt.value) / SAMPLE_MS, 1)
  })

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: SLOT - progress.value * SLOT }],
  }))

  return (
    <View
      accessible
      accessibilityLabel={i18n.t('notesImport_voiceListening')}
      onLayout={(event) =>
        setCount(Math.floor(event.nativeEvent.layout.width / SLOT))
      }
      style={{ flex: 1, height: MAX_HEIGHT, overflow: 'hidden' }}
    >
      <Animated.View
        style={[
          {
            position: 'absolute',
            right: 0,
            top: 0,
            bottom: 0,
            flexDirection: 'row',
            alignItems: 'center',
          },
          rowStyle,
        ]}
      >
        {Array.from({ length: count ? slots : 0 }, (_, index) => (
          <Bar key={index} index={index} history={history} />
        ))}
      </Animated.View>
    </View>
  )
}

export default NotesImportVoiceWaveform
