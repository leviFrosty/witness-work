import { useEffect } from 'react'
import { View } from 'react-native'
import { Timer as TimerIcon } from 'lucide-react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import moment from 'moment'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { formatMinutesCompact } from '@/lib/minutes'
import SatelliteSurface, {
  IconChip,
  SatelliteProps,
  SatelliteText,
} from '@/features/onboarding/components/welcome/satellites/SatelliteSurface'

const GOAL_MINUTES = 50 * 60
const LOGGED_MINUTES = 34 * 60
const BAR_WIDTH = 180

const HoursSatellite = ({
  palette,
  focus,
  active,
  reduceMotion,
}: SatelliteProps) => {
  const theme = useTheme()
  const accent = theme.colors.accent
  const fill = useSharedValue(1)

  useEffect(() => {
    if (!active || reduceMotion) return
    fill.value = withSequence(
      withTiming(0.55, { duration: 160 }),
      withSpring(1, { damping: 12, stiffness: 120 })
    )
  }, [active, reduceMotion, fill])

  const fillStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: fill.value }],
  }))

  return (
    <SatelliteSurface
      palette={palette}
      focus={focus}
      accent={accent}
      style={{ width: BAR_WIDTH + 28, gap: 10 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <IconChip icon={TimerIcon} color={accent} size={26} />
        <SatelliteText
          style={{
            flex: 1,
            fontSize: 13,
            fontFamily: theme.fonts.semiBold,
            color: palette.textAlt,
          }}
        >
          {moment().format('MMMM')}
        </SatelliteText>
        <SatelliteText
          style={{
            fontSize: 22,
            fontFamily: theme.fonts.bold,
            fontVariant: ['tabular-nums'],
            color: palette.text,
          }}
        >
          {formatMinutesCompact(LOGGED_MINUTES)}
        </SatelliteText>
      </View>
      <View
        style={{
          width: BAR_WIDTH,
          height: 8,
          borderRadius: 4,
          overflow: 'hidden',
          backgroundColor: palette.skeleton,
        }}
      >
        <Animated.View
          style={[
            {
              width: (BAR_WIDTH * LOGGED_MINUTES) / GOAL_MINUTES,
              height: 8,
              borderRadius: 4,
              backgroundColor: accent,
              transformOrigin: 'left',
            },
            fillStyle,
          ]}
        />
      </View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <SatelliteText
          style={{
            fontSize: 13,
            fontFamily: theme.fonts.bold,
            color: accent,
          }}
        >
          {i18n.t('hoursToGoLabel', {
            value: formatMinutesCompact(GOAL_MINUTES - LOGGED_MINUTES),
          })}
        </SatelliteText>
        <SatelliteText
          style={{
            fontSize: 12,
            fontFamily: theme.fonts.medium,
            color: palette.textAlt,
          }}
        >
          {i18n.t('goalLabel', { value: formatMinutesCompact(GOAL_MINUTES) })}
        </SatelliteText>
      </View>
    </SatelliteSurface>
  )
}

export default HoursSatellite
