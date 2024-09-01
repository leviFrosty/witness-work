import Card from '../components/Card'
import { Sheet, Spinner } from 'tamagui'
import MapView, {
  LongPressEvent,
  Marker,
  PROVIDER_GOOGLE,
  Region,
} from 'react-native-maps'
import { useToastController } from '@tamagui/toast'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import MapWarningLocationSharingDisabled from '../components/MapWarningLocationSharingDisabled'
import * as Location from 'expo-location'
import { Contact, Coordinate } from '../types/contact'
import { useEffect, useMemo, useRef, useState } from 'react'
import useTheme from '../contexts/theme'
import i18n from '../lib/locales'
import XView from './layout/XView'
import Button from './Button'
import Text from './MyText'
import { Platform, View } from 'react-native'
import IconButton from './IconButton'
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
          paddingVertical: 15,
          marginRight: 20,
          marginTop: 5,
          borderTopColor: theme.colors.border,
          borderTopWidth: 1,
          gap: 10,
        }}
      >
        <XView style={{ gap: 10 }}>
          <View style={{ gap: 5, flex: 1 }}>
            <Text
              style={{
                fontFamily: theme.fonts.semiBold,
              }}
            >
              {i18n.t('pinLocation')}
            </Text>
            <Text
              style={{
                fontSize: theme.fontSize('sm'),
                color: theme.colors.textAlt,
              }}
            >
              {i18n.t('pinLocation_description')}
            </Text>
          </View>
          <View style={{ gap: 3, justifyContent: 'center' }}>
            {contact.coordinate && (
              <View
                style={{
                  borderRadius: theme.numbers.borderRadiusLg,
                  borderWidth: 1,
                  borderColor: theme.colors.accent,
                  backgroundColor: theme.colors.accentTranslucent,
                  paddingHorizontal: 15,
                  paddingVertical: 2,
                  alignItems: 'center',
                }}
              >
                <Text
                  style={{
                    color: theme.colors.accent,
                    fontSize: theme.fontSize('sm'),
                  }}
                >
                  {i18n.t('saved')}
                </Text>
              </View>
            )}
            {contact.userDraggedCoordinate && (
              <View
                style={{
                  borderRadius: theme.numbers.borderRadiusLg,
                  borderWidth: 1,
                  borderColor: theme.colors.text,
                  backgroundColor: theme.colors.background,
                  paddingHorizontal: 15,
                  paddingVertical: 2,
                  alignItems: 'center',
                }}
              >
                <Text
                  style={{
                    color: theme.colors.text,
                    fontSize: theme.fontSize('sm'),
                  }}
                >
                  {i18n.t('custom')}
                </Text>
              </View>
            )}
          </View>
        </XView>

        <XView>
          {contact.coordinate && (
            <>
              <Button
                variant='outline'
                style={{
                  paddingVertical: 12,
                  paddingHorizontal: 30,
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
                <Text>{i18n.t('clear')}</Text>
              </Button>
            </>
          )}
          <Button
            onPress={() => setOpen(true)}
            variant='solid'
            style={{
              paddingVertical: 12,
              flex: 1,
              justifyContent: 'center',
              borderRadius: theme.numbers.borderRadiusSm,
              borderColor: theme.colors.border,
              borderWidth: 1,
            }}
          >
            <Text>{i18n.t(contact.coordinate ? 'edit' : 'add')}</Text>
          </Button>
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
                onLongPress={(e: LongPressEvent) => {
                  setCoordinate({
                    latitude: e.nativeEvent.coordinate.latitude,
                    longitude: e.nativeEvent.coordinate.longitude,
                  })
                }}
                provider={
                  Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined
                }
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
