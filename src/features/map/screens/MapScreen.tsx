import {
  ChevronUp as ChevronUpIcon,
  Navigation as NavigationIcon,
  Search as SearchIcon,
} from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import useGlassColorScheme from '@/hooks/useGlassColorScheme'
import Wrapper from '@/components/ui/layout/Wrapper'
import MapView, { LatLng, Marker } from 'react-native-maps'
import { Gesture } from 'react-native-gesture-handler'
import useContacts from '@/stores/contactsStore'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useIsFocused, useNavigation } from '@react-navigation/native'
import useTheme, { ThemeContext } from '@/contexts/theme'
import { GlassColorSchemeOverrideContext } from '@/contexts/glassColorScheme'
import useConversations from '@/stores/conversationStore'
import { filterActivesContacts } from '@/lib/dismissedContacts'
import {
  AppState,
  Platform,
  useWindowDimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native'
import { Input, InputProps } from 'tamagui'
import { BlurView } from '@/components/ui/BlurView'
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { Carousel, type CarouselRef } from 'react-native-reanimated-carousel'
import { GestureDetector } from 'react-native-gesture-handler'
import MapCarouselCard from '@/features/map/components/MapCarouselCard'
import * as Location from 'expo-location'
import * as Crypto from 'expo-crypto'
import { usePreferences } from '@/stores/preferences'
import { useShallow } from 'zustand/react/shallow'
import { useTabBarHidden } from '@/stores/tabBarVisibility'
import Button from '@/components/ui/Button'
import Empty from '@/components/ui/Empty'
import MapEmptyState from '@/features/map/components/MapEmptyState'
import i18n from '@/lib/locales'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import MapOnboarding from '@/features/map/components/MapOnboarding'
import { TAB_BAR_HEIGHT } from '@/components/ui/TabBar'
import useDevice from '@/hooks/useDevice'
import useAppActive from '@/hooks/useAppActive'
import { RootStackNavigation } from '@/types/rootStack'
import { HomeTabStackNavigation } from '@/types/homeStack'
import type { ContactMarker, MapRouteActions } from '@/features/map/types/map'
import { Contact } from '@/types/contact'
import { useMarkerColors } from '@/hooks/useMarkerColors'
import { stalenessToColor } from '@/lib/contactStaleness'
import { ConversationIndex } from '@/lib/conversationIndex'
import useConversationIndex from '@/hooks/useConversationIndex'
import {
  findContactIndexById,
  reconcileActiveContact,
  resolveCarouselSnapContact,
} from '@/features/map/lib/mapCarousel'
import { fitMapToCoordinates } from '@/features/map/lib/mapCamera'
import { buildContactsFuse, searchContactsFuzzy } from '@/lib/contactsSearch'
import { requestOrOfferLocationSettings } from '@/lib/locationPermission'
import useAdaptiveLayout from '@/hooks/useAdaptiveLayout'
import MapContactInspector, {
  type MapContactRowRenderer,
} from '@/features/map/components/MapContactInspector'
import CreateContactCard from '@/features/map/components/CreateContactCard'
import useMapContactCreation from '@/features/map/hooks/useMapContactCreation'
import {
  getMapImageryTheme,
  MapImageryContext,
} from '@/features/map/lib/mapImageryTheme'
import MapPinLabel, {
  PinHoverArea,
} from '@/features/map/components/MapPinLabel'
import usePinHover from '@/features/map/hooks/usePinHover'
import PointerTooltip from '@/components/ui/PointerTooltip'
import { alignInput, forwardSign, isRtlLayout } from '@/lib/direction'
import { analytics } from '@/lib/analytics'
import ContactPinLayer from '@/features/map/components/ContactPinLayer'
import MapControlColumn, {
  type MapControlsLayout,
} from '@/features/map/components/MapControlColumn'
import MapFloatingCard from '@/features/map/components/MapFloatingCard'
import MapGroupList from '@/features/map/components/MapGroupList'
import MapTopChips from '@/features/map/components/MapTopChips'
import useContactPinItems from '@/features/map/hooks/useContactPinItems'
import useMapProjection from '@/features/map/hooks/useMapProjection'
import {
  contactCardLine,
  contactUrgency,
  groupTitle,
  resolveCardDetail,
} from '@/features/map/lib/contactPins'
import type { MapPinItem } from '@/features/map/lib/mapPinLayout'
import {
  MAP_CONTROL_TOOLTIP,
  mapControlStyle,
  STOW_TRANSITION,
} from '@/features/map/lib/mapStyles'
import { isSamePlace } from '@/features/map/lib/pinGeometry'

const liquidGlass = isLiquidGlassAvailable()

const LEGAL_LABEL_HEIGHT = 20

const CAROUSEL_ANIMATION = {
  type: 'timing' as const,
  duration: 225,
  easing: Easing.bezier(0.25, 1, 0.5, 1),
}

const STOWED_HANDLE_HEIGHT = 28

const STOW_TIMING = { duration: 280, easing: Easing.inOut(Easing.ease) }

interface FullMapViewProps {
  renderContactRow: MapContactRowRenderer

  contactMarkers: ContactMarker[]

  hasMappedContacts: boolean
  activeContactCount: number
  conversationIndex: ConversationIndex
  topInset: number
  onExplore?: () => void
  onExploreEnd?: () => void

  onContactCreated: (id: string) => void
  routeActions?: MapRouteActions
}

function whileFlagged(flag: { current: boolean }, run: () => void) {
  flag.current = true
  try {
    run()
  } finally {
    flag.current = false
  }
}

function useMapSearchIndex(
  contactMarkers: ContactMarker[],
  hasSearch: boolean
) {
  const conversations = useConversations((s) => s.conversations)
  return hasSearch ? buildContactsFuse(contactMarkers, conversations) : null
}

const FullMapView = ({
  contactMarkers,
  hasMappedContacts,
  activeContactCount,
  conversationIndex,
  renderContactRow,
  topInset,
  onExplore,
  onExploreEnd,
  onContactCreated,
  routeActions,
}: FullMapViewProps) => {
  const navigation = useNavigation<HomeTabStackNavigation>()
  const { height: windowHeight } = useWindowDimensions()
  const { isWide, hasBottomBar, contentWidth: width } = useAdaptiveLayout()

  const [height, setHeight] = useState(windowHeight)

  const tabBarHidden = useTabBarHidden()
  const bottomBarHeight = !hasBottomBar || tabBarHidden ? 0 : TAB_BAR_HEIGHT
  const inspectorWidth = 360
  const [inspectorRevealRequest, setInspectorRevealRequest] = useState(0)
  const {
    colorScheme,
    mapLayer,
    mapCardDetail,
    set: setPreferences,
  } = usePreferences(
    useShallow((s) => ({
      colorScheme: s.colorScheme,
      mapLayer: s.mapLayer,
      mapCardDetail: s.mapCardDetail,
      set: s.set,
    }))
  )

  const cardDetail = useContacts((s) =>
    resolveCardDetail(mapCardDetail, s.customFieldDefs)
  )
  const mapRef = useRef<MapView>(null)
  const mapProjection = useMapProjection(mapRef)
  const [isMapReady, setIsMapReady] = useState(false)
  const [hasMapLayout, setHasMapLayout] = useState(false)
  const insets = useSafeAreaInsets()

  const bottomOverlayInset =
    insets.bottom +
    bottomBarHeight +
    (Platform.OS === 'android' ? LEGAL_LABEL_HEIGHT : 0)
  const carouselRef = useRef<CarouselRef>(null)
  const { isTablet } = useDevice()
  const [locationPermission, setLocationPermission] = useState(false)

  const isFocused = useIsFocused()
  const appActive = useAppActive()
  const [isTrackingUser, setIsTrackingUser] = useState(false)
  const locationSubscriptionRef = useRef<Location.LocationSubscription | null>(
    null
  )

  const trackingRequestRef = useRef(0)
  const [emptyStateHeight, setEmptyStateHeight] = useState(0)
  const draggingContactRef = useRef(false)
  const [noResultsHeight, setNoResultsHeight] = useState(0)
  const [search, setSearch] = useState('')
  const [searchExpanded, setSearchExpanded] = useState(false)

  const [cardsStowed, setCardsStowed] = useState(false)

  const stowProgress = useSharedValue(0)
  const searchInputRef = useRef<TextInput>(null)
  const searchExpand = useSharedValue(0)
  const appTheme = useTheme()
  const appGlassColorScheme = useGlassColorScheme()

  const overImagery = mapLayer !== 'standard'
  const theme = overImagery ? getMapImageryTheme(appTheme) : appTheme
  const glassColorScheme = overImagery ? 'dark' : appGlassColorScheme
  const updateContact = useContacts((s) => s.updateContact)
  const CARD_HEIGHT = 200
  const isDark = theme.colors.background === '#121212'

  const searchFuse = useMapSearchIndex(contactMarkers, search.trim().length > 0)
  const visibleContactMarkers = searchFuse
    ? searchContactsFuzzy(search, searchFuse, contactMarkers).map(
        (result) => result.contact
      )
    : contactMarkers

  const inspectorInset =
    isWide && hasMappedContacts && !cardsStowed ? inspectorWidth + 32 : 0
  const inspectorLeft = isRtlLayout() ? inspectorInset : 0
  const inspectorRight = isRtlLayout() ? 0 : inspectorInset

  const pinLabelBounds = {
    left: inspectorLeft,
    top: topInset,
    right: width - inspectorRight,
    bottom: height - bottomOverlayInset,
  }
  const pinHover = usePinHover({
    mapRef,
    contacts: visibleContactMarkers,
    bounds: pinLabelBounds,
  })
  const hoveredPinContact =
    pinHover.pin &&
    visibleContactMarkers.find((contact) => contact.id === pinHover.pin?.id)

  const [activeContactId, setActiveContactId] = useState<string | undefined>(
    () => contactMarkers[0]?.id
  )
  const lastReconciledIndexRef = useRef<number>(0)
  const pendingMarkerSnapIdRef = useRef<string | undefined>(undefined)

  const programmaticScrollRef = useRef(false)

  const [openGroupIds, setOpenGroupIds] = useState<string[] | null>(null)
  const [floatingCardHeight, setFloatingCardHeight] = useState(0)

  const [cardHeights, setCardHeights] = useState<Record<string, number>>({})

  const [chipsBottom, setChipsBottom] = useState(0)
  const [controlsLayout, setControlsLayout] =
    useState<MapControlsLayout | null>(null)
  const handleDragContactPin = (id: string, coordinate: LatLng) => {
    updateContact({
      id,
      coordinate,
      userDraggedCoordinate: true,
    })
  }

  const fitToMarkers = useCallback(() => {
    if (!isMapReady || !hasMapLayout) return
    fitMapToCoordinates(
      mapRef.current,
      visibleContactMarkers.map((contact) => contact.coordinate!)
    )
  }, [hasMapLayout, isMapReady, visibleContactMarkers])

  const fitToContactId = useCallback(
    (id: string) => {
      if (!isMapReady || !hasMapLayout) return
      const coordinate = visibleContactMarkers.find(
        (c) => c.id === id
      )?.coordinate
      if (coordinate) fitMapToCoordinates(mapRef.current, [coordinate])
    },
    [hasMapLayout, isMapReady, visibleContactMarkers]
  )

  const handleCarouselSnap = useCallback(
    (index: number) => {
      const resolved = resolveCarouselSnapContact({
        contactMarkers: visibleContactMarkers,
        snappedIndex: index,
        pendingMarkerId: pendingMarkerSnapIdRef.current,
      })
      pendingMarkerSnapIdRef.current = undefined

      programmaticScrollRef.current = false

      if (!resolved) return
      lastReconciledIndexRef.current = resolved.index
      setActiveContactId(resolved.activeId)
      fitToContactId(resolved.activeId)
    },
    [visibleContactMarkers, fitToContactId]
  )

  const dismissSearchKeyboard = useCallback(() => {
    if (searchInputRef.current?.isFocused()) {
      searchInputRef.current.blur()
    }
  }, [])

  const handleCarouselScrollStart = useCallback(() => {
    if (programmaticScrollRef.current) {
      return
    }
    dismissSearchKeyboard()
  }, [dismissSearchKeyboard])

  const scrollCarouselTo = useCallback((index: number, animated: boolean) => {
    const carousel = carouselRef.current
    if (!carousel || carousel.getCurrentIndex() === index) return false

    whileFlagged(programmaticScrollRef, () =>
      carousel.scrollTo({ index, animated })
    )
    return true
  }, [])

  const handlePinPress = useCallback(
    (id: string) => {
      dismissSearchKeyboard()

      const idx = findContactIndexById(visibleContactMarkers, id)
      if (idx < 0) return

      lastReconciledIndexRef.current = idx

      if (id === activeContactId) {
        pendingMarkerSnapIdRef.current = undefined
        fitToContactId(id)
        return
      }

      pendingMarkerSnapIdRef.current = id
      setActiveContactId(id)
      fitToContactId(id)
      if (!scrollCarouselTo(idx, true)) {
        pendingMarkerSnapIdRef.current = undefined
      }
    },
    [
      visibleContactMarkers,
      activeContactId,
      fitToContactId,
      dismissSearchKeyboard,
      scrollCarouselTo,
    ]
  )

  const openGroup = openGroupIds
    ? visibleContactMarkers
        .filter((contact) => openGroupIds.includes(contact.id))
        .map((contact) => ({
          contact,
          urgency: contactUrgency(
            contact,
            conversationIndex,
            conversationIndex.nowMs
          ),
        }))
        .sort((a, b) => a.urgency - b.urgency)
        .map(({ contact }) => contact)
    : []

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

    if (pendingMarkerSnapIdRef.current) return

    const currentCarouselIndex = carouselRef.current?.getCurrentIndex()
    if (currentCarouselIndex !== undefined && currentCarouselIndex !== index) {
      scrollCarouselTo(index, false)
    }
  }, [activeContactId, scrollCarouselTo, visibleContactMarkers, isWide])

  useEffect(() => {
    const unsubscribe = navigation.addListener('tabPress', () => {
      if (navigation.isFocused()) fitToMarkers()
    })
    return unsubscribe
  }, [fitToMarkers, navigation])

  const [fitRequest, setFitRequest] = useState(0)
  const handledFitRequest = useRef(0)
  useEffect(() => {
    if (fitRequest === handledFitRequest.current) return
    handledFitRequest.current = fitRequest
    fitToMarkers()
  }, [fitRequest, fitToMarkers])

  const hasFitOnMount = useRef(false)

  const [isMapLoaded, setIsMapLoaded] = useState(Platform.OS !== 'android')
  useEffect(() => {
    if (!isMapReady || isMapLoaded) return
    const timer = setTimeout(() => setIsMapLoaded(true), 1500)
    return () => clearTimeout(timer)
  }, [isMapReady, isMapLoaded])

  useEffect(() => {
    if (
      !hasFitOnMount.current &&
      isMapReady &&
      isMapLoaded &&
      hasMapLayout &&
      visibleContactMarkers.length > 0
    ) {
      fitMapToCoordinates(
        mapRef.current,
        visibleContactMarkers.map((contact) => contact.coordinate!),
        { animated: Platform.OS !== 'android' }
      )
      hasFitOnMount.current = true
    }
  }, [hasMapLayout, isMapReady, isMapLoaded, visibleContactMarkers])

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
    trackingRequestRef.current += 1
    if (locationSubscriptionRef.current) {
      locationSubscriptionRef.current.remove()
      locationSubscriptionRef.current = null
    }
    setIsTrackingUser(false)
  }, [])

  const mapContactCreation = useMapContactCreation((id, coordinate) => {
    setCardsStowed(false)
    stowProgress.set(withTiming(0, STOW_TIMING))

    setSearch('')
    onContactCreated(id)
    pendingMarkerSnapIdRef.current = undefined
    setActiveContactId(id)
    setInspectorRevealRequest((request) => request + 1)
    stopTrackingUser()
    mapRef.current?.animateCamera({ center: coordinate }, { duration: 225 })
  })

  const startTrackingUser = useCallback(async () => {
    const request = ++trackingRequestRef.current
    const isCancelled = () => request !== trackingRequestRef.current
    let granted = locationPermission
    if (!granted) {
      granted = await requestOrOfferLocationSettings()
      if (granted) setLocationPermission(true)
    }
    if (!granted || isCancelled()) return

    const ZOOM_DELTA = 0.005
    const PAN_DURATION_MS = 500

    let initialZoomFiredAt = 0

    const lastKnown = await Location.getLastKnownPositionAsync({
      maxAge: 60_000,
    })
    if (isCancelled()) return
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
      const subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,

          distanceInterval: 5,
        },
        (loc) => {
          const center = {
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          }
          const now = Date.now()

          if (initialZoomFiredAt === 0) {
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

          if (now - initialZoomFiredAt < PAN_DURATION_MS + 50) return

          mapRef.current?.animateCamera(
            { center },
            { duration: PAN_DURATION_MS }
          )
        }
      )
      if (isCancelled()) {
        subscription.remove()
        return
      }
      locationSubscriptionRef.current = subscription
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
    const unsubscribeBlur = navigation.addListener('blur', stopTrackingUser)
    const appStateSubscription = AppState.addEventListener(
      'change',
      (state) => {
        if (state === 'background' && locationSubscriptionRef.current) {
          stopTrackingUser()
        }
      }
    )
    return () => {
      unsubscribeBlur()
      appStateSubscription.remove()
      stopTrackingUser()
    }
  }, [navigation, stopTrackingUser])

  const parallaxScrollingScale =
    visibleContactMarkers.length === 1 ? 0.9 : isTablet ? 0.92 : 0.8025

  const cardsBottom = bottomOverlayInset + LEGAL_LABEL_HEIGHT - 5

  const cardTopGap = (CARD_HEIGHT * (1 - parallaxScrollingScale)) / 2

  const mapCardBottom = cardsBottom - cardTopGap

  const focusedCardHeight =
    ((activeContactId && cardHeights[activeContactId]) || CARD_HEIGHT) *
    parallaxScrollingScale

  const stowDistance = cardsBottom + focusedCardHeight

  const stowSwipeDistance = (CARD_HEIGHT - cardTopGap) / 6

  const SEARCH_COLLAPSED_WIDTH = 44
  const SEARCH_EXPANDED_WIDTH = isWide
    ? Math.min(360, width - inspectorWidth - 96)
    : width - 16 - 64
  const SEARCH_SPRING_OPEN = { damping: 18, stiffness: 180, mass: 0.9 }
  const SEARCH_SPRING_CLOSE = { damping: 22, stiffness: 200, mass: 0.9 }

  const toggleCardsStowed = () => {
    const stowed = !cardsStowed

    setCardsStowed(stowed)
    stowProgress.set(withTiming(stowed ? 1 : 0, STOW_TIMING))
    if (stowed) onExplore?.()
    else onExploreEnd?.()
  }

  const settleStowProgress = () => {
    stowProgress.set(withTiming(cardsStowed ? 1 : 0, STOW_TIMING))
  }

  const clampProgress = (value: number) => Math.min(1, Math.max(0, value))

  const cardsStowGesture = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetY(12)
    .failOffsetX([-12, 12])
    .onUpdate((e) => {
      stowProgress.set(clampProgress(e.translationY / stowDistance))
    })
    .onEnd((e) => {
      if (e.translationY > stowSwipeDistance || e.velocityY > 500) {
        toggleCardsStowed()
      } else {
        settleStowProgress()
      }
    })

  const expandSearch = () => {
    if (cardsStowed) toggleCardsStowed()
    if (searchExpanded) {
      searchInputRef.current?.focus()
      return
    }

    setSearchExpanded(true)
    searchExpand.set(withSpring(1, SEARCH_SPRING_OPEN))
    requestAnimationFrame(() => searchInputRef.current?.focus())
  }

  const handleSearchBlur = () => {
    if (search.trim().length === 0) {
      searchExpand.set(withSpring(0, SEARCH_SPRING_CLOSE))
      setSearchExpanded(false)
    }
  }

  const collapseSearch = () => {
    if (!searchExpanded) return
    searchInputRef.current?.blur()
    searchExpand.set(withSpring(0, SEARCH_SPRING_CLOSE))
    setSearchExpanded(false)
  }

  const handlePinItemPress = (item: MapPinItem) => {
    const ids = item.members.map((contact) => contact.id)
    mapContactCreation.cancel()
    if (item.group) {
      const coordinates = item.members.map((contact) => contact.coordinate!)

      if (isSamePlace(coordinates)) {
        if (cardsStowed) toggleCardsStowed()
        setOpenGroupIds(ids)
        const count = ids.length
        analytics.capture('map_group_opened', {
          count: count <= 2 ? '2' : count <= 5 ? '3-5' : '6+',
        })
      } else {
        fitMapToCoordinates(mapRef.current, coordinates)
      }
      return
    }
    setOpenGroupIds(null)
    if (cardsStowed) toggleCardsStowed()
    setInspectorRevealRequest((request) => request + 1)
    handlePinPress(ids[0]!)
  }

  const cardsPeekGesture = Gesture.Exclusive(
    Gesture.Pan()
      .runOnJS(true)
      .activeOffsetY(-8)
      .failOffsetY(8)
      .onUpdate((e) => {
        stowProgress.set(clampProgress(1 + e.translationY / stowDistance))
      })
      .onEnd((e) => {
        if (e.translationY < -24 || e.velocityY < -400) {
          toggleCardsStowed()
        } else {
          settleStowProgress()
        }
      }),
    Gesture.Tap()
      .runOnJS(true)
      .onEnd(() => toggleCardsStowed())
  )

  const handlePanDrag = () => {
    onExplore?.()
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

  const animatedCardsStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: stowProgress.value * stowDistance }],
  }))

  const animatedStowedHandleStyle = useAnimatedStyle(() => ({
    opacity: stowProgress.value,
  }))

  const addContact = () =>
    (navigation as unknown as RootStackNavigation).navigate('Contact Form', {
      id: Crypto.randomUUID(),
    })

  const emptyCardPlacement = {
    left: 16,
    right: isWide ? undefined : 16,
    width: isWide ? 400 : undefined,
    bottom: bottomOverlayInset + 12,
  }

  const showsFloatingCard = openGroup.length > 0
  const floatingCardBottom = bottomOverlayInset + (isWide ? 28 : 12)

  const renderEmptyState = () => (
    <Animated.View
      pointerEvents='box-none'
      onLayout={(e) => setEmptyStateHeight(e.nativeEvent.layout.height)}
      style={{
        position: 'absolute',
        ...emptyCardPlacement,
        alignItems: 'center',
        transitionProperty: 'bottom',
        ...STOW_TRANSITION,
      }}
    >
      <View
        style={{
          width: '100%',
          maxWidth: isTablet ? 520 : undefined,
          maxHeight: height - topInset - bottomOverlayInset - 80,
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
        <ScrollView bounces={false} style={{ flexShrink: 1 }}>
          <MapEmptyState
            activeContactCount={activeContactCount}
            onReviewContacts={() => {
              setPreferences({ contactsView: 'list' })
            }}
            onAddContact={addContact}
          />
        </ScrollView>
      </View>
    </Animated.View>
  )

  const pinItems = useContactPinItems({
    contacts: visibleContactMarkers,
    index: conversationIndex,
    detail: cardDetail,
    projection: mapProjection.projection,
    size: { width, height },
    activeId: activeContactId,
    overlays: {
      top: [topInset + 8 + 44, chipsBottom],
      controls: controlsLayout,

      inspectorLeft: showsFloatingCard ? 0 : inspectorLeft,
      inspectorRight: showsFloatingCard ? 0 : inspectorRight,
      bottom: {
        base: isWide ? bottomOverlayInset + 28 : bottomOverlayInset,
        floatingCard: showsFloatingCard
          ? { bottom: floatingCardBottom, height: floatingCardHeight }
          : null,
        cards:
          !isWide && visibleContactMarkers.length > 0
            ? cardsBottom +
              (cardsStowed ? STOWED_HANDLE_HEIGHT : focusedCardHeight)
            : null,
      },
    },
  })

  const locationButtonBottom = mapContactCreation.coordinate
    ? mapCardBottom + CARD_HEIGHT + 8
    : showsFloatingCard
      ? floatingCardBottom + floatingCardHeight + 8
      : visibleContactMarkers.length > 0
        ? cardsStowed
          ? cardsBottom + STOWED_HANDLE_HEIGHT + 8
          : cardsBottom + focusedCardHeight + 12
        : !hasMappedContacts
          ? bottomOverlayInset + 12 + emptyStateHeight + 8
          : bottomOverlayInset + 4 + noResultsHeight + 8

  return (
    <ThemeContext.Provider value={theme}>
      <GlassColorSchemeOverrideContext.Provider
        value={overImagery ? 'dark' : undefined}
      >
        <MapImageryContext.Provider value={overImagery}>
          <PinHoverArea
            gesture={pinHover.hover}
            onTouchStart={pinHover.dismiss}
          >
            <MapView
              mapType={mapLayer}
              userInterfaceStyle={colorScheme ? colorScheme : undefined}
              showsUserLocation={locationPermission && isFocused && appActive}
              showsMyLocationButton={false}
              ref={mapRef}
              onLayout={(e) => {
                setHeight(e.nativeEvent.layout.height)
                setHasMapLayout(true)
                mapProjection.onLayout({
                  width: e.nativeEvent.layout.width,
                  height: e.nativeEvent.layout.height,
                })
              }}
              rotateEnabled={false}
              pitchEnabled={false}
              onMapReady={() => setIsMapReady(true)}
              onMapLoaded={() => setIsMapLoaded(true)}
              onPress={() => {
                collapseSearch()
                mapContactCreation.cancel()
                setOpenGroupIds(null)
              }}
              onLongPress={(e) => {
                if (draggingContactRef.current) return
                setOpenGroupIds(null)
                collapseSearch()
                stopTrackingUser()
                pendingMarkerSnapIdRef.current = undefined
                mapContactCreation.dropPin(e.nativeEvent.coordinate)
                mapRef.current?.animateCamera(
                  { center: e.nativeEvent.coordinate },
                  { duration: 225 }
                )
              }}
              onPanDrag={handlePanDrag}
              onRegionChangeStart={pinHover.onRegionChangeStart}
              onRegionChangeComplete={(region) => {
                pinHover.onRegionChangeComplete?.()
                mapProjection.onRegionChangeComplete(region)
              }}
              mapPadding={
                Platform.OS === 'android' && !isMapReady
                  ? undefined
                  : {
                      top: topInset,
                      right: inspectorRight,
                      left: inspectorLeft,
                      bottom:
                        Platform.OS === 'android'
                          ? insets.bottom + bottomBarHeight
                          : tabBarHidden
                            ? 0
                            : insets.bottom + bottomBarHeight / 4,
                    }
              }
              style={{ height: '100%', width: '100%' }}
            >
              {mapContactCreation.coordinate && (
                <Marker
                  identifier='new-contact-location'
                  coordinate={mapContactCreation.coordinate}
                  pinColor={theme.colors.accent}
                  title={i18n.t('map_droppedPin')}
                  zIndex={1}
                  stopPropagation
                />
              )}
              <ContactPinLayer
                items={pinItems}
                onPress={handlePinItemPress}
                onDragStart={() => {
                  draggingContactRef.current = true
                  pinHover.setDragging(true)
                  mapContactCreation.cancel()
                }}
                onDragEnd={(contactId, coordinate) => {
                  draggingContactRef.current = false
                  pinHover.setDragging(false)
                  handleDragContactPin(contactId, coordinate)
                }}
              />
            </MapView>
          </PinHoverArea>
          {pinHover.pin && hoveredPinContact && (
            <MapPinLabel
              key={hoveredPinContact.id}
              name={hoveredPinContact.name}
              box={pinHover.pin.box}
              bounds={pinLabelBounds}
            />
          )}

          {hasMappedContacts && (
            <Animated.View
              style={[
                {
                  position: 'absolute',
                  top: topInset + 8,
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
              {}
              <PointerTooltip
                label={i18n.t('map_searchContacts')}
                placement='right'
                enabled={!searchExpanded}
                style={{ borderRadius: 22 }}
              >
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
                  <LucideIcon
                    icon={SearchIcon}
                    size={theme.fontSize('sm')}
                    style={{ color: theme.colors.text }}
                  />
                </Pressable>
              </PointerTooltip>
              <Animated.View
                style={[
                  { flex: 1, paddingRight: 14 },
                  animatedSearchInputStyle,
                ]}
                pointerEvents={searchExpanded ? 'auto' : 'none'}
              >
                <Input
                  unstyled
                  ref={searchInputRef}
                  value={search}
                  onChangeText={setSearch}
                  onBlur={handleSearchBlur}
                  disabled={!searchExpanded}
                  placeholder={i18n.t('map_searchContacts')}
                  placeholderTextColor={
                    theme.colors.textAlt as InputProps['placeholderTextColor']
                  }
                  clearButtonMode='while-editing'
                  enterKeyHint='search'
                  style={{
                    color: theme.colors.text,
                    fontFamily: theme.fonts.regular,
                    fontSize: theme.fontSize('md'),

                    textAlign: alignInput('start'),
                    padding: 0,
                  }}
                />
              </Animated.View>
            </Animated.View>
          )}

          {mapContactCreation.coordinate ? (
            <Animated.View
              style={{
                position: 'absolute',
                bottom: isWide ? bottomOverlayInset + 28 : mapCardBottom,
                transitionProperty: 'bottom',
                ...STOW_TRANSITION,
                left: isWide ? undefined : 0,
                right: isWide ? 16 : undefined,
                width: isWide ? inspectorWidth : width,
                height: isWide ? undefined : CARD_HEIGHT,

                transform: isWide
                  ? undefined
                  : [{ scale: parallaxScrollingScale }],
                ...(isWide && !hasMappedContacts ? emptyCardPlacement : {}),
              }}
            >
              <CreateContactCard
                fill={!isWide}
                coordinate={mapContactCreation.coordinate}
                onCreate={mapContactCreation.createContact}
                onCancel={mapContactCreation.cancel}
              />
            </Animated.View>
          ) : showsFloatingCard ? (
            <MapFloatingCard
              isWide={isWide}
              width={inspectorWidth}
              bottom={floatingCardBottom}
              onHeight={setFloatingCardHeight}
            >
              <MapGroupList
                title={groupTitle(openGroup)}
                members={openGroup}
                lineFor={(contact) =>
                  contactCardLine(
                    contact,
                    conversationIndex,
                    cardDetail,
                    conversationIndex.nowMs
                  )
                }
                activeId={activeContactId}
                onSelect={(id) => {
                  setOpenGroupIds(null)
                  setInspectorRevealRequest((request) => request + 1)
                  handlePinPress(id)
                }}
                onClose={() => setOpenGroupIds(null)}
              />
            </MapFloatingCard>
          ) : !hasMappedContacts ? (
            renderEmptyState()
          ) : visibleContactMarkers.length === 0 ? (
            <Animated.View
              onLayout={(e) => setNoResultsHeight(e.nativeEvent.layout.height)}
              style={{
                position: 'absolute',
                bottom: bottomOverlayInset + 4,
                transitionProperty: 'bottom',
                ...STOW_TRANSITION,
                width: isWide ? inspectorWidth : width,
                right: isWide ? 16 : undefined,
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
                <Empty
                  icon={
                    <LucideIcon
                      icon={SearchIcon}
                      size={24}
                      color={theme.colors.text}
                    />
                  }
                  title={i18n.t('map_noSearchResults')}
                  description={i18n.t(
                    contactMarkers.length === 0
                      ? 'map_noFilterResults_description'
                      : 'map_noSearchResults_description'
                  )}
                />
              </View>
            </Animated.View>
          ) : isWide ? (
            <Animated.View
              pointerEvents={cardsStowed ? 'none' : 'box-none'}
              style={{
                position: 'absolute',
                right: 16,
                top: topInset + 8,
                bottom: bottomOverlayInset + 28,
                width: inspectorWidth,
                opacity: cardsStowed ? 0 : 1,

                transform: [
                  {
                    translateX: cardsStowed
                      ? forwardSign() * (inspectorWidth + 32)
                      : 0,
                  },
                ],
                transitionProperty: ['transform', 'opacity', 'bottom'],
                ...STOW_TRANSITION,
              }}
            >
              <MapContactInspector
                renderContactRow={renderContactRow}
                contacts={visibleContactMarkers}
                activeId={activeContactId}
                revealRequest={inspectorRevealRequest}
                index={conversationIndex}
                onSelect={handlePinPress}
                onHoverContact={pinHover.linkContact}
              />
            </Animated.View>
          ) : (
            <Animated.View
              pointerEvents='box-none'
              style={{
                position: 'absolute',
                bottom: mapCardBottom,
                width,
                height: CARD_HEIGHT,
                transitionProperty: 'bottom',
                ...STOW_TRANSITION,
              }}
            >
              <GestureDetector gesture={cardsStowGesture}>
                <Animated.View
                  pointerEvents={cardsStowed ? 'none' : 'box-none'}
                  style={[{ flex: 1 }, animatedCardsStyle]}
                >
                  <Carousel
                    onSnapToItem={handleCarouselSnap}
                    onScrollStart={handleCarouselScrollStart}
                    defaultIndex={Math.max(
                      0,
                      findContactIndexById(
                        visibleContactMarkers,
                        activeContactId
                      )
                    )}
                    ref={carouselRef}
                    data={visibleContactMarkers}
                    keyExtractor={(contact) => contact.id}
                    renderItem={({ item }) => (
                      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
                        <View
                          onLayout={(e) => {
                            const cardHeight = e.nativeEvent.layout.height
                            setCardHeights((heights) =>
                              heights[item.id] === cardHeight
                                ? heights
                                : { ...heights, [item.id]: cardHeight }
                            )
                          }}
                        >
                          <MapCarouselCard
                            contact={item}
                            index={conversationIndex}
                          />
                        </View>
                      </View>
                    )}
                    animation={CAROUSEL_ANIMATION}
                    onConfigurePanGesture={(gesture) => {
                      gesture.activeOffsetX([-10, 10])
                    }}
                    renderWindowSize={7}
                    layout={{
                      type: 'parallax',
                      offset: 100,
                      scale: parallaxScrollingScale,
                      adjacentScale: parallaxScrollingScale ** 2,
                    }}
                    loop={visibleContactMarkers.length !== 1}
                    style={{ width, height: CARD_HEIGHT }}
                  />
                </Animated.View>
              </GestureDetector>
              {cardsStowed && (
                <GestureDetector gesture={cardsPeekGesture}>
                  <Animated.View
                    accessible
                    accessibilityRole='button'
                    accessibilityLabel={i18n.t('map_showContactCards')}
                    style={[
                      {
                        position: 'absolute',
                        bottom: cardTopGap,
                        alignSelf: 'center',

                        paddingHorizontal: 32,
                        paddingTop: 16,
                      },
                      animatedStowedHandleStyle,
                    ]}
                  >
                    <View
                      style={{
                        width: 56,
                        height: STOWED_HANDLE_HEIGHT,
                        borderRadius: STOWED_HANDLE_HEIGHT / 2,
                        borderCurve: 'continuous',
                        overflow: 'hidden',
                        alignItems: 'center',
                        justifyContent: 'center',
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
                            { borderRadius: STOWED_HANDLE_HEIGHT / 2 },
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
                      <LucideIcon
                        icon={ChevronUpIcon}
                        size={theme.fontSize('md')}
                        style={{ color: theme.colors.text }}
                      />
                    </View>
                  </Animated.View>
                </GestureDetector>
              )}
            </Animated.View>
          )}
          <MapControlColumn
            top={topInset + (hasMappedContacts ? 64 : 8)}
            onFit={visibleContactMarkers.length >= 1 ? fitToMarkers : null}
            stow={
              isWide &&
              visibleContactMarkers.length >= 1 &&
              !mapContactCreation.coordinate
                ? { stowed: cardsStowed, onToggle: () => toggleCardsStowed() }
                : null
            }
            mapLayer={mapLayer}
            onChangeLayer={(mapLayer) => setPreferences({ mapLayer })}
            onLayout={setControlsLayout}
          />
          <MapTopChips
            top={topInset + 8}
            start={72}
            end={
              isWide && hasMappedContacts && !cardsStowed
                ? inspectorWidth + 48
                : 16
            }
            searchExpanded={searchExpanded}
            onFound={() => setFitRequest((request) => request + 1)}
            todayRoute={
              routeActions?.todayStopCount
                ? {
                    stopCount: routeActions.todayStopCount,
                    onPress: routeActions.openTodayRoute,
                  }
                : null
            }
            onBottom={setChipsBottom}
          />
          <Animated.View
            style={{
              position: 'absolute',
              right:
                isWide && hasMappedContacts && !cardsStowed
                  ? inspectorWidth + 48
                  : 16,
              bottom: isWide ? bottomOverlayInset + 32 : locationButtonBottom,
              transitionProperty: ['right', 'bottom'],
              ...STOW_TRANSITION,
            }}
          >
            {}
            <PointerTooltip
              label={i18n.t(
                isTrackingUser
                  ? 'map_stopFollowingLocation'
                  : 'map_centerOnMyLocation'
              )}
              {...MAP_CONTROL_TOOLTIP}
              placement='left'
            >
              <Button
                accessibilityLabel={
                  isTrackingUser
                    ? i18n.t('map_stopFollowingLocation')
                    : i18n.t('map_centerOnMyLocation')
                }
                variant='glass'
                onPress={toggleLocationTracking}
                style={mapControlStyle(theme.colors.card)}
              >
                <LucideIcon
                  icon={NavigationIcon}
                  size={theme.fontSize('sm')}
                  style={{
                    color: isTrackingUser
                      ? theme.colors.accent
                      : theme.colors.text,
                  }}
                />
              </Button>
            </PointerTooltip>
          </Animated.View>
        </MapImageryContext.Provider>
      </GlassColorSchemeOverrideContext.Provider>
    </ThemeContext.Provider>
  )
}

function withDroppedContacts(
  contacts: Contact[],
  activeContacts: Contact[],
  droppedIds: string[]
): Contact[] {
  const shown = new Set(contacts.map((c) => c.id))
  const dropped = activeContacts.filter(
    (c) => droppedIds.includes(c.id) && !shown.has(c.id)
  )
  return dropped.length > 0 ? [...contacts, ...dropped] : contacts
}

const MapScreen = ({
  contacts,
  renderContactRow,
  topInset = 0,
  onExplore,
  onExploreEnd,
  routeActions,
}: {
  contacts: Contact[]
  renderContactRow: MapContactRowRenderer

  topInset?: number

  onExplore?: () => void

  onExploreEnd?: () => void

  routeActions?: MapRouteActions
}) => {
  const allContacts = useContacts((s) => s.contacts)
  const conversations = useConversations((s) => s.conversations)
  const { hasCompletedMapOnboarding, stalenessBreakpoints } = usePreferences(
    useShallow((s) => ({
      hasCompletedMapOnboarding: s.hasCompletedMapOnboarding,
      stalenessBreakpoints: s.stalenessBreakpoints,
    }))
  )
  const colors = useMarkerColors()

  const [droppedIds, setDroppedIds] = useState<string[]>([])

  const conversationIndex = useConversationIndex(
    conversations,
    stalenessBreakpoints
  )

  const activeContacts = filterActivesContacts(allContacts)
  const hasMappedContacts = activeContacts.some((c) => c.coordinate != null)
  const pinnedContacts = withDroppedContacts(
    contacts,
    activeContacts,
    droppedIds
  )

  const contactMarkers: ContactMarker[] = pinnedContacts
    .filter((c) => c.coordinate != null)
    .map((c) => ({
      ...c,
      pinColor: stalenessToColor(conversationIndex.stalenessFor(c.id), colors),
    }))

  if (!hasCompletedMapOnboarding) {
    return (
      <Wrapper insets='none' style={{ flex: 1, paddingTop: topInset }}>
        <MapOnboarding />
      </Wrapper>
    )
  }

  return (
    <Wrapper insets='none' style={{ flexGrow: 1, position: 'relative' }}>
      <FullMapView
        renderContactRow={renderContactRow}
        contactMarkers={contactMarkers}
        hasMappedContacts={hasMappedContacts}
        activeContactCount={activeContacts.length}
        conversationIndex={conversationIndex}
        topInset={topInset}
        onExplore={onExplore}
        onExploreEnd={onExploreEnd}
        onContactCreated={(id) => setDroppedIds((ids) => [...ids, id])}
        routeActions={routeActions}
      />
    </Wrapper>
  )
}

export default MapScreen
