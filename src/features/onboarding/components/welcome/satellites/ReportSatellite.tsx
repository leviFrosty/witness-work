import { useEffect } from 'react'
import { View } from 'react-native'
import { Check as CheckIcon, Send as SendIcon } from 'lucide-react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import useTheme from '@/contexts/theme'
import LucideIcon from '@/components/ui/LucideIcon'
import SatelliteSurface, {
  IconChip,
  SatelliteProps,
  Skeleton,
} from '@/features/onboarding/components/welcome/satellites/SatelliteSurface'

/** The month's service report, sent off with a tap. */
const ReportSatellite = ({
  palette,
  focus,
  active,
  reduceMotion,
}: SatelliteProps) => {
  const theme = useTheme()
  const color = theme.colors.orange
  const flight = useSharedValue(0)
  const sent = useSharedValue(0)

  // The report flies off and comes back confirmed as the story reaches it.
  useEffect(() => {
    if (reduceMotion) {
      sent.value = active ? 1 : 0
      return
    }
    if (!active) {
      sent.value = withTiming(0, { duration: 300 })
      return
    }
    flight.value = withSequence(
      withTiming(1, { duration: 320, easing: Easing.in(Easing.cubic) }),
      withTiming(-1, { duration: 0 }),
      withTiming(0, { duration: 360, easing: Easing.out(Easing.cubic) })
    )
    sent.value = withDelay(420, withSpring(1, { damping: 10, stiffness: 220 }))
  }, [active, reduceMotion, flight, sent])

  const planeStyle = useAnimatedStyle(() => ({
    opacity: 1 - Math.abs(flight.value),
    transform: [
      { translateX: flight.value * 16 },
      { translateY: -flight.value * 16 },
    ],
  }))
  const checkStyle = useAnimatedStyle(() => ({
    opacity: sent.value,
    transform: [{ scale: 0.4 + sent.value * 0.6 }],
  }))

  return (
    <SatelliteSurface
      palette={palette}
      focus={focus}
      accent={color}
      style={{
        width: 170,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 11,
      }}
    >
      <Animated.View style={planeStyle}>
        <IconChip icon={SendIcon} color={color} size={30} />
      </Animated.View>
      <View style={{ flex: 1, gap: 8 }}>
        <Skeleton palette={palette} width='88%' />
        <Skeleton palette={palette} width='54%' />
      </View>
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 11,
          borderWidth: 1.5,
          borderColor: palette.skeleton,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Animated.View
          style={[
            {
              position: 'absolute',
              width: 22,
              height: 22,
              borderRadius: 11,
              backgroundColor: theme.colors.accent,
              alignItems: 'center',
              justifyContent: 'center',
            },
            checkStyle,
          ]}
        >
          <LucideIcon
            icon={CheckIcon}
            size={13}
            color='#FFFFFF'
            strokeWidth={3}
          />
        </Animated.View>
      </View>
    </SatelliteSurface>
  )
}

export default ReportSatellite
