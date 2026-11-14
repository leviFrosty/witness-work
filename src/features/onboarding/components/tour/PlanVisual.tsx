import { View } from 'react-native'
import Animated, {
  DerivedValue,
  clamp,
  useAnimatedStyle,
  useDerivedValue,
} from 'react-native-reanimated'
import { Check as CheckIcon } from 'lucide-react-native'
import moment from 'moment'
import useTheme from '@/contexts/theme'
import LucideIcon from '@/components/ui/LucideIcon'
import i18n from '@/lib/locales'
import { withAlpha } from '@/lib/color'
import { formatDisplay } from '@/lib/dates'
import { formatMinutesCompact } from '@/lib/minutes'
import { tracking } from '@/lib/tracking'
import { WelcomePalette } from '@/features/onboarding/lib/welcomePalette'
import {
  RevealVisualProps,
  Surface,
  TapRipple,
  VISUAL,
  VisualText,
  backOut,
  seg,
  useRiseStyle,
  useVisualClock,
} from '@/features/updates/components/reveal/visuals/kit'

const GOAL_MINUTES = 50 * 60
const BEFORE_MINUTES = 34 * 60
const DAY_MINUTES = 4 * 60

const PICKS = [1, 4, 9, 12]

const DAYS = 14
const CALENDAR = { top: 0, height: 152, pad: 10, rows: [58, 102] }
const CELL = { width: 40, height: 42 }
const COLUMN = (VISUAL.width - CALENDAR.pad * 2) / 7
const GOAL = { top: 160, height: 120 }

const T = { result: [0.5, 0.58], reset: [0.92, 0.98] }

const tapAt = (pick: number) => {
  'worklet'
  return 0.06 + pick * 0.12
}

const planned = (t: number, pick: number) => {
  'worklet'
  const from = tapAt(pick) + 0.03
  return seg(t, from, from + 0.09)
}

const swapped = (t: number, pick: number) => {
  'worklet'
  if (pick < 0) return 1
  if (pick >= PICKS.length) return 0
  const from = tapAt(pick) + 0.05
  return clamp((t - from) / 0.04, 0, 1)
}

const PlanVisual = ({ palette, active, reduceMotion }: RevealVisualProps) => {
  const theme = useTheme()
  const accent = theme.colors.accent
  const { intro, loop } = useVisualClock({
    active,
    reduceMotion,
    introMs: 900,
    loopMs: 6800,
    restAt: 0.8,
  })

  const calendarStyle = useRiseStyle(intro, 0, 0.6, 22)
  const goalStyle = useRiseStyle(intro, 0.3, 1, 22)
  const time = useDerivedValue(() =>
    loop.value >= T.reset[0]
      ? (1 - seg(loop.value, T.reset[0], T.reset[1])) * T.reset[0]
      : loop.value
  )
  const reached = useDerivedValue(() =>
    seg(time.value, T.result[0], T.result[1])
  )

  const barStyle = useAnimatedStyle(() => {
    let minutes = BEFORE_MINUTES
    for (let pick = 0; pick < PICKS.length; pick++) {
      minutes += planned(time.value, pick) * DAY_MINUTES
    }
    return { width: `${(minutes / GOAL_MINUTES) * 100}%` }
  })
  const resultStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, reached.value * 1.6),
    transform: [{ scale: 0.7 + 0.3 * backOut(reached.value) }],
  }))

  const start = moment().startOf('week').add(1, 'week')
  const days = Array.from({ length: DAYS }, (_, i) =>
    start.clone().add(i, 'days')
  )
  const totals = Array.from(
    { length: PICKS.length + 1 },
    (_, step) => BEFORE_MINUTES + step * DAY_MINUTES
  )

  return (
    <View style={{ flex: 1 }}>
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: 0,
            right: 0,
            top: CALENDAR.top,
            height: CALENDAR.height,
          },
          calendarStyle,
        ]}
      >
        <Surface palette={palette} style={{ flex: 1 }}>
          <VisualText
            style={{
              position: 'absolute',
              left: 16,
              top: 13,
              fontSize: 13,
              fontFamily: theme.fonts.bold,
              letterSpacing: tracking(0.5),
              textTransform: 'uppercase',
              color: palette.textAlt,
            }}
          >
            {formatDisplay(days[0], 'MMMM')}
          </VisualText>
          <View
            style={{
              position: 'absolute',
              left: CALENDAR.pad,
              right: CALENDAR.pad,
              top: 36,
              flexDirection: 'row',
            }}
          >
            {days.slice(0, 7).map((day, i) => (
              <View key={i} style={{ width: COLUMN, alignItems: 'center' }}>
                <VisualText
                  style={{
                    fontSize: 12,
                    lineHeight: 16,
                    fontFamily: theme.fonts.medium,
                    color: palette.textAlt,
                  }}
                >
                  {Array.from(day.format('dd'))[0] ?? ''}
                </VisualText>
              </View>
            ))}
          </View>
          {days.map((day, i) => (
            <DayCell
              key={i}
              label={formatDisplay(day, 'D')}
              left={CALENDAR.pad + COLUMN * (i % 7) + (COLUMN - CELL.width) / 2}
              top={CALENDAR.rows[Math.floor(i / 7)]}
              pick={PICKS.indexOf(i)}
              time={time}
              loop={loop}
              palette={palette}
            />
          ))}
        </Surface>
      </Animated.View>

      <Animated.View
        style={[
          {
            position: 'absolute',
            left: 0,
            right: 0,
            top: GOAL.top,
            height: GOAL.height,
          },
          goalStyle,
        ]}
      >
        <Surface
          palette={palette}
          style={{ flex: 1, paddingHorizontal: 16, paddingTop: 14 }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
            }}
          >
            <View>
              {totals.map((minutes, step) => (
                <Total key={step} step={step} time={time} color={palette.text}>
                  {formatMinutesCompact(minutes)}
                </Total>
              ))}
            </View>
            <VisualText
              style={{ fontSize: 13, marginBottom: 3, color: palette.textAlt }}
            >
              {i18n.t('goalLabel', {
                value: formatMinutesCompact(GOAL_MINUTES),
              })}
            </VisualText>
          </View>
          <View
            style={{
              marginTop: 8,
              height: 12,
              borderRadius: 6,
              backgroundColor: palette.ringTrack,
              overflow: 'hidden',
            }}
          >
            <Animated.View
              style={[
                { height: 12, borderRadius: 6, backgroundColor: accent },
                barStyle,
              ]}
            />
          </View>
          <View style={{ marginTop: 12, height: 28, justifyContent: 'center' }}>
            <View>
              {totals.slice(0, PICKS.length).map((minutes, step) => (
                <Total
                  key={step}
                  step={step}
                  time={time}
                  color={palette.textAlt}
                  small
                >
                  {i18n.t('hoursToGoLabel', {
                    value: formatMinutesCompact(GOAL_MINUTES - minutes),
                  })}
                </Total>
              ))}
            </View>
            <Animated.View
              style={[
                {
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  transformOrigin: 'left center',
                },
                resultStyle,
              ]}
            >
              <View
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 13,
                  backgroundColor: accent,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <LucideIcon
                  icon={CheckIcon}
                  size={16}
                  color='#FFFFFF'
                  strokeWidth={3}
                />
              </View>
              <VisualText
                minimumFontScale={0.7}
                style={{
                  flex: 1,
                  fontSize: 20,
                  lineHeight: 26,
                  fontFamily: theme.fonts.bold,
                  letterSpacing: tracking(-0.3),
                  color: accent,
                }}
              >
                {i18n.t('onboardingTour_plan_reachesGoal')}
              </VisualText>
            </Animated.View>
          </View>
        </Surface>
      </Animated.View>
    </View>
  )
}

const Total = ({
  step,
  time,
  color,
  small,
  children,
}: {
  step: number
  time: DerivedValue<number>
  color: string
  small?: boolean
  children: string
}) => {
  const theme = useTheme()
  const style = useAnimatedStyle(() => ({
    opacity: swapped(time.value, step - 1) * (1 - swapped(time.value, step)),
  }))
  return (
    <Animated.View
      style={[step > 0 && { position: 'absolute', left: 0, top: 0 }, style]}
    >
      <VisualText
        style={
          small
            ? { fontSize: 14, lineHeight: 18, color }
            : {
                fontSize: 22,
                lineHeight: 26,
                fontFamily: theme.fonts.bold,
                letterSpacing: tracking(-0.3),
                fontVariant: ['tabular-nums'],
                color,
              }
        }
      >
        {children}
      </VisualText>
    </Animated.View>
  )
}

const DayCell = ({
  label,
  left,
  top,
  pick,
  time,
  loop,
  palette,
}: {
  label: string
  left: number
  top: number
  pick: number
  time: DerivedValue<number>
  loop: DerivedValue<number>
  palette: WelcomePalette
}) => {
  const theme = useTheme()
  const accent = theme.colors.accent
  const picked = pick >= 0
  const tap = useDerivedValue(() =>
    picked ? seg(loop.value, tapAt(pick), tapAt(pick) + 0.08) : 0
  )
  const fillStyle = useAnimatedStyle(() => {
    const p = picked ? planned(time.value, pick) : 0
    return { opacity: p, transform: [{ scale: 0.8 + 0.2 * backOut(p) }] }
  })
  const numberStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: picked ? -8 * planned(time.value, pick) : 0 }],
  }))
  const hoursStyle = useAnimatedStyle(() => {
    const p = picked ? planned(time.value, pick) : 0
    return {
      opacity: p,
      transform: [{ scale: 0.6 + 0.4 * backOut(p) }],
    }
  })
  return (
    <View
      style={{
        position: 'absolute',
        left,
        top,
        width: CELL.width,
        height: CELL.height,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {picked && (
        <Animated.View
          style={[
            {
              position: 'absolute',
              left: 0,
              right: 0,
              top: 0,
              bottom: 0,
              borderRadius: 12,
              borderCurve: 'continuous',
              borderWidth: 1.5,
              borderColor: accent,
              backgroundColor: withAlpha(accent, 0x2e),
            },
            fillStyle,
          ]}
        />
      )}
      <Animated.View style={numberStyle}>
        <VisualText
          style={{
            fontSize: 15,
            lineHeight: 18,
            fontFamily: theme.fonts.semiBold,
            color: palette.text,
          }}
        >
          {label}
        </VisualText>
      </Animated.View>
      {picked && (
        <>
          <Animated.View
            style={[
              {
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 4,
                alignItems: 'center',
              },
              hoursStyle,
            ]}
          >
            <VisualText
              style={{
                fontSize: 12,
                lineHeight: 15,
                fontFamily: theme.fonts.bold,
                color: accent,
              }}
            >
              {formatMinutesCompact(DAY_MINUTES)}
            </VisualText>
          </Animated.View>
          <TapRipple
            tap={tap}
            color={accent}
            size={46}
            style={{
              left: (CELL.width - 46) / 2,
              top: (CELL.height - 46) / 2,
            }}
          />
        </>
      )}
    </View>
  )
}

export default PlanVisual
