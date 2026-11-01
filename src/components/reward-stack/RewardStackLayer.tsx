import { useEffect, useRef, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import Animated, {
  Easing,
  interpolate,
  Keyframe,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'
import OutlinedText from '@/components/reward-stack/OutlinedText'
import { fonts } from '@/constants/theme'
import { tracking } from '@/lib/tracking'
import { formatNumber } from '@/lib/numbers'
import {
  FLY_MS,
  IMPACT_MS,
  MAX_LINES,
  rewardTarget,
  SLAM_HIT_MS,
  skipReward,
  STOMP_MS,
  useRewardStack,
  type RewardLine,
  type RewardRun,
  type RewardSlot,
  type RewardTone,
} from '@/stores/rewardStack'

type Rect = { x: number; y: number; width: number; height: number }

export type RewardAnchor = { bottom: number } | { top: number }

const TONE_COLOR: Record<RewardTone | 'total', string> = {
  base: '#f4f4f4',
  bonus: '#ff9a3c',
  milestone: '#ffd23f',
  total: '#ffd23f',
}
const LABEL_COLOR: Record<RewardTone, string> = {
  base: '#e2e2e2',
  bonus: '#ffb070',
  milestone: '#ffe27a',
}
const SPARK_COLORS: Record<RewardTone | 'total', string[]> = {
  base: ['#e5e5e5', '#ffffff'],
  bonus: ['#ff8a1f', '#ffd23f', '#ffffff'],
  milestone: ['#ffd23f', '#fff3b0', '#ff8a1f', '#ffffff'],
  total: ['#ffd23f', '#fff3b0', '#ff8a1f', '#ffffff'],
}

function feel(line: RewardLine) {
  if (line.tone === 'milestone')
    return { shake: 7, sparks: 18, reach: 70, ring: 90 }
  if (line.amount >= 4) return { shake: 3.5, sparks: 10, reach: 46, ring: 0 }
  return { shake: 2, sparks: 6, reach: 32, ring: 0 }
}

const lineSize = (amount: number, compact: boolean) =>
  (amount >= 10 ? 38 : amount >= 4 ? 31 : 25) - (compact ? 5 : 0)

const STOMP = new Keyframe({
  0: { opacity: 0, transform: [{ translateY: -16 }, { scale: 2.9 }] },
  55: {
    opacity: 1,
    transform: [{ translateY: 0 }, { scale: 0.84 }],
    easing: Easing.bezier(0.2, 0.7, 0.3, 1),
  },
  78: { opacity: 1, transform: [{ translateY: 0 }, { scale: 1.09 }] },
  100: { opacity: 1, transform: [{ translateY: 0 }, { scale: 1 }] },
}).duration(STOMP_MS)

const RISE = new Keyframe({
  0: { opacity: 0, transform: [{ translateY: 10 }, { scale: 0.8 }] },
  100: {
    opacity: 1,
    transform: [{ translateY: 0 }, { scale: 1 }],
    easing: Easing.out(Easing.cubic),
  },
}).duration(320)

const FOLD = new Keyframe({
  0: { opacity: 1, transform: [{ translateY: 0 }, { scale: 1 }] },
  100: {
    opacity: 0,
    transform: [{ translateY: -14 }, { scale: 0.7 }],
    easing: Easing.in(Easing.cubic),
  },
}).duration(200)

let lastTotal: Rect | null = null

export default function RewardStackLayer({
  slot,
  anchor,
  compact = false,
}: {
  slot: RewardSlot
  anchor: RewardAnchor
  compact?: boolean
}) {
  const run = useRewardStack((s) => (s.run?.slot === slot ? s.run : null))
  if (!run) return null
  return <RunView key={run.id} run={run} anchor={anchor} compact={compact} />
}

function RunView({
  run,
  anchor,
  compact,
}: {
  run: RewardRun
  anchor: RewardAnchor
  compact: boolean
}) {
  const root = useRef<View>(null)
  const totalRef = useRef<View>(null)
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null)

  const [playedBefore] = useState(run.played)
  const shake = useSharedValue(0)
  const collapse = useSharedValue(0)
  const played = run.lines.slice(0, run.played)
  const total = played.reduce((sum, line) => sum + line.amount, 0)
  const showsTotal = played.length >= 2
  const flying = run.phase === 'fly' || run.phase === 'count'
  const scene = useCardScene(run.slot === 'card')
  const placed: RewardAnchor =
    scene && origin ? { top: scene.y - origin.y + 6 } : anchor

  const newest = played[played.length - 1]
  useEffect(() => {
    if (!newest || run.soft || run.played <= playedBefore) return
    const a = feel(newest).shake
    shake.value = withDelay(IMPACT_MS, shakeSequence(a))
  }, [run.played, newest, run.soft, playedBefore, shake])
  useEffect(() => {
    if (run.phase !== 'slam') return
    shake.value = withDelay(SLAM_HIT_MS, shakeSequence(5))
    collapse.value = withDelay(520, withTiming(1, { duration: 230 }))
  }, [run.phase, shake, collapse])

  const shakeStyle = useAnimatedStyle(() => {
    const a = shake.value
    return {
      transform: [{ translateX: a }, { translateY: -a * 0.6 }],
      opacity: 1,
    }
  })

  const columnPosition =
    'bottom' in placed ? { bottom: placed.bottom } : { top: placed.top }

  return (
    <View
      ref={root}
      pointerEvents='box-none'
      style={StyleSheet.absoluteFill}
      onLayout={() =>
        root.current?.measureInWindow((x, y) => setOrigin({ x, y }))
      }
    >
      {!run.soft && (
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={skipReward}
          accessible={false}
          testID='reward-stack-skip'
        />
      )}
      {scene && origin && (
        <Scrim
          rect={{ ...scene, x: scene.x - origin.x, y: scene.y - origin.y }}
          shown={!flying}
        />
      )}
      {!flying && (
        <Animated.View
          pointerEvents='none'
          style={[styles.column, columnPosition, shakeStyle]}
        >
          <View style={styles.lines}>
            {played.slice(-MAX_LINES).map((line, i, shown) => {
              const index = run.played - shown.length + i
              return (
                <Line
                  key={index}
                  line={line}
                  compact={compact}
                  soft={run.soft}
                  animate={index >= playedBefore}
                  collapse={collapse}
                  fromEnd={shown.length - i}
                  icon={run.icon}
                />
              )
            })}
          </View>
          {showsTotal && (
            <Total
              ref={totalRef}
              amount={total}
              compact={compact}
              slam={run.phase === 'slam'}
              animate={playedBefore < 2}
              icon={run.icon}
            />
          )}
        </Animated.View>
      )}
      {flying && origin && (
        <Landing run={run} origin={origin} anchor={placed} compact={compact} />
      )}
    </View>
  )
}

function useCardScene(over: boolean) {
  const [scene, setScene] = useState<Rect | null>(null)
  useEffect(() => {
    if (!over) return
    rewardTarget('cardScene')?.current?.measureInWindow(
      (x, y, width, height) => width && setScene({ x, y, width, height })
    )
  }, [over])
  return over ? scene : null
}

function Scrim({ rect, shown }: { rect: Rect; shown: boolean }) {
  const p = useSharedValue(0)
  useEffect(() => {
    p.value = withTiming(shown ? 1 : 0, { duration: shown ? 220 : 260 })
  }, [p, shown])
  const style = useAnimatedStyle(() => ({ opacity: p.value }))
  return (
    <Animated.View
      pointerEvents='none'
      style={[
        styles.scrim,
        {
          left: rect.x,
          top: rect.y,
          width: rect.width,
          height: rect.height,
        },
        style,
      ]}
    />
  )
}

const shakeSequence = (a: number) =>
  withSequence(
    withTiming(a, { duration: 40 }),
    withTiming(-a, { duration: 50 }),
    withTiming(a * 0.6, { duration: 45 }),
    withTiming(-a * 0.4, { duration: 40 }),
    withTiming(0, { duration: 45 })
  )

function Line({
  line,
  compact,
  soft,
  animate,
  collapse,
  fromEnd,
  icon,
}: {
  line: RewardLine
  compact: boolean
  soft: boolean
  animate: boolean
  collapse: SharedValue<number>
  fromEnd: number
  icon: RewardRun['icon']
}) {
  const size = lineSize(line.amount, compact)
  const f = feel(line)
  const collapseStyle = useAnimatedStyle(() => ({
    opacity: 1 - collapse.value,
    transform: [
      { translateY: collapse.value * fromEnd * 16 },
      { scale: 1 - collapse.value * 0.5 },
    ],
  }))
  return (
    <Animated.View
      entering={animate ? (soft ? RISE : STOMP) : undefined}
      exiting={FOLD}
      layout={LinearTransition.duration(200)}
      style={collapseStyle}
    >
      <View style={styles.line}>
        {icon(size - 2)}
        <OutlinedText
          text={`+${formatNumber(line.amount)}`}
          size={size}
          color={TONE_COLOR[line.tone]}
        />
        <View
          style={[
            styles.label,
            line.tone === 'milestone' && styles.milestoneLabel,
          ]}
        >
          <Animated.Text
            allowFontScaling={false}
            numberOfLines={1}
            style={[
              styles.labelText,
              { color: LABEL_COLOR[line.tone], letterSpacing: tracking(0.6) },
            ]}
          >
            {line.label.toLocaleUpperCase()}
          </Animated.Text>
        </View>
        {animate && !soft && (
          <View pointerEvents='none' style={styles.center}>
            {f.ring > 0 && <Ring size={f.ring} delay={IMPACT_MS} />}
            <Burst
              count={f.sparks}
              reach={f.reach}
              colors={SPARK_COLORS[line.tone]}
              delay={IMPACT_MS}
            />
          </View>
        )}
      </View>
    </Animated.View>
  )
}

function Total({
  ref,
  amount,
  compact,
  slam,
  animate,
  icon,
}: {
  ref: React.RefObject<View | null>
  amount: number
  compact: boolean
  slam: boolean
  animate: boolean
  icon: RewardRun['icon']
}) {
  const pulse = useSharedValue(1)
  const [first] = useState(amount)
  useEffect(() => {
    if (slam)
      pulse.value = withSequence(
        withTiming(1.5, { duration: 126 }),
        withTiming(0.93, { duration: 126 }),
        withTiming(1, { duration: 108 })
      )
    else if (amount !== first)
      pulse.value = withDelay(
        IMPACT_MS,
        withSequence(
          withTiming(1.22, { duration: 60 }),
          withTiming(1, { duration: 140 })
        )
      )
  }, [amount, first, slam, pulse])
  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }))
  const size = compact ? 38 : 46
  return (
    <Animated.View
      ref={ref}
      entering={animate ? STOMP : undefined}
      layout={LinearTransition.duration(200)}
      onLayout={() =>
        ref.current?.measureInWindow(
          (x, y, width, height) => (lastTotal = { x, y, width, height })
        )
      }
    >
      <Animated.View style={[styles.total, pulseStyle]}>
        <OutlinedText text='=' size={compact ? 24 : 28} color='#ffffff' />
        {icon(compact ? 26 : 32)}
        <OutlinedText
          text={`+${formatNumber(amount)}`}
          size={size}
          color={TONE_COLOR.total}
        />
      </Animated.View>
      {slam && (
        <View pointerEvents='none' style={styles.center}>
          <Ring size={130} delay={SLAM_HIT_MS} />
          <Burst
            count={26}
            reach={95}
            colors={SPARK_COLORS.total}
            delay={SLAM_HIT_MS}
          />
        </View>
      )}
    </Animated.View>
  )
}

function Landing({
  run,
  origin,
  anchor,
  compact,
}: {
  run: RewardRun
  origin: { x: number; y: number }
  anchor: RewardAnchor
  compact: boolean
}) {
  const [target, setTarget] = useState<Rect | null | 'none'>(null)
  useEffect(() => {
    const ref = rewardTarget(run.home === 'card' ? 'card' : 'toast')
    if (!ref?.current) return setTarget('none')
    ref.current.measureInWindow((x, y, width, height) =>
      setTarget(width ? { x, y, width, height } : 'none')
    )
  }, [run.home])
  const amount = run.count.to - run.count.from
  if (target === null) return null
  if (target === 'none' || !lastTotal)
    return <Tally run={run} anchor={anchor} compact={compact} />
  const from = { x: lastTotal.x - origin.x, y: lastTotal.y - origin.y }
  const to = {
    x: target.x - origin.x + target.width / 2,
    y: target.y - origin.y + target.height / 2,
  }
  return (
    <>
      {run.phase === 'fly' && amount > 0 && (
        <FlyChip from={from} to={to} amount={amount} icon={run.icon} />
      )}
      {run.phase === 'count' && (
        <View
          pointerEvents='none'
          style={[styles.at, { left: to.x, top: to.y }]}
        >
          <Burst count={8} reach={30} colors={SPARK_COLORS.bonus} delay={0} />
        </View>
      )}
    </>
  )
}

function FlyChip({
  from,
  to,
  amount,
  icon,
}: {
  from: { x: number; y: number }
  to: { x: number; y: number }
  amount: number
  icon: RewardRun['icon']
}) {
  const p = useSharedValue(0)
  useEffect(() => {
    p.value = withTiming(1, {
      duration: FLY_MS,
      easing: Easing.bezier(0.5, 0, 0.75, 1),
    })
  }, [p])
  const big = amount >= 3
  const dx = to.x - from.x
  const dy = to.y - from.y
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(p.value, [0, 0.4, 1], [1, 1, 0.85]),
    transform: [
      { translateX: interpolate(p.value, [0, 0.4, 1], [0, dx * 0.35, dx]) },
      {
        translateY: interpolate(
          p.value,
          [0, 0.4, 1],
          [0, dy * 0.2 - 36, dy - 20]
        ),
      },
      { scale: interpolate(p.value, [0, 0.4, 1], [1, 0.85, 0.3]) },
    ],
  }))
  return (
    <Animated.View
      pointerEvents='none'
      style={[styles.flyChip, { left: from.x, top: from.y }, style]}
    >
      {icon(big ? 32 : 24)}
      <OutlinedText
        text={`+${formatNumber(amount)}`}
        size={big ? 40 : 28}
        color={TONE_COLOR.total}
      />
    </Animated.View>
  )
}

function Tally({
  run,
  anchor,
  compact,
}: {
  run: RewardRun
  anchor: RewardAnchor
  compact: boolean
}) {
  const position =
    'bottom' in anchor ? { bottom: anchor.bottom } : { top: anchor.top }
  return (
    <Animated.View
      pointerEvents='none'
      entering={STOMP}
      style={[styles.column, position]}
    >
      <View style={styles.tally}>
        {run.icon(compact ? 22 : 26)}
        <OutlinedText
          text={formatNumber(run.shown)}
          size={compact ? 24 : 30}
          color='#ffffff'
        />
      </View>
    </Animated.View>
  )
}

function Burst({
  count,
  reach,
  colors,
  delay,
}: {
  count: number
  reach: number
  colors: string[]
  delay: number
}) {
  const [sparks] = useState(() =>
    Array.from({ length: count }, (_, i) => {
      const angle = Math.random() * Math.PI * 2
      const distance = reach * (0.55 + Math.random() * 0.6)
      return {
        dx: Math.cos(angle) * distance,
        dy: Math.sin(angle) * distance * 0.8,
        color: colors[i % colors.length],
        duration: 480 + Math.random() * 120,
      }
    })
  )
  return (
    <>
      {sparks.map((spark, i) => (
        <Spark key={i} {...spark} delay={delay} />
      ))}
    </>
  )
}

function Spark({
  dx,
  dy,
  color,
  duration,
  delay,
}: {
  dx: number
  dy: number
  color: string
  duration: number
  delay: number
}) {
  const p = useSharedValue(0)
  useEffect(() => {
    p.value = withDelay(
      delay,
      withTiming(1, { duration, easing: Easing.bezier(0.1, 0.8, 0.3, 1) })
    )
  }, [p, delay, duration])
  const style = useAnimatedStyle(() => ({
    opacity: p.value === 0 ? 0 : interpolate(p.value, [0, 0.6, 1], [1, 1, 0]),
    transform: [
      { translateX: interpolate(p.value, [0, 0.6, 1], [0, dx, dx * 1.1]) },
      { translateY: interpolate(p.value, [0, 0.6, 1], [0, dy, dy + 18]) },
      { scale: interpolate(p.value, [0, 0.6, 1], [1.4, 1, 0.6]) },
    ],
  }))
  return (
    <Animated.View style={[styles.spark, { backgroundColor: color }, style]} />
  )
}

function Ring({ size, delay }: { size: number; delay: number }) {
  const p = useSharedValue(0)
  useEffect(() => {
    p.value = withDelay(
      delay,
      withTiming(1, { duration: 380, easing: Easing.out(Easing.cubic) })
    )
  }, [p, delay])
  const style = useAnimatedStyle(() => ({
    opacity: p.value === 0 ? 0 : 0.9 * (1 - p.value),
    transform: [{ scale: 0.3 + p.value * 1.1 }],
  }))
  return (
    <Animated.View
      style={[
        styles.ring,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          marginLeft: -size / 2,
          marginTop: -size / 2,
        },
        style,
      ]}
    />
  )
}

const styles = StyleSheet.create({
  column: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  lines: { alignItems: 'center', gap: 1 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(29, 19, 12, 0.9)',
    maxWidth: 190,
  },
  milestoneLabel: {
    borderWidth: 1.5,
    borderColor: 'rgba(255, 210, 63, 0.55)',
    shadowColor: '#ffd23f',
    shadowOpacity: 0.6,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 0 },
  },
  labelText: {
    fontSize: 10.5,
    fontFamily: fonts.bold,
  },
  total: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 4,
  },
  center: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 0,
    height: 0,
  },
  at: { position: 'absolute', width: 0, height: 0 },
  flyChip: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tally: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(29, 19, 12, 0.82)',
  },
  spark: {
    position: 'absolute',
    width: 5,
    height: 5,
    marginLeft: -2.5,
    marginTop: -2.5,
  },
  ring: {
    position: 'absolute',
    borderWidth: 3,
    borderColor: '#ffd23f',
  },
  scrim: {
    position: 'absolute',
    borderRadius: 11,
    backgroundColor: 'rgba(20, 10, 4, 0.55)',
  },
})
