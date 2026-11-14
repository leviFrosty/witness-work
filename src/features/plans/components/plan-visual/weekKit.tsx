import { StyleProp, View, ViewStyle } from 'react-native'
import Animated, { type AnimatedStyle } from 'react-native-reanimated'
import moment from 'moment'
import useTheme from '@/contexts/theme'
import { VisualText } from '@/features/updates/components/reveal/visuals/kit'
import type { WelcomePalette } from '@/features/onboarding/lib/welcomePalette'
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
