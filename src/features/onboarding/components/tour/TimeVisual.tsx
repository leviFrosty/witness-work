import { useEffect, useState } from 'react'
import { View } from 'react-native'
import Animated, {
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
} from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import { Canvas, Path, Skia } from '@shopify/react-native-skia'
import { Check as CheckIcon, Timer as TimerIcon } from 'lucide-react-native'
import moment from 'moment'
import useTheme from '@/contexts/theme'
import LucideIcon from '@/components/ui/LucideIcon'
import i18n from '@/lib/locales'
import { formatMinutesCompact } from '@/lib/minutes'
import { formatMs } from '@/features/service-reports/hooks/useStopWatch'
import {
  IconTile,
  RevealVisualProps,
  Surface,
  TapRipple,
  VisualText,
  backOut,
  seg,
  useRiseStyle,
  useVisualClock,
} from '@/features/updates/components/reveal/visuals/kit'

const GOAL_MINUTES = 50 * 60
const BEFORE_MINUTES = 34 * 60
// A believable session already under way: 1h 24m.
const SESSION_MINUTES = 84
const AFTER_MINUTES = BEFORE_MINUTES + SESSION_MINUTES

const TIMER = { top: 0, height: 76 }
const MONTH = { top: 92, height: 188 }
const RING = { size: 132, stroke: 14, left: 18 }
const RING_TOP = (MONTH.height - RING.size) / 2
const SAVE = { right: 16, width: 74, height: 34 }

/** When Save is tapped, the session flies into the ring, and it all resets. */
const T = { tap: 0.38, fly: [0.44, 0.6], fill: [0.56, 0.74], reset: 0.92 }

const ringPath = (() => {
  const inset = RING.stroke / 2
  const bounds = Skia.XYWHRect(
    inset,
    inset,
    RING.size - RING.stroke,
    RING.size - RING.stroke
  )
  return Skia.PathBuilder.Make().addArc(bounds, -90, 359.9).detach()
})()

/**
 * Tracking time: a timer runs, Save sends the session into the month, and the
 * goal ring fills up to meet it.
 */
const TimeVisual = ({ palette, active, reduceMotion }: RevealVisualProps) => {
  const theme = useTheme()
  const accent = theme.colors.accent
  const { intro, loop } = useVisualClock({
    active,
    reduceMotion,
    introMs: 900,
    loopMs: 5600,
    restAt: 0.8,
  })
  // Compact throughout: the sketch is small, like the app's tight spots.
  const session = `+${formatMinutesCompact(SESSION_MINUTES)}`
  const toGoBefore = formatMinutesCompact(GOAL_MINUTES - BEFORE_MINUTES)
  const toGoAfter = formatMinutesCompact(GOAL_MINUTES - AFTER_MINUTES)

  // The stopwatch ticks in real time and starts over with each loop.
  const [seconds, setSeconds] = useState(0)
  const ticking = active && !reduceMotion
  useEffect(() => {
    if (!ticking) return
    const id = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [ticking])
  useAnimatedReaction(
    () => loop.value,
    (now, before) => {
      if (before !== null && now < before) scheduleOnRN(setSeconds, 0)
    }
  )
  const elapsed = formatMs(((SESSION_MINUTES - 1) * 60 + 40 + seconds) * 1000)

  const timerStyle = useRiseStyle(intro, 0, 0.55, 22)
  const monthStyle = useRiseStyle(intro, 0.25, 0.9, 22)
  const reset = useDerivedValue(() => seg(loop.value, T.reset, 0.98))
  const tap = useDerivedValue(() => seg(loop.value, T.tap, T.tap + 0.08))
  const saved = useDerivedValue(
    () => seg(loop.value, T.tap + 0.03, T.tap + 0.08) * (1 - reset.value)
  )
  const fly = useDerivedValue(() => seg(loop.value, T.fly[0], T.fly[1]))
  const fill = useDerivedValue(
    () => seg(loop.value, T.fill[0], T.fill[1]) * (1 - reset.value)
  )
  const ringEnd = useDerivedValue(
    () =>
      (seg(intro.value, 0.4, 1) * BEFORE_MINUTES +
        fill.value * SESSION_MINUTES) /
      GOAL_MINUTES
  )

  const runningStyle = useAnimatedStyle(() => ({ opacity: 1 - saved.value }))
  const savedStyle = useAnimatedStyle(() => ({
    opacity: saved.value,
    transform: [{ scale: 0.6 + 0.4 * backOut(saved.value) }],
  }))
  const saveStyle = useAnimatedStyle(() => {
    const dip = seg(tap.value, 0, 0.3) * (1 - seg(tap.value, 0.3, 1))
    return { transform: [{ scale: 1 - dip * 0.08 }] }
  })
  // From the Save button down and across into the ring, on a gentle arc.
  const chipStyle = useAnimatedStyle(() => {
    const p = fly.value
    const from = { x: 320 - SAVE.right - SAVE.width, y: TIMER.top + 20 }
    const to = {
      x: RING.left + RING.size / 2 - 40,
      y: MONTH.top + RING_TOP + RING.size / 2 - 14,
    }
    return {
      opacity: p > 0 && p < 1 ? Math.min(1, p * 6, (1 - p) * 4) : 0,
      transform: [
        { translateX: from.x + (to.x - from.x) * p },
        {
          translateY: from.y + (to.y - from.y) * p - Math.sin(p * Math.PI) * 40,
        },
        { scale: 1 - p * 0.25 },
      ],
    }
  })
  // The totals swap quickly as the ring passes halfway, so they never blur.
  const swap = useDerivedValue(() =>
    fill.value < 0.45 ? 0 : fill.value > 0.6 ? 1 : (fill.value - 0.45) / 0.15
  )
  const beforeStyle = useAnimatedStyle(() => ({ opacity: 1 - swap.value }))
  const afterStyle = useAnimatedStyle(() => ({ opacity: swap.value }))
  // Today's bar grows with the saved session.
  const todayStyle = useAnimatedStyle(() => ({
    height: 10 + 24 * fill.value,
  }))

  const week = [18, 30, 0, 22, 12, 0]
  const month = moment().format('MMMM')

  return (
    <View style={{ flex: 1 }}>
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: 0,
            right: 0,
            top: TIMER.top,
            height: TIMER.height,
          },
          timerStyle,
        ]}
      >
        <Surface
          palette={palette}
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingHorizontal: 16,
          }}
        >
          <IconTile icon={TimerIcon} color={accent} size={36} />
          <View style={{ flex: 1, gap: 2 }}>
            <VisualText style={{ fontSize: 11, color: palette.textAlt }}>
              {i18n.t('timer')}
            </VisualText>
            <View>
              <Animated.View style={runningStyle}>
                <VisualText
                  style={{
                    fontSize: 24,
                    fontFamily: theme.fonts.bold,
                    fontVariant: ['tabular-nums'],
                    color: palette.text,
                  }}
                >
                  {elapsed}
                </VisualText>
              </Animated.View>
              <Animated.View
                style={[
                  {
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    bottom: 0,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                  },
                  savedStyle,
                ]}
              >
                <LucideIcon
                  icon={CheckIcon}
                  size={20}
                  color={accent}
                  strokeWidth={3}
                />
                <VisualText
                  style={{
                    fontSize: 20,
                    fontFamily: theme.fonts.bold,
                    color: accent,
                  }}
                >
                  {i18n.t('saved')}
                </VisualText>
              </Animated.View>
            </View>
          </View>
          <Animated.View
            style={[
              {
                width: SAVE.width,
                height: SAVE.height,
                borderRadius: SAVE.height / 2,
                backgroundColor: accent,
                alignItems: 'center',
                justifyContent: 'center',
              },
              saveStyle,
            ]}
          >
            <VisualText
              style={{
                fontSize: 13,
                fontFamily: theme.fonts.bold,
                color: '#FFFFFF',
              }}
            >
              {i18n.t('save')}
            </VisualText>
            <TapRipple tap={tap} color={accent} size={44} />
          </Animated.View>
        </Surface>
      </Animated.View>

      <Animated.View
        style={[
          {
            position: 'absolute',
            left: 0,
            right: 0,
            top: MONTH.top,
            height: MONTH.height,
          },
          monthStyle,
        ]}
      >
        <Surface palette={palette} style={{ flex: 1 }}>
          <View
            style={{
              position: 'absolute',
              left: RING.left,
              top: RING_TOP,
              width: RING.size,
              height: RING.size,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Canvas
              style={{
                position: 'absolute',
                width: RING.size,
                height: RING.size,
              }}
            >
              <Path
                path={ringPath}
                style='stroke'
                strokeWidth={RING.stroke}
                color={palette.ringTrack}
              />
              <Path
                path={ringPath}
                style='stroke'
                strokeWidth={RING.stroke}
                strokeCap='round'
                color={accent}
                end={ringEnd}
              />
            </Canvas>
            <View style={{ alignItems: 'center' }}>
              <View>
                <Animated.View style={beforeStyle}>
                  <RingValue palette={palette}>
                    {formatMinutesCompact(BEFORE_MINUTES)}
                  </RingValue>
                </Animated.View>
                <Animated.View
                  style={[
                    {
                      position: 'absolute',
                      left: -20,
                      right: -20,
                      alignItems: 'center',
                    },
                    afterStyle,
                  ]}
                >
                  <RingValue palette={palette}>
                    {formatMinutesCompact(AFTER_MINUTES)}
                  </RingValue>
                </Animated.View>
              </View>
              <VisualText style={{ fontSize: 11, color: palette.textAlt }}>
                {i18n.t('hours')}
              </VisualText>
            </View>
          </View>
          <View
            style={{
              position: 'absolute',
              left: RING.left + RING.size + 18,
              right: 16,
              top: 26,
              bottom: 22,
              justifyContent: 'space-between',
            }}
          >
            <View style={{ gap: 4 }}>
              <VisualText style={{ fontSize: 11, color: palette.textAlt }}>
                {month}
              </VisualText>
              <VisualText style={{ fontSize: 14, color: palette.text }}>
                {i18n.t('goalLabel', {
                  value: formatMinutesCompact(GOAL_MINUTES),
                })}
              </VisualText>
              <View>
                <Animated.View style={beforeStyle}>
                  <VisualText style={{ fontSize: 12, color: accent }}>
                    {i18n.t('hoursToGoLabel', {
                      value: toGoBefore,
                    })}
                  </VisualText>
                </Animated.View>
                <Animated.View
                  style={[{ position: 'absolute', left: 0 }, afterStyle]}
                >
                  <VisualText style={{ fontSize: 12, color: accent }}>
                    {i18n.t('hoursToGoLabel', { value: toGoAfter })}
                  </VisualText>
                </Animated.View>
              </View>
            </View>
            <View
              style={{
                height: 40,
                flexDirection: 'row',
                alignItems: 'flex-end',
                gap: 5,
              }}
            >
              {week.map((height, i) => (
                <View
                  key={i}
                  style={{
                    flex: 1,
                    height: Math.max(4, height),
                    borderRadius: 3,
                    backgroundColor: height
                      ? palette.ringTrack
                      : palette.skeleton,
                  }}
                />
              ))}
              <Animated.View
                style={[
                  { flex: 1, borderRadius: 3, backgroundColor: accent },
                  todayStyle,
                ]}
              />
            </View>
          </View>
        </Surface>
      </Animated.View>

      <Animated.View
        pointerEvents='none'
        style={[
          {
            position: 'absolute',
            left: 0,
            top: 0,
            paddingHorizontal: 12,
            height: 28,
            borderRadius: 14,
            justifyContent: 'center',
            backgroundColor: accent,
            shadowColor: accent,
            shadowOpacity: 0.4,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 4 },
          },
          chipStyle,
        ]}
      >
        <VisualText
          style={{
            fontSize: 13,
            fontFamily: theme.fonts.bold,
            color: '#FFFFFF',
          }}
        >
          {session}
        </VisualText>
      </Animated.View>
    </View>
  )
}

const RingValue = ({
  palette,
  children,
}: {
  palette: RevealVisualProps['palette']
  children: string
}) => {
  const theme = useTheme()
  return (
    <VisualText
      style={{
        fontSize: 28,
        fontFamily: theme.fonts.bold,
        letterSpacing: -0.5,
        color: palette.text,
        textAlign: 'center',
      }}
    >
      {children}
    </VisualText>
  )
}

export default TimeVisual
