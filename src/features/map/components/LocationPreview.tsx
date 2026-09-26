import { useEffect, useMemo } from 'react'
import { View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
import MapView, { Marker } from 'react-native-maps'
import useTheme from '@/contexts/theme'
import { useMarkerColors } from '@/hooks/useMarkerColors'
import { usePreferences } from '@/stores/preferences'

const FAKE_USER_LOCATION = {
  latitude: 41.160376,
  longitude: -74.257556,
}

const USER_DOT_COLOR = '#4285F4'

/**
 * Illustrates what sharing location gets you: a pulsing "you are here" dot
 * among contact markers. Uses a fake location so the preview never needs the
 * permission it's asking for.
 */
const LocationPreview = () => {
  const theme = useTheme()
  const markerColors = useMarkerColors()
  const { colorScheme } = usePreferences()
  const pulse = useSharedValue(0)

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 1800, easing: Easing.out(Easing.ease) }),
      -1
    )
  }, [pulse])

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: 0.45 * (1 - pulse.value),
    transform: [{ scale: 1 + pulse.value * 3 }],
  }))

  const fakeContacts = useMemo(
    () => [
      { dLat: 0.0028, dLng: -0.0034, color: markerColors.withinThePastWeek },
      { dLat: -0.0022, dLng: 0.0018, color: markerColors.longerThanAWeekAgo },
      { dLat: 0.0014, dLng: 0.0042, color: markerColors.longerThanAMonthAgo },
      { dLat: -0.0036, dLng: -0.0026, color: markerColors.noConversations },
      { dLat: 0.0044, dLng: 0.0012, color: markerColors.withinThePastWeek },
      { dLat: -0.0012, dLng: 0.0038, color: markerColors.longerThanAWeekAgo },
    ],
    [markerColors]
  )

  return (
    <View
      pointerEvents='none'
      accessibilityElementsHidden
      importantForAccessibility='no-hide-descendants'
      style={{
        width: '100%',
        height: 200,
        borderRadius: theme.numbers.borderRadiusLg,
        overflow: 'hidden',
        backgroundColor: theme.colors.backgroundLighter,
      }}
    >
      <MapView
        userInterfaceStyle={colorScheme ? colorScheme : undefined}
        scrollEnabled={false}
        zoomEnabled={false}
        pitchEnabled={false}
        rotateEnabled={false}
        toolbarEnabled={false}
        style={{ height: '100%', width: '100%' }}
        initialRegion={{
          ...FAKE_USER_LOCATION,
          latitudeDelta: 0.015,
          longitudeDelta: 0.015,
        }}
      >
        {fakeContacts.map((p, i) => (
          <Marker
            key={i}
            coordinate={{
              latitude: FAKE_USER_LOCATION.latitude + p.dLat,
              longitude: FAKE_USER_LOCATION.longitude + p.dLng,
            }}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View
              style={{
                width: 14,
                height: 14,
                borderRadius: 7,
                backgroundColor: p.color,
                borderWidth: 2,
                borderColor: theme.colors.card,
              }}
            />
          </Marker>
        ))}
      </MapView>
      {/* The region is centered on the fake location, so the dot is drawn as
          a centered overlay instead of a Marker — animated views inside map
          markers don't reliably re-render. */}
      <View
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Animated.View
          style={[
            {
              position: 'absolute',
              width: 20,
              height: 20,
              borderRadius: 10,
              backgroundColor: USER_DOT_COLOR,
            },
            pulseStyle,
          ]}
        />
        <View
          style={{
            width: 20,
            height: 20,
            borderRadius: 10,
            backgroundColor: USER_DOT_COLOR,
            borderWidth: 3,
            borderColor: '#FFFFFF',
          }}
        />
      </View>
    </View>
  )
}

export default LocationPreview
