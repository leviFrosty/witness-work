import Wrapper from '../components/layout/Wrapper'
import MapView, { LatLng, Marker, PROVIDER_GOOGLE } from 'react-native-maps'
import useContacts from '../stores/contactsStore'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigation } from '@react-navigation/native'
import { HomeTabStackNavigation } from '../stacks/HomeTabStack'
import useTheme from '../contexts/theme'
import useConversations from '../stores/conversationStore'
import moment from 'moment'
import { Dimensions, Platform, View } from 'react-native'
import Carousel, { ICarouselInstance } from 'react-native-reanimated-carousel'
import MapCarouselCard from '../components/MapCarouselCard'
import { Contact } from '../types/contact'
import * as Location from 'expo-location'
import * as Crypto from 'expo-crypto'
import ShareAddressSheet, {
  MapShareSheet,
} from '../components/ShareAddressSheet'
import { usePreferences } from '../stores/preferences'
import Text from '../components/MyText'
import Button from '../components/Button'
import i18n from '../lib/locales'
import ActionButton from '../components/ActionButton'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Card from '../components/Card'
import { RootStackNavigation } from '../stacks/RootStack'
import MapOnboarding from '../components/MapOnboarding'
import { TAB_BAR_HEIGHT } from '../components/TabBar'
import useDevice from '../hooks/useDevice'

export interface ContactMarker extends Contact {
  pinColor: string
}

interface FullMapViewProps {
  contactMarkers: ContactMarker[]
}

const FullMapView = ({ contactMarkers }: FullMapViewProps) => {
  const navigation = useNavigation<HomeTabStackNavigation>()
  const { width } = Dimensions.get('window')
  const mapRef = useRef<MapView>(null)
  const insets = useSafeAreaInsets()
  const carouselRef = useRef<ICarouselInstance>(null)
  const { isTablet } = useDevice()
  const [locationPermission, setLocationPermission] = useState(false)
  const [sheet, setSheet] = useState<MapShareSheet>({
    open: false,
    appleMapsUri: '',
    googleMapsUri: '',
  })
  const theme = useTheme()
  const { contacts, updateContact } = useContacts()
  const CARD_HEIGHT = 200

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

  const contactsWithCoords = useMemo(() => {
    return contacts.filter(
      (c) => c.coordinate?.latitude && c.coordinate.longitude
    )
  }, [contacts])

  const parallaxScrollingScale =
    contactsWithCoords.length === 1 ? 0.9 : isTablet ? 0.92 : 0.8025

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

      {contactMarkers.length === 0 ? (
        <View
          style={{
            position: 'absolute',
            bottom: insets.bottom + TAB_BAR_HEIGHT + 4,
            height: 200,
            width: width,
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
          scrollAnimationDuration={125}
          mode='parallax'
          modeConfig={{
            parallaxScrollingScale,
          }}
          loop={contactsWithCoords.length !== 1}
          width={width}
          height={CARD_HEIGHT}
          style={{
            position: 'absolute',
            bottom: insets.bottom + TAB_BAR_HEIGHT - 5,
          }}
        />
      )}
      <ShareAddressSheet sheet={sheet} setSheet={setSheet} />
      {contactMarkers.length > 1 && (
        <Button
          variant='solid'
          onPress={fitToMarkers}
          style={{
            paddingVertical: 10,
            paddingHorizontal: 25,
            justifyContent: 'center',
            borderRadius: theme.numbers.borderRadiusSm,
            position: 'absolute',
            top: insets.top + 5,
            left: 8,
          }}
        >
          <Text style={{ fontFamily: theme.fonts.bold, textAlign: 'center' }}>
            {i18n.t('fit')}
          </Text>
        </Button>
      )}
    </>
  )
}

const MapScreen = () => {
  const { contacts } = useContacts()
  const { conversations } = useConversations()
  const theme = useTheme()
  const { hasCompletedMapOnboarding } = usePreferences()

  const contactMarkers: ContactMarker[] = useMemo(() => {
    const contactsWithCoords = contacts.filter(
      (c) => c.coordinate?.latitude && c.coordinate.longitude
    )
    return contactsWithCoords.map((c) => {
      const today = moment()
      const contactConvos = conversations.filter(
        (convo) => convo.contact.id === c.id
      )

      if (contactConvos.length === 0) {
        return {
          ...c,
          pinColor: theme.colors.textAlt,
        }
      }

      const conversationsSorted = [...contactConvos].sort(
        (a, b) => moment(b.date).unix() - moment(a.date).unix()
      )
      const mostRecentDate = moment(conversationsSorted[0].date)

      let pinColor: string = theme.colors.accent

      if (mostRecentDate.isBefore(today.subtract(1, 'week'))) {
        pinColor = theme.colors.warn
      }

      if (mostRecentDate.isBefore(today.subtract(1, 'month'))) {
        pinColor = theme.colors.error
      }

      return {
        ...c,
        pinColor: pinColor,
      }
    })
  }, [
    contacts,
    conversations,
    theme.colors.accent,
    theme.colors.error,
    theme.colors.textAlt,
    theme.colors.warn,
  ])

  if (!hasCompletedMapOnboarding) {
    return (
      <Wrapper insets='none' style={{ flexGrow: 1 }}>
        <MapOnboarding />
      </Wrapper>
    )
  }

  return (
    <Wrapper insets='none' style={{ flexGrow: 1, position: 'relative' }}>
      <FullMapView contactMarkers={contactMarkers} />
    </Wrapper>
  )
}

export default MapScreen
