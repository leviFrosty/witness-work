import { Fragment, useEffect } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Check as CheckIcon, Lock as LockIcon } from 'lucide-react-native'
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
import { scheduleOnUI } from 'react-native-worklets'
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg'
import moment from 'moment'
import Avatar from '@/components/ui/Avatar'
import LucideIcon from '@/components/ui/LucideIcon'
import useTheme from '@/contexts/theme'
import { withAlpha } from '@/lib/color'
import i18n from '@/lib/locales'
import { formatMinutesCompact } from '@/lib/minutes'
import { useProfile } from '@/stores/profile'

/**
 * The sketch is laid out on a fixed stage, centered in a card that stretches,
 * so the buddy's initial always lands on its day.
 */
const STAGE = { width: 300, height: 184 }
const CENTER = STAGE.width / 2
const AVATAR = 44
/** Ring that lifts each avatar off the card. */
const RING = 3
const AVATAR_Y = 34
/** Paired avatars sit this far either side of center... */
const PAIR_DX = 62
/** ...and drift this much further apart while unpaired. */
const APART = 22
const LINK_WIDTH = 2 * (PAIR_DX - AVATAR / 2 - RING - 5)
const LOCK = 24

const CELL = { width: 36, height: 40, gap: 4, top: 100 }
const FIRST_COLUMN =
  (STAGE.width - (7 * CELL.width + 6 * CELL.gap)) / 2 + CELL.width / 2
const columnX = (index: number) =>
  FIRST_COLUMN + index * (CELL.width + CELL.gap)
/** Your planned days; the buddy goes out with you on the second. */
const PLANNED = [1, 4]
const SHARED_DAY = 4
/** Another buddy plans to go out this day: just a dot. */
const DOT_DAY = 2

/**
 * The buddy's initial on a calendar day, at the cell's corner like
 * `BuddyDayBadge`, hanging a little further out so it clears the duration.
 */
const BADGE = 16
const BADGE_RING = 2
const BADGE_OUTER = BADGE + BADGE_RING * 2
const BADGE_HANG = { right: 7, bottom: 8 }
const BADGE_CENTER = {
  x: columnX(SHARED_DAY) + CELL.width / 2 + BADGE_HANG.right - BADGE_OUTER / 2,
  y: CELL.top + CELL.height + BADGE_HANG.bottom - BADGE_OUTER / 2,
}
/** It starts as a copy of the buddy's avatar, at the same size. */
const BADGE_FROM = { x: CENTER + PAIR_DX, y: AVATAR_Y, scale: AVATAR / BADGE }
/** How high it arcs on its way down. */
const HOP = 16
const CHIP_TOP = CELL.top + CELL.height + 16
const CHIP_SLOT = 180

/**
 * One pass of the story, in ms: the two pair up and link, a lock settles on the
 * link, the buddy's initial drops onto the day you both plan, a dot marks
 * another buddy's day, and "Going" pops. It holds, then eases back and plays
 * again.
 */
const LOOP_MS = 7600
const T = {
  pair: [400, 1200],
  link: [1100, 1600],
  lock: [1450, 1900],
  fly: [2000, 2900],
  land: [2900, 3200],
  ripple: [2900, 3700],
  dot: [3150, 3450],
  chip: [3400, 3900],
  chipOut: [6700, 7000],
  badgeOut: [6750, 7100],
  lockOut: [6750, 7050],
  linkOut: [6800, 7150],
  apart: [6900, 7400],
} as const
/** Reduce Motion holds here, with everything in place. */
const STILL = 5300 / LOOP_MS

type Span = readonly [number, number]

/** 0–1 progress through a span of the loop. */
const seg = (t: number, [from, to]: Span) => {
  'worklet'
  return Math.min(1, Math.max(0, (t * LOOP_MS - from) / (to - from)))
}
const easeOut = (x: number) => {
  'worklet'
  return 1 - Math.pow(1 - x, 3)
}
const easeInOut = (x: number) => {
  'worklet'
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2
}
/** Ease-out with a gentle overshoot, so things settle rather than stop. */
const easeOutBack = (x: number) => {
  'worklet'
  const c1 = 1.4
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2)
}
/** 1 until the span, then eases to 0 through it. */
const leaving = (t: number, span: Span) => {
  'worklet'
  return 1 - easeInOut(seg(t, span))
}
/** Never exactly 0, which would make a singular transform. */
const nonZero = (scale: number) => {
  'worklet'
  return Math.max(0.001, scale)
}
/** A pop in through `enter` that leaves through `exit`. */
const popStyle = (t: number, enter: Span, exit: Span) => {
  'worklet'
  const pop = seg(t, enter)
  const out = leaving(t, exit)
  return {
    opacity: Math.min(1, pop * 4) * out,
    transform: [{ scale: nonZero(easeOutBack(pop) * out) }],
  }
}

/**
 * Two people pair up over a private link, then share a day on the calendar: a
 * looping sketch of Buddies, with the User's own avatar beside a made-up buddy.
 * Purely decorative; the step's title and description say what it means. Under
 * Reduce Motion it rests on a frame with everything in place.
 */
const BuddiesPreview = () => {
  const theme = useTheme()
  const reduceMotion = useReducedMotion()
  const avatar = useProfile((state) => state.avatar)
  const name = useProfile((state) => state.name)
  const buddyName = i18n.t('onboardingBuddies_previewBuddyName')
  const buddyColor = theme.colors.purple
  const t = useSharedValue(reduceMotion ? STILL : 0)

  useEffect(() => {
    // Reset and start in one UI-thread step, so every repeat starts from 0
    // rather than a stale value (see NavMapPreview).
    scheduleOnUI(() => {
      'worklet'
      cancelAnimation(t)
      if (reduceMotion) {
        t.value = STILL
        return
      }
      t.value = 0
      t.value = withRepeat(
        withTiming(1, { duration: LOOP_MS, easing: Easing.linear }),
        -1,
        false
      )
    })
    return () => cancelAnimation(t)
  }, [reduceMotion, t])

  const youStyle = useAnimatedStyle(() => {
    const apart =
      1 - easeInOut(seg(t.value, T.pair)) * leaving(t.value, T.apart)
    return { transform: [{ translateX: -APART * apart }] }
  })
  const buddyStyle = useAnimatedStyle(() => {
    const apart =
      1 - easeInOut(seg(t.value, T.pair)) * leaving(t.value, T.apart)
    return { transform: [{ translateX: APART * apart }] }
  })
  const linkStyle = useAnimatedStyle(() => {
    const grow = easeOut(seg(t.value, T.link)) * leaving(t.value, T.linkOut)
    return {
      opacity: Math.min(1, grow * 3),
      transform: [{ scaleX: nonZero(grow) }],
    }
  })
  const lockStyle = useAnimatedStyle(() => popStyle(t.value, T.lock, T.lockOut))
  const dotStyle = useAnimatedStyle(() => popStyle(t.value, T.dot, T.badgeOut))
  const badgeStyle = useAnimatedStyle(() => {
    const fly = seg(t.value, T.fly)
    const p = easeInOut(fly)
    const x = BADGE_FROM.x + (BADGE_CENTER.x - BADGE_FROM.x) * p
    const y =
      BADGE_FROM.y +
      (BADGE_CENTER.y - BADGE_FROM.y) * p -
      Math.sin(p * Math.PI) * HOP
    const shrink = BADGE_FROM.scale + (1 - BADGE_FROM.scale) * easeOut(fly)
    const squash = 1 + Math.sin(seg(t.value, T.land) * Math.PI) * 0.18
    return {
      opacity:
        fly > 0 ? Math.min(1, fly * 6) * leaving(t.value, T.badgeOut) : 0,
      transform: [
        { translateX: x - BADGE_CENTER.x },
        { translateY: y - BADGE_CENTER.y },
        { scale: shrink * squash },
      ],
    }
  })
  const rippleStyle = useAnimatedStyle(() => {
    const r = seg(t.value, T.ripple)
    return {
      opacity: r > 0 && r < 1 ? Math.sin(r * Math.PI) * 0.9 : 0,
      transform: [{ scale: 1 + easeOut(r) * 0.18 }],
    }
  })
  const chipStyle = useAnimatedStyle(() => {
    const pop = seg(t.value, T.chip)
    return {
      opacity: Math.min(1, pop * 3) * leaving(t.value, T.chipOut),
      transform: [
        { translateY: (1 - easeOut(pop)) * -6 },
        { scale: 0.6 + 0.4 * easeOutBack(pop) },
      ],
    }
  })

  const weekStart = moment().startOf('week')
  const days = Array.from({ length: 7 }, (_, index) => {
    const day = weekStart.clone().add(index, 'days')
    return {
      letter: Array.from(day.format('dd'))[0] ?? '',
      date: day.date(),
      planned: PLANNED.includes(index),
    }
  })
  // Fixed-size art: its labels don't scale with Dynamic Type, or they'd burst
  // the cells. The step's real copy scales normally.
  const label = (fontSize: number, color: string, bold = false) => ({
    fontSize,
    color,
    fontFamily: bold ? theme.fonts.semiBold : theme.fonts.medium,
  })
  const avatarRing = {
    position: 'absolute' as const,
    top: AVATAR_Y - AVATAR / 2 - RING,
    padding: RING,
    borderRadius: AVATAR,
    backgroundColor: theme.colors.card,
  }
  const cellBox = (index: number) => ({
    position: 'absolute' as const,
    top: CELL.top,
    left: columnX(index) - CELL.width / 2,
    width: CELL.width,
    height: CELL.height,
  })

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility='no-hide-descendants'
      pointerEvents='none'
      style={{
        borderRadius: theme.numbers.borderRadiusLg,
        borderCurve: 'continuous',
        backgroundColor: theme.colors.backgroundLighter,
        borderWidth: 1,
        borderColor: theme.colors.border,
        paddingVertical: 14,
        alignItems: 'center',
        overflow: 'hidden',
        shadowColor: theme.colors.shadow,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 10,
        elevation: 4,
      }}
    >
      {/* A soft pool of light behind the pair. */}
      <Svg style={StyleSheet.absoluteFill} width='100%' height='100%'>
        <Defs>
          <RadialGradient
            id='buddiesPreviewGlow'
            cx='50%'
            cy='22%'
            rx='42%'
            ry='48%'
          >
            <Stop
              offset='0'
              stopColor={theme.colors.accent}
              stopOpacity={0.2}
            />
            <Stop offset='1' stopColor={theme.colors.accent} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width='100%' height='100%' fill='url(#buddiesPreviewGlow)' />
      </Svg>
      <View style={{ width: STAGE.width, height: STAGE.height }}>
        <Animated.View
          style={[
            {
              position: 'absolute',
              top: AVATAR_Y - 1.5,
              left: CENTER - LINK_WIDTH / 2,
              width: LINK_WIDTH,
              height: 3,
              borderRadius: 1.5,
              backgroundColor: withAlpha(theme.colors.accent, 0x80),
            },
            linkStyle,
          ]}
        />
        <Animated.View
          style={[
            avatarRing,
            { left: CENTER - PAIR_DX - AVATAR / 2 - RING },
            youStyle,
          ]}
        >
          <Avatar avatar={avatar} name={name} size={AVATAR} />
        </Animated.View>
        <Animated.View
          style={[
            avatarRing,
            { left: CENTER + PAIR_DX - AVATAR / 2 - RING },
            buddyStyle,
          ]}
        >
          <Avatar
            avatar={{ type: 'none', value: '' }}
            name={buddyName}
            size={AVATAR}
            background={buddyColor}
          />
        </Animated.View>
        <Animated.View
          style={[
            {
              position: 'absolute',
              top: AVATAR_Y - LOCK / 2,
              left: CENTER - LOCK / 2,
              width: LOCK,
              height: LOCK,
              borderRadius: LOCK / 2,
              borderWidth: 2,
              borderColor: theme.colors.backgroundLighter,
              backgroundColor: theme.colors.accent,
              alignItems: 'center',
              justifyContent: 'center',
            },
            lockStyle,
          ]}
        >
          <LucideIcon icon={LockIcon} size={11} color={theme.colors.card} />
        </Animated.View>

        {days.map((day, index) => (
          <Fragment key={index}>
            <Text
              allowFontScaling={false}
              style={[
                label(10, theme.colors.textAlt),
                {
                  ...cellBox(index),
                  top: CELL.top - 18,
                  height: undefined,
                  textAlign: 'center',
                },
              ]}
            >
              {day.letter}
            </Text>
            {index === SHARED_DAY && (
              // Behind the cell, so only its growing edge shows.
              <Animated.View
                style={[
                  cellBox(index),
                  {
                    borderRadius: theme.numbers.borderRadiusSm + 2,
                    borderWidth: 2,
                    borderColor: buddyColor,
                  },
                  rippleStyle,
                ]}
              />
            )}
            <View
              style={[
                cellBox(index),
                {
                  borderRadius: theme.numbers.borderRadiusSm,
                  backgroundColor: theme.colors.background,
                  alignItems: 'center',
                  justifyContent: 'center',
                },
              ]}
            >
              <Text
                allowFontScaling={false}
                style={label(14, theme.colors.text, true)}
              >
                {day.date}
              </Text>
              {day.planned && (
                <Text
                  allowFontScaling={false}
                  style={label(9, theme.colors.textAlt)}
                >
                  {formatMinutesCompact(120)}
                </Text>
              )}
            </View>
            {index === DOT_DAY && (
              <Animated.View
                style={[
                  {
                    position: 'absolute',
                    top: CELL.top + CELL.height + 2,
                    left: columnX(index) - 2.5,
                    width: 5,
                    height: 5,
                    borderRadius: 2.5,
                    backgroundColor: theme.colors.textAlt,
                  },
                  dotStyle,
                ]}
              />
            )}
          </Fragment>
        ))}

        <Animated.View
          style={[
            {
              position: 'absolute',
              left: BADGE_CENTER.x - BADGE_OUTER / 2,
              top: BADGE_CENTER.y - BADGE_OUTER / 2,
              padding: BADGE_RING,
              borderRadius: BADGE_OUTER,
              backgroundColor: theme.colors.card,
            },
            badgeStyle,
          ]}
        >
          <View
            style={{
              width: BADGE,
              height: BADGE,
              borderRadius: BADGE / 2,
              backgroundColor: buddyColor,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text
              allowFontScaling={false}
              style={label(9, theme.colors.textInverse, true)}
            >
              {Array.from(buddyName)[0] ?? ''}
            </Text>
          </View>
        </Animated.View>

        {/* Centered under the shared day; the slot keeps the pill's offset
            out of its animated transform. */}
        <View
          style={{
            position: 'absolute',
            top: CHIP_TOP,
            left: columnX(SHARED_DAY) - CHIP_SLOT / 2,
            width: CHIP_SLOT,
            alignItems: 'center',
          }}
        >
          <Animated.View
            style={[
              {
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                paddingVertical: 4,
                paddingHorizontal: 10,
                borderRadius: 999,
                backgroundColor: theme.colors.accentTranslucent,
              },
              chipStyle,
            ]}
          >
            <LucideIcon
              icon={CheckIcon}
              size={12}
              color={theme.colors.accent}
            />
            <Text
              allowFontScaling={false}
              numberOfLines={1}
              style={label(11, theme.colors.text, true)}
            >
              {`${i18n.t('buddies_going')} · ${moment().hour(9).minute(0).format('LT')}`}
            </Text>
          </Animated.View>
        </View>
      </View>
    </View>
  )
}

export default BuddiesPreview
