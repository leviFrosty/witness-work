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

  orbLabel: string
  title: string | null
  subtitle: string | null
}

const GLOW_OVERLAP = 42

const CLEARANCE = 30
const MIN_ORB = 96

const LINES_FONT_SCALE_CAP = 1.6

const ScribeVoiceStage = ({ orb, level, orbLabel, title, subtitle }: Props) => {
  const theme = useTheme()
  const { width } = useWindowDimensions()

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

export const pickVoiceExample = () => {
  const examples = [
    i18n.t('scribe_voiceExample1'),
    i18n.t('scribe_voiceExample2'),
    i18n.t('scribe_voiceExample3'),
  ]
  return examples[Math.floor(Math.random() * examples.length)]
}
