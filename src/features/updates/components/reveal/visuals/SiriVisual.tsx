import { View } from 'react-native'
import Animated, {
  DerivedValue,
  useAnimatedStyle,
  useDerivedValue,
} from 'react-native-reanimated'
import { BlurMask, Canvas, Circle } from '@shopify/react-native-skia'
import {
  AudioLines as AudioLinesIcon,
  CircleCheck as CircleCheckIcon,
  Pause as PauseIcon,
  Play as PlayIcon,
} from 'lucide-react-native'
import Constants from 'expo-constants'
import useTheme from '@/contexts/theme'
import type { AppIcon } from '@/components/ui/LucideIcon'
import i18n, { TranslationKey } from '@/lib/locales'
import { formatMinutes } from '@/lib/minutes'
import { usePreferences } from '@/stores/preferences'
import { siriPhrase } from '@/features/updates/lib/siriPhrase'
import {
  IconTile,
  RevealVisualProps,
  Surface,
  VisualText,
  backOut,
  seg,
  useRiseStyle,
  useVisualClock,
} from '@/features/updates/components/reveal/visuals/kit'
import {
  WATCH_COLORS,
  WATCH_FRAME,
  WATCH_SCREEN,
  WatchFrame,
} from '@/features/updates/components/reveal/visuals/watchKit'

interface Command {
  phraseKey: TranslationKey
  replyKey: TranslationKey
  icon: AppIcon
  /** Siri asks how long, and the answer is spoken back. */
  asksDuration?: boolean
}

/**
 * The watch's Siri phrases (`targets/watch/WatchShortcuts.swift`), in a day's
 * order.
 */
const COMMANDS: Command[] = [
  {
    phraseKey: 'watchShortcutStartTimer',
    replyKey: 'watchTimerStarted',
    icon: PlayIcon,
  },
  {
    phraseKey: 'watchShortcutPauseTimer',
    replyKey: 'watchTimerPaused',
    icon: PauseIcon,
  },
  {
    phraseKey: 'watchShortcutAddTime',
    replyKey: 'timeAdded',
    icon: CircleCheckIcon,
    asksDuration: true,
  },
]
const ASKS = COMMANDS.map((command) => !!command.asksDuration)
const COUNT = COMMANDS.length
const SPOKEN_DURATION = 90
/** Moments in one command, 0–1. */
const T = {
  wordsFrom: 0.05,
  wordsTo: 0.38,
  heard: 0.42,
  ask: 0.44,
  answer: 0.5,
  reply: 0.64,
  out: 0.92,
}
const BUBBLE_W = 320 - WATCH_FRAME.width - 22
const ORB = 64

/** Where one command is, 0–1, or -1 while another is playing. */
const localTime = (loop: number, index: number) => {
  'worklet'
  const l = loop * COUNT - index
  return l >= 0 && l < 1 ? l : -1
}

/** In and out with its command; 0 while another plays. */
const presence = (l: number) => {
  'worklet'
  return l < 0 ? 0 : seg(l, 0, 0.05) * (1 - seg(l, T.out, 1))
}

/**
 * Siri on the Apple Watch: each phrase is spoken a word at a time beside the
 * watch, the orb listens, and the watch answers — starting the timer, pausing
 * it, then adding time after asking how long.
 */
const SiriVisual = ({ palette, active, reduceMotion }: RevealVisualProps) => {
  const theme = useTheme()
  const { timeDisplayFormat } = usePreferences()
  const { intro, loop } = useVisualClock({
    active,
    reduceMotion,
    introMs: 1100,
    loopMs: 4600 * COUNT,
    // The first command, answered.
    restAt: 0.8 / COUNT,
  })

  const watchStyle = useRiseStyle(intro, 0, 0.45, 24)
  const bubbleStyle = useRiseStyle(intro, 0.25, 0.75, 18)
  const answer = formatMinutes(SPOKEN_DURATION, timeDisplayFormat).formatted

  return (
    <View style={{ flex: 1 }}>
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: 0,
            width: BUBBLE_W,
            top: 0,
            bottom: 0,
            justifyContent: 'center',
          },
          bubbleStyle,
        ]}
      >
        <View style={{ height: 172 }}>
          {COMMANDS.map((command, i) => (
            <Spoken
              key={command.phraseKey}
              index={i}
              loop={loop}
              phrase={siriPhrase(command.phraseKey)}
              answer={command.asksDuration ? answer : undefined}
              palette={palette}
            />
          ))}
        </View>
      </Animated.View>

      <Animated.View
        style={[
          {
            position: 'absolute',
            right: 4,
            top: (280 - WATCH_FRAME.height) / 2,
          },
          watchStyle,
        ]}
      >
        <WatchFrame palette={palette}>
          {COMMANDS.map((command, i) => (
            <Reply
              key={command.phraseKey}
              index={i}
              loop={loop}
              command={command}
            />
          ))}
          <Orb
            loop={loop}
            colors={[theme.colors.pink, theme.colors.purple, theme.colors.cyan]}
          />
        </WatchFrame>
      </Animated.View>
    </View>
  )
}

/** What the user says: the phrase a word at a time, and any answer after. */
const Spoken = ({
  index,
  loop,
  phrase,
  answer,
  palette,
}: {
  index: number
  loop: DerivedValue<number>
  phrase: string
  answer?: string
  palette: RevealVisualProps['palette']
}) => {
  const theme = useTheme()
  const local = useDerivedValue(() => localTime(loop.value, index))
  // Languages written without spaces arrive as one phrase.
  const words = phrase.split(' ')
  const style = useAnimatedStyle(() => {
    const p = presence(local.value)
    return {
      opacity: p,
      transform: [{ translateY: (1 - p) * 8 }],
    }
  })
  const answerStyle = useAnimatedStyle(() => {
    const p = local.value < 0 ? 0 : seg(local.value, T.answer, T.answer + 0.08)
    return {
      opacity: p,
      transform: [{ scale: 0.85 + 0.15 * backOut(p) }],
    }
  })
  const quoteColor = theme.colors.pink

  return (
    <Animated.View
      style={[
        { position: 'absolute', top: 0, left: 0, right: 0, gap: 8 },
        style,
      ]}
    >
      <Surface
        palette={palette}
        style={{ padding: 14, gap: 8, borderBottomRightRadius: 6 }}
      >
        <IconTile icon={AudioLinesIcon} color={quoteColor} size={24} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 4 }}>
          {words.map((word, i) => (
            <Word
              key={`${word}-${i}`}
              word={word}
              local={local}
              at={T.wordsFrom + ((T.wordsTo - T.wordsFrom) * i) / words.length}
              color={palette.text}
            />
          ))}
        </View>
      </Surface>
      {answer && (
        <Animated.View style={[{ alignSelf: 'flex-end' }, answerStyle]}>
          <Surface
            palette={palette}
            style={{
              paddingVertical: 8,
              paddingHorizontal: 12,
              borderBottomRightRadius: 6,
            }}
          >
            <VisualText
              style={{
                fontSize: 15,
                fontFamily: theme.fonts.bold,
                color: palette.text,
              }}
            >
              {answer}
            </VisualText>
          </Surface>
        </Animated.View>
      )}
    </Animated.View>
  )
}

const Word = ({
  word,
  local,
  at,
  color,
}: {
  word: string
  local: DerivedValue<number>
  at: number
  color: string
}) => {
  const theme = useTheme()
  const style = useAnimatedStyle(() => {
    const p = local.value < 0 ? 0 : seg(local.value, at, at + 0.07)
    return {
      opacity: 0.15 + 0.85 * p,
      transform: [{ translateY: (1 - p) * 4 }],
    }
  })
  return (
    <Animated.View style={style}>
      <VisualText
        style={{
          fontSize: 17,
          lineHeight: 22,
          fontFamily: theme.fonts.bold,
          color,
        }}
      >
        {word}
      </VisualText>
    </Animated.View>
  )
}

/** The watch's answer: Siri's question first when it needs one, then the result. */
const Reply = ({
  index,
  loop,
  command,
}: {
  index: number
  loop: DerivedValue<number>
  command: Command
}) => {
  const theme = useTheme()
  const accent = theme.colors.accent
  const local = useDerivedValue(() => localTime(loop.value, index))
  const asks = !!command.asksDuration
  const askStyle = useAnimatedStyle(() => {
    const l = local.value
    const p =
      l < 0 || !asks
        ? 0
        : seg(l, T.ask, T.ask + 0.06) * (1 - seg(l, T.reply - 0.04, T.reply))
    return { opacity: p, transform: [{ translateY: (1 - p) * 6 }] }
  })
  const replyStyle = useAnimatedStyle(() => {
    const l = local.value
    const from = asks ? T.reply : T.heard + 0.04
    const p = l < 0 ? 0 : seg(l, from, from + 0.08) * (1 - seg(l, T.out, 1))
    return {
      opacity: p,
      transform: [{ scale: 0.85 + 0.15 * backOut(Math.min(1, p)) }],
    }
  })

  return (
    <>
      <Animated.View style={[replyFrame, askStyle]}>
        <VisualText
          style={{
            fontSize: 15,
            fontFamily: theme.fonts.bold,
            color: WATCH_COLORS.text,
            textAlign: 'center',
          }}
        >
          {i18n.t('watchDuration')}
        </VisualText>
      </Animated.View>
      <Animated.View style={[replyFrame, replyStyle]}>
        <VisualText style={{ fontSize: 9, color: WATCH_COLORS.textAlt }}>
          {Constants.expoConfig?.name ?? 'WitnessWork'}
        </VisualText>
        <IconTile icon={command.icon} color={accent} size={34} filled />
        <VisualText
          numberOfLines={2}
          style={{
            fontSize: 13,
            fontFamily: theme.fonts.bold,
            color: WATCH_COLORS.text,
            textAlign: 'center',
          }}
        >
          {i18n.t(command.replyKey)}
        </VisualText>
      </Animated.View>
    </>
  )
}

const replyFrame = {
  position: 'absolute',
  top: 18,
  left: 12,
  right: 12,
  height: 92,
  alignItems: 'center',
  justifyContent: 'center',
  gap: 5,
} as const

/**
 * Siri's orb: three glows circling while it listens, settling small at the
 * bottom of the screen while the watch answers.
 */
const Orb = ({
  loop,
  colors,
}: {
  loop: DerivedValue<number>
  colors: string[]
}) => {
  const listening = useDerivedValue(() => {
    const index = Math.min(COUNT - 1, Math.floor(loop.value * COUNT))
    const l = loop.value * COUNT - index
    const first = 1 - seg(l, T.heard, T.heard + 0.05)
    const again = ASKS[index]
      ? seg(l, T.ask, T.ask + 0.04) * (1 - seg(l, T.reply - 0.04, T.reply))
      : 0
    return Math.max(first, again) * (1 - seg(l, T.out, 1))
  })
  // Louder while words are being spoken.
  const level = useDerivedValue(() => {
    const l = (loop.value * COUNT) % 1
    const speaking =
      seg(l, T.wordsFrom, T.wordsFrom + 0.04) * (1 - seg(l, T.wordsTo, T.heard))
    return speaking * Math.abs(Math.sin(l * Math.PI * 22))
  })
  const style = useAnimatedStyle(() => {
    const p = listening.value
    return {
      transform: [
        { translateY: (1 - p) * 46 },
        { scale: (0.5 + 0.5 * p) * (1 + 0.12 * level.value) },
      ],
    }
  })
  const spin = useDerivedValue(() => loop.value * Math.PI * 2 * 9)

  return (
    <Animated.View
      pointerEvents='none'
      style={[
        {
          position: 'absolute',
          left: (WATCH_SCREEN.width - ORB) / 2,
          top: (WATCH_SCREEN.height - ORB) / 2 + 18,
          width: ORB,
          height: ORB,
        },
        style,
      ]}
    >
      <Canvas style={{ width: ORB, height: ORB }}>
        {colors.map((color, i) => (
          <Glow
            key={color}
            color={color}
            angle={(i * Math.PI * 2) / colors.length}
            spin={spin}
            level={level}
          />
        ))}
      </Canvas>
    </Animated.View>
  )
}

/** One of the orb's glows, circling the middle — wider as the voice rises. */
const Glow = ({
  color,
  angle,
  spin,
  level,
}: {
  color: string
  angle: number
  spin: DerivedValue<number>
  level: DerivedValue<number>
}) => {
  const cx = useDerivedValue(
    () => ORB / 2 + Math.cos(spin.value + angle) * (6 + 4 * level.value)
  )
  const cy = useDerivedValue(
    () => ORB / 2 + Math.sin(spin.value + angle) * (6 + 4 * level.value)
  )
  return (
    <Circle cx={cx} cy={cy} r={15} color={color} opacity={0.85}>
      <BlurMask blur={5} style='normal' />
    </Circle>
  )
}

export default SiriVisual
