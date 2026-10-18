import { useEffect, useState, type Ref } from 'react'
import { View, type StyleProp, type ViewStyle } from 'react-native'
import MapView, { Marker, type Region } from 'react-native-maps'
import * as Location from 'expo-location'
import MapWarningLocationSharingDisabled from '@/components/MapWarningLocationSharingDisabled'
import Spinner from '@/components/ui/Spinner'
import useTheme from '@/contexts/theme'
import { usePreferences } from '@/stores/preferences'
import type { Coordinate } from '@/types/contact'

const ZOOMED_IN = { latitudeDelta: 0.005, longitudeDelta: 0.005 }

/**
 * A map to put one pin on: tap or touch and hold to drop it, drag it to fine
 * tune. Opens on the pin, else `around`, else on the device's location.
 * `otherPins` show in gray for reference, e.g. the User's other Contacts.
 */
export default function PinPickerMap({
  coordinate,
  onChange,
  onRegionChange,
  otherPins = [],
  around,
  pinId = 'picked-pin',
  mapRef,
  style,
}: {
  coordinate: Coordinate | undefined
  onChange: (coordinate: Coordinate) => void
  /** The map moved: its center, e.g. to drop the pin there. */
  onRegionChange?: (region: Region) => void
  otherPins?: { id: string; coordinate: Coordinate }[]
  /**
   * Where to open with no pin yet, e.g. a route's start, before the device's
   * location.
   */
  around?: Coordinate
  pinId?: string
  mapRef?: Ref<MapView>
  style?: StyleProp<ViewStyle>
}) {
  const theme = useTheme()
  const { colorScheme } = usePreferences()
  const [hasLocationPermission, setHasLocationPermission] = useState(false)
  // Undefined while looking, null when there's no fix to open on.
  const [userLocation, setUserLocation] = useState<Region | null>()
  const [opensOn] = useState(coordinate ?? around)

  useEffect(() => {
    const getLocation = async () => {
      const { granted } = await Location.getForegroundPermissionsAsync()
      setHasLocationPermission(granted)
      if (!granted) {
        setUserLocation(null)
        return
      }
      const location = await Location.getLastKnownPositionAsync()
      setUserLocation(
        location
          ? {
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
              ...ZOOMED_IN,
            }
          : null
      )
    }
    getLocation()
  }, [])

  const drop = (e: { nativeEvent: { coordinate: Coordinate } }) =>
    onChange({
      latitude: e.nativeEvent.coordinate.latitude,
      longitude: e.nativeEvent.coordinate.longitude,
    })

  return (
    <View style={[{ flex: 1 }, style]}>
      {userLocation === undefined ? (
        <View
          style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}
        >
          <Spinner />
        </View>
      ) : (
        <MapView
          userInterfaceStyle={colorScheme ? colorScheme : undefined}
          ref={mapRef}
          showsUserLocation={hasLocationPermission}
          style={{ height: '100%', width: '100%' }}
          onPress={drop}
          onLongPress={drop}
          initialRegion={
            opensOn ? { ...opensOn, ...ZOOMED_IN } : (userLocation ?? undefined)
          }
          onRegionChange={onRegionChange}
        >
          {coordinate && (
            <Marker
              draggable
              identifier={pinId}
              pinColor={theme.colors.accent}
              onDragEnd={drop}
              coordinate={{
                latitude: coordinate.latitude,
                longitude: coordinate.longitude,
              }}
              key={coordinate.latitude % 1337}
            />
          )}
          {otherPins.map((pin) => (
            <Marker
              identifier={pin.id}
              key={pin.id}
              coordinate={pin.coordinate}
              pinColor={theme.colors.textAlt}
            />
          ))}
        </MapView>
      )}

      <MapWarningLocationSharingDisabled
        hasLocationPermission={hasLocationPermission}
      />
    </View>
  )
}
