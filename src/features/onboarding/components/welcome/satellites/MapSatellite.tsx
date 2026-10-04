import { useEffect } from 'react'
import { View } from 'react-native'
import Svg, { Path, Rect } from 'react-native-svg'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import useTheme from '@/contexts/theme'
import { useMarkerColors } from '@/hooks/useMarkerColors'
import { withAlpha } from '@/lib/color'
import SatelliteSurface, {
  SatelliteProps,
} from '@/features/onboarding/components/welcome/satellites/SatelliteSurface'

const SIZE = 92
const MARKER = 13

interface MarkerProps {
  x: number
  y: number
  color: string
  index: number
  pulse?: boolean
  active: boolean
  reduceMotion: boolean
}

const Marker = ({
  x,
  y,
  color,
  index,
  pulse,
  active,
  reduceMotion,
}: MarkerProps) => {
  const theme = useTheme()
  const drop = useSharedValue(0)
  const ring = useSharedValue(0)

  // Markers drop back onto the map as the story reaches visits.
  useEffect(() => {
    if (!active || reduceMotion) return
    drop.value = withSequence(
      withTiming(1, { duration: 0 }),
      withDelay(index * 90, withSpring(0, { damping: 9, stiffness: 200 }))
    )
  }, [active, reduceMotion, index, drop])

  useEffect(() => {
    if (!pulse || reduceMotion) return
    ring.value = withRepeat(withTiming(1, { duration: 1800 }), -1, false)
  }, [pulse, reduceMotion, ring])

  const markerStyle = useAnimatedStyle(() => ({
    opacity: 1 - drop.value,
    transform: [{ translateY: -drop.value * 14 }],
  }))
  const ringStyle = useAnimatedStyle(() => ({
    opacity: (1 - ring.value) * 0.55,
    transform: [{ scale: 1 + ring.value * 1.5 }],
  }))

  return (
    <View
      style={{
        position: 'absolute',
        left: x - MARKER / 2,
        top: y - MARKER / 2,
        width: MARKER,
        height: MARKER,
      }}
    >
      {pulse && (
        <Animated.View
          style={[
            {
              position: 'absolute',
              width: MARKER,
              height: MARKER,
              borderRadius: MARKER / 2,
              backgroundColor: color,
            },
            ringStyle,
          ]}
        />
      )}
      <Animated.View
        style={[
          {
            width: MARKER,
            height: MARKER,
            borderRadius: MARKER / 2,
            borderWidth: 2.5,
            borderColor: '#FFFFFF',
            backgroundColor: color,
            shadowColor: theme.colors.shadow,
            shadowOpacity: 0.25,
            shadowRadius: 3,
            shadowOffset: { width: 0, height: 1 },
          },
          markerStyle,
        ]}
      />
    </View>
  )
}

/** A corner of the territory, with contacts coloured by how recently visited. */
const MapSatellite = ({
  palette,
  focus,
  active,
  reduceMotion,
}: SatelliteProps) => {
  const theme = useTheme()
  const markers = useMarkerColors()
  const road = palette.mapRoad

  return (
    <SatelliteSurface
      palette={palette}
      focus={focus}
      accent={theme.colors.cyan}
      style={{
        width: SIZE,
        height: SIZE,
        padding: 0,
        borderRadius: 22,
        overflow: 'hidden',
      }}
    >
      <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        <Rect
          x={58}
          y={6}
          width={30}
          height={26}
          rx={9}
          fill={withAlpha(theme.colors.accent, 0x26)}
        />
        <Path
          d='M-4 84 C 24 74, 56 94, 96 78'
          stroke={withAlpha(theme.colors.cyan, 0x33)}
          strokeWidth={7}
          fill='none'
        />
        <Path
          d='M-4 58 C 22 50, 44 66, 96 46'
          stroke={road}
          strokeWidth={5}
          strokeLinecap='round'
          fill='none'
        />
        <Path d='M30 -4 L 40 96' stroke={road} strokeWidth={3} />
        <Path d='M-4 24 L 96 34' stroke={road} strokeWidth={3} />
        <Path d='M66 -4 L 60 96' stroke={road} strokeWidth={2} />
      </Svg>
      <Marker
        x={22}
        y={40}
        color={markers.withinThePastWeek}
        index={0}
        pulse
        active={active}
        reduceMotion={reduceMotion}
      />
      <Marker
        x={70}
        y={56}
        color={markers.longerThanAWeekAgo}
        index={1}
        active={active}
        reduceMotion={reduceMotion}
      />
      <Marker
        x={48}
        y={76}
        color={markers.longerThanAMonthAgo}
        index={2}
        active={active}
        reduceMotion={reduceMotion}
      />
    </SatelliteSurface>
  )
}

export default MapSatellite
