import useGlassColorScheme from '@/hooks/useGlassColorScheme'
import Wrapper from '@/components/ui/layout/Wrapper'
import MapView, { LatLng, Marker } from 'react-native-maps'
import useContacts from '@/stores/contactsStore'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigation } from '@react-navigation/native'
import useTheme from '@/contexts/theme'
import useConversations from '@/stores/conversationStore'
import { filterActivesContacts } from '@/lib/dismissedContacts'
import {
  Dimensions,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native'
import { BlurView } from 'expo-blur'
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated'
import Carousel, { ICarouselInstance } from 'react-native-reanimated-carousel'
import MapCarouselCard from '@/features/map/components/MapCarouselCard'
import * as Location from 'expo-location'
import * as Crypto from 'expo-crypto'
import ShareAddressSheet, {
  MapShareSheet,
} from '@/features/map/components/ShareAddressSheet'
import { usePreferences } from '@/stores/preferences'
import Text from '@/components/ui/MyText'
import Button from '@/components/ui/Button'
import i18n from '@/lib/locales'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import MapOnboarding from '@/features/map/components/MapOnboarding'
import { TAB_BAR_HEIGHT } from '@/components/ui/TabBar'
import useDevice from '@/hooks/useDevice'
import { RootStackNavigation } from '@/types/rootStack'
import { HomeTabStackNavigation } from '@/types/homeStack'
import { ContactMarker } from '@/features/map/types/map'
import {
  faAddressBook,
  faCircleInfo,
  faLocationArrow,
  faMapLocationDot,
  faMagnifyingGlass,
  faPlus,
  faUpRightAndDownLeftFromCenter,
} from '@fortawesome/free-solid-svg-icons'
import { Popover } from 'tamagui'
import MapKey from '@/features/map/components/MapColorKey'
import { useMarkerColors } from '@/hooks/useMarkerColors'
import { getContactStaleness, stalenessToColor } from '@/lib/contactStaleness'
import {
  findContactIndexById,
  reconcileActiveContact,
  resolveCarouselSnapContact,
} from '@/features/map/lib/mapCarousel'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import { addressToString, coordinateAsString } from '@/lib/address'

const liquidGlass = isLiquidGlassAvailable()

// Reserved vertical space above the tab bar for Apple Maps' legal/logo
// attribution, which `mapPadding` lifts up out from behind the carousel.
const LEGAL_LABEL_HEIGHT = 20

interface FullMapViewProps {
  contactMarkers: ContactMarker[]
  activeContactCount: number
}

const FullMapView = ({
  contactMarkers,
  activeContactCount,
}: FullMapViewProps) => {
  const navigation = useNavigation<HomeTabStackNavigation>()
  const { width, height } = Dimensions.get('window')
  const { colorScheme } = usePreferences()
  const mapRef = useRef<MapView>(null)
  const insets = useSafeAreaInsets()
  const carouselRef = useRef<ICarouselInstance>(null)
  const { isTablet } = useDevice()
  const [locationPermission, setLocationPermission] = useState(false)
  const [isTrackingUser, setIsTrackingUser] = useState(false)
  const locationSubscriptionRef = useRef<Location.LocationSubscription | null>(
    null
  )
  const [emptyStateHeight, setEmptyStateHeight] = useState(0)
  const [noResultsHeight, setNoResultsHeight] = useState(0)
  const [sheet, setSheet] = useState<MapShareSheet>({
    open: false,
    appleMapsUri: '',
    googleMapsUri: '',
  })
  const [showInfo, setShowInfo] = useState(false)
  const [search, setSearch] = useState('')
  const [searchExpanded, setSearchExpanded] = useState(false)
  const searchInputRef = useRef<TextInput>(null)
  const searchExpand = useSharedValue(0)
  const theme = useTheme()
  const glassColorScheme = useGlassColorScheme()
  const { contacts, updateContact } = useContacts()
  const CARD_HEIGHT = 200
  const isDark = theme.colors.background === '#121212'

  const normalizedSearch = search.trim().toLocaleLowerCase()
  const visibleContactMarkers = useMemo(
    () =>
      normalizedSearch
        ? contactMarkers.filter((contact) => {
            const address = contact.address
              ? addressToString(contact.address)
              : coordinateAsString(contact)

            return [contact.name, contact.phone, contact.email, address]
              .filter(Boolean)
              .some((value) =>
                value?.toLocaleLowerCase().includes(normalizedSearch)
              )
          })
        : contactMarkers,
    [contactMarkers, normalizedSearch]
  )

  // Track the active contact by id rather than carousel index. Indices shift
  // whenever the source list reorders (dismiss/undismiss, sync inserts, etc.),
  // which is the primary cause of carousel↔pin desync — using a stable id
  // means lookups always resolve to the contact the user is actually looking
  // at, regardless of how the array has been re-keyed since render.
  const [activeContactId, setActiveContactId] = useState<string | undefined>(
    () => contactMarkers[0]?.id
  )
  const lastReconciledIndexRef = useRef<number>(0)
  const pendingMarkerSnapIdRef = useRef<string | undefined>(undefined)

  const handleDragContactPin = (id: string, coordinate: LatLng) => {
    updateContact({
      ...contacts.find((c) => c.id === id),
      coordinate,
      userDraggedCoordinate: true,
    })
  }

  const fitToMarkers = useCallback(() => {
    if (visibleContactMarkers.length === 0) {
      return
    }
    mapRef.current?.fitToSuppliedMarkers(visibleContactMarkers.map((c) => c.id))
  }, [visibleContactMarkers])

  const handleMapLayout = () => {
    fitToMarkers()
  }

  const fitToContactId = useCallback((id: string) => {
    mapRef.current?.fitToSuppliedMarkers([id])
  }, [])

  const handleCarouselSnap = useCallback(
    (index: number) => {
      const resolved = resolveCarouselSnapContact({
        contactMarkers: visibleContactMarkers,
        snappedIndex: index,
        pendingMarkerId: pendingMarkerSnapIdRef.current,
      })
      pendingMarkerSnapIdRef.current = undefined

      if (!resolved) return
      lastReconciledIndexRef.current = resolved.index
      setActiveContactId(resolved.activeId)
      fitToContactId(resolved.activeId)
    },
    [visibleContactMarkers, fitToContactId]
  )

  const handlePinPress = useCallback(
    (id: string) => {
      // Resolve the index from the *current* contactMarkers rather than a
      // captured render-time index — otherwise an upstream reorder between
      // render and tap scrolls the carousel to the wrong card.
      const idx = findContactIndexById(visibleContactMarkers, id)
      if (idx < 0) return
      lastReconciledIndexRef.current = idx

      // Re-tap on the already-active pin: the carousel is already on this
      // index so onSnapToItem won't fire — refocus the map directly so the
      // user gets the same zoom-in behaviour as the first tap.
      if (id === activeContactId) {
        pendingMarkerSnapIdRef.current = undefined
        fitToContactId(id)
        return
      }

      pendingMarkerSnapIdRef.current = id
      setActiveContactId(id)
      fitToContactId(id)
      carouselRef.current?.scrollTo({
        index: idx,
        animated: true,
        onFinished: () => {
          if (pendingMarkerSnapIdRef.current !== id) return
          pendingMarkerSnapIdRef.current = undefined
          fitToContactId(id)
        },
      })
    },
    [visibleContactMarkers, activeContactId, fitToContactId]
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
      nextContactMarkers: visibleContactMarkers,
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
  }, [activeContactId, visibleContactMarkers])

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

  const stopTrackingUser = useCallback(() => {
    if (locationSubscriptionRef.current) {
      locationSubscriptionRef.current.remove()
      locationSubscriptionRef.current = null
    }
    setIsTrackingUser(false)
  }, [])

  const startTrackingUser = useCallback(async () => {
    let granted = locationPermission
    if (!granted) {
      const existing = await Location.getForegroundPermissionsAsync()
      granted = existing.granted
      if (!granted) {
        const requested = await Location.requestForegroundPermissionsAsync()
        granted = requested.granted
      }
      if (granted) setLocationPermission(true)
    }
    if (!granted) return

    // 0.005 deltas ≈ Google Maps zoom level ~16–17 (street level),
    // which is what Google/Apple Maps land on when you tap "my location".
    // Formula: latitudeDelta ≈ 360 / 2^zoom → 360 / 2^16 ≈ 0.0055.
    const ZOOM_DELTA = 0.005
    const PAN_DURATION_MS = 500

    // Track when the initial zoom-in animation was fired. Subsequent
    // watcher updates must NOT call `animateCamera` while it is still
    // running — on Apple Maps that interrupts the in-flight region
    // animation and freezes the camera at whatever mid-interpolation
    // zoom it had reached, which is the bug that made the "snap" look
    // like it didn't zoom at all.
    let initialZoomFiredAt = 0

    // Instant initial jump using whatever fix iOS already has cached, so
    // the button feels responsive even when the GPS is cold. The watcher
    // below refines this to a live position within a couple of seconds.
    const lastKnown = await Location.getLastKnownPositionAsync({
      maxAge: 60_000,
    })
    if (lastKnown) {
      mapRef.current?.animateToRegion(
        {
          latitude: lastKnown.coords.latitude,
          longitude: lastKnown.coords.longitude,
          latitudeDelta: ZOOM_DELTA,
          longitudeDelta: ZOOM_DELTA,
        },
        PAN_DURATION_MS
      )
      initialZoomFiredAt = Date.now()
    }

    if (!locationSubscriptionRef.current) {
      locationSubscriptionRef.current = await Location.watchPositionAsync(
        {
          // BestForNavigation = highest accuracy with sensor fusion, the
          // documented choice for continuous "follow-me" tracking.
          accuracy: Location.Accuracy.BestForNavigation,
          // 5 m → fires while walking, doesn't spam while stationary.
          // `timeInterval` is Android-only on expo-location, so omitted.
          distanceInterval: 5,
        },
        (loc) => {
          const center = {
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          }
          const now = Date.now()

          if (initialZoomFiredAt === 0) {
            // No cached fix was available — do the initial zoom-in on
            // the first fresh sample so the user still sees the snap.
            initialZoomFiredAt = now
            mapRef.current?.animateToRegion(
              {
                ...center,
                latitudeDelta: ZOOM_DELTA,
                longitudeDelta: ZOOM_DELTA,
              },
              PAN_DURATION_MS
            )
            return
          }

          // Initial zoom still in flight — drop this update so we
          // don't interrupt the in-progress region animation. A small
          // buffer past PAN_DURATION_MS guards against frame jitter.
          if (now - initialZoomFiredAt < PAN_DURATION_MS + 50) return

          mapRef.current?.animateCamera(
            { center },
            { duration: PAN_DURATION_MS }
          )
        }
      )
    }

    setIsTrackingUser(true)
  }, [locationPermission])

  const toggleLocationTracking = () => {
    if (isTrackingUser) {
      stopTrackingUser()
    } else {
      startTrackingUser()
    }
  }

  useEffect(() => {
    return () => {
      if (locationSubscriptionRef.current) {
        locationSubscriptionRef.current.remove()
        locationSubscriptionRef.current = null
      }
    }
  }, [])

  const parallaxScrollingScale =
    visibleContactMarkers.length === 1 ? 0.9 : isTablet ? 0.92 : 0.8025

  // Sit the location FAB just above whichever bottom UI is on screen:
  // the empty-state card, the no-search-results card, or the carousel.
  // Heights for the variable cards come from onLayout; the carousel is
  // fixed at CARD_HEIGHT.
  const locationButtonBottom =
    contactMarkers.length === 0
      ? insets.bottom + TAB_BAR_HEIGHT + 12 + emptyStateHeight + 8
      : visibleContactMarkers.length === 0
        ? insets.bottom + TAB_BAR_HEIGHT + 4 + noResultsHeight + 8
        : insets.bottom +
          TAB_BAR_HEIGHT +
          LEGAL_LABEL_HEIGHT -
          5 +
          CARD_HEIGHT +
          8

  const mapControlStyle = {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderCurve: 'continuous' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingHorizontal: 0,
    paddingVertical: 0,
    backgroundColor: liquidGlass ? undefined : theme.colors.card + 'dd',
  }

  const SEARCH_COLLAPSED_WIDTH = 44
  const SEARCH_EXPANDED_WIDTH = width - 16 - 64
  const SEARCH_SPRING_OPEN = { damping: 18, stiffness: 180, mass: 0.9 }
  const SEARCH_SPRING_CLOSE = { damping: 22, stiffness: 200, mass: 0.9 }

  const expandSearch = () => {
    if (searchExpanded) {
      searchInputRef.current?.focus()
      return
    }
    setSearchExpanded(true)
    searchExpand.value = withSpring(1, SEARCH_SPRING_OPEN)
    requestAnimationFrame(() => searchInputRef.current?.focus())
  }

  const handleSearchBlur = () => {
    if (search.trim().length === 0) {
      searchExpand.value = withSpring(0, SEARCH_SPRING_CLOSE)
      setSearchExpanded(false)
    }
  }

  const collapseSearch = () => {
    if (!searchExpanded) return
    searchInputRef.current?.blur()
    searchExpand.value = withSpring(0, SEARCH_SPRING_CLOSE)
    setSearchExpanded(false)
  }

  const dismissSearchKeyboard = () => {
    if (searchInputRef.current?.isFocused()) {
      searchInputRef.current.blur()
    }
  }

  const handlePanDrag = () => {
    dismissSearchKeyboard()
    if (isTrackingUser) {
      stopTrackingUser()
    }
  }

  const animatedSearchContainerStyle = useAnimatedStyle(() => ({
    width:
      SEARCH_COLLAPSED_WIDTH +
      (SEARCH_EXPANDED_WIDTH - SEARCH_COLLAPSED_WIDTH) * searchExpand.value,
  }))

  const animatedSearchInputStyle = useAnimatedStyle(() => ({
    opacity: searchExpand.value,
  }))

  const addContact = () =>
    (navigation as unknown as RootStackNavigation).navigate('Contact Form', {
      id: Crypto.randomUUID(),
    })

  const hasSavedActiveContacts = activeContactCount > 0
  const emptyStateTitle = hasSavedActiveContacts
    ? i18n.t('map_emptyMissingLocationsTitle')
    : i18n.t('map_emptyNoContactsTitle')
  const emptyStateBody = hasSavedActiveContacts
    ? i18n.t('map_emptyMissingLocationsBody')
    : i18n.t('map_emptyNoContactsBody')
  const emptyStatePrimaryLabel = hasSavedActiveContacts
    ? i18n.t('map_reviewContacts')
    : i18n.t('addContact')
  const emptyStatePrimaryIcon = hasSavedActiveContacts ? faAddressBook : faPlus
  const emptyStatePrimaryAction = hasSavedActiveContacts
    ? () => navigation.navigate('Contacts')
    : addContact

  const renderEmptyState = () => (
    <View
      pointerEvents='box-none'
      onLayout={(e) => setEmptyStateHeight(e.nativeEvent.layout.height)}
      style={{
        position: 'absolute',
        left: 16,
        right: 16,
        bottom: insets.bottom + TAB_BAR_HEIGHT + 12,
        alignItems: 'center',
      }}
    >
      <View
        style={{
          width: '100%',
          maxWidth: isTablet ? 520 : undefined,
          maxHeight: height - insets.top - insets.bottom - TAB_BAR_HEIGHT - 96,
          borderRadius: 24,
          borderCurve: 'continuous',
          overflow: 'hidden',
          backgroundColor: liquidGlass ? undefined : theme.colors.card + 'dd',
          shadowColor: theme.colors.shadow,
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: theme.numbers.shadowOpacity * 1.5,
          shadowRadius: 18,
        }}
      >
        {liquidGlass ? (
          <GlassView
            pointerEvents='none'
            glassEffectStyle='regular'
            colorScheme={glassColorScheme}
            style={[StyleSheet.absoluteFill, { borderRadius: 24 }]}
          />
        ) : (
          <BlurView
            pointerEvents='none'
            tint={isDark ? 'dark' : 'light'}
            intensity={70}
            style={StyleSheet.absoluteFill}
          />
        )}
        <View style={{ padding: 20, gap: 16 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 14,
            }}
          >
            <View
              style={{
                width: 48,
                height: 48,
                borderRadius: 24,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: theme.colors.accentTranslucent,
                borderWidth: 1,
                borderColor: theme.colors.accent,
              }}
            >
              <FontAwesomeIcon
                icon={faMapLocationDot}
                size={theme.fontSize('lg')}
                style={{ color: theme.colors.accent }}
              />
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text
                style={{
                  fontSize: theme.fontSize('xl'),
                  fontFamily: theme.fonts.bold,
                  color: theme.colors.text,
                }}
              >
                {emptyStateTitle}
              </Text>
              {hasSavedActiveContacts && (
                <Text
                  style={{
                    color: theme.colors.textAlt,
                    fontSize: theme.fontSize('sm'),
                    fontFamily: theme.fonts.semiBold,
                  }}
                >
                  {i18n.t('map_emptyMappedCount', {
                    count: activeContactCount,
                  })}
                </Text>
              )}
            </View>
          </View>

          <Text
            style={{
              color: theme.colors.textAlt,
              fontSize: theme.fontSize('md'),
              lineHeight: theme.fontSize('md') * 1.35,
            }}
          >
            {emptyStateBody}
          </Text>

          <View
            style={{
              flexDirection: hasSavedActiveContacts ? 'row' : 'column',
              gap: 10,
            }}
          >
            <Button
              onPress={emptyStatePrimaryAction}
              style={{
                flex: hasSavedActiveContacts ? 1 : undefined,
                minHeight: 48,
                borderRadius: theme.numbers.borderRadiusMd,
                backgroundColor: theme.colors.accent,
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                gap: 10,
                paddingHorizontal: 16,
              }}
            >
              <FontAwesomeIcon
                icon={emptyStatePrimaryIcon}
                size={theme.fontSize('sm')}
                style={{ color: theme.colors.textInverse }}
              />
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                style={{
                  color: theme.colors.textInverse,
                  fontFamily: theme.fonts.bold,
                  fontSize: theme.fontSize('md'),
                }}
              >
                {emptyStatePrimaryLabel}
              </Text>
            </Button>
            {hasSavedActiveContacts && (
              <Button
                onPress={addContact}
                variant='outline'
                style={{
                  minHeight: 48,
                  borderRadius: theme.numbers.borderRadiusMd,
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'row',
                  gap: 10,
                  paddingHorizontal: 16,
                }}
              >
                <FontAwesomeIcon
                  icon={faPlus}
                  size={theme.fontSize('sm')}
                  style={{ color: theme.colors.text }}
                />
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  style={{
                    color: theme.colors.text,
                    fontFamily: theme.fonts.semiBold,
                    fontSize: theme.fontSize('md'),
                  }}
                >
                  {i18n.t('addContact')}
                </Text>
              </Button>
            )}
          </View>
        </View>
      </View>
    </View>
  )

  return (
    <>
      <MapView
        userInterfaceStyle={colorScheme ? colorScheme : undefined}
        showsUserLocation={locationPermission}
        ref={mapRef}
        onLayout={handleMapLayout}
        onPress={collapseSearch}
        onPanDrag={handlePanDrag}
        mapPadding={{
          top: 0,
          right: 0,
          left: 0,
          bottom: insets.bottom + TAB_BAR_HEIGHT / 4,
        }}
        style={{ height: '100%', width: '100%' }}
      >
        {visibleContactMarkers.map((c) => (
          <Marker
            onPress={() => handlePinPress(c.id)}
            identifier={c.id}
            // Include pinColor in the key so the marker remounts when its
            // staleness color changes. react-native-maps only applies
            // `pinColor` at mount on iOS — without the remount, logging a
            // conversation never updates the pin tint until reload.
            key={`${c.id}-${c.pinColor}`}
            coordinate={c.coordinate!}
            pinColor={c.pinColor}
            draggable
            onDragEnd={(e) =>
              handleDragContactPin(c.id, e.nativeEvent.coordinate)
            }
          />
        ))}
      </MapView>

      {contactMarkers.length > 0 && (
        <Animated.View
          style={[
            {
              position: 'absolute',
              top: insets.top + 8,
              left: 16,
              height: 44,
              borderRadius: 22,
              borderCurve: 'continuous',
              backgroundColor: liquidGlass
                ? undefined
                : theme.colors.card + 'dd',
              overflow: 'hidden',
              flexDirection: 'row',
              alignItems: 'center',
            },
            animatedSearchContainerStyle,
          ]}
        >
          {liquidGlass ? (
            <GlassView
              pointerEvents='none'
              glassEffectStyle='regular'
              colorScheme={glassColorScheme}
              style={[StyleSheet.absoluteFill, { borderRadius: 22 }]}
            />
          ) : (
            <BlurView
              pointerEvents='none'
              tint={isDark ? 'dark' : 'light'}
              intensity={60}
              style={StyleSheet.absoluteFill}
            />
          )}
          <Pressable
            onPress={expandSearch}
            accessibilityLabel={i18n.t('map_searchContacts')}
            accessibilityRole='button'
            style={{
              width: 44,
              height: 44,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <FontAwesomeIcon
              icon={faMagnifyingGlass}
              size={theme.fontSize('sm')}
              style={{ color: theme.colors.text }}
            />
          </Pressable>
          <Animated.View
            style={[{ flex: 1, paddingRight: 14 }, animatedSearchInputStyle]}
            pointerEvents={searchExpanded ? 'auto' : 'none'}
          >
            <TextInput
              ref={searchInputRef}
              value={search}
              onChangeText={setSearch}
              onBlur={handleSearchBlur}
              editable={searchExpanded}
              placeholder={i18n.t('map_searchContacts')}
              placeholderTextColor={theme.colors.textAlt}
              clearButtonMode='while-editing'
              returnKeyType='search'
              style={{
                color: theme.colors.text,
                fontFamily: theme.fonts.regular,
                fontSize: theme.fontSize('md'),
                padding: 0,
              }}
            />
          </Animated.View>
        </Animated.View>
      )}

      {contactMarkers.length === 0 ? (
        renderEmptyState()
      ) : visibleContactMarkers.length === 0 ? (
        <View
          onLayout={(e) => setNoResultsHeight(e.nativeEvent.layout.height)}
          style={{
            position: 'absolute',
            bottom: insets.bottom + TAB_BAR_HEIGHT + 4,
            width,
            padding: 10,
          }}
        >
          <View
            style={{
              borderRadius: theme.numbers.borderRadiusLg,
              borderCurve: 'continuous',
              overflow: 'hidden',
              backgroundColor: liquidGlass
                ? undefined
                : theme.colors.card + 'dd',
            }}
          >
            {liquidGlass ? (
              <GlassView
                pointerEvents='none'
                glassEffectStyle='regular'
                colorScheme={glassColorScheme}
                style={[
                  StyleSheet.absoluteFill,
                  { borderRadius: theme.numbers.borderRadiusLg },
                ]}
              />
            ) : (
              <BlurView
                pointerEvents='none'
                tint={isDark ? 'dark' : 'light'}
                intensity={60}
                style={StyleSheet.absoluteFill}
              />
            )}
            <View style={{ padding: 20, gap: 8 }}>
              <Text
                style={{
                  fontSize: theme.fontSize('xl'),
                  fontFamily: theme.fonts.semiBold,
                }}
              >
                {i18n.t('map_noSearchResults')}
              </Text>
              <Text>{i18n.t('map_noSearchResults_description')}</Text>
            </View>
          </View>
        </View>
      ) : (
        <Carousel
          // Remount when crossing the 1↔many boundary. `loop` cannot be
          // toggled mid-life on react-native-reanimated-carousel — when a
          // search narrows results to a single match the carousel keeps its
          // looping internals and renders blank otherwise.
          key={visibleContactMarkers.length === 1 ? 'single' : 'multi'}
          onSnapToItem={handleCarouselSnap}
          onScrollStart={dismissSearchKeyboard}
          defaultIndex={0}
          ref={carouselRef}
          data={visibleContactMarkers}
          renderItem={({ item }) => (
            <MapCarouselCard contact={item} setSheet={setSheet} />
          )}
          scrollAnimationDuration={125}
          mode='parallax'
          modeConfig={{
            parallaxScrollingScale,
          }}
          loop={visibleContactMarkers.length !== 1}
          width={width}
          height={CARD_HEIGHT}
          style={{
            position: 'absolute',
            bottom: insets.bottom + TAB_BAR_HEIGHT + LEGAL_LABEL_HEIGHT - 5,
          }}
        />
      )}
      <ShareAddressSheet sheet={sheet} setSheet={setSheet} />
      <View
        style={{
          position: 'absolute',
          top: insets.top + (contactMarkers.length > 0 ? 64 : 8),
          left: 16,
          gap: 8,
        }}
      >
        {visibleContactMarkers.length >= 1 && (
          <Button
            accessibilityLabel={i18n.t('map_fitContacts')}
            variant='glass'
            onPress={fitToMarkers}
            style={mapControlStyle}
          >
            <FontAwesomeIcon
              icon={faUpRightAndDownLeftFromCenter}
              size={theme.fontSize('sm')}
              style={{ color: theme.colors.text }}
            />
          </Button>
        )}
        <Popover
          open={showInfo}
          onOpenChange={setShowInfo}
          placement='right-start'
          allowFlip
          offset={8}
        >
          <Popover.Trigger asChild>
            <Button
              accessibilityLabel={i18n.t('map_showLegend')}
              variant='glass'
              onPress={() => setShowInfo((v) => !v)}
              style={mapControlStyle}
            >
              <FontAwesomeIcon
                icon={faCircleInfo}
                size={theme.fontSize('sm')}
                style={{ color: theme.colors.text }}
              />
            </Button>
          </Popover.Trigger>
          <Popover.Content
            borderWidth={1}
            borderColor={theme.colors.border}
            backgroundColor={theme.colors.card}
            padding={12}
            elevate
            animation={['quick', { opacity: { overshootClamping: true } }]}
            enterStyle={{ x: -8, opacity: 0 }}
            exitStyle={{ x: -8, opacity: 0 }}
            maxWidth={300}
          >
            <Popover.Arrow
              borderWidth={1}
              borderColor={theme.colors.border}
              backgroundColor={theme.colors.card}
            />
            <MapKey />
          </Popover.Content>
        </Popover>
      </View>
      <View
        style={{
          position: 'absolute',
          right: 16,
          bottom: locationButtonBottom,
        }}
      >
        <Button
          accessibilityLabel={
            isTrackingUser
              ? i18n.t('map_stopFollowingLocation')
              : i18n.t('map_centerOnMyLocation')
          }
          variant='glass'
          onPress={toggleLocationTracking}
          style={mapControlStyle}
        >
          <FontAwesomeIcon
            icon={faLocationArrow}
            size={theme.fontSize('sm')}
            style={{
              color: isTrackingUser ? theme.colors.accent : theme.colors.text,
            }}
          />
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

  const activeContacts = useMemo(() => {
    // First filter out dismissed contacts, then check for coordinates
    return filterActivesContacts(contacts)
  }, [contacts])

  const contactMarkers: ContactMarker[] = useMemo(() => {
    const contactsWithCoords = activeContacts.filter(
      (c) => c.coordinate?.latitude && c.coordinate.longitude
    )
    return contactsWithCoords.map((c) => ({
      ...c,
      pinColor: stalenessToColor(getContactStaleness(c, conversations), colors),
    }))
  }, [activeContacts, colors, conversations])

  if (!hasCompletedMapOnboarding) {
    return (
      <Wrapper insets='none' style={{ flexGrow: 1 }}>
        <MapOnboarding />
      </Wrapper>
    )
  }

  return (
    <Wrapper insets='none' style={{ flexGrow: 1, position: 'relative' }}>
      <FullMapView
        contactMarkers={contactMarkers}
        activeContactCount={activeContacts.length}
      />
    </Wrapper>
  )
}

export default MapScreen
