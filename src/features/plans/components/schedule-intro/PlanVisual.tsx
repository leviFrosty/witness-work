import { View } from 'react-native'
import Animated, {
  DerivedValue,
  useAnimatedStyle,
  useDerivedValue,
} from 'react-native-reanimated'
import { CalendarClock as CalendarClockIcon } from 'lucide-react-native'
import moment from 'moment'
import useTheme from '@/contexts/theme'
import { formatStartTime } from '@/lib/dates'
import i18n from '@/lib/locales'
import { tracking } from '@/lib/tracking'
import { formatMinutesCompact, useFormattedMinutes } from '@/lib/minutes'
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
  DATE_Y,
  DayNumber,
  SelectedRing,
  WeekStrip,
  dayX,
  thisWeek,
} from '@/features/plans/components/schedule-intro/introKit'

const CARD = { top: 24, height: 118 }
const STRIP_TOP = 42

const PLANS = [
  { day: 1, minutes: 120, start: 9 * 60 + 30 },
  { day: 3, minutes: 90, start: 10 * 60 },
  { day: 5, minutes: 180, start: 9 * 60 },
]
const LAST = PLANS[PLANS.length - 1]

const tapAt = (index: number) => 0.06 + index * 0.17

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
  const days = thisWeek()
  const lastDay = days[LAST.day]

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
                fontSize: 12,
                fontFamily: theme.fonts.semiBold,
                color: palette.textAlt,
                textTransform: 'uppercase',
                letterSpacing: tracking(0.5),
              }}
            >
              {i18n.t('thisWeek')}
            </VisualText>
          </View>
          <View
            style={{ position: 'absolute', left: 0, right: 0, top: STRIP_TOP }}
          >
            <WeekStrip
              palette={palette}
              renderDate={(i) => {
                const index = PLANS.findIndex((plan) => plan.day === i)
                return index < 0 ? null : (
                  <PlannedDate
                    day={days[i]}
                    minutes={PLANS[index].minutes}
                    index={index}
                    loop={loop}
                    reset={reset}
                    color={palette.text}
                  />
                )
              }}
            />
          </View>
        </Surface>
        {PLANS.map((plan, i) => (
          <PlanTap
            key={plan.day}
            index={i}
            day={plan.day}
            loop={loop}
            reset={reset}
          />
        ))}
      </Animated.View>

      <Animated.View
        style={[
          {
            position: 'absolute',
            left: 16,
            right: 16,
            top: CARD.top + CARD.height + 16,
          },
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

function Duration({ minutes, color }: { minutes: number; color: string }) {
  const theme = useTheme()
  return (
    <VisualText style={{ fontSize: 14, fontFamily: theme.fonts.bold, color }}>
      {useFormattedMinutes(minutes).formatted}
    </VisualText>
  )
}

function PlannedDate({
  day,
  minutes,
  index,
  loop,
  reset,
  color,
}: {
  day: moment.Moment
  minutes: number
  index: number
  loop: DerivedValue<number>
  reset: DerivedValue<number>
  color: string
}) {
  const theme = useTheme()
  const from = tapAt(index)
  const drop = useDerivedValue(
    () => seg(loop.value, from + 0.06, from + 0.16) * (1 - reset.value)
  )
  const numberStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -6 * drop.value }],
  }))
  const timeStyle = useAnimatedStyle(() => ({
    opacity: drop.value,
    transform: [
      { translateY: (1 - backOut(drop.value)) * -6 },
      { scale: 0.7 + 0.3 * backOut(drop.value) },
    ],
  }))
  return (
    <>
      <Animated.View style={numberStyle}>
        <DayNumber day={day} color={color} />
      </Animated.View>
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: 0,
            right: 0,
            top: 23,
            alignItems: 'center',
          },
          timeStyle,
        ]}
      >
        <VisualText
          style={{ fontSize: 10, fontFamily: theme.fonts.regular, color }}
        >
          {formatMinutesCompact(minutes)}
        </VisualText>
      </Animated.View>
    </>
  )
}

function PlanTap({
  index,
  day,
  loop,
  reset,
}: {
  index: number
  day: number
  loop: DerivedValue<number>
  reset: DerivedValue<number>
}) {
  const theme = useTheme()
  const from = tapAt(index)
  const until = index < PLANS.length - 1 ? tapAt(index + 1) : 1
  const tap = useDerivedValue(() => seg(loop.value, from, from + 0.1))
  const ringStyle = useAnimatedStyle(() => {
    const on = seg(loop.value, from + 0.02, from + 0.08)
    const off = seg(loop.value, until + 0.02, until + 0.06)
    const p = on * (1 - off) * (1 - reset.value)
    return {
      opacity: p,
      transform: [{ scale: 0.85 + 0.15 * backOut(on) }],
    }
  })
  const x = dayX(day)
  const dateTop = STRIP_TOP + DATE_Y
  return (
    <>
      <SelectedRing x={x} top={dateTop} style={ringStyle} />
      <TapRipple
        tap={tap}
        color={theme.colors.accent}
        size={44}
        style={{ left: x - 22, top: dateTop - 2 }}
      />
    </>
  )
}

export default PlanVisual
