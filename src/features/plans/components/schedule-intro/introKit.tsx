import { StyleProp, View, ViewStyle } from 'react-native'
import Animated, {
  type AnimatedStyle,
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
import { formatPlainNumber } from '@/lib/numbers'
import { formatDisplay } from '@/lib/dates'

export const WEEK = { days: 7, pad: 14, width: 320 }
export const DAY_W = (WEEK.width - WEEK.pad * 2) / WEEK.days

export const DATE_Y = 18

export const DATE_SIZE = 40

export const SELECTED_RING = 2

export const thisWeek = () => {
  const start = moment().startOf('week')
  return Array.from({ length: WEEK.days }, (_, i) =>
    start.clone().add(i, 'days')
  )
}

export const dayX = (index: number) => {
  'worklet'
  return WEEK.pad + DAY_W * (index + 0.5)
}

export function DayNumber({
  day,
  color,
}: {
  day: moment.Moment
  color: string
}) {
  const theme = useTheme()
  return (
    <VisualText
      style={{ fontSize: 16, fontFamily: theme.fonts.semiBold, color }}
    >
      {formatDisplay(day, 'D')}
    </VisualText>
  )
}

export function WeekStrip({
  palette,
  renderDate,
}: {
  palette: WelcomePalette
  renderDate?: (index: number) => React.ReactNode
}) {
  const theme = useTheme()
  return (
    <View style={{ flexDirection: 'row', paddingHorizontal: WEEK.pad }}>
      {thisWeek().map((day, i) => (
        <View key={i} style={{ width: DAY_W, alignItems: 'center', gap: 4 }}>
          <VisualText
            style={{
              fontSize: 10,
              lineHeight: 14,
              fontFamily: theme.fonts.medium,
              color: palette.textAlt,
            }}
          >
            {day.format('dd').charAt(0)}
          </VisualText>
          <View
            style={{
              width: DATE_SIZE,
              height: DATE_SIZE,
              borderRadius: theme.numbers.borderRadiusSm,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {renderDate?.(i) ?? <DayNumber day={day} color={palette.text} />}
          </View>
        </View>
      ))}
    </View>
  )
}

export function SelectedRing({
  x,
  top,
  style,
}: {
  x: number
  top: number
  style?: StyleProp<AnimatedStyle<ViewStyle>>
}) {
  const theme = useTheme()
  return (
    <Animated.View
      pointerEvents='none'
      style={[
        {
          position: 'absolute',
          left: x - DATE_SIZE / 2 - SELECTED_RING,
          top: top - SELECTED_RING,
          width: DATE_SIZE + SELECTED_RING * 2,
          height: DATE_SIZE + SELECTED_RING * 2,
          borderWidth: SELECTED_RING,
          borderRadius: theme.numbers.borderRadiusSm + 4,
          borderColor: theme.colors.accent,
        },
        style,
      ]}
    />
  )
}

export function FlameCount({
  steps,
  max,
  size = 28,
}: {
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
        {formatPlainNumber(n)}
      </VisualText>
    </Animated.View>
  )
}

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
