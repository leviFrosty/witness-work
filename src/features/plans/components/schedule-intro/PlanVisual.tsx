import { View } from 'react-native'
import Animated, {
  DerivedValue,
  useAnimatedStyle,
  useDerivedValue,
} from 'react-native-reanimated'
import { CalendarClock as CalendarClockIcon } from 'lucide-react-native'
import useTheme from '@/contexts/theme'
import { formatStartTime } from '@/lib/dates'
import i18n from '@/lib/locales'
import { useFormattedMinutes } from '@/lib/minutes'
import { withAlpha } from '@/lib/color'
import {
  Bar,
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
import {
  DATE_SIZE,
  DATE_Y,
  WeekStrip,
  dayX,
  thisWeek,
} from '@/features/plans/components/schedule-intro/introKit'

const CARD = { top: 0, height: 150 }
const STRIP_TOP = 52
/** The days planned, each landing in turn; the last one opens below. */
const PLANS = [
  { day: 1, minutes: 120, start: 9 * 60 + 30 },
  { day: 3, minutes: 90, start: 10 * 60 },
  { day: 5, minutes: 180, start: 9 * 60 },
]
const LAST = PLANS[PLANS.length - 1]
const CHIP_Y = STRIP_TOP + DATE_Y + DATE_SIZE + 10

/**
 * Planning: days tapped across the week, each getting a Plan, and the last one
 * opening to show its time.
 */
const PlanVisual = ({ palette, active, reduceMotion }: RevealVisualProps) => {
  const theme = useTheme()
  const { intro, loop } = useVisualClock({
    active,
    reduceMotion,
    introMs: 900,
    loopMs: 5600,
    restAt: 0.8,
  })
  const reset = useDerivedValue(() => seg(loop.value, 0.9, 0.97))
  const cardStyle = useRiseStyle(intro, 0, 0.6, 22)
  const detailOpen = useDerivedValue(
    () => seg(loop.value, 0.62, 0.74) * (1 - reset.value)
  )
  const detailStyle = useAnimatedStyle(() => ({
    opacity: detailOpen.value,
    transform: [{ translateY: (1 - backOut(detailOpen.value)) * 24 }],
  }))
  const lastDay = thisWeek()[LAST.day]

  return (
    <View style={{ flex: 1 }}>
      <Animated.View
        style={[
          { position: 'absolute', left: 0, right: 0, top: CARD.top },
          cardStyle,
        ]}
      >
        <Surface palette={palette} style={{ height: CARD.height }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              paddingHorizontal: 14,
              paddingTop: 14,
            }}
          >
            <VisualText
              style={{
                fontSize: 15,
                fontFamily: theme.fonts.bold,
                color: palette.text,
              }}
            >
              {i18n.t('thisWeek')}
            </VisualText>
          </View>
          <View
            style={{ position: 'absolute', left: 0, right: 0, top: STRIP_TOP }}
          >
            <WeekStrip palette={palette} />
          </View>
        </Surface>
        {PLANS.map((plan, i) => (
          <PlanChip
            key={plan.day}
            index={i}
            day={plan.day}
            minutes={plan.minutes}
            loop={loop}
            reset={reset}
          />
        ))}
      </Animated.View>

      <Animated.View
        style={[
          { position: 'absolute', left: 16, right: 16, top: 168 },
          detailStyle,
        ]}
      >
        <Surface
          palette={palette}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            padding: 14,
          }}
        >
          <IconTile
            icon={CalendarClockIcon}
            color={theme.colors.accent}
            size={40}
          />
          <View style={{ flex: 1, gap: 6 }}>
            <VisualText
              style={{
                fontSize: 15,
                fontFamily: theme.fonts.bold,
                color: palette.text,
              }}
            >
              {`${lastDay.format('dddd')} · ${formatStartTime(LAST.start)}`}
            </VisualText>
            <Bar palette={palette} width='70%' />
          </View>
          <Duration minutes={LAST.minutes} color={theme.colors.accent} />
        </Surface>
      </Animated.View>
    </View>
  )
}

function Duration({
  minutes,
  color,
  size = 14,
}: {
  minutes: number
  color: string
  size?: number
}) {
  const theme = useTheme()
  return (
    <VisualText style={{ fontSize: size, fontFamily: theme.fonts.bold, color }}>
      {useFormattedMinutes(minutes).formatted}
    </VisualText>
  )
}

/** A tap on a day, then its Plan dropping in beneath it. */
function PlanChip({
  index,
  day,
  minutes,
  loop,
  reset,
}: {
  index: number
  day: number
  minutes: number
  loop: DerivedValue<number>
  reset: DerivedValue<number>
}) {
  const theme = useTheme()
  const from = 0.06 + index * 0.17
  const tap = useDerivedValue(() => seg(loop.value, from, from + 0.1))
  const drop = useDerivedValue(
    () => seg(loop.value, from + 0.06, from + 0.18) * (1 - reset.value)
  )
  const ringStyle = useAnimatedStyle(() => ({
    opacity: drop.value,
    transform: [{ scale: 0.6 + 0.4 * backOut(drop.value) }],
  }))
  const chipStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, drop.value * 2),
    transform: [
      { translateY: (1 - backOut(drop.value)) * -16 },
      { scale: 0.7 + 0.3 * backOut(drop.value) },
    ],
  }))
  const x = dayX(day)
  const dateTop = STRIP_TOP + DATE_Y - 2
  return (
    <>
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: x - DATE_SIZE / 2 - 2,
            top: dateTop,
            width: DATE_SIZE + 4,
            height: DATE_SIZE + 4,
            borderRadius: (DATE_SIZE + 4) / 2,
            borderWidth: 2,
            borderColor: theme.colors.accent,
          },
          ringStyle,
        ]}
      />
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: x - 36,
            top: CHIP_Y,
            width: 72,
            alignItems: 'center',
          },
          chipStyle,
        ]}
      >
        <View
          style={{
            paddingHorizontal: 6,
            paddingVertical: 3,
            borderRadius: 8,
            backgroundColor: withAlpha(theme.colors.accent, 0x2e),
          }}
        >
          <Duration minutes={minutes} color={theme.colors.accent} size={11} />
        </View>
      </Animated.View>
      <TapRipple
        tap={tap}
        color={theme.colors.accent}
        size={38}
        style={{ left: x - 19, top: dateTop - 3 }}
      />
    </>
  )
}

export default PlanVisual
