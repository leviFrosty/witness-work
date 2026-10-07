import { View } from 'react-native'
import Animated, {
  DerivedValue,
  useAnimatedStyle,
  useDerivedValue,
} from 'react-native-reanimated'
import { Check as CheckIcon } from 'lucide-react-native'
import useTheme from '@/contexts/theme'
import LucideIcon from '@/components/ui/LucideIcon'
import i18n from '@/lib/locales'
import { useFormattedMinutes } from '@/lib/minutes'
import { withAlpha } from '@/lib/color'
import {
  RevealVisualProps,
  Surface,
  VisualText,
  backOut,
  seg,
  segInOut,
  useRiseStyle,
  useVisualClock,
} from '@/features/updates/components/reveal/visuals/kit'
import {
  DATE_SIZE,
  DATE_Y,
  FlameCount,
  WeekStrip,
  dayX,
} from '@/features/plans/components/schedule-intro/introKit'

const CARD_TOP = 84
const STRIP_TOP = CARD_TOP + 16
const DATE_TOP = STRIP_TOP + DATE_Y
/** Planned days get time in turn; the unplanned one gets time too. */
const PLANNED = [
  { day: 1, minutes: 45, at: 0.08 },
  { day: 3, minutes: 120, at: 0.3 },
  { day: 5, minutes: 60, at: 0.62 },
]
const UNPLANNED = { day: 4, minutes: 30, at: 0.46 }
const FALL = 0.12

/**
 * The streak: time logged on each planned day lands in it and the flame's count
 * rolls up. Time on a day without a Plan lands too, and changes nothing.
 */
const StreakVisual = ({ palette, active, reduceMotion }: RevealVisualProps) => {
  const theme = useTheme()
  const { intro, loop } = useVisualClock({
    active,
    reduceMotion,
    introMs: 900,
    loopMs: 6400,
    restAt: 0.86,
  })
  const reset = useDerivedValue(() => seg(loop.value, 0.9, 0.97))
  const steps = useDerivedValue(
    () =>
      PLANNED.reduce(
        (sum, plan) =>
          sum + seg(loop.value, plan.at + FALL, plan.at + FALL + 0.06),
        0
      ) *
      (1 - reset.value)
  )
  const flameStyle = useRiseStyle(intro, 0, 0.5, 16)
  const cardStyle = useRiseStyle(intro, 0.2, 0.8, 22)

  return (
    <View style={{ flex: 1 }}>
      <Animated.View
        style={[
          {
            position: 'absolute',
            top: 4,
            left: 0,
            right: 0,
            alignItems: 'center',
          },
          flameStyle,
        ]}
      >
        <FlameCount steps={steps} max={PLANNED.length} />
      </Animated.View>

      <Animated.View
        style={[
          { position: 'absolute', left: 0, right: 0, top: CARD_TOP },
          cardStyle,
        ]}
      >
        <Surface palette={palette} style={{ height: 150 }}>
          <View style={{ paddingTop: 16 }}>
            <WeekStrip
              palette={palette}
              renderDate={(i) =>
                PLANNED.some((plan) => plan.day === i) ? (
                  <View
                    style={{
                      position: 'absolute',
                      inset: -2,
                      borderRadius: DATE_SIZE,
                      borderWidth: 2,
                      borderColor: theme.colors.accent,
                    }}
                  />
                ) : null
              }
            />
          </View>
          <View
            style={{
              position: 'absolute',
              left: 14,
              right: 14,
              bottom: 14,
              flexDirection: 'row',
              justifyContent: 'center',
              gap: 18,
            }}
          >
            <Legend
              label={i18n.t('scheduleIntro_planned')}
              mark={
                <View
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 6,
                    borderWidth: 2,
                    borderColor: theme.colors.accent,
                  }}
                />
              }
              color={palette.textAlt}
            />
            <Legend
              label={i18n.t('scheduleIntro_kept')}
              mark={<KeptMark size={14} />}
              color={palette.textAlt}
            />
          </View>
        </Surface>
      </Animated.View>

      {PLANNED.map((plan) => (
        <LoggedTime
          key={plan.day}
          {...plan}
          planned
          loop={loop}
          reset={reset}
          border={palette.badgeBorder}
        />
      ))}
      <LoggedTime
        {...UNPLANNED}
        planned={false}
        loop={loop}
        reset={reset}
        border={palette.badgeBorder}
      />
    </View>
  )
}

function Legend({
  label,
  mark,
  color,
}: {
  label: string
  mark: React.ReactNode
  color: string
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      {mark}
      <VisualText style={{ fontSize: 11, color }}>{label}</VisualText>
    </View>
  )
}

function KeptMark({ size, border }: { size: number; border?: string }) {
  const theme = useTheme()
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.accent,
        borderWidth: border ? 1.5 : 0,
        borderColor: border,
      }}
    >
      <LucideIcon
        icon={CheckIcon}
        size={size * 0.65}
        strokeWidth={3}
        color='#FFFFFF'
      />
    </View>
  )
}

/**
 * Time logged on a day: it falls into the date. A planned day is kept and
 * checked; a day without a Plan only gets a quiet dot.
 */
function LoggedTime({
  day,
  minutes,
  at,
  planned,
  loop,
  reset,
  border,
}: {
  day: number
  minutes: number
  at: number
  planned: boolean
  loop: DerivedValue<number>
  reset: DerivedValue<number>
  border: string
}) {
  const theme = useTheme()
  const color = planned ? theme.colors.accent : theme.colors.textAlt
  const duration = useFormattedMinutes(minutes).formatted
  const x = dayX(day)
  const chipStyle = useAnimatedStyle(() => {
    const appear = seg(loop.value, at, at + 0.04)
    const fall = segInOut(loop.value, at + 0.04, at + FALL)
    const landed = seg(loop.value, at + FALL, at + FALL + 0.03)
    return {
      opacity: appear * (1 - landed),
      transform: [
        { translateY: fall * (DATE_TOP - 30) },
        { scale: 1 - fall * 0.4 },
      ],
    }
  })
  const markStyle = useAnimatedStyle(() => {
    const p = seg(loop.value, at + FALL, at + FALL + 0.06) * (1 - reset.value)
    return {
      opacity: Math.min(1, p * 2),
      transform: [{ scale: backOut(p) }],
    }
  })
  return (
    <>
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: x - 32,
            top: 22,
            width: 64,
            alignItems: 'center',
          },
          chipStyle,
        ]}
      >
        <View
          style={{
            paddingHorizontal: 7,
            paddingVertical: 3,
            borderRadius: 8,
            backgroundColor: withAlpha(color, 0x2e),
          }}
        >
          <VisualText
            style={{ fontSize: 11, fontFamily: theme.fonts.bold, color }}
          >
            {`+${duration}`}
          </VisualText>
        </View>
      </Animated.View>
      <Animated.View
        style={[
          planned
            ? {
                position: 'absolute',
                left: x + DATE_SIZE / 2 - 9,
                top: DATE_TOP + DATE_SIZE - 9,
              }
            : {
                position: 'absolute',
                left: x - 3,
                top: DATE_TOP + DATE_SIZE + 4,
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: theme.colors.textAlt,
              },
          markStyle,
        ]}
      >
        {planned && <KeptMark size={16} border={border} />}
      </Animated.View>
    </>
  )
}

export default StreakVisual
