import { ReactNode, useState } from 'react'
import { View } from 'react-native'
import Animated, {
  DerivedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
} from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import { Canvas, Path, Skia } from '@shopify/react-native-skia'
import {
  Circle as CircleIcon,
  CircleCheck as CircleCheckIcon,
  CircleDashed as CircleDashedIcon,
  Download as DownloadIcon,
  Pause as PauseIcon,
  Play as PlayIcon,
  Plus as PlusIcon,
} from 'lucide-react-native'
import useTheme from '@/contexts/theme'
import LucideIcon, { AppIcon } from '@/components/ui/LucideIcon'
import i18n, { TranslationKey } from '@/lib/locales'
import { withAlpha } from '@/lib/color'
import { formatMinutes, formatMinutesCompact } from '@/lib/minutes'
import { usePreferences } from '@/stores/preferences'
import usePublisher from '@/hooks/usePublisher'
import {
  RevealVisualProps,
  TapRipple,
  VisualText,
  backOut,
  pulseWindow,
  seg,
  useRiseStyle,
  useVisualClock,
} from '@/features/updates/components/reveal/visuals/kit'
import {
  WATCH_COLORS,
  WATCH_FRAME,
  WATCH_SCREEN,
  WatchFrame,
  WatchRow,
} from '@/features/updates/components/reveal/visuals/watchKit'

const LOOP_MS = 11000
// A tenth of an hour divides both, so the total climbs in clean steps.
const MONTH_BEFORE = 32 * 60 + 12
const ADDED = 90
const GOAL_HOURS = 50
// The timer runs in real time, from 1:29:57 until it's paused on 1:30:00.
const TIMER_FROM_S = ADDED * 60 - 3
const PAUSE_AT = 3000 / LOOP_MS
/** Moments in the loop, 0–1. */
const T = {
  pause: PAUSE_AT,
  openSave: 0.38,
  push: 0.4,
  save: 0.55,
  pop: 0.68,
  count: 0.75,
  // The screen dims, and comes back on the first frame.
  dim: 0.93,
  restart: 0.97,
}
const PAD = 10
const BAR_W = WATCH_SCREEN.width - PAD * 2
const COLUMN_LEFT = WATCH_FRAME.width + 18
const GAUGE = 60
const GAUGE_STROKE = 5
const gaugePath = (() => {
  const inset = GAUGE_STROKE / 2 + 3
  return Skia.PathBuilder.Make()
    .addArc(
      {
        x: inset,
        y: inset,
        width: GAUGE - inset * 2,
        height: GAUGE - inset * 2,
      },
      -90,
      360
    )
    .detach()
})()

const formatTimer = (seconds: number) => {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = String(seconds % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}

/** The watch's string for a one-line spot, like `L10n.line`. */
const line = (key: TranslationKey) => i18n.t(key).replace(/\n/g, ' ')

/**
 * The Apple Watch app, live: the timer ticks, is paused and saved from the
 * wrist, and the month's total — and the Monthly Progress complications beside
 * the watch — move up with it. Roles that don't log hours see the check-off
 * instead.
 */
const WatchVisual = (props: RevealVisualProps) => {
  const { showsTimeEntry } = usePublisher()
  return showsTimeEntry ? (
    <HoursWatch {...props} />
  ) : (
    <CheckboxWatch {...props} />
  )
}

/** The loop's own clock: holds its first frame while the screen comes back. */
const useScene = (loop: DerivedValue<number>) => {
  const scene = useDerivedValue(() =>
    loop.value >= T.restart ? 0 : loop.value
  )
  const screenStyle = useAnimatedStyle(() => ({
    opacity:
      1 -
      seg(loop.value, T.dim, T.restart - 0.01) +
      seg(loop.value, T.restart, 1),
  }))
  return { scene, screenStyle }
}

const useTap = (scene: DerivedValue<number>, at: number) =>
  useDerivedValue(() => seg(scene.value, at, at + 0.07))

const HoursWatch = ({ palette, active, reduceMotion }: RevealVisualProps) => {
  const theme = useTheme()
  const accent = theme.colors.accent
  const { timeDisplayFormat } = usePreferences()
  const { intro, loop } = useVisualClock({
    active,
    reduceMotion,
    introMs: 1200,
    loopMs: LOOP_MS,
    restAt: 0.88,
  })
  const { scene, screenStyle } = useScene(loop)
  const [seconds, setSeconds] = useState(reduceMotion ? 0 : TIMER_FROM_S)
  const [month, setMonth] = useState(
    reduceMotion ? MONTH_BEFORE + ADDED : MONTH_BEFORE
  )

  // The month's added share, 0–1.
  const added = useDerivedValue(() => seg(scene.value, T.count, T.count + 0.1))
  useAnimatedReaction(
    () =>
      scene.value >= T.save
        ? 0
        : TIMER_FROM_S +
          Math.floor((Math.min(scene.value, T.pause) * LOOP_MS) / 1000 + 1e-6),
    (now, before) => {
      if (now !== before) scheduleOnRN(setSeconds, now)
    }
  )
  useAnimatedReaction(
    // In tenths of an hour, so the total climbs in steps the eye can follow.
    () => Math.round((MONTH_BEFORE + ADDED * added.value) / 6) * 6,
    (now, before) => {
      if (now !== before) scheduleOnRN(setMonth, now)
    }
  )

  const watchStyle = useRiseStyle(intro, 0, 0.45, 24)
  const columnStyle = useRiseStyle(intro, 0.3, 0.8, 18)

  const pauseTap = useTap(scene, T.pause - 0.02)
  const openTap = useTap(scene, T.openSave - 0.02)
  const saveTap = useTap(scene, T.save - 0.02)
  // 1 while Add Time is pushed over Home.
  const nav = useDerivedValue(
    () =>
      seg(scene.value, T.push, T.push + 0.06) -
      seg(scene.value, T.pop, T.pop + 0.06)
  )
  const homeStyle = useAnimatedStyle(() => ({
    opacity: 1 - nav.value,
    transform: [{ translateX: -40 * nav.value }],
  }))
  const addStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: WATCH_SCREEN.width * (1 - nav.value) }],
  }))
  const runningStyle = useAnimatedStyle(() => ({
    opacity: scene.value < T.pause ? 1 : 0,
  }))
  const pausedStyle = useAnimatedStyle(() => ({
    opacity: scene.value < T.pause ? 0 : 1,
  }))
  // Save Time… stands in for Add Time while there's paused time to save.
  const saveRowStyle = useAnimatedStyle(() => ({
    opacity:
      seg(scene.value, T.pause, T.pause + 0.03) *
      (scene.value < T.save ? 1 : 0),
  }))
  const addRowStyle = useAnimatedStyle(() => ({
    opacity:
      1 -
      seg(scene.value, T.pause, T.pause + 0.03) *
        (scene.value < T.save ? 1 : 0),
  }))
  const fillStyle = useAnimatedStyle(() => ({
    width: (BAR_W * (MONTH_BEFORE + ADDED * added.value)) / (GOAL_HOURS * 60),
  }))
  const doneStyle = useAnimatedStyle(() => {
    const p = pulseWindow(
      scene.value,
      T.save + 0.01,
      T.save + 0.05,
      T.pop - 0.02,
      T.pop
    )
    return {
      opacity: Math.min(1, p * 1.5),
      transform: [{ scale: 0.7 + 0.3 * backOut(Math.min(1, p)) }],
    }
  })
  const gaugeEnd = useDerivedValue(
    () => (MONTH_BEFORE + ADDED * added.value) / (GOAL_HOURS * 60)
  )
  const progressStyle = useAnimatedStyle(() => ({
    width: `${gaugeEnd.value * 100}%`,
  }))
  const glowStyle = useAnimatedStyle(() => ({
    opacity: pulseWindow(
      scene.value,
      T.count,
      T.count + 0.03,
      T.count + 0.1,
      T.count + 0.16
    ),
  }))

  const monthText = formatMinutes(month, timeDisplayFormat).formatted
  const goal = `/${GOAL_HOURS}`

  return (
    <View style={{ flex: 1 }}>
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: 4,
            top: (280 - WATCH_FRAME.height) / 2,
          },
          watchStyle,
        ]}
      >
        <WatchFrame palette={palette}>
          <Animated.View style={[{ flex: 1 }, screenStyle]}>
            <Animated.View
              style={[
                {
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  paddingHorizontal: PAD,
                  paddingTop: 13,
                  gap: 4,
                },
                homeStyle,
              ]}
            >
              <View>
                <Caption>{i18n.t('month')}</Caption>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'baseline',
                    gap: 2,
                  }}
                >
                  <VisualText
                    style={{
                      fontSize: 17,
                      fontFamily: theme.fonts.bold,
                      color: WATCH_COLORS.text,
                      fontVariant: ['tabular-nums'],
                    }}
                  >
                    {monthText}
                  </VisualText>
                  <VisualText
                    style={{ fontSize: 11, color: WATCH_COLORS.textAlt }}
                  >
                    {goal}
                  </VisualText>
                </View>
                <View
                  style={{
                    marginTop: 4,
                    height: 4,
                    width: BAR_W,
                    borderRadius: 2,
                    overflow: 'hidden',
                    backgroundColor: WATCH_COLORS.track,
                  }}
                >
                  <Animated.View
                    style={[
                      { height: 4, borderRadius: 2, backgroundColor: accent },
                      fillStyle,
                    ]}
                  />
                </View>
              </View>
              <View>
                <Caption>{i18n.t('timer')}</Caption>
                <VisualText
                  style={{
                    fontSize: 15,
                    color: WATCH_COLORS.text,
                    fontVariant: ['tabular-nums'],
                  }}
                >
                  {formatTimer(seconds)}
                </VisualText>
              </View>
              <View>
                <Swap
                  first={{ icon: PauseIcon, label: i18n.t('timerPauseAction') }}
                  second={{ icon: PlayIcon, label: i18n.t('timerStartAction') }}
                  firstStyle={runningStyle}
                  secondStyle={pausedStyle}
                />
                <TapRipple
                  tap={pauseTap}
                  color={WATCH_COLORS.text}
                  style={{ left: BAR_W / 2 - 17, top: -3 }}
                />
              </View>
              <View>
                <Swap
                  first={{ icon: PlusIcon, label: i18n.t('addTime') }}
                  second={{
                    icon: DownloadIcon,
                    label: i18n.t('timerSaveAction'),
                  }}
                  firstStyle={addRowStyle}
                  secondStyle={saveRowStyle}
                />
                <TapRipple
                  tap={openTap}
                  color={WATCH_COLORS.text}
                  style={{ left: BAR_W / 2 - 17, top: -3 }}
                />
              </View>
            </Animated.View>

            <Animated.View
              style={[
                {
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  paddingHorizontal: PAD,
                  paddingTop: 15,
                  gap: 6,
                  backgroundColor: WATCH_COLORS.screen,
                },
                addStyle,
              ]}
            >
              <VisualText
                style={{
                  fontSize: 12,
                  fontFamily: theme.fonts.bold,
                  color: WATCH_COLORS.text,
                  textAlign: 'center',
                }}
              >
                {i18n.t('addTime')}
              </VisualText>
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                <Wheel
                  label={i18n.t('hours')}
                  values={[0, 1, 2]}
                  color={accent}
                />
                <Wheel
                  label={i18n.t('minutes')}
                  values={[29, 30, 31]}
                  color={accent}
                />
              </View>
              <View>
                <WatchRow
                  style={{
                    justifyContent: 'center',
                    backgroundColor: withAlpha(accent, 0x4d),
                  }}
                >
                  <VisualText
                    style={{ fontSize: 11, color: WATCH_COLORS.text }}
                  >
                    {i18n.t('save')}
                  </VisualText>
                </WatchRow>
                <TapRipple
                  tap={saveTap}
                  color={WATCH_COLORS.text}
                  style={{ left: BAR_W / 2 - 17, top: -3 }}
                />
              </View>
              <Animated.View
                style={[
                  {
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    backgroundColor: WATCH_COLORS.screen,
                  },
                  doneStyle,
                ]}
              >
                <LucideIcon icon={CircleCheckIcon} size={40} color={accent} />
                <VisualText style={{ fontSize: 12, color: WATCH_COLORS.text }}>
                  {i18n.t('timeAdded')}
                </VisualText>
              </Animated.View>
            </Animated.View>
          </Animated.View>
        </WatchFrame>
      </Animated.View>

      <Animated.View
        style={[
          {
            position: 'absolute',
            left: COLUMN_LEFT,
            right: 4,
            top: 0,
            bottom: 0,
            justifyContent: 'center',
            gap: 10,
          },
          columnStyle,
        ]}
      >
        <VisualText
          style={{ fontSize: 11, color: palette.textAlt }}
          numberOfLines={2}
        >
          {i18n.t('watchComplicationName')}
        </VisualText>
        <Complication accent={accent} glowStyle={glowStyle} round>
          <Canvas style={{ width: GAUGE, height: GAUGE }}>
            <Path
              path={gaugePath}
              style='stroke'
              strokeWidth={GAUGE_STROKE}
              color={WATCH_COLORS.track}
            />
            <Path
              path={gaugePath}
              style='stroke'
              strokeWidth={GAUGE_STROKE}
              strokeCap='round'
              color={accent}
              end={gaugeEnd}
            />
          </Canvas>
          <View
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <VisualText
              style={{
                fontSize: 13,
                fontFamily: theme.fonts.bold,
                color: WATCH_COLORS.text,
              }}
            >
              {formatMinutesCompact(month)}
            </VisualText>
          </View>
        </Complication>
        <Complication accent={accent} glowStyle={glowStyle}>
          <VisualText
            style={{
              fontSize: 11,
              fontFamily: theme.fonts.bold,
              color: accent,
            }}
          >
            {i18n.t('month')}
          </VisualText>
          <View
            style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}
          >
            <VisualText
              style={{
                fontSize: 14,
                fontFamily: theme.fonts.bold,
                color: WATCH_COLORS.text,
                fontVariant: ['tabular-nums'],
              }}
            >
              {monthText}
            </VisualText>
            <VisualText style={{ fontSize: 11, color: WATCH_COLORS.textAlt }}>
              {goal}
            </VisualText>
          </View>
          <View
            style={{
              height: 4,
              borderRadius: 2,
              overflow: 'hidden',
              backgroundColor: WATCH_COLORS.track,
            }}
          >
            <Animated.View
              style={[
                { height: 4, borderRadius: 2, backgroundColor: accent },
                progressStyle,
              ]}
            />
          </View>
        </Complication>
      </Animated.View>
    </View>
  )
}

/**
 * Regular Publishers who don't log hours check off sharing the good news; the
 * complications swap their dashed circle for a check.
 */
const CheckboxWatch = ({
  palette,
  active,
  reduceMotion,
}: RevealVisualProps) => {
  const theme = useTheme()
  const accent = theme.colors.accent
  const { intro, loop } = useVisualClock({
    active,
    reduceMotion,
    introMs: 1200,
    loopMs: 6000,
    restAt: 0.7,
  })
  const { scene, screenStyle } = useScene(loop)
  const at = 0.3

  const watchStyle = useRiseStyle(intro, 0, 0.45, 24)
  const columnStyle = useRiseStyle(intro, 0.3, 0.8, 18)
  const tap = useTap(scene, at - 0.04)
  const doneStyle = useAnimatedStyle(() => {
    const p = seg(scene.value, at, at + 0.08)
    return {
      opacity: p,
      transform: [{ scale: 0.8 + 0.2 * backOut(p) }],
    }
  })
  const todoStyle = useAnimatedStyle(() => ({
    opacity: 1 - seg(scene.value, at, at + 0.04),
  }))
  const noteStyle = useAnimatedStyle(() => ({
    opacity: seg(scene.value, at + 0.06, at + 0.14),
  }))
  const glowStyle = useAnimatedStyle(() => ({
    opacity: pulseWindow(
      scene.value,
      at + 0.08,
      at + 0.12,
      at + 0.2,
      at + 0.28
    ),
  }))
  const label = line('sharedTheGoodNews')

  return (
    <View style={{ flex: 1 }}>
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: 4,
            top: (280 - WATCH_FRAME.height) / 2,
          },
          watchStyle,
        ]}
      >
        <WatchFrame palette={palette}>
          <Animated.View
            style={[
              { flex: 1, paddingHorizontal: PAD, justifyContent: 'center' },
              screenStyle,
            ]}
          >
            <View>
              <Animated.View style={todoStyle}>
                <WatchRow style={{ height: 40 }}>
                  <LucideIcon
                    icon={CircleIcon}
                    size={14}
                    color={WATCH_COLORS.textAlt}
                  />
                  <VisualText
                    numberOfLines={2}
                    style={{ flex: 1, fontSize: 11, color: WATCH_COLORS.text }}
                  >
                    {label}
                  </VisualText>
                </WatchRow>
              </Animated.View>
              <Animated.View
                style={[
                  {
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: 40,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    paddingHorizontal: 4,
                  },
                  doneStyle,
                ]}
              >
                <LucideIcon icon={CircleCheckIcon} size={14} color={accent} />
                <VisualText
                  numberOfLines={2}
                  style={{ flex: 1, fontSize: 11, color: accent }}
                >
                  {label}
                </VisualText>
              </Animated.View>
              <TapRipple
                tap={tap}
                color={WATCH_COLORS.text}
                style={{ left: BAR_W / 2 - 17, top: 3 }}
              />
            </View>
            <Animated.View
              style={[{ marginTop: 4, paddingLeft: 4 }, noteStyle]}
            >
              <VisualText style={{ fontSize: 10, color: WATCH_COLORS.textAlt }}>
                {i18n.t('reportedToday')}
              </VisualText>
            </Animated.View>
          </Animated.View>
        </WatchFrame>
      </Animated.View>

      <Animated.View
        style={[
          {
            position: 'absolute',
            left: COLUMN_LEFT,
            right: 4,
            top: 0,
            bottom: 0,
            justifyContent: 'center',
            gap: 10,
          },
          columnStyle,
        ]}
      >
        <VisualText
          style={{ fontSize: 11, color: palette.textAlt }}
          numberOfLines={2}
        >
          {i18n.t('watchComplicationName')}
        </VisualText>
        <Complication accent={accent} glowStyle={glowStyle} round>
          <View style={{ width: GAUGE, height: GAUGE }}>
            <Animated.View style={[centered, todoStyle]}>
              <LucideIcon
                icon={CircleDashedIcon}
                size={26}
                color={WATCH_COLORS.textAlt}
              />
            </Animated.View>
            <Animated.View style={[centered, doneStyle]}>
              <LucideIcon icon={CircleCheckIcon} size={26} color={accent} />
            </Animated.View>
          </View>
        </Complication>
        <Complication accent={accent} glowStyle={glowStyle}>
          <VisualText
            style={{
              fontSize: 11,
              fontFamily: theme.fonts.bold,
              color: accent,
            }}
          >
            {i18n.t('month')}
          </VisualText>
          <View>
            <Animated.View
              style={[{ flexDirection: 'row', gap: 4 }, todoStyle]}
            >
              <LucideIcon
                icon={CircleDashedIcon}
                size={12}
                color={WATCH_COLORS.textAlt}
              />
              <VisualText
                numberOfLines={2}
                style={{ flex: 1, fontSize: 10, color: WATCH_COLORS.text }}
              >
                {label}
              </VisualText>
            </Animated.View>
            <Animated.View
              style={[
                {
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  flexDirection: 'row',
                  gap: 4,
                },
                doneStyle,
              ]}
            >
              <LucideIcon icon={CircleCheckIcon} size={12} color={accent} />
              <VisualText
                numberOfLines={2}
                style={{ flex: 1, fontSize: 10, color: WATCH_COLORS.text }}
              >
                {label}
              </VisualText>
            </Animated.View>
          </View>
        </Complication>
      </Animated.View>
    </View>
  )
}

const centered = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  alignItems: 'center',
  justifyContent: 'center',
} as const

/** A small grey heading, like the watch app's section labels. */
const Caption = ({ children }: { children: string }) => {
  const theme = useTheme()
  return (
    <VisualText
      style={{
        fontSize: 8.5,
        fontFamily: theme.fonts.semiBold,
        letterSpacing: 0.4,
        textTransform: 'uppercase',
        color: WATCH_COLORS.textAlt,
      }}
    >
      {children}
    </VisualText>
  )
}

interface RowContent {
  icon: AppIcon
  label: string
}

/** A watch row whose content crossfades between two states. */
const Swap = ({
  first,
  second,
  firstStyle,
  secondStyle,
}: {
  first: RowContent
  second: RowContent
  firstStyle: ReturnType<typeof useAnimatedStyle>
  secondStyle: ReturnType<typeof useAnimatedStyle>
}) => (
  <WatchRow>
    {[
      { content: first, style: firstStyle },
      { content: second, style: secondStyle },
    ].map(({ content, style }, i) => (
      <Animated.View
        key={i}
        style={[
          {
            position: 'absolute',
            left: 10,
            right: 10,
            top: 0,
            bottom: 0,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
          },
          style,
        ]}
      >
        <LucideIcon icon={content.icon} size={12} color={WATCH_COLORS.text} />
        <VisualText style={{ flex: 1, fontSize: 11, color: WATCH_COLORS.text }}>
          {content.label}
        </VisualText>
      </Animated.View>
    ))}
  </WatchRow>
)

/** A Digital Crown wheel resting on its value, with its neighbours dimmed. */
const Wheel = ({
  label,
  values,
  color,
}: {
  label: string
  values: number[]
  color: string
}) => {
  const theme = useTheme()
  return (
    <View style={{ alignItems: 'center', gap: 2 }}>
      <VisualText style={{ fontSize: 8.5, color: WATCH_COLORS.textAlt }}>
        {label}
      </VisualText>
      <View
        style={{
          width: 48,
          height: 56,
          borderRadius: 10,
          borderWidth: 1.5,
          borderColor: color,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {values.map((value, i) => (
          <VisualText
            key={value}
            style={{
              fontSize: i === 1 ? 17 : 11,
              lineHeight: i === 1 ? 21 : 14,
              fontFamily: i === 1 ? theme.fonts.bold : theme.fonts.semiBold,
              color: i === 1 ? WATCH_COLORS.text : WATCH_COLORS.textAlt,
              fontVariant: ['tabular-nums'],
            }}
          >
            {String(value)}
          </VisualText>
        ))}
      </View>
    </View>
  )
}

/** A complication on a black watch face, lit as its value changes. */
const Complication = ({
  accent,
  glowStyle,
  round,
  children,
}: {
  accent: string
  glowStyle: ReturnType<typeof useAnimatedStyle>
  round?: boolean
  children: ReactNode
}) => {
  const shape = round
    ? { width: GAUGE, height: GAUGE, borderRadius: GAUGE / 2 }
    : { alignSelf: 'stretch' as const, borderRadius: 16, padding: 10, gap: 3 }
  return (
    <View
      style={[
        shape,
        {
          borderCurve: 'continuous',
          backgroundColor: WATCH_COLORS.screen,
          borderWidth: 1,
          borderColor: WATCH_COLORS.rim,
        },
      ]}
    >
      {round ? (
        // Sized to the outer edge, so the ring centers on the border too.
        <View style={{ position: 'absolute', top: -1, left: -1 }}>
          {children}
        </View>
      ) : (
        children
      )}
      <Animated.View
        pointerEvents='none'
        style={[
          {
            position: 'absolute',
            top: -1,
            left: -1,
            right: -1,
            bottom: -1,
            borderRadius: shape.borderRadius,
            borderWidth: 2,
            borderColor: accent,
          },
          glowStyle,
        ]}
      />
    </View>
  )
}

export default WatchVisual
