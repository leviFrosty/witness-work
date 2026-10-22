import { useEffect, useState } from 'react'
import { Text, View } from 'react-native'
import Animated, { useAnimatedStyle } from 'react-native-reanimated'
import useTheme from '@/contexts/theme'
import { formatMs } from '@/features/service-reports/hooks/useStopWatch'
import SatelliteSurface, {
  SatelliteProps,
} from '@/features/onboarding/components/welcome/satellites/SatelliteSurface'
import { tracking } from '@/lib/tracking'

// A believable session already under way: 1h 24m 07s.
const STARTED_MS = (84 * 60 + 7) * 1000
// Seconds per beat of the recording dot.
const PULSE_SECONDS = 1.6

/** A running stopwatch, ticking in real time. */
const TimerSatellite = ({
  palette,
  focus,
  reduceMotion,
  time,
}: SatelliteProps) => {
  const theme = useTheme()
  const [elapsed, setElapsed] = useState(STARTED_MS)

  useEffect(() => {
    if (reduceMotion) return
    const id = setInterval(() => setElapsed((ms) => ms + 1000), 1000)
    return () => clearInterval(id)
  }, [reduceMotion])

  const ringStyle = useAnimatedStyle(() => {
    const pulse = reduceMotion
      ? 0
      : (time.value % PULSE_SECONDS) / PULSE_SECONDS
    return {
      opacity: (1 - pulse) * 0.6,
      transform: [{ scale: 1 + pulse * 1.6 }],
    }
  })

  return (
    <SatelliteSurface
      palette={palette}
      focus={focus}
      accent={theme.colors.accent}
      style={{
        borderRadius: 24,
        paddingVertical: 10,
        paddingLeft: 14,
        paddingRight: 16,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <View
        style={{
          width: 10,
          height: 10,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Animated.View
          style={[
            {
              position: 'absolute',
              width: 10,
              height: 10,
              borderRadius: 5,
              backgroundColor: theme.colors.accent,
            },
            ringStyle,
          ]}
        />
        <View
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: theme.colors.accent,
          }}
        />
      </View>
      <Text
        allowFontScaling={false}
        style={{
          fontSize: 18,
          fontFamily: theme.fonts.semiBold,
          fontVariant: ['tabular-nums'],
          letterSpacing: tracking(0.3),
          color: palette.text,
        }}
      >
        {formatMs(elapsed)}
      </Text>
    </SatelliteSurface>
  )
}

export default TimerSatellite
