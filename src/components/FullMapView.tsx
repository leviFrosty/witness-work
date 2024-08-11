import { useNavigation } from '@react-navigation/native'
import Carousel, { ICarouselInstance } from 'react-native-reanimated-carousel'
import { ContactMarker } from '../screens/MapScreen'
import { HomeTabStackNavigation } from '../stacks/HomeTabStack'
import { Dimensions, Platform, View } from 'react-native'
import { useCallback, useEffect, useRef, useState } from 'react'
import MapView, { LatLng, Marker, PROVIDER_GOOGLE } from 'react-native-maps'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import useTheme from '../contexts/theme'
import ShareAddressSheet, { MapShareSheet } from './ShareAddressSheet'
import useContacts from '../stores/contactsStore'
import * as Location from 'expo-location'
import Card from './Card'
import Text from './MyText'
import i18n from '../lib/locales'
import ActionButton from './ActionButton'
import { RootStackNavigation } from '../stacks/RootStack'
import * as Crypto from 'expo-crypto'
import MapCarouselCard from './MapCarouselCard'
import Button from './Button'

interface FullMapViewProps {
  contactMarkers: ContactMarker[]
}

export default function FullMapView({ contactMarkers }: FullMapViewProps) {
  const navigation = useNavigation<HomeTabStackNavigation>()
  const width = Dimensions.get('window').width
  const mapRef = useRef<MapView>(null)
  const insets = useSafeAreaInsets()
  const carouselRef = useRef<ICarouselInstance>(null)
  const [locationPermission, setLocationPermission] = useState(false)
  const [sheet, setSheet] = useState<MapShareSheet>({
    open: false,
    appleMapsUri: '',
    googleMapsUri: '',
  })
  const theme = useTheme()
  const { contacts, updateContact } = useContacts()

  const handleDragContactPin = (id: string, coordinate: LatLng) => {
    updateContact({
      ...contacts.find((c) => c.id === id),
      coordinate,
      userDraggedCoordinate: true,
    })
  }

  const fitToMarkers = useCallback(() => {
    mapRef.current?.fitToSuppliedMarkers(contactMarkers.map((c) => c.id))
  }, [contactMarkers])

  const handleMapLayout = () => {
    fitToMarkers()
  }

  const handleFitToMarker = (index: number) => {
    if (contactMarkers[index]) {
      mapRef.current?.fitToSuppliedMarkers([contactMarkers[index].id])
    }
  }

  useEffect(() => {
    const unsubscribe = navigation.addListener('tabPress', (e) => {
      if (e.target?.includes('Map')) {
        fitToMarkers()
      }
    })
    return unsubscribe
  }, [fitToMarkers, navigation])

  useEffect(() => {
    fitToMarkers()

    // Only run at mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const getLocation = async () => {
      const { granted } = await Location.getForegroundPermissionsAsync()
      if (granted) {
        setLocationPermission(true)
      }
    }

    getLocation()
  }, [])

  const cardHeight = 280

  return (
    <>
      <MapView
        showsUserLocation={locationPermission}
        ref={mapRef}
        onLayout={handleMapLayout}
        style={{ height: '100%', width: '100%' }}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
      >
        {contactMarkers.map((c, index) => (
          <Marker
            onPress={() =>
              carouselRef.current?.scrollTo({ index, animated: true })
            }
            identifier={c.id}
            key={c.id}
            coordinate={c.coordinate!}
            pinColor={c.pinColor}
            draggable
            onDragEnd={(e) =>
              handleDragContactPin(c.id, e.nativeEvent.coordinate)
            }
          />
        ))}
      </MapView>

      <View
        style={{
          position: 'absolute',
          bottom: 0,
          zIndex: 1000,
          paddingBottom: 15,
        }}
      >
        {contactMarkers.length === 0 ? (
          <View
            style={{
              height: 200,
              width: width,
              marginBottom: 100,
              padding: 10,
            }}
          >
            <Card>
              <Text
                style={{
                  fontSize: theme.fontSize('xl'),
                  fontFamily: theme.fonts.semiBold,
                }}
              >
                {i18n.t('noContactsToDisplay')}
              </Text>
              <Text>{i18n.t('map_noContactsWithGeocodes')}</Text>
              <ActionButton
                onPress={() =>
                  (navigation as unknown as RootStackNavigation).navigate(
                    'Contact Form',
                    {
                      id: Crypto.randomUUID(),
                    }
                  )
                }
              >
                {i18n.t('addContact')}
              </ActionButton>
            </Card>
          </View>
        ) : (
          <Carousel
            onSnapToItem={(index) => handleFitToMarker(index)}
            defaultIndex={0}
            ref={carouselRef}
            data={contactMarkers}
            renderItem={({ item }) => (
              <MapCarouselCard contact={item} setSheet={setSheet} />
            )}
            scrollAnimationDuration={100}
            mode='parallax'
            modeConfig={{
              parallaxScrollingScale: 0.9,
              parallaxScrollingOffset: 50,
            }}
            loop
            width={width}
            height={cardHeight}
          />
        )}
      </View>
      <ShareAddressSheet sheet={sheet} setSheet={setSheet} />
      {contactMarkers.length > 1 && (
        <View
          style={{
            position: 'absolute',
            top: insets.top + 8,
            left: 8,
            gap: 10,
          }}
        >
          <Button
            variant='solid'
            onPress={fitToMarkers}
            style={{
              paddingVertical: 10,
              paddingHorizontal: 25,
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontFamily: theme.fonts.bold, textAlign: 'center' }}>
              {i18n.t('fit')}
            </Text>
          </Button>
        </View>
      )}
    </>
  )
}
