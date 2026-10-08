import { View } from 'react-native'
import Animated, {
  DerivedValue,
  useAnimatedStyle,
} from 'react-native-reanimated'
import {
  Flame as FlameIcon,
  UserRound as UserRoundIcon,
} from 'lucide-react-native'
import moment from 'moment'
import useTheme from '@/contexts/theme'
import LucideIcon from '@/components/ui/LucideIcon'
import { VisualText } from '@/features/updates/components/reveal/visuals/kit'
import type { WelcomePalette } from '@/features/onboarding/lib/welcomePalette'

/** The intro's week strip: a week's days inside a card, `WEEK.pad` in. */
export const WEEK = { days: 7, pad: 14, width: 320 }
export const DAY_W = (WEEK.width - WEEK.pad * 2) / WEEK.days
/** Where a day's date circle sits, from the strip's top. */
export const DATE_Y = 17
export const DATE_SIZE = 28

/** This week's days, so the sketch matches the User's calendar. */
export const thisWeek = () => {
  const start = moment().startOf('week')
  return Array.from({ length: WEEK.days }, (_, i) =>
    start.clone().add(i, 'days')
  )
}

/** The center of day `index`'s column, from the card's left edge. */
export const dayX = (index: number) => {
  'worklet'
  return WEEK.pad + DAY_W * (index + 0.5)
}

/**
 * A week of day letters and dates. `renderDate` draws over each date circle,
 * for marks like a planned ring or a kept check.
 */
export function WeekStrip({
  palette,
  renderDate,
}: {
  palette: WelcomePalette
  renderDate?: (index: number) => React.ReactNode
}) {
  return (
    <View style={{ flexDirection: 'row', paddingHorizontal: WEEK.pad }}>
      {thisWeek().map((day, i) => (
        <View key={i} style={{ width: DAY_W, alignItems: 'center', gap: 4 }}>
          <VisualText style={{ fontSize: 10, color: palette.textAlt }}>
            {day.format('dd')}
          </VisualText>
          <View
            style={{
              width: DATE_SIZE,
              height: DATE_SIZE,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {renderDate?.(i)}
            <VisualText style={{ fontSize: 13, color: palette.text }}>
              {day.format('D')}
            </VisualText>
          </View>
        </View>
      ))}
    </View>
  )
}

/** A flame and a count that rolls from one number to the next. */
export function FlameCount({
  steps,
  max,
  size = 28,
}: {
  /** 0→`max`: the count shown, between whole numbers mid-roll. */
  steps: DerivedValue<number>
  max: number
  size?: number
}) {
  const theme = useTheme()
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 999,
        backgroundColor: theme.colors.orangeTranslucent,
      }}
    >
      <LucideIcon
        icon={FlameIcon}
        size={size}
        color={theme.colors.orange}
        fill={theme.colors.orange}
      />
      <View style={{ width: size * 0.9, height: size * 1.2 }}>
        {Array.from({ length: max + 1 }, (_, n) => (
          <RollingDigit key={n} n={n} steps={steps} size={size} />
        ))}
      </View>
    </View>
  )
}

function RollingDigit({
  n,
  steps,
  size,
}: {
  n: number
  steps: DerivedValue<number>
  size: number
}) {
  const theme = useTheme()
  const style = useAnimatedStyle(() => {
    const offset = n - steps.value
    return {
      opacity: Math.max(0, 1 - Math.abs(offset) * 1.6),
      transform: [{ translateY: offset * size * 0.9 }],
    }
  })
  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      <VisualText
        style={{
          fontSize: size,
          lineHeight: size * 1.2,
          fontFamily: theme.fonts.bold,
          color: theme.colors.orange,
        }}
      >
        {String(n)}
      </VisualText>
    </Animated.View>
  )
}

/** A person, as a coloured circle — the sketch never shows real names. */
export function Face({
  color,
  size,
  border,
}: {
  color: string
  size: number
  border: string
}) {
  return (
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
}
