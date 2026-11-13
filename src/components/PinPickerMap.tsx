import { useEffect, useState, type Ref } from 'react'
import { View, type StyleProp, type ViewStyle } from 'react-native'
import MapView, { Marker, type Region } from 'react-native-maps'
import * as Location from 'expo-location'
import LocationNotice from '@/components/LocationNotice'
import Spinner from '@/components/ui/Spinner'
import useTheme from '@/contexts/theme'
import useLocationAccess from '@/hooks/useLocationAccess'
import { usePreferences } from '@/stores/preferences'
import type { Coordinate } from '@/types/contact'

const ZOOMED_IN = { latitudeDelta: 0.005, longitudeDelta: 0.005 }

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

  onRegionChange?: (region: Region) => void
  otherPins?: { id: string; coordinate: Coordinate }[]

  around?: Coordinate
  pinId?: string
  mapRef?: Ref<MapView>
  style?: StyleProp<ViewStyle>
}) {
  const theme = useTheme()
  const { colorScheme } = usePreferences()
  const location = useLocationAccess()
  const [noticeHidden, setNoticeHidden] = useState(false)

  const [userLocation, setUserLocation] = useState<Region | null>()
  const [opensOn] = useState(coordinate ?? around)

  useEffect(() => {
    const getLocation = async () => {
      const { granted } = await Location.getForegroundPermissionsAsync()
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
          showsUserLocation={location.granted}
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

      {location.notice && !noticeHidden && location.access && (
        <LocationNotice
          floating
          access={location.access}
          fix={location.fix}
          onFix={location.runFix}
          onDismiss={() => setNoticeHidden(true)}
          testID='pin-picker-location-notice'
          style={{
            position: 'absolute',
            top: 8,
            left: 8,
            right: 8,
            borderRadius: 8,
          }}
        />
      )}
    </View>
  )
}
