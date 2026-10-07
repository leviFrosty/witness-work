import { View } from 'react-native'
import Animated, {
  DerivedValue,
  useAnimatedStyle,
  useDerivedValue,
} from 'react-native-reanimated'
import { Flame as FlameIcon } from 'lucide-react-native'
import moment from 'moment'
import useTheme from '@/contexts/theme'
import LucideIcon from '@/components/ui/LucideIcon'
import { formatStartTime } from '@/lib/dates'
import i18n from '@/lib/locales'
import { useFormattedMinutes } from '@/lib/minutes'
import { withAlpha } from '@/lib/color'
import { buddySlotColor } from '@/features/buddies/lib/buddyColors'
import {
  Bar,
  RevealVisualProps,
  Surface,
  VisualText,
  backOut,
  seg,
  segInOut,
  useRiseStyle,
  useVisualClock,
} from '@/features/updates/components/reveal/visuals/kit'
import { Face } from '@/features/plans/components/schedule-intro/introKit'

const CARD = { top: 150, height: 110 }
const STACK = { x: 16, y: CARD.top + 62, size: 30, step: 22 }
/** You in the middle, a buddy each side, and each one's streak. */
const PEOPLE = [
  { x: 70, y: 48, size: 40, streak: 5 },
  { x: 160, y: 36, size: 50, streak: 12, you: true },
  { x: 250, y: 48, size: 40, streak: 8 },
]
/** The order people join the Plan: you first, then your buddies. */
const JOIN_ORDER = [1, 0, 2]

/**
 * Together: you and two buddies, each with a streak, joining one Plan; then
 * every streak flares at once.
 */
const TogetherVisual = ({
  palette,
  active,
  reduceMotion,
}: RevealVisualProps) => {
  const theme = useTheme()
  const { intro, loop } = useVisualClock({
    active,
    reduceMotion,
    introMs: 1100,
    loopMs: 5600,
    restAt: 0.8,
  })
  const reset = useDerivedValue(() => seg(loop.value, 0.9, 0.97))
  const flare = useDerivedValue(() => {
    const p = seg(loop.value, 0.62, 0.78)
    return Math.sin(Math.PI * p)
  })
  const cardStyle = useRiseStyle(intro, 0.4, 1, 24)
  const colors = PEOPLE.map((person, i) =>
    person.you ? theme.colors.accent : buddySlotColor(theme, i)
  )
  const saturday = moment().day(6)
  const duration = useFormattedMinutes(120).formatted

  return (
    <View style={{ flex: 1 }}>
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: 0,
            right: 0,
            top: CARD.top,
            height: CARD.height,
          },
          cardStyle,
        ]}
      >
        <Surface palette={palette} style={{ flex: 1, padding: 14, gap: 8 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <VisualText
              style={{
                fontSize: 15,
                fontFamily: theme.fonts.bold,
                color: palette.text,
              }}
            >
              {`${saturday.format('dddd')} · ${formatStartTime(9 * 60 + 30)}`}
            </VisualText>
            <VisualText
              style={{
                fontSize: 14,
                fontFamily: theme.fonts.bold,
                color: theme.colors.accent,
              }}
            >
              {duration}
            </VisualText>
          </View>
          <Bar palette={palette} width='45%' />
        </Surface>
      </Animated.View>

      <GoingLabel loop={loop} reset={reset} />

      {PEOPLE.map((person, i) => (
        <Person
          key={i}
          index={i}
          color={colors[i]}
          border={palette.badgeBorder}
          intro={intro}
          loop={loop}
          reset={reset}
          flare={flare}
          textColor={theme.colors.orange}
          pill={theme.colors.orangeTranslucent}
        />
      ))}
    </View>
  )
}

/** "Going" beside the faces gathered in the Plan. */
function GoingLabel({
  loop,
  reset,
}: {
  loop: DerivedValue<number>
  reset: DerivedValue<number>
}) {
  const theme = useTheme()
  const style = useAnimatedStyle(() => {
    const p = seg(loop.value, 0.5, 0.58) * (1 - reset.value)
    return { opacity: p, transform: [{ translateX: (1 - p) * -8 }] }
  })
  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: STACK.x + STACK.size + STACK.step * 2 + 10,
          top: STACK.y + 5,
          paddingHorizontal: 8,
          paddingVertical: 3,
          borderRadius: 8,
          backgroundColor: withAlpha(theme.colors.accent, 0x2e),
        },
        style,
      ]}
    >
      <VisualText style={{ fontSize: 11, color: theme.colors.accent }}>
        {i18n.t('buddies_going')}
      </VisualText>
    </Animated.View>
  )
}

/**
 * A person with their streak. They pop in, then a copy of them travels into the
 * Plan's row of faces.
 */
function Person({
  index,
  color,
  border,
  intro,
  loop,
  reset,
  flare,
  textColor,
  pill,
}: {
  index: number
  color: string
  border: string
  intro: DerivedValue<number>
  loop: DerivedValue<number>
  reset: DerivedValue<number>
  flare: DerivedValue<number>
  textColor: string
  pill: string
}) {
  const theme = useTheme()
  const person = PEOPLE[index]
  const order = JOIN_ORDER.indexOf(index)
  const toX = STACK.x + order * STACK.step + STACK.size / 2
  const toY = STACK.y + STACK.size / 2
  const faceStyle = useAnimatedStyle(() => {
    const p = seg(intro.value, 0.1 + index * 0.12, 0.4 + index * 0.12)
    return {
      opacity: Math.min(1, p * 2),
      transform: [{ scale: 0.4 + 0.6 * backOut(p) }],
    }
  })
  const streakStyle = useAnimatedStyle(() => {
    const p = seg(intro.value, 0.35 + index * 0.12, 0.6 + index * 0.12)
    return {
      opacity: p,
      transform: [
        { scale: (0.6 + 0.4 * backOut(p)) * (1 + 0.22 * flare.value) },
      ],
    }
  })
  const travelStyle = useAnimatedStyle(() => {
    const from = 0.08 + order * 0.12
    const p = segInOut(loop.value, from, from + 0.18)
    const landed = p >= 1
    const x = person.x + (toX - person.x) * p
    const y = person.y + (toY - person.y) * p - Math.sin(Math.PI * p) * 24
    const size = person.size + (STACK.size - person.size) * p
    return {
      opacity: p > 0 ? 1 - reset.value : 0,
      zIndex: landed ? order : 10,
      transform: [
        { translateX: x - size / 2 },
        { translateY: y - size / 2 },
        { scale: size / person.size },
      ],
    }
  })
  return (
    <>
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: person.x - person.size / 2,
            top: person.y - person.size / 2,
          },
          faceStyle,
        ]}
      >
        <Face color={color} size={person.size} border={border} />
      </Animated.View>
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: person.x - 30,
            top: person.y + person.size / 2 + 6,
            width: 60,
            alignItems: 'center',
          },
          streakStyle,
        ]}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 3,
            paddingHorizontal: 7,
            paddingVertical: 2,
            borderRadius: 999,
            backgroundColor: pill,
          }}
        >
          <LucideIcon
            icon={FlameIcon}
            size={12}
            color={textColor}
            fill={textColor}
          />
          <VisualText
            style={{
              fontSize: 12,
              fontFamily: theme.fonts.bold,
              color: textColor,
            }}
          >
            {String(person.streak)}
          </VisualText>
        </View>
      </Animated.View>
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: 0,
            top: 0,
            transformOrigin: ['0%', '0%', 0],
          },
          travelStyle,
        ]}
      >
        <Face color={color} size={person.size} border={border} />
      </Animated.View>
    </>
  )
}

export default TogetherVisual
