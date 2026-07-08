import {
  Bell as BellIcon,
  Check as CheckIcon,
  Timer as TimerIcon,
} from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import { View } from 'react-native'
import { useEffect, useMemo } from 'react'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedProps,
  withTiming,
  withDelay,
  withRepeat,
  withSequence,
  Easing,
} from 'react-native-reanimated'
import Svg, { Circle } from 'react-native-svg'
import useTheme from '@/contexts/theme'
import Text from '@/components/ui/MyText'
import Card from '@/components/ui/Card'
import i18n, { TranslationKey } from '@/lib/locales'
import { usePreferences } from '@/stores/preferences'
import { Publisher } from '@/types/publisher'
import { getEntryMode } from '@/lib/publisherCapabilities'

const EASE = Easing.out(Easing.cubic)
const PREVIEW_SIZE = 56
const AnimatedCircle = Animated.createAnimatedComponent(Circle)

// --- Goal progress ring (Pioneer-class) ---
const GoalProgressPreview = ({ color }: { color: string }) => {
  const theme = useTheme()
  const STROKE = 5
  const R = (PREVIEW_SIZE - STROKE) / 2
  const CIRC = 2 * Math.PI * R

  const progress = useSharedValue(0)

  useEffect(() => {
    progress.value = withRepeat(
      withSequence(
        withTiming(0.7, { duration: 1500, easing: EASE }),
        withDelay(900, withTiming(0, { duration: 600, easing: EASE })),
        withDelay(400, withTiming(0, { duration: 0 }))
      ),
      -1,
      false
    )
  }, [progress])

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: CIRC * (1 - progress.value),
  }))

  return (
    <View style={previewBoxStyle}>
      <Svg
        width={PREVIEW_SIZE}
        height={PREVIEW_SIZE}
        style={{ position: 'absolute' }}
      >
        <Circle
          cx={PREVIEW_SIZE / 2}
          cy={PREVIEW_SIZE / 2}
          r={R}
          stroke={theme.colors.border}
          strokeWidth={STROKE}
          fill='none'
        />
        <AnimatedCircle
          cx={PREVIEW_SIZE / 2}
          cy={PREVIEW_SIZE / 2}
          r={R}
          stroke={color}
          strokeWidth={STROKE}
          strokeLinecap='round'
          fill='none'
          strokeDasharray={`${CIRC} ${CIRC}`}
          animatedProps={animatedProps}
          transform={`rotate(-90 ${PREVIEW_SIZE / 2} ${PREVIEW_SIZE / 2})`}
        />
      </Svg>
      <LucideIcon icon={TimerIcon} size={18} color={color} />
    </View>
  )
}

// --- Time checkbox tick (Publisher) ---
const TimeCheckPreview = ({ color }: { color: string }) => {
  const theme = useTheme()
  const fill = useSharedValue(0)
  const tick = useSharedValue(0)

  useEffect(() => {
    fill.value = withRepeat(
      withSequence(
        withDelay(400, withTiming(1, { duration: 280, easing: EASE })),
        withDelay(1200, withTiming(0, { duration: 240, easing: EASE })),
        withDelay(300, withTiming(0, { duration: 0 }))
      ),
      -1,
      false
    )
    tick.value = withRepeat(
      withSequence(
        withDelay(540, withTiming(1, { duration: 220, easing: EASE })),
        withDelay(1140, withTiming(0, { duration: 200, easing: EASE })),
        withDelay(300, withTiming(0, { duration: 0 }))
      ),
      -1,
      false
    )
  }, [fill, tick])

  const fillStyle = useAnimatedStyle(() => ({
    transform: [{ scale: fill.value }],
  }))
  const tickStyle = useAnimatedStyle(() => ({
    opacity: tick.value,
    transform: [{ scale: 0.6 + tick.value * 0.4 }],
  }))

  return (
    <View style={previewBoxStyle}>
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          borderWidth: 2,
          borderColor: color,
          justifyContent: 'center',
          alignItems: 'center',
          overflow: 'hidden',
        }}
      >
        <Animated.View
          style={[
            {
              position: 'absolute',
              width: '100%',
              height: '100%',
              backgroundColor: color,
              borderRadius: 5,
            },
            fillStyle,
          ]}
        />
        <Animated.View style={tickStyle}>
          <LucideIcon
            icon={CheckIcon}
            size={20}
            color={theme.colors.textInverse}
          />
        </Animated.View>
      </View>
    </View>
  )
}

// --- Conversation bubbles (shared) ---
const ConversationBubble = ({
  color,
  width,
  delay,
}: {
  color: string
  width: number
  delay: number
}) => {
  const v = useSharedValue(0)

  useEffect(() => {
    v.value = withRepeat(
      withSequence(
        withDelay(delay, withTiming(1, { duration: 320, easing: EASE })),
        withDelay(1500 - delay, withTiming(0, { duration: 280 })),
        withDelay(400, withTiming(0, { duration: 0 }))
      ),
      -1,
      false
    )
  }, [v, delay])

  const style = useAnimatedStyle(() => ({
    opacity: v.value,
    transform: [
      { translateY: 4 - v.value * 4 },
      { scale: 0.85 + v.value * 0.15 },
    ],
  }))

  return (
    <Animated.View
      style={[
        {
          backgroundColor: color,
          borderRadius: 6,
          height: 10,
          width,
          marginVertical: 2,
        },
        style,
      ]}
    />
  )
}

const ConversationsPreview = ({ color }: { color: string }) => (
  <View
    style={[previewBoxStyle, { alignItems: 'flex-start', paddingLeft: 10 }]}
  >
    <ConversationBubble color={color} width={26} delay={0} />
    <ConversationBubble color={color} width={36} delay={220} />
    <ConversationBubble color={color} width={22} delay={440} />
  </View>
)

// --- Monthly report bars (Pioneer-class) ---
const ReportBar = ({
  color,
  height,
  delay,
}: {
  color: string
  height: number
  delay: number
}) => {
  const v = useSharedValue(0)

  useEffect(() => {
    v.value = withRepeat(
      withSequence(
        withDelay(delay, withTiming(1, { duration: 460, easing: EASE })),
        withDelay(1100 - delay, withTiming(0, { duration: 360 })),
        withDelay(400, withTiming(0, { duration: 0 }))
      ),
      -1,
      false
    )
  }, [v, delay])

  const style = useAnimatedStyle(() => ({
    height: v.value * height,
    opacity: 0.55 + v.value * 0.45,
  }))

  return (
    <Animated.View
      style={[{ width: 6, backgroundColor: color, borderRadius: 2 }, style]}
    />
  )
}

const REPORT_BARS = [
  { height: 18, delay: 0 },
  { height: 32, delay: 110 },
  { height: 14, delay: 220 },
  { height: 38, delay: 330 },
  { height: 24, delay: 440 },
]

const ReportPreview = ({ color }: { color: string }) => (
  <View
    style={[
      previewBoxStyle,
      {
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        paddingHorizontal: 8,
        paddingBottom: 8,
      },
    ]}
  >
    {REPORT_BARS.map((b, i) => (
      <ReportBar key={i} color={color} height={b.height} delay={b.delay} />
    ))}
  </View>
)

// --- Reminder bell (Publisher) ---
const RemindersPreview = ({ color }: { color: string }) => {
  const theme = useTheme()
  const wiggle = useSharedValue(0)
  const dot = useSharedValue(0)

  useEffect(() => {
    wiggle.value = withRepeat(
      withSequence(
        withDelay(500, withTiming(1, { duration: 110, easing: EASE })),
        withTiming(-1, { duration: 170 }),
        withTiming(1, { duration: 170 }),
        withTiming(0, { duration: 130, easing: EASE }),
        withDelay(1300, withTiming(0, { duration: 0 }))
      ),
      -1,
      false
    )
    dot.value = withRepeat(
      withSequence(
        withDelay(540, withTiming(1, { duration: 220, easing: EASE })),
        withDelay(1300, withTiming(0, { duration: 220 })),
        withDelay(400, withTiming(0, { duration: 0 }))
      ),
      -1,
      false
    )
  }, [wiggle, dot])

  const bellStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${wiggle.value * 14}deg` }],
  }))
  const dotStyle = useAnimatedStyle(() => ({
    opacity: dot.value,
    transform: [{ scale: 0.4 + dot.value * 0.6 }],
  }))

  return (
    <View style={previewBoxStyle}>
      <Animated.View style={bellStyle}>
        <LucideIcon icon={BellIcon} size={26} color={color} />
      </Animated.View>
      <Animated.View
        style={[
          {
            position: 'absolute',
            top: 12,
            right: 14,
            width: 10,
            height: 10,
            borderRadius: 5,
            backgroundColor: theme.colors.error,
            borderWidth: 1.5,
            borderColor: theme.colors.card,
          },
          dotStyle,
        ]}
      />
    </View>
  )
}

const previewBoxStyle = {
  width: PREVIEW_SIZE,
  height: PREVIEW_SIZE,
  justifyContent: 'center' as const,
  alignItems: 'center' as const,
}

type HighlightId = 'goal' | 'check' | 'conversations' | 'report' | 'reminders'

interface Highlight {
  id: HighlightId
  titleKey: TranslationKey
  descriptionKey: TranslationKey
  Preview: React.ComponentType<{ color: string }>
  getColor: (theme: ReturnType<typeof useTheme>) => string
}

const HIGHLIGHTS: Record<HighlightId, Highlight> = {
  goal: {
    id: 'goal',
    titleKey: 'highlightGoalTitle',
    descriptionKey: 'highlightGoalDesc',
    Preview: GoalProgressPreview,
    getColor: (t) => t.colors.accent,
  },
  check: {
    id: 'check',
    titleKey: 'highlightCheckTitle',
    descriptionKey: 'highlightCheckDesc',
    Preview: TimeCheckPreview,
    getColor: (t) => t.colors.accent,
  },
  conversations: {
    id: 'conversations',
    titleKey: 'highlightConversationsTitle',
    descriptionKey: 'highlightConversationsDesc',
    Preview: ConversationsPreview,
    getColor: (t) => t.colors.cyan,
  },
  report: {
    id: 'report',
    titleKey: 'highlightReportTitle',
    descriptionKey: 'highlightReportDesc',
    Preview: ReportPreview,
    getColor: (t) => t.colors.indigo,
  },
  reminders: {
    id: 'reminders',
    titleKey: 'highlightRemindersTitle',
    descriptionKey: 'highlightRemindersDesc',
    Preview: RemindersPreview,
    getColor: (t) => t.colors.pink,
  },
}

const highlightsForPublisher = (publisher: Publisher): HighlightId[] => {
  if (getEntryMode(publisher) === 'checkbox') {
    return ['check', 'conversations', 'reminders']
  }
  return ['goal', 'conversations', 'report']
}

const HighlightCard = ({ highlight }: { highlight: Highlight }) => {
  const theme = useTheme()
  const color = highlight.getColor(theme)
  const { Preview } = highlight

  return (
    <Card
      flexDirection='row'
      style={{
        alignItems: 'center',
        paddingVertical: 14,
        paddingHorizontal: 14,
        marginBottom: 10,
        gap: 14,
      }}
    >
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: 14,
          backgroundColor: theme.colors.background,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <Preview color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontSize: 16,
            fontFamily: 'Inter_600SemiBold',
            color: theme.colors.text,
            marginBottom: 3,
          }}
        >
          {i18n.t(highlight.titleKey)}
        </Text>
        <Text
          style={{
            fontSize: 13,
            color: theme.colors.textAlt,
            lineHeight: 17,
          }}
        >
          {i18n.t(highlight.descriptionKey)}
        </Text>
      </View>
    </Card>
  )
}

interface FeatureShowcaseProps {
  style?: object
}

const FeatureShowcase = ({ style }: FeatureShowcaseProps) => {
  const theme = useTheme()
  const { role } = usePreferences()

  const highlights = useMemo(
    () => highlightsForPublisher(role).map((id) => HIGHLIGHTS[id]),
    [role]
  )

  return (
    <View style={[{ marginTop: 36 }, style]}>
      <Text
        style={{
          fontSize: 16,
          fontFamily: 'Inter_600SemiBold',
          color: theme.colors.text,
          marginBottom: 12,
        }}
      >
        {i18n.t('highlightsTitle')}
      </Text>
      <View>
        {highlights.map((h) => (
          <HighlightCard key={h.id} highlight={h} />
        ))}
      </View>
    </View>
  )
}

export default FeatureShowcase
