import { useEffect } from 'react'
import { Text, View } from 'react-native'
import {
  CalendarDays as CalendarDaysIcon,
  Check as CheckIcon,
} from 'lucide-react-native'
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
import LucideIcon from '@/components/ui/LucideIcon'
import i18n from '@/lib/locales'
import SatelliteSurface, {
  IconChip,
  SatelliteProps,
  SatelliteText,
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
          fontSize: 11,
          fontFamily: today ? theme.fonts.bold : theme.fonts.medium,
          color: today ? palette.text : palette.textAlt,
        }}
      >
        {label}
      </Text>
      <View
        style={{
          width: 18,
          height: 18,
          borderRadius: 9,
          borderWidth: today ? 1.5 : 0,
          borderColor: theme.colors.accent,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Animated.View
          style={[
            {
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: planned ? color : palette.skeleton,
            },
            dotStyle,
          ]}
        />
      </View>
    </View>
  )
}

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
      style={{ width: 214 }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          marginBottom: 10,
        }}
      >
        <IconChip icon={CalendarDaysIcon} color={color} size={26} />
        <SatelliteText
          style={{
            flex: 1,
            fontSize: 13,
            fontFamily: theme.fonts.semiBold,
            color: palette.textAlt,
          }}
        >
          {i18n.t('thisWeek')}
        </SatelliteText>
        <LucideIcon
          icon={CheckIcon}
          size={13}
          color={theme.colors.accent}
          strokeWidth={3}
        />
        <SatelliteText
          style={{
            fontSize: 13,
            fontFamily: theme.fonts.bold,
            color: theme.colors.accent,
          }}
        >
          {i18n.t('scheduleStatus.onTrack')}
        </SatelliteText>
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
