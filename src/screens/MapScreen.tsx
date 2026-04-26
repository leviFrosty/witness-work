import Wrapper from '../components/layout/Wrapper'
import MapView, { LatLng, Marker } from 'react-native-maps'
import useContacts from '../stores/contactsStore'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigation } from '@react-navigation/native'
import useTheme from '../contexts/theme'
import useConversations from '../stores/conversationStore'
import { filterActivesContacts } from '../lib/dismissedContacts'
import { Dimensions, View } from 'react-native'
import Carousel, { ICarouselInstance } from 'react-native-reanimated-carousel'
import MapCarouselCard from '../components/MapCarouselCard'
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
import MapOnboarding from '../components/MapOnboarding'
import { TAB_BAR_HEIGHT } from '../components/TabBar'
import useDevice from '../hooks/useDevice'
import { RootStackNavigation } from '../types/rootStack'
import { HomeTabStackNavigation } from '../types/homeStack'
import { ContactMarker } from '../types/map'
import IconButton from '../components/IconButton'
import { faInfo, faTimes } from '@fortawesome/free-solid-svg-icons'
import { Sheet } from 'tamagui'
import MapKey from '../components/MapColorKey'
import { useMarkerColors } from '../hooks/useMarkerColors'
import { getContactStaleness, stalenessToColor } from '../lib/contactStaleness'
import {
  findContactIndexById,
  reconcileActiveContact,
} from '../lib/mapCarousel'

interface FullMapViewProps {
  contactMarkers: ContactMarker[]
}

const FullMapView = ({ contactMarkers }: FullMapViewProps) => {
  const navigation = useNavigation<HomeTabStackNavigation>()
  const { width } = Dimensions.get('window')
  const { colorScheme } = usePreferences()
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
  const [showInfo, setShowInfo] = useState(false)
  const theme = useTheme()
  const { contacts, updateContact } = useContacts()
  const CARD_HEIGHT = 200

  // Track the active contact by id rather than carousel index. Indices shift
  // whenever the source list reorders (dismiss/undismiss, sync inserts, etc.),
  // which is the primary cause of carousel↔pin desync — using a stable id
  // means lookups always resolve to the contact the user is actually looking
  // at, regardless of how the array has been re-keyed since render.
  const [activeContactId, setActiveContactId] = useState<string | undefined>(
    () => contactMarkers[0]?.id
  )
  const lastReconciledIndexRef = useRef<number>(0)

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

  const fitToContactId = useCallback((id: string) => {
    mapRef.current?.fitToSuppliedMarkers([id])
  }, [])

  const handleCarouselSnap = useCallback(
    (index: number) => {
      const contact = contactMarkers[index]
      if (!contact) return
      lastReconciledIndexRef.current = index
      setActiveContactId(contact.id)
      fitToContactId(contact.id)
    },
    [contactMarkers, fitToContactId]
  )

  const handlePinPress = useCallback(
    (id: string) => {
      // Resolve the index from the *current* contactMarkers rather than a
      // captured render-time index — otherwise an upstream reorder between
      // render and tap scrolls the carousel to the wrong card.
      const idx = findContactIndexById(contactMarkers, id)
      if (idx < 0) return
      lastReconciledIndexRef.current = idx
      setActiveContactId(id)
      carouselRef.current?.scrollTo({ index: idx, animated: true })
    },
    [contactMarkers]
  )

  // Reconcile carousel + active id when the underlying list changes.
  // - If the active contact still exists, ensure the carousel is on its
  //   current index — covers the case where contacts were inserted/removed
  //   before it and shifted its position.
  // - If it disappeared (dismissed, deleted), pick a deterministic neighbour
  //   based on its previous index rather than snapping back to 0.
  useEffect(() => {
    const { activeId, index } = reconcileActiveContact({
      previousActiveId: activeContactId,
      previousIndex: lastReconciledIndexRef.current,
      nextContactMarkers: contactMarkers,
    })

    if (activeId !== activeContactId) {
      setActiveContactId(activeId)
    }

    if (index < 0) {
      lastReconciledIndexRef.current = 0
      return
    }

    lastReconciledIndexRef.current = index

    const currentCarouselIndex = carouselRef.current?.getCurrentIndex()
    if (currentCarouselIndex !== undefined && currentCarouselIndex !== index) {
      carouselRef.current?.scrollTo({ index, animated: false })
    }
  }, [activeContactId, contactMarkers])

  useEffect(() => {
    const unsubscribe = navigation.addListener('tabPress', (e) => {
      if (e.target?.includes('Map')) {
        fitToMarkers()
      }
    })
    return unsubscribe
  }, [fitToMarkers, navigation])

  const hasFitOnMount = useRef(false)

  useEffect(() => {
    if (!hasFitOnMount.current) {
      fitToMarkers()
      hasFitOnMount.current = true
    }
  }, [fitToMarkers])

  useEffect(() => {
    const getLocation = async () => {
      const { granted } = await Location.getForegroundPermissionsAsync()
      if (granted) {
        setLocationPermission(true)
      }
    }

    getLocation()
  }, [])

  const parallaxScrollingScale =
    contactMarkers.length === 1 ? 0.9 : isTablet ? 0.92 : 0.8025

  return (
    <>
      <MapView
        userInterfaceStyle={colorScheme ? colorScheme : undefined}
        showsUserLocation={locationPermission}
        ref={mapRef}
        onLayout={handleMapLayout}
        style={{ height: '100%', width: '100%' }}
      >
        {contactMarkers.map((c) => (
          <Marker
            onPress={() => handlePinPress(c.id)}
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
          onSnapToItem={handleCarouselSnap}
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
          loop={contactMarkers.length !== 1}
          width={width}
          height={CARD_HEIGHT}
          style={{
            position: 'absolute',
            bottom: insets.bottom + TAB_BAR_HEIGHT - 5,
          }}
        />
      )}
      <ShareAddressSheet sheet={sheet} setSheet={setSheet} />
      <Sheet
        open={showInfo}
        onOpenChange={(o: boolean) => setShowInfo(o)}
        dismissOnSnapToBottom
        modal
        snapPoints={[65]}
      >
        <Sheet.Handle />
        <Sheet.Overlay zIndex={100_000 - 1} />
        <Sheet.Frame>
          <View style={{ padding: 30, gap: 10 }}>
            <IconButton
              icon={faTimes}
              color={theme.colors.text}
              onPress={() => setShowInfo(false)}
              size='xl'
              style={{ marginLeft: 'auto', marginBottom: 10 }}
            />
            <MapKey />
          </View>
        </Sheet.Frame>
      </Sheet>
      <View
        style={{
          position: 'absolute',
          top: insets.top + 5,
          left: 8,
          gap: 5,
        }}
      >
        {contactMarkers.length > 1 && (
          <Button
            variant='solid'
            onPress={fitToMarkers}
            style={{
              paddingVertical: 10,
              paddingHorizontal: 25,
              justifyContent: 'center',
              borderRadius: theme.numbers.borderRadiusSm,
            }}
          >
            <Text style={{ fontFamily: theme.fonts.bold, textAlign: 'center' }}>
              {i18n.t('fit')}
            </Text>
          </Button>
        )}
        <Button
          variant='solid'
          onPress={() => setShowInfo(!showInfo)}
          style={{
            paddingVertical: 10,
            paddingHorizontal: 25,
            justifyContent: 'center',
            borderRadius: theme.numbers.borderRadiusSm,
          }}
        >
          <IconButton icon={faInfo} iconStyle={{ color: theme.colors.text }} />
        </Button>
      </View>
    </>
  )
}

const MapScreen = () => {
  const { contacts } = useContacts()
  const { conversations } = useConversations()
  const { hasCompletedMapOnboarding } = usePreferences()
  const colors = useMarkerColors()

  const contactMarkers: ContactMarker[] = useMemo(() => {
    // First filter out dismissed contacts, then check for coordinates
    const activeContacts = filterActivesContacts(contacts)
    const contactsWithCoords = activeContacts.filter(
      (c) => c.coordinate?.latitude && c.coordinate.longitude
    )
    return contactsWithCoords.map((c) => ({
      ...c,
      pinColor: stalenessToColor(getContactStaleness(c, conversations), colors),
    }))
  }, [colors, contacts, conversations])

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
