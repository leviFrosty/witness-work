import { useEffect } from 'react'
import { Text, View } from 'react-native'
import { CalendarDays as CalendarDaysIcon } from 'lucide-react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import moment from 'moment'
import useTheme from '@/contexts/theme'
import SatelliteSurface, {
  IconChip,
  SatelliteProps,
} from '@/features/onboarding/components/welcome/satellites/SatelliteSurface'
import { WelcomePalette } from '@/features/onboarding/lib/welcomePalette'

interface DayProps {
  label: string
  planned: boolean
  today: boolean
  index: number
  color: string
  palette: WelcomePalette
  active: boolean
  reduceMotion: boolean
}

const Day = ({
  label,
  planned,
  today,
  index,
  color,
  palette,
  active,
  reduceMotion,
}: DayProps) => {
  const theme = useTheme()
  const pop = useSharedValue(1)

  // Planned days pop in one after another as the story reaches planning.
  useEffect(() => {
    if (!active || reduceMotion || !planned) return
    pop.value = withSequence(
      withTiming(0, { duration: 120 }),
      withDelay(index * 70, withSpring(1, { damping: 8, stiffness: 260 }))
    )
  }, [active, reduceMotion, planned, index, pop])

  const dotStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pop.value }],
  }))

  return (
    <View style={{ alignItems: 'center', gap: 6 }}>
      <Text
        allowFontScaling={false}
        style={{
          fontSize: 10,
          fontFamily: today ? theme.fonts.bold : theme.fonts.medium,
          color: today ? palette.text : palette.textAlt,
        }}
      >
        {label}
      </Text>
      <View
        style={{
          width: 16,
          height: 16,
          borderRadius: 8,
          borderWidth: today ? 1.5 : 0,
          borderColor: theme.colors.accent,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Animated.View
          style={[
            {
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: planned ? color : palette.skeleton,
            },
            dotStyle,
          ]}
        />
      </View>
    </View>
  )
}

/** This week at a glance, with the planned service days marked. */
const PlanSatellite = ({
  palette,
  focus,
  active,
  reduceMotion,
}: SatelliteProps) => {
  const theme = useTheme()
  const color = theme.colors.indigo
  const weekStart = moment().startOf('week')
  const days = Array.from({ length: 7 }, (_, index) => {
    const day = weekStart.clone().add(index, 'days')
    return {
      label: Array.from(day.format('dd'))[0] ?? '',
      planned: index % 2 === 1,
      today: day.isSame(moment(), 'day'),
    }
  })

  return (
    <SatelliteSurface
      palette={palette}
      focus={focus}
      accent={color}
      style={{ width: 172 }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          marginBottom: 10,
        }}
      >
        <IconChip icon={CalendarDaysIcon} color={color} size={24} />
        <Text
          allowFontScaling={false}
          numberOfLines={1}
          style={{
            flex: 1,
            fontSize: 13,
            fontFamily: theme.fonts.semiBold,
            color: palette.text,
          }}
        >
          {moment().format('MMMM')}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {days.map((day, index) => (
          <Day
            key={index}
            {...day}
            index={index}
            color={color}
            palette={palette}
            active={active}
            reduceMotion={reduceMotion}
          />
        ))}
      </View>
    </SatelliteSurface>
  )
}

export default PlanSatellite
