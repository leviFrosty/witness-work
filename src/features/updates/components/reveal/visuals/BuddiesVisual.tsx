import { View } from 'react-native'
import Animated, {
  DerivedValue,
  useAnimatedStyle,
  useDerivedValue,
} from 'react-native-reanimated'
import {
  LockKeyhole as LockKeyholeIcon,
  UserRound as UserRoundIcon,
} from 'lucide-react-native'
import moment from 'moment'
import useTheme from '@/contexts/theme'
import LucideIcon from '@/components/ui/LucideIcon'
import { formatStartTime } from '@/lib/dates'
import i18n from '@/lib/locales'
import { useFormattedMinutes } from '@/lib/minutes'
import { withAlpha } from '@/lib/color'
import { buddyColor } from '@/features/buddies/lib/buddyColors'
import {
  Bar,
  RevealVisualProps,
  Surface,
  TapRipple,
  VisualText,
  backOut,
  seg,
  segInOut,
  useRiseStyle,
  useVisualClock,
} from '@/features/updates/components/reveal/visuals/kit'

const YOU = { x: 160, y: 100, size: 46 }
const BUDDY_SIZE = 34
/** Buddies on an arc above you, each with the day they plan to go out. */
const BUDDIES = [
  { x: 56, y: 84, day: 1 },
  { x: 106, y: 60, day: 1 },
  { x: 214, y: 60, day: 3 },
  { x: 264, y: 84, day: 4 },
]
const CARD = { x: 8, y: 132, width: 304, height: 140 }
const DAYS = 5
const CARD_PAD = 12
const COLUMN_W = (CARD.width - CARD_PAD * 2) / DAYS
const DAY_Y = CARD.y + 42
const MARK_Y = CARD.y + 66
const MARK = 8
/** The day with two buddies out, which opens to show their plans. */
const OPEN_DAY = 1
const PLAN_START = 9 * 60 + 30
const PLAN_MINUTES = 120

const columnX = (day: number) => {
  'worklet'
  return CARD.x + CARD_PAD + COLUMN_W * (day + 0.5)
}

/** Where a buddy's marker sits under its day, beside any others there. */
const markX = (index: number) => {
  const { day } = BUDDIES[index]
  const sameDay = BUDDIES.filter((buddy) => buddy.day === day)
  const slot = sameDay.indexOf(BUDDIES[index])
  return columnX(day) + (slot - (sameDay.length - 1) / 2) * (MARK + 4)
}

/**
 * Buddies: you, paired with the people you go out with, and their planned days
 * landing on your calendar — sealed with a lock, since only you and they can
 * read them. A day with two buddies opens to show when they're going.
 */
const BuddiesVisual = ({
  palette,
  active,
  reduceMotion,
}: RevealVisualProps) => {
  const theme = useTheme()
  const duration = useFormattedMinutes(PLAN_MINUTES).formatted
  const { intro, loop } = useVisualClock({
    active,
    reduceMotion,
    introMs: 1700,
    loopMs: 6000,
    restAt: 0.76,
  })
  const days = Array.from({ length: DAYS }, (_, i) => moment().add(i, 'days'))
  const colors = BUDDIES.map((_, i) => buddyColor(theme, i))
  const openColors = BUDDIES.flatMap((buddy, i) =>
    buddy.day === OPEN_DAY ? [colors[i]] : []
  )

  const headerStyle = useRiseStyle(intro, 0, 0.2)
  const cardStyle = useRiseStyle(intro, 0.45, 0.85, 24)
  const youStyle = useAnimatedStyle(() => {
    const p = seg(intro.value, 0.08, 0.3)
    return {
      opacity: Math.min(1, p * 2),
      transform: [{ scale: 0.5 + 0.5 * backOut(p) }],
    }
  })
  const lockStyle = useAnimatedStyle(() => {
    const p = seg(intro.value, 0.8, 1)
    // A beat as the first plans set off.
    const beat = Math.sin(Math.PI * seg(loop.value, 0.02, 0.12))
    return {
      opacity: p,
      transform: [{ scale: (0.4 + 0.6 * backOut(p)) * (1 + 0.22 * beat) }],
    }
  })
  const reset = useDerivedValue(() => seg(loop.value, 0.88, 0.96))
  const dayTap = useDerivedValue(() => seg(loop.value, 0.56, 0.66))
  const open = useDerivedValue(
    () => seg(loop.value, 0.6, 0.7) * (1 - seg(loop.value, 0.84, 0.9))
  )
  const ringStyle = useAnimatedStyle(() => ({ opacity: open.value }))
  const planStyle = useAnimatedStyle(() => ({
    opacity: open.value,
    transform: [{ translateY: (1 - backOut(open.value)) * 16 }],
  }))

  return (
    <View style={{ flex: 1 }}>
      <Animated.View
        style={[
          {
            position: 'absolute',
            top: 4,
            left: 8,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
          },
          headerStyle,
        ]}
      >
        <VisualText
          style={{
            fontSize: 24,
            fontFamily: theme.fonts.bold,
            color: palette.text,
          }}
        >
          {i18n.t('buddies_title')}
        </VisualText>
        <View
          style={{
            paddingHorizontal: 7,
            paddingVertical: 2,
            borderRadius: 8,
            backgroundColor: theme.colors.accentTranslucent,
          }}
        >
          <VisualText
            style={{
              fontSize: 10,
              fontFamily: theme.fonts.bold,
              color: theme.colors.accent,
            }}
          >
            {i18n.t('alpha')}
          </VisualText>
        </View>
      </Animated.View>

      {BUDDIES.map((buddy, i) => (
        <Link key={i} index={i} color={colors[i]} intro={intro} />
      ))}

      <Animated.View
        style={[
          {
            position: 'absolute',
            top: CARD.y,
            left: CARD.x,
            width: CARD.width,
            height: CARD.height,
          },
          cardStyle,
        ]}
      >
        <Surface palette={palette} style={{ flex: 1, borderRadius: 20 }}>
          <View
            style={{
              flexDirection: 'row',
              paddingHorizontal: CARD_PAD,
              paddingTop: 12,
            }}
          >
            {days.map((day, i) => (
              <View
                key={i}
                style={{ width: COLUMN_W, alignItems: 'center', gap: 4 }}
              >
                <VisualText style={{ fontSize: 10, color: palette.textAlt }}>
                  {day.format('dd')}
                </VisualText>
                <View
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 13,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: i === 0 ? theme.colors.accent : undefined,
                  }}
                >
                  {i === OPEN_DAY && (
                    <Animated.View
                      style={[
                        {
                          position: 'absolute',
                          inset: -3,
                          borderRadius: 16,
                          borderWidth: 2,
                          borderColor: openColors[0],
                        },
                        ringStyle,
                      ]}
                    />
                  )}
                  <VisualText
                    style={{
                      fontSize: 13,
                      color: i === 0 ? theme.colors.textInverse : palette.text,
                    }}
                  >
                    {day.format('D')}
                  </VisualText>
                </View>
              </View>
            ))}
          </View>
        </Surface>
        <Animated.View
          style={[
            {
              position: 'absolute',
              left: 14,
              right: 14,
              bottom: 14,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              padding: 8,
              borderRadius: 14,
              borderCurve: 'continuous',
              backgroundColor: withAlpha(openColors[0], 0x1f),
            },
            planStyle,
          ]}
        >
          <View style={{ flexDirection: 'row' }}>
            {openColors.map((color, i) => (
              <View key={i} style={{ marginLeft: i === 0 ? 0 : -8 }}>
                <Face color={color} size={26} border={palette.badgeBorder} />
              </View>
            ))}
          </View>
          <VisualText
            style={{
              fontSize: 13,
              fontFamily: theme.fonts.bold,
              color: palette.text,
            }}
          >
            {i18n.t('buddies_dayPlanAtTime', {
              time: formatStartTime(PLAN_START),
              duration,
            })}
          </VisualText>
          <Bar palette={palette} width={48} />
        </Animated.View>
      </Animated.View>

      <TapRipple
        tap={dayTap}
        color={theme.colors.accent}
        size={38}
        style={{ left: columnX(OPEN_DAY) - 19, top: DAY_Y - 19 }}
      />

      {BUDDIES.map((buddy, i) => (
        <Buddy
          key={i}
          index={i}
          color={colors[i]}
          border={palette.badgeBorder}
          intro={intro}
          loop={loop}
          reset={reset}
        />
      ))}

      <Animated.View
        style={[
          {
            position: 'absolute',
            left: YOU.x - YOU.size / 2,
            top: YOU.y - YOU.size / 2,
          },
          youStyle,
        ]}
      >
        <Face
          color={theme.colors.accent}
          size={YOU.size}
          border={palette.badgeBorder}
        />
        <Animated.View
          style={[
            {
              position: 'absolute',
              right: -6,
              bottom: -4,
              width: 22,
              height: 22,
              borderRadius: 11,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.colors.card,
              borderWidth: 1.5,
              borderColor: palette.surfaceBorder,
            },
            lockStyle,
          ]}
        >
          <LucideIcon
            icon={LockKeyholeIcon}
            size={12}
            strokeWidth={2.6}
            color={theme.colors.accent}
          />
        </Animated.View>
      </Animated.View>
    </View>
  )
}

/** A person, as a coloured circle — the sketch never shows real names. */
const Face = ({
  color,
  size,
  border,
}: {
  color: string
  size: number
  border: string
}) => (
  <View
    style={{
      width: size,
      height: size,
      borderRadius: size / 2,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: color,
      borderWidth: 2,
      borderColor: border,
    }}
  >
    <LucideIcon
      icon={UserRoundIcon}
      size={size * 0.5}
      strokeWidth={2.4}
      color='#FFFFFF'
    />
  </View>
)

/** The line from you to a buddy, drawn as they pair. */
const Link = ({
  index,
  color,
  intro,
}: {
  index: number
  color: string
  intro: DerivedValue<number>
}) => {
  const buddy = BUDDIES[index]
  const dx = buddy.x - YOU.x
  const dy = buddy.y - YOU.y
  const length = Math.hypot(dx, dy)
  const angle = Math.atan2(dy, dx)
  const style = useAnimatedStyle(() => ({
    transform: [
      { rotate: `${angle}rad` },
      { scaleX: seg(intro.value, 0.25 + index * 0.1, 0.4 + index * 0.1) },
    ],
  }))
  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: YOU.x,
          top: YOU.y - 1,
          width: length,
          height: 2,
          borderRadius: 1,
          transformOrigin: ['0%', '50%', 0],
          backgroundColor: withAlpha(color, 0x80),
        },
        style,
      ]}
    />
  )
}

/**
 * A buddy, popping in as they pair; then their planned day travels down to your
 * calendar and lands as a marker under the date.
 */
const Buddy = ({
  index,
  color,
  border,
  intro,
  loop,
  reset,
}: {
  index: number
  color: string
  border: string
  intro: DerivedValue<number>
  loop: DerivedValue<number>
  reset: DerivedValue<number>
}) => {
  const buddy = BUDDIES[index]
  const toX = markX(index)
  const faceStyle = useAnimatedStyle(() => {
    const p = seg(intro.value, 0.33 + index * 0.1, 0.5 + index * 0.1)
    return {
      opacity: Math.min(1, p * 2),
      transform: [{ scale: 0.3 + 0.7 * backOut(p) }],
    }
  })
  const packetStyle = useAnimatedStyle(() => {
    const p = segInOut(loop.value, 0.06 + index * 0.08, 0.24 + index * 0.08)
    const x = buddy.x + (toX - buddy.x) * p
    const y = buddy.y + (MARK_Y - buddy.y) * p - Math.sin(Math.PI * p) * 18
    return {
      opacity: p > 0 && p < 1 ? 1 : 0,
      transform: [
        { translateX: x - MARK / 2 },
        { translateY: y - MARK / 2 },
        { scale: 1 + 0.4 * Math.sin(Math.PI * p) },
      ],
    }
  })
  const markStyle = useAnimatedStyle(() => {
    const p = seg(loop.value, 0.22 + index * 0.08, 0.32 + index * 0.08)
    return {
      opacity: Math.min(1, p * 3) * (1 - reset.value),
      transform: [{ scale: backOut(p) }],
    }
  })
  const dot = {
    position: 'absolute' as const,
    width: MARK,
    height: MARK,
    borderRadius: MARK / 2,
    backgroundColor: color,
  }
  return (
    <>
      <Animated.View
        style={[
          { ...dot, left: toX - MARK / 2, top: MARK_Y - MARK / 2 },
          markStyle,
        ]}
      />
      <Animated.View style={[{ ...dot, left: 0, top: 0 }, packetStyle]} />
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: buddy.x - BUDDY_SIZE / 2,
            top: buddy.y - BUDDY_SIZE / 2,
          },
          faceStyle,
        ]}
      >
        <Face color={color} size={BUDDY_SIZE} border={border} />
      </Animated.View>
    </>
  )
}

export default BuddiesVisual
