import { forwardRef, useImperativeHandle } from 'react'
import { View } from 'react-native'
import type { MapViewProps } from 'react-native-maps'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'

const origin = { latitude: 0, longitude: 0 }

/**
 * Stands in for react-native-maps in the web build (see
 * `metro/bundleRedirects.js`), which builds native components as it loads and
 * has no web map. Map screens show a placeholder in the map's place; markers
 * and lines draw nothing, and camera moves do nothing.
 */
const MapView = forwardRef<unknown, MapViewProps>(function MapView(
  { style, testID },
  ref
) {
  const theme = useTheme()
  useImperativeHandle(ref, () => ({
    animateCamera: () => {},
    animateToRegion: () => {},
    fitToCoordinates: () => {},
    setCamera: () => {},
    getCamera: async () => ({ center: origin, heading: 0, pitch: 0, zoom: 0 }),
    getMapBoundaries: async () => ({ northEast: origin, southWest: origin }),
    pointForCoordinate: async () => ({ x: 0, y: 0 }),
    coordinateForPoint: async () => origin,
  }))
  return (
    <View
      testID={testID}
      style={[
        {
          alignItems: 'center',
          justifyContent: 'center',
          padding: 20,
          backgroundColor: theme.colors.backgroundLighter,
        },
        style,
      ]}
    >
      <Text style={{ color: theme.colors.textAlt, textAlign: 'center' }}>
        {i18n.t('map_unavailableOnWeb')}
      </Text>
    </View>
  )
})

const Nothing = () => null

export default MapView
export { MapView, Nothing as Marker, Nothing as Polyline }
