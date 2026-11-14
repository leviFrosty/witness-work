import { useEffect, useState } from 'react'
import { View } from 'react-native'
import Animated, {
  DerivedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
} from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
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
  pulseWindow,
  seg,
  useRiseStyle,
  useVisualClock,
} from '@/features/updates/components/reveal/visuals/kit'
import { tracking } from '@/lib/tracking'
import useAppActive from '@/hooks/useAppActive'

const GOAL_MINUTES = 50 * 60
const BEFORE_MINUTES = 34 * 60

const SESSION_MINUTES = 2 * 60
const AFTER_MINUTES = BEFORE_MINUTES + SESSION_MINUTES

const TIMER = { top: 0, height: 76 }
const MONTH = { top: 92, height: 188 }
const RING = { size: 132, stroke: 14, left: 18 }
const RING_TOP = (MONTH.height - RING.size) / 2
const SAVE = { right: 16, width: 74, height: 34 }

const T = { tap: 0.3, fly: [0.36, 0.5], fill: [0.47, 0.62], reset: 0.9 }

const TimeVisual = ({ palette, active, reduceMotion }: RevealVisualProps) => {
  const theme = useTheme()
  const accent = theme.colors.accent
  const { intro, loop } = useVisualClock({
    active,
    reduceMotion,
    introMs: 900,
    loopMs: 6400,
    restAt: 0.8,
  })

  const session = `+${formatMinutesCompact(SESSION_MINUTES)}`
  const toGoBefore = formatMinutesCompact(GOAL_MINUTES - BEFORE_MINUTES)
  const toGoAfter = formatMinutesCompact(GOAL_MINUTES - AFTER_MINUTES)

  const [seconds, setSeconds] = useState(0)
  const appActive = useAppActive()
  const ticking = active && appActive && !reduceMotion
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
  const elapsed = formatMs((SESSION_MINUTES * 60 + seconds) * 1000)

  const timerStyle = useRiseStyle(intro, 0, 0.55, 22)
  const monthStyle = useRiseStyle(intro, 0.25, 0.9, 22)
  const reset = useDerivedValue(() => seg(loop.value, T.reset, 0.96))
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

  const swap = useDerivedValue(() =>
    fill.value < 0.45 ? 0 : fill.value > 0.6 ? 1 : (fill.value - 0.45) / 0.15
  )
  const beforeStyle = useAnimatedStyle(() => ({ opacity: 1 - swap.value }))
  const afterStyle = useAnimatedStyle(() => ({ opacity: swap.value }))
  const toGoStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: 1 + 0.16 * pulseWindow(fill.value, 0.45, 0.75, 0.75, 1) },
    ],
  }))

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
            <VisualText style={{ fontSize: 12, color: palette.textAlt }}>
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
            <Ring progress={ringEnd} color={accent} track={palette.ringTrack} />
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
              <VisualText style={{ fontSize: 12, color: palette.textAlt }}>
                {i18n.t('hours')}
              </VisualText>
            </View>
          </View>
          <View
            style={{
              position: 'absolute',
              left: RING.left + RING.size + 18,
              right: 16,
              top: 24,
              bottom: 22,
              justifyContent: 'space-between',
            }}
          >
            <View style={{ gap: 3 }}>
              <VisualText style={{ fontSize: 12, color: palette.textAlt }}>
                {month}
              </VisualText>
              <Animated.View
                style={[{ transformOrigin: 'left center' }, toGoStyle]}
              >
                <Animated.View style={beforeStyle}>
                  <ToGo color={accent}>
                    {i18n.t('hoursToGoLabel', { value: toGoBefore })}
                  </ToGo>
                </Animated.View>
                <Animated.View
                  style={[
                    { position: 'absolute', left: 0, right: 0 },
                    afterStyle,
                  ]}
                >
                  <ToGo color={accent}>
                    {i18n.t('hoursToGoLabel', { value: toGoAfter })}
                  </ToGo>
                </Animated.View>
              </Animated.View>
              <VisualText style={{ fontSize: 13, color: palette.textAlt }}>
                {i18n.t('goalLabel', {
                  value: formatMinutesCompact(GOAL_MINUTES),
                })}
              </VisualText>
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

const HALF = RING.size / 2

const RingHalf = ({
  side,
  color,
}: {
  side: 'left' | 'right'
  color: string
}) => (
  <View
    style={{
      position: 'absolute',
      left: side === 'left' ? 0 : HALF,
      width: HALF,
      height: RING.size,
      overflow: 'hidden',
    }}
  >
    <View
      style={{
        position: 'absolute',
        left: side === 'left' ? 0 : -HALF,
        width: RING.size,
        height: RING.size,
        borderRadius: HALF,
        borderWidth: RING.stroke,
        borderColor: color,
      }}
    />
  </View>
)

const RingCap = ({ color }: { color: string }) => (
  <View
    style={{
      position: 'absolute',
      left: HALF - RING.stroke / 2,
      top: 0,
      width: RING.stroke,
      height: RING.stroke,
      borderRadius: RING.stroke / 2,
      backgroundColor: color,
    }}
  />
)

const Ring = ({
  progress,
  color,
  track,
}: {
  progress: DerivedValue<number>
  color: string
  track: string
}) => {
  const sweep = {
    position: 'absolute',
    width: RING.size,
    height: RING.size,
  } as const
  const shownStyle = useAnimatedStyle(() => ({
    opacity: progress.value > 0.002 ? 1 : 0,
  }))
  const firstStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${Math.min(progress.value, 0.5) * 360}deg` }],
  }))
  const secondStyle = useAnimatedStyle(() => ({
    transform: [
      { rotate: `${(Math.max(progress.value, 0.5) - 0.5) * 360}deg` },
    ],
  }))
  const pastHalfStyle = useAnimatedStyle(() => ({
    opacity: progress.value > 0.5 ? 1 : 0,
  }))
  const endStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${progress.value * 360}deg` }],
  }))
  return (
    <View style={sweep}>
      <View
        style={[
          sweep,
          { borderRadius: HALF, borderWidth: RING.stroke, borderColor: track },
        ]}
      />
      <Animated.View style={[sweep, shownStyle]}>
        <View
          style={{
            position: 'absolute',
            left: HALF,
            width: HALF,
            height: RING.size,
            overflow: 'hidden',
          }}
        >
          <Animated.View style={[sweep, { left: -HALF }, firstStyle]}>
            <RingHalf side='left' color={color} />
          </Animated.View>
        </View>
        <Animated.View
          style={[
            {
              position: 'absolute',
              left: 0,
              width: HALF,
              height: RING.size,
              overflow: 'hidden',
            },
            pastHalfStyle,
          ]}
        >
          <Animated.View style={[sweep, secondStyle]}>
            <RingHalf side='right' color={color} />
          </Animated.View>
        </Animated.View>
        <Animated.View
          style={[
            {
              position: 'absolute',
              left: HALF - 1,
              bottom: 0,
              width: 2,
              height: RING.stroke,
              backgroundColor: color,
            },
            pastHalfStyle,
          ]}
        />
        <RingCap color={color} />
        <Animated.View style={[sweep, endStyle]}>
          <RingCap color={color} />
        </Animated.View>
      </Animated.View>
    </View>
  )
}

const ToGo = ({ color, children }: { color: string; children: string }) => {
  const theme = useTheme()
  return (
    <VisualText
      minimumFontScale={0.7}
      style={{
        fontSize: 20,
        lineHeight: 26,
        fontFamily: theme.fonts.bold,
        letterSpacing: tracking(-0.3),
        color,
      }}
    >
      {children}
    </VisualText>
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
        letterSpacing: tracking(-0.5),
        color: palette.text,
        textAlign: 'center',
      }}
    >
      {children}
    </VisualText>
  )
}

export default TimeVisual
