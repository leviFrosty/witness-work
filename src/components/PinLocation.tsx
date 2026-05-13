import Card from '../components/Card'
import { Sheet, Spinner } from 'tamagui'
import MapView, { Marker, Region } from 'react-native-maps'
import { useToastController } from '@tamagui/toast'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import MapWarningLocationSharingDisabled from './MapWarningLocationSharingDisabled'
import * as Location from 'expo-location'
import { Contact, Coordinate } from '../types/contact'
import { useEffect, useMemo, useRef, useState } from 'react'
import useTheme from '../contexts/theme'
import i18n from '../lib/locales'
import XView from '../components/layout/XView'
import Button from '../components/Button'
import Text from '../components/MyText'
import { View } from 'react-native'
import IconButton from '../components/IconButton'
import { faTimes } from '@fortawesome/free-solid-svg-icons'
import useContacts from '../stores/contactsStore'
import { usePreferences } from '../stores/preferences'

export default function PinLocation(props: {
  contact: Contact
  setContact: (value: React.SetStateAction<Contact>) => void
}) {
  const { contact, setContact } = props
  const { contacts } = useContacts()
  const [open, setOpen] = useState(false)
  const [hasLocationPermission, setHasLocationPermission] = useState(false)
  const { colorScheme } = usePreferences()
  const [userLocation, setUserLocation] = useState<Region | null>()
  const mapRef = useRef<MapView>(null)
  const initialRegion: Region | undefined = contact.coordinate
    ? {
        latitude: contact.coordinate.latitude,
        longitude: contact.coordinate.longitude,
        latitudeDelta: 0.005,
        longitudeDelta: 0.005,
      }
    : undefined
  const [region, setRegion] = useState<Region | undefined>(initialRegion)
  const [coordinate, setCoordinate] = useState<Coordinate | undefined>(
    contact.coordinate
  )
  const insets = useSafeAreaInsets()
  const theme = useTheme()
  const toast = useToastController()

  function handleSave() {
    setContact({ ...contact, coordinate, userDraggedCoordinate: !!coordinate })
    toast.show(i18n.t('coordinateSaved'), { native: true })
    setOpen(false)
  }

  function handleAddOrRemove() {
    if (region && !coordinate) {
      setCoordinate({ latitude: region.latitude, longitude: region.longitude })
    } else {
      setCoordinate(undefined)
    }
  }

  useEffect(() => {
    const getLocation = async () => {
      const { granted } = await Location.getForegroundPermissionsAsync()
      if (granted) {
        const location = await Location.getLastKnownPositionAsync()
        if (location) {
          setUserLocation({
            latitude: location?.coords.latitude,
            longitude: location?.coords.longitude,
            latitudeDelta: 0.005,
            longitudeDelta: 0.005,
          })
        } else {
          setUserLocation(null)
        }
        setHasLocationPermission(true)
        return
      }
      setHasLocationPermission(false)
      setUserLocation(null)
    }

    getLocation()
  }, [])

  const otherContacts = useMemo(
    () =>
      contacts.filter(
        (c) =>
          c.id !== contact.id &&
          c.coordinate?.latitude &&
          c.coordinate.longitude
      ),
    [contact.id, contacts]
  )

  return (
    <>
      <View
        style={{
          paddingVertical: 10,
          marginRight: 20,
        }}
      >
        <XView style={{ gap: 10, alignItems: 'center' }}>
          <View style={{ gap: 2, flex: 1 }}>
            <Text
              style={{
                fontFamily: theme.fonts.semiBold,
                fontSize: theme.fontSize('sm'),
                color: theme.colors.textAlt,
              }}
            >
              {i18n.t('pinOnMap')}
            </Text>
            <Text
              style={{
                fontSize: theme.fontSize('xs'),
                color: theme.colors.textAlt,
              }}
            >
              {contact.coordinate
                ? i18n.t('pinOnMap_customSet')
                : i18n.t('pinOnMap_descriptionAuto')}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {contact.coordinate && (
              <Button
                variant='outline'
                style={{
                  paddingVertical: 6,
                  paddingHorizontal: 12,
                  justifyContent: 'center',
                  borderRadius: theme.numbers.borderRadiusSm,
                }}
                onPress={() => {
                  setCoordinate(undefined)
                  if (userLocation) {
                    setRegion(userLocation)
                    mapRef.current?.animateToRegion(userLocation)

                    setContact({
                      ...contact,
                      coordinate: undefined,
                      userDraggedCoordinate: undefined,
                    })
                  }
                }}
              >
                <Text style={{ fontSize: theme.fontSize('sm') }}>
                  {i18n.t('clear')}
                </Text>
              </Button>
            )}
            <Button
              onPress={() => setOpen(true)}
              variant='outline'
              style={{
                paddingVertical: 6,
                paddingHorizontal: 14,
                justifyContent: 'center',
                borderRadius: theme.numbers.borderRadiusSm,
              }}
            >
              <Text style={{ fontSize: theme.fontSize('sm') }}>
                {i18n.t(contact.coordinate ? 'edit' : 'add')}
              </Text>
            </Button>
          </View>
        </XView>
      </View>
      <Sheet
        open={open}
        modal
        disableDrag
        onOpenChange={setOpen}
        dismissOnSnapToBottom
        animation='quick'
        snapPoints={[92]}
      >
        <Sheet.Overlay zIndex={100_000 - 1} />
        <Sheet.Frame>
          <XView
            style={{
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              paddingVertical: 15,
              paddingHorizontal: 20,
              gap: 10,
            }}
          >
            <Text style={{ fontSize: theme.fontSize('md'), flex: 1 }}>
              {i18n.t('pinLocationHelp')}
            </Text>
            <IconButton
              noTransform
              icon={faTimes}
              color={theme.colors.text}
              onPress={() => setOpen(false)}
              size={'lg'}
            />
          </XView>
          <View
            style={{
              position: 'relative',
              flex: 1,
            }}
          >
            {userLocation === undefined ? (
              <View
                style={{
                  flex: 1,
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                <Spinner />
              </View>
            ) : (
              <MapView
                userInterfaceStyle={colorScheme ? colorScheme : undefined}
                ref={mapRef}
                showsUserLocation={hasLocationPermission}
                style={{ height: '100%', width: '100%' }}
                onPress={(e) => {
                  setCoordinate({
                    latitude: e.nativeEvent.coordinate.latitude,
                    longitude: e.nativeEvent.coordinate.longitude,
                  })
                }}
                onLongPress={(e) => {
                  setCoordinate({
                    latitude: e.nativeEvent.coordinate.latitude,
                    longitude: e.nativeEvent.coordinate.longitude,
                  })
                }}
                initialRegion={
                  initialRegion
                    ? initialRegion
                    : userLocation
                      ? userLocation
                      : undefined
                }
                onRegionChange={(newRegion) => setRegion(newRegion)}
              >
                {coordinate?.latitude && coordinate.longitude && (
                  <Marker
                    draggable
                    identifier={contact.id}
                    pinColor={theme.colors.accent}
                    onDragEnd={(e) =>
                      setCoordinate({
                        latitude: e.nativeEvent.coordinate.latitude,
                        longitude: e.nativeEvent.coordinate.longitude,
                      })
                    }
                    coordinate={{
                      latitude: coordinate.latitude,
                      longitude: coordinate.longitude,
                    }}
                    key={coordinate.latitude % 1337}
                  />
                )}
                {otherContacts.map((c) => (
                  <Marker
                    identifier={c.id}
                    key={c.id}
                    coordinate={c.coordinate!}
                    pinColor={theme.colors.textAlt}
                  />
                ))}
              </MapView>
            )}

            <MapWarningLocationSharingDisabled
              hasLocationPermission={hasLocationPermission}
            />
            <View
              style={{
                position: 'absolute',
                bottom: insets.bottom,
                width: '100%',
                padding: 5,
              }}
            >
              <Card
                style={{
                  flexDirection: 'row',
                  gap: 5,
                  borderRadius: theme.numbers.borderRadiusMd,
                  paddingVertical: 10,
                  paddingHorizontal: 10,
                }}
              >
                <Button
                  noTransform
                  variant='outline'
                  style={{
                    justifyContent: 'center',
                    flex: 1,
                    paddingVertical: 10,
                  }}
                  onPress={handleAddOrRemove}
                >
                  <Text>{i18n.t(coordinate ? 'remove' : 'add')}</Text>
                </Button>
                <Button
                  noTransform
                  variant='solid'
                  style={{
                    justifyContent: 'center',
                    flex: 1,
                    backgroundColor: theme.colors.accent,
                    paddingVertical: 10,
                  }}
                  onPress={handleSave}
                >
                  <Text
                    style={{
                      fontFamily: theme.fonts.semiBold,
                      color: theme.colors.textInverse,
                    }}
                  >
                    {i18n.t('save')}
                  </Text>
                </Button>
              </Card>
            </View>
          </View>
        </Sheet.Frame>
      </Sheet>
    </>
  )
}
