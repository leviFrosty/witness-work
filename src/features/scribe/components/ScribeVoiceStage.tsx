import { useState } from 'react'
import { View, useWindowDimensions } from 'react-native'
import type { SharedValue } from 'react-native-reanimated'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import useAccessibilityTextSize from '@/hooks/useAccessibilityTextSize'
import i18n from '@/lib/locales'
import ScribeOrb, {
  type ScribeOrbState,
} from '@/features/scribe/components/ScribeOrb'

interface Props {
  orb: ScribeOrbState
  level: SharedValue<number>
  /** The orb's state for screen readers. */
  orbLabel: string
  title: string | null
  subtitle: string | null
}

// The orb's glow runs into the space above it and under its lines.
const GLOW_OVERLAP = 42
// Kept between the lines and Discard and Done.
const CLEARANCE = 30
const MIN_ORB = 96
// Past this, the largest text sizes would push the lines into the controls.
const LINES_FONT_SCALE_CAP = 1.6

/** The big orb and the one or two lines under it. */
const ScribeVoiceStage = ({ orb, level, orbLabel, title, subtitle }: Props) => {
  const theme = useTheme()
  const { width } = useWindowDimensions()
  // Short sheets (iPhone SE, iPhone Duo closed) and large text shrink the orb,
  // so its lines stay clear of Discard and Done.
  const largeText = useAccessibilityTextSize()
  const [height, setHeight] = useState<number | null>(null)
  const [linesHeight, setLinesHeight] = useState(52)
  const room =
    height === null ? 340 : height + GLOW_OVERLAP - linesHeight - CLEARANCE
  const size = Math.max(
    MIN_ORB,
    Math.min(width - 40, largeText ? 220 : 340, room)
  )
  return (
    <View
      onLayout={(event) => setHeight(event.nativeEvent.layout.height)}
      style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
    >
      <ScribeOrb
        size={size}
        core={0.29}
        state={orb}
        level={level}
        accessibilityLabel={orbLabel}
        style={{ marginTop: -24 }}
      />
      <View
        onLayout={(event) => setLinesHeight(event.nativeEvent.layout.height)}
        style={{
          alignItems: 'center',
          gap: 6,
          marginTop: -18,
          paddingHorizontal: 32,
          minHeight: 52,
        }}
      >
        {title ? (
          <Text
            maxFontSizeMultiplier={LINES_FONT_SCALE_CAP}
            style={{
              fontSize: theme.fontSize('lg'),
              fontFamily: theme.fonts.semiBold,
              textAlign: 'center',
            }}
          >
            {title}
          </Text>
        ) : null}
        {subtitle ? (
          <Text
            maxFontSizeMultiplier={LINES_FONT_SCALE_CAP}
            style={{
              fontSize: theme.fontSize('md'),
              color: theme.colors.textAlt,
              textAlign: 'center',
            }}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
    </View>
  )
}

export default ScribeVoiceStage

/** One of the example lines, picked once per sheet. */
export const pickVoiceExample = () => {
  const examples = [
    i18n.t('scribe_voiceExample1'),
    i18n.t('scribe_voiceExample2'),
    i18n.t('scribe_voiceExample3'),
  ]
  return examples[Math.floor(Math.random() * examples.length)]
}
