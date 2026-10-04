import { useEffect, useRef, useState } from 'react'
import { LayoutChangeEvent, View } from 'react-native'
import Animated, {
  Easing,
  SharedValue,
  clamp,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import { usePreferences } from '@/stores/preferences'
import {
  DISPLAY_FONT_SCALE_CAP,
  Headline,
} from '@/features/onboarding/constants/welcome'
import { WelcomePalette } from '@/features/onboarding/lib/welcomePalette'

const WORD_IN_MS = 620
const WORD_IN_STAGGER = 55
const WORD_OUT_MS = 300
const WORD_OUT_STAGGER = 25
// A new line waits for most of the old one to clear the slot.
const SWAP_DELAY_MS = 260

interface WordProps {
  text: string
  index: number
  count: number
  enter: SharedValue<number>
  exit: SharedValue<number>
  fontSize: number
  lineHeight: number
  color: string
  reduceMotion: boolean
}

/** One word rising out of — and later away through — its own slot. */
const Word = ({
  text,
  index,
  count,
  enter,
  exit,
  fontSize,
  lineHeight,
  color,
  reduceMotion,
}: WordProps) => {
  const theme = useTheme()
  const style = useAnimatedStyle(() => {
    const a = clamp(
      (enter.value * (WORD_IN_MS + count * WORD_IN_STAGGER) -
        index * WORD_IN_STAGGER) /
        WORD_IN_MS,
      0,
      1
    )
    const b = clamp(
      (exit.value * (WORD_OUT_MS + count * WORD_OUT_STAGGER) -
        index * WORD_OUT_STAGGER) /
        WORD_OUT_MS,
      0,
      1
    )
    const rise = 1 - Math.pow(1 - a, 3)
    const leave = b * b * b
    if (reduceMotion) return { opacity: rise * (1 - leave) }
    return {
      opacity: Math.min(1, rise * 1.5) * (1 - leave),
      transform: [
        { translateY: (1 - rise) * lineHeight - leave * lineHeight * 0.8 },
      ],
    }
  })

  // The slot clips the word; its padding leaves room for accents, descenders
  // and side bearings without changing the line's layout.
  const bleed = lineHeight * 0.14
  return (
    <View
      style={{
        overflow: 'hidden',
        padding: bleed,
        margin: -bleed,
      }}
    >
      <Animated.View style={style}>
        <Text
          maxFontSizeMultiplier={DISPLAY_FONT_SCALE_CAP}
          style={{
            fontSize,
            lineHeight,
            letterSpacing: -fontSize * 0.025,
            fontFamily: theme.fonts.bold,
            color,
          }}
        >
          {text}
        </Text>
      </Animated.View>
    </View>
  )
}

interface LineProps {
  text: string
  current: boolean
  /** Wait before rising in, to let the previous line clear. */
  enterDelay: number
  /** A word to pick out in the accent colour (the brand name). */
  highlight: string
  palette: WelcomePalette
  fontSize: number
  reduceMotion: boolean
  onHeight: (height: number) => void
}

const HeadlineLine = ({
  text,
  current,
  enterDelay,
  highlight,
  palette,
  fontSize,
  reduceMotion,
  onHeight,
}: LineProps) => {
  const theme = useTheme()
  const { fontSizeOffset } = usePreferences()
  const words = text.split(/\s+/).filter(Boolean)
  const enter = useSharedValue(0)
  const exit = useSharedValue(0)
  const shown = useRef(false)
  const wasCurrent = useRef(false)
  // `Text` adds the user's size offset to `fontSize`; the line has to as well.
  const lineHeight = Math.round((fontSize + fontSizeOffset) * 1.14)

  useEffect(() => {
    if (current) {
      const arriving = !wasCurrent.current
      wasCurrent.current = true
      // Only the wait changed (the intro was hurried): leave a rise that has
      // already begun alone.
      if (!arriving && enter.value > 0) return
      // Returning to a line always has another one to make way for.
      const delay = arriving && shown.current ? SWAP_DELAY_MS : enterDelay
      shown.current = true
      exit.value = 0
      enter.value = withSequence(
        withTiming(0, { duration: 0 }),
        withDelay(
          delay,
          withTiming(1, {
            duration: WORD_IN_MS + words.length * WORD_IN_STAGGER,
            easing: Easing.linear,
          })
        )
      )
    } else if (wasCurrent.current) {
      wasCurrent.current = false
      exit.value = withTiming(1, {
        duration: WORD_OUT_MS + words.length * WORD_OUT_STAGGER,
        easing: Easing.linear,
      })
    }
  }, [current, enterDelay, words.length, enter, exit])

  return (
    <View
      onLayout={(e: LayoutChangeEvent) => onHeight(e.nativeEvent.layout.height)}
      // Lines sit on the box's floor, so a short line stays with the copy
      // below it and the spare room opens up above.
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        flexDirection: 'row',
        flexWrap: 'wrap',
        columnGap: (fontSize + fontSizeOffset) * 0.24,
      }}
    >
      {words.map((word, index) => (
        <Word
          key={`${index}-${word}`}
          text={word}
          index={index}
          count={words.length}
          enter={enter}
          exit={exit}
          fontSize={fontSize}
          lineHeight={lineHeight}
          color={
            word.replace(/[.,!?。！]/g, '') === highlight
              ? theme.colors.accent
              : palette.text
          }
          reduceMotion={reduceMotion}
        />
      ))}
    </View>
  )
}

interface SegmentProps {
  state: 'past' | 'current' | 'future'
  holdMs: number
  palette: WelcomePalette
}

const Segment = ({ state, holdMs, palette }: SegmentProps) => {
  const fill = useSharedValue(state === 'past' ? 1 : 0)

  useEffect(() => {
    fill.value =
      state === 'current'
        ? withSequence(
            withTiming(0, { duration: 0 }),
            withTiming(1, { duration: holdMs, easing: Easing.linear })
          )
        : withTiming(state === 'past' ? 1 : 0, { duration: 250 })
  }, [state, holdMs, fill])

  const fillStyle = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }))

  return (
    <View
      style={{
        width: 22,
        height: 4,
        borderRadius: 2,
        overflow: 'hidden',
        backgroundColor: palette.skeleton,
      }}
    >
      <Animated.View
        style={[{ height: '100%', backgroundColor: palette.text }, fillStyle]}
      />
    </View>
  )
}

type LineId = Exclude<Headline, null>

interface Props {
  /** The greeting, then one line per part of the story, in order. */
  lines: { id: LineId; text: string }[]
  current: Headline
  /** Extra wait before the greeting first rises in. */
  firstLineDelay: number
  highlight: string
  palette: WelcomePalette
  fontSize: number
  /** How long each part of the story holds, for its progress segment. */
  holdMs: number
  reduceMotion: boolean
}

/**
 * The welcome's headline: it greets the user, then tells the app's story one
 * line at a time, each word rising through its own slot. Story progress shows
 * as segments above it. Screen readers get every line at once, in order.
 */
const WelcomeHeadline = ({
  lines,
  current,
  firstLineDelay,
  highlight,
  palette,
  fontSize,
  holdMs,
  reduceMotion,
}: Props) => {
  const { fontSizeOffset } = usePreferences()
  const [heights, setHeights] = useState<Partial<Record<LineId, number>>>({})
  const story = lines.filter((line) => line.id !== 'welcome')
  const storyIndex = story.findIndex((line) => line.id === current)
  const pagerOpacity = useSharedValue(0)

  useEffect(() => {
    pagerOpacity.value = withTiming(storyIndex >= 0 ? 1 : 0, { duration: 400 })
  }, [storyIndex, pagerOpacity])

  const pagerStyle = useAnimatedStyle(() => ({ opacity: pagerOpacity.value }))

  // Reserve the tallest line's height so the copy below never jumps.
  const tallest = Math.max(
    Math.round((fontSize + fontSizeOffset) * 1.14) * 2,
    ...Object.values(heights)
  )

  return (
    <View
      accessible
      accessibilityRole='header'
      accessibilityLabel={lines.map((line) => line.text).join(' ')}
    >
      <Animated.View
        style={[{ flexDirection: 'row', gap: 6, marginBottom: 18 }, pagerStyle]}
      >
        {story.map((line, i) => (
          <Segment
            key={line.id}
            state={
              i < storyIndex ? 'past' : i === storyIndex ? 'current' : 'future'
            }
            holdMs={holdMs}
            palette={palette}
          />
        ))}
      </Animated.View>
      <View style={{ height: tallest }}>
        {lines.map((line) => (
          <HeadlineLine
            key={line.id}
            text={line.text}
            current={line.id === current}
            // Only the greeting arrives without a line to replace.
            enterDelay={line.id === 'welcome' ? firstLineDelay : SWAP_DELAY_MS}
            highlight={highlight}
            palette={palette}
            fontSize={fontSize}
            reduceMotion={reduceMotion}
            onHeight={(height) =>
              setHeights((prev) =>
                prev[line.id] === height ? prev : { ...prev, [line.id]: height }
              )
            }
          />
        ))}
      </View>
    </View>
  )
}

export default WelcomeHeadline
