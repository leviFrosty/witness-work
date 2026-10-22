import {
  ChevronUp as ChevronUpIcon,
  Expand as ExpandIcon,
  Info as InfoIcon,
  Navigation as NavigationIcon,
  Search as SearchIcon,
} from 'lucide-react-native'
import {
  PanelTrailingCloseIcon,
  PanelTrailingOpenIcon,
} from '@/components/ui/DirectionalIcon'
import LucideIcon from '@/components/ui/LucideIcon'
import useGlassColorScheme from '@/hooks/useGlassColorScheme'
import Wrapper from '@/components/ui/layout/Wrapper'
import MapView, { LatLng, Marker } from 'react-native-maps'
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
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
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
import { ContactMarker } from '@/features/map/types/map'
import { Contact } from '@/types/contact'
import Popover from '@/components/ui/Popover'
import MapKey from '@/features/map/components/MapColorKey'
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
import MapLayerMenu from '@/features/map/components/MapLayerMenu'
import MapFindContacts from '@/features/map/components/MapFindContacts'
import MapPinLabel, {
  PinHoverArea,
} from '@/features/map/components/MapPinLabel'
import usePinHover from '@/features/map/hooks/usePinHover'
import PointerTooltip from '@/components/ui/PointerTooltip'
import { alignInput, forwardSign, isRtlLayout } from '@/lib/direction'

const liquidGlass = isLiquidGlassAvailable()

// Reserved vertical space above the tab bar (or the safe area, while it's
// away) for the map's legal/logo attribution, which `mapPadding` lifts up out
// from behind the carousel.
const LEGAL_LABEL_HEIGHT = 20

// v4 used the same ease-out curve for gesture settling and ref commands. Its
// gesture path silently added 100ms to scrollAnimationDuration, so 225ms keeps
// the previous swipe feel while avoiding v5's much slower 500ms default.
const CAROUSEL_ANIMATION = {
  type: 'timing' as const,
  duration: 225,
  easing: Easing.bezier(0.25, 1, 0.5, 1),
}

/** Height of the handle left above the tab bar while the cards are stowed. */
const STOWED_HANDLE_HEIGHT = 28

const STOW_TIMING = { duration: 280, easing: Easing.inOut(Easing.ease) }

const STOW_TRANSITION = {
  transitionDuration: 280,
  transitionTimingFunction: 'ease-in-out',
} as const

interface FullMapViewProps {
  renderContactRow: MapContactRowRenderer
  /** The pins the Contacts filters let through, in the list's order. */
  contactMarkers: ContactMarker[]
  /** Any active contact has a location, filtered out or not. */
  hasMappedContacts: boolean
  activeContactCount: number
  conversationIndex: ConversationIndex
  topInset: number
  onExplore?: () => void
  /** A contact was saved from a pin dropped on this map. */
  onContactCreated: (id: string) => void
}

/**
 * Sets `flag` while `run` runs. Outside the component: the React Compiler skips
 * a component with a `try … finally` in it.
 */
function whileFlagged(flag: { current: boolean }, run: () => void) {
  flag.current = true
  try {
    run()
  } finally {
    flag.current = false
  }
}

/**
 * The same search as the Contacts list: typos, notes, custom fields and Arabic
 * spellings all match. Built only while there's a query, so logging a visit
 * doesn't rebuild an index nobody is using. A hook of its own, so the React
 * Compiler keeps it apart from the query and typing doesn't rebuild it.
 */
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
  onContactCreated,
}: FullMapViewProps) => {
  const navigation = useNavigation<HomeTabStackNavigation>()
  const { height: windowHeight } = useWindowDimensions()
  const { isWide, hasBottomBar, contentWidth: width } = useAdaptiveLayout()
  // Map runs under the floating Contacts header (`topInset`), so size overlays
  // to its own frame.
  const [height, setHeight] = useState(windowHeight)
  // Exploring slides the tab bar away (see Contacts), and the cards and
  // controls drop into its room.
  const tabBarHidden = useTabBarHidden()
  const bottomBarHeight = !hasBottomBar || tabBarHidden ? 0 : TAB_BAR_HEIGHT
  const inspectorWidth = 360
  const [inspectorRevealRequest, setInspectorRevealRequest] = useState(0)
  const {
    colorScheme,
    mapLayer,
    set: setPreferences,
  } = usePreferences(
    useShallow((s) => ({
      colorScheme: s.colorScheme,
      mapLayer: s.mapLayer,
      set: s.set,
    }))
  )
  const mapRef = useRef<MapView>(null)
  const [isMapReady, setIsMapReady] = useState(false)
  const [hasMapLayout, setHasMapLayout] = useState(false)
  const insets = useSafeAreaInsets()
  // Google Maps' logo sits above its padding; keep cards clear of that strip.
  const bottomOverlayInset =
    insets.bottom +
    bottomBarHeight +
    (Platform.OS === 'android' ? LEGAL_LABEL_HEIGHT : 0)
  const carouselRef = useRef<CarouselRef>(null)
  const { isTablet } = useDevice()
  const [locationPermission, setLocationPermission] = useState(false)
  // The Map stays mounted behind other tabs, pushed screens and the
  // background, and its blue dot keeps the OS location request running (every
  // 5 s on Android) while it's shown. Show it only while the Map is in view.
  const isFocused = useIsFocused()
  const appActive = useAppActive()
  const [isTrackingUser, setIsTrackingUser] = useState(false)
  const locationSubscriptionRef = useRef<Location.LocationSubscription | null>(
    null
  )
  // Each start takes a number and each stop bumps it, so a watch that finishes
  // starting after the user stopped or left the Map is removed, not kept.
  const trackingRequestRef = useRef(0)
  const [emptyStateHeight, setEmptyStateHeight] = useState(0)
  const draggingContactRef = useRef(false)
  const [noResultsHeight, setNoResultsHeight] = useState(0)
  const [search, setSearch] = useState('')
  const [searchExpanded, setSearchExpanded] = useState(false)
  // Stowed cards tuck down to a peek (the wide inspector slides off-screen)
  // for a full map.
  const [cardsStowed, setCardsStowed] = useState(false)
  // 0 = cards shown, 1 = stowed. Driven by the swipe while dragging, then
  // animated to rest.
  const stowProgress = useSharedValue(0)
  const searchInputRef = useRef<TextInput>(null)
  const searchExpand = useSharedValue(0)
  const appTheme = useTheme()
  const appGlassColorScheme = useGlassColorScheme()
  // Satellite/hybrid imagery is dark whatever the app theme, so every overlay
  // on it switches to a dark, higher-contrast palette.
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

  // Room the floating inspector takes on the trailing edge, the physical left
  // in a right-to-left layout. Map padding and pin points are physical.
  const inspectorInset =
    isWide && hasMappedContacts && !cardsStowed ? inspectorWidth + 32 : 0
  const inspectorLeft = isRtlLayout() ? inspectorInset : 0
  const inspectorRight = isRtlLayout() ? 0 : inspectorInset
  // Pin labels stay on the open map, clear of the floating header, inspector
  // and bottom bar.
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
  // The carousel fires onScrollStart for programmatic scrollTo calls, not
  // just user swipes. Programmatic scrolls happen while the user is typing
  // (search narrows results → reconcile effect re-syncs the carousel), and
  // letting them dismiss the keyboard blurs the search input mid-word.
  const programmaticScrollRef = useRef(false)
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
      // v5 emits onSnapToItem only after movement settles. Keep this defensive
      // clear in case callback scheduling ever changes.
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

  // Only dismiss the keyboard when the user actually swipes the carousel —
  // programmatic scrolls (search-driven reconciles) must not steal focus.
  const handleCarouselScrollStart = useCallback(() => {
    if (programmaticScrollRef.current) {
      return
    }
    dismissSearchKeyboard()
  }, [dismissSearchKeyboard])

  // v5 removed the public command-level onFinished hook. Its ref commands
  // invoke onScrollStart synchronously, so the flag only needs to wrap the
  // command call; onSnapToItem remains the settled-state callback.
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

    // getCurrentIndex() is settled-only in v5. While a marker-triggered
    // animation is in flight it still reports the previous card, so an
    // immediate reconciliation here would replace the 225ms animation with a
    // non-animated jump. onSnapToItem performs the settled reconciliation.
    if (pendingMarkerSnapIdRef.current) return

    const currentCarouselIndex = carouselRef.current?.getCurrentIndex()
    if (currentCarouselIndex !== undefined && currentCarouselIndex !== index) {
      scrollCarouselTo(index, false)
    }
  }, [activeContactId, scrollCarouselTo, visibleContactMarkers, isWide])

  // Reselecting the Contacts tab while on the map refits it to every pin.
  useEffect(() => {
    const unsubscribe = navigation.addListener('tabPress', () => {
      if (navigation.isFocused()) fitToMarkers()
    })
    return unsubscribe
  }, [fitToMarkers, navigation])

  // Fits every pin once Contacts found by the Find contacts row are on it.
  const [fitRequest, setFitRequest] = useState(0)
  const handledFitRequest = useRef(0)
  useEffect(() => {
    if (fitRequest === handledFitRequest.current) return
    handledFitRequest.current = fitRequest
    fitToMarkers()
  }, [fitRequest, fitToMarkers])

  const hasFitOnMount = useRef(false)

  useEffect(() => {
    if (
      !hasFitOnMount.current &&
      isMapReady &&
      hasMapLayout &&
      visibleContactMarkers.length > 0
    ) {
      fitToMarkers()
      hasFitOnMount.current = true
    }
  }, [fitToMarkers, hasMapLayout, isMapReady, visibleContactMarkers.length])

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
    // Clear the old search before reconciliation so the saved Contact can
    // become the selected carousel card (or the revealed iPad inspector row).
    // It stays pinned even if the Contacts filters would hide it.
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

  // Following runs the GPS at navigation accuracy, so it stops when the Map
  // leaves view: other tabs and pushed screens keep it mounted. A start still
  // in flight is left alone in the background, since its own permission and
  // location-settings prompts pause the app on Android.
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
  const mapCardBottom = bottomOverlayInset + LEGAL_LABEL_HEIGHT - 5
  // The parallax layout scales the focused card around its centre, so its top
  // edge sits this far below the carousel's frame.
  const cardTopGap = (CARD_HEIGHT * (1 - parallaxScrollingScale)) / 2
  // Stowed cards slide off the bottom of the screen rather than leaving a
  // clipped sliver above it. They never fade: iOS can stop drawing glass for
  // good under a view that sat at opacity 0 while the app was backgrounded or
  // the tab left, so the cards came back see-through.
  const stowDistance = mapCardBottom + CARD_HEIGHT - cardTopGap
  /** How far a drag down has to go to stow the cards, short of a flick. */
  const stowSwipeDistance = (CARD_HEIGHT - cardTopGap) / 6

  // Sit the location FAB just above whichever bottom UI is on screen:
  // the empty-state card, the no-search-results card, or the carousel.
  // Heights for the variable cards come from onLayout; the carousel is
  // fixed at CARD_HEIGHT.
  const locationButtonBottom = mapContactCreation.coordinate
    ? mapCardBottom + CARD_HEIGHT + 8
    : visibleContactMarkers.length > 0
      ? cardsStowed
        ? mapCardBottom + STOWED_HANDLE_HEIGHT + 8
        : mapCardBottom + CARD_HEIGHT + 8
      : !hasMappedContacts
        ? bottomOverlayInset + 12 + emptyStateHeight + 8
        : bottomOverlayInset + 4 + noResultsHeight + 8

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

  // Icon-only controls in the left column; their labels open toward the map.
  // `Button` already supplies the pointer effect.
  const controlTooltipProps = {
    placement: 'right',
    effect: 'none',
    style: { borderRadius: 22 },
  } as const

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
  }

  const settleStowProgress = () => {
    stowProgress.set(withTiming(cardsStowed ? 1 : 0, STOW_TIMING))
  }

  const clampProgress = (value: number) => Math.min(1, Math.max(0, value))

  // Dragging the cards down follows the finger and stows them past a short
  // distance or on a flick. Horizontal drags stay with the carousel.
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
    // Results show in the cards, so bring them back.
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

  // The stowed handle brings the cards back on a tap or an upward swipe.
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
              }}
              onMapReady={() => setIsMapReady(true)}
              onPress={() => {
                collapseSearch()
                mapContactCreation.cancel()
              }}
              onLongPress={(e) => {
                if (draggingContactRef.current) return
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
              onRegionChangeComplete={pinHover.onRegionChangeComplete}
              mapPadding={
                // Android calls GoogleMap.setPadding synchronously; the native
                // map can still be null when Fabric applies initial props.
                Platform.OS === 'android' && !isMapReady
                  ? undefined
                  : {
                      top: topInset,
                      right: inspectorRight,
                      left: inspectorLeft,
                      bottom:
                        Platform.OS === 'android'
                          ? insets.bottom + bottomBarHeight
                          : // Apple Maps adds the safe area itself, so with
                            // the tab bar gone its label sits right on it.
                            tabBarHidden
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
              {visibleContactMarkers.map((c) => (
                <Marker
                  onPress={() => {
                    mapContactCreation.cancel()
                    if (cardsStowed) toggleCardsStowed()
                    setInspectorRevealRequest((request) => request + 1)
                    handlePinPress(c.id)
                  }}
                  identifier={c.id}
                  // Include pinColor in the key so the marker remounts when its
                  // staleness color changes. react-native-maps only applies
                  // `pinColor` at mount on iOS — without the remount, logging a
                  // conversation never updates the pin tint until reload.
                  key={`${c.id}-${c.pinColor}`}
                  coordinate={c.coordinate!}
                  pinColor={c.pinColor}
                  draggable
                  onDragStart={() => {
                    draggingContactRef.current = true
                    pinHover.setDragging(true)
                    mapContactCreation.cancel()
                  }}
                  onDragEnd={(e) => {
                    draggingContactRef.current = false
                    pinHover.setDragging(false)
                    handleDragContactPin(c.id, e.nativeEvent.coordinate)
                  }}
                />
              ))}
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
              {/* The expanded field shows its own placeholder. */}
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
                    // Explicit: an unaligned field follows the app bundle's language on
                    // iOS, which can be Arabic while the app runs in English.
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
                // Match the focused carousel item, including its scaled contents.
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
                // Slides off past the trailing edge (the right in LTR).
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
                      <MapCarouselCard
                        contact={item}
                        index={conversationIndex}
                      />
                    )}
                    animation={CAROUSEL_ANIMATION}
                    // Leave vertical drags to the swipe-down-to-stow gesture.
                    onConfigurePanGesture={(gesture) => {
                      gesture.activeOffsetX([-10, 10])
                    }}
                    // Only mount the visible card plus a few neighbors on each side —
                    // without renderWindowSize the v5 renderer mounts every Contact's
                    // card up front, regressing the map screen's first paint.
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
                        bottom: 0,
                        alignSelf: 'center',
                        // Wider and taller than the handle so it's an easy target.
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
          <View
            style={{
              position: 'absolute',
              top: topInset + (hasMappedContacts ? 64 : 8),
              left: 16,
              gap: 8,
            }}
          >
            {visibleContactMarkers.length >= 1 && (
              <PointerTooltip
                label={i18n.t('map_fitContacts')}
                {...controlTooltipProps}
              >
                <Button
                  accessibilityLabel={i18n.t('map_fitContacts')}
                  variant='glass'
                  onPress={fitToMarkers}
                  style={mapControlStyle}
                >
                  <LucideIcon
                    icon={ExpandIcon}
                    size={theme.fontSize('sm')}
                    style={{ color: theme.colors.text }}
                  />
                </Button>
              </PointerTooltip>
            )}
            {/* Phone cards stow with a swipe down instead. */}
            {isWide &&
              visibleContactMarkers.length >= 1 &&
              !mapContactCreation.coordinate && (
                <PointerTooltip
                  label={i18n.t(
                    cardsStowed
                      ? 'map_showContactCards'
                      : 'map_hideContactCards'
                  )}
                  {...controlTooltipProps}
                >
                  <Button
                    accessibilityLabel={i18n.t(
                      cardsStowed
                        ? 'map_showContactCards'
                        : 'map_hideContactCards'
                    )}
                    variant='glass'
                    onPress={() => toggleCardsStowed()}
                    style={mapControlStyle}
                  >
                    <LucideIcon
                      icon={
                        cardsStowed
                          ? PanelTrailingOpenIcon
                          : PanelTrailingCloseIcon
                      }
                      size={theme.fontSize('sm')}
                      style={{ color: theme.colors.text }}
                    />
                  </Button>
                </PointerTooltip>
              )}
            {/* A click hides the label before the menu opens. */}
            <PointerTooltip
              label={i18n.t('map_chooseLayer')}
              {...controlTooltipProps}
            >
              <MapLayerMenu
                value={mapLayer}
                onChange={(mapLayer) => setPreferences({ mapLayer })}
                style={mapControlStyle}
              />
            </PointerTooltip>
            <Popover
              contentWidth={280}
              renderTrigger={({ onPress }) => (
                <PointerTooltip
                  label={i18n.t('map_showLegend')}
                  {...controlTooltipProps}
                >
                  <Button
                    accessibilityLabel={i18n.t('map_showLegend')}
                    variant='glass'
                    onPress={onPress}
                    style={mapControlStyle}
                  >
                    <LucideIcon
                      icon={InfoIcon}
                      size={theme.fontSize('sm')}
                      style={{ color: theme.colors.text }}
                    />
                  </Button>
                </PointerTooltip>
              )}
            >
              <MapKey />
            </Popover>
          </View>
          <View
            pointerEvents='box-none'
            style={{
              position: 'absolute',
              top: topInset + 8,
              // Clear of the search button and the controls under it.
              left: 72,
              right:
                isWide && hasMappedContacts && !cardsStowed
                  ? inspectorWidth + 48
                  : 16,
              alignItems: 'center',
            }}
          >
            <MapFindContacts
              hidden={searchExpanded}
              onFound={() => setFitRequest((request) => request + 1)}
            />
          </View>
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
            {/* Left, so the label stays clear of the inspector beside it. */}
            <PointerTooltip
              label={i18n.t(
                isTrackingUser
                  ? 'map_stopFollowingLocation'
                  : 'map_centerOnMyLocation'
              )}
              {...controlTooltipProps}
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
                style={mapControlStyle}
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

/** `contacts`, then those made from a dropped pin that the filters hide. */
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
}: {
  /**
   * Active contacts to pin, with the Contacts filters and sort already applied,
   * so the map and the list show the same people. Those without a location are
   * left off.
   */
  contacts: Contact[]
  renderContactRow: MapContactRowRenderer
  /** Height of any header floating over the top of the map. */
  topInset?: number
  /** The user started exploring: dragged the map or stowed the cards. */
  onExplore?: () => void
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
  // Contacts made from a dropped pin stay on the map for this visit even when
  // the filters would hide them, so a new pin doesn't vanish once saved.
  const [droppedIds, setDroppedIds] = useState<string[]>([])
  // Single O(conversations) index shared by the pin-color loop and every
  // carousel card — replaces the per-contact full-array scans that made the
  // screen take seconds to open (same pattern as the Contacts list).
  const conversationIndex = useConversationIndex(
    conversations,
    stalenessBreakpoints
  )

  // After every hook: the React Compiler can't memoize a value across one.
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
        onContactCreated={(id) => setDroppedIds((ids) => [...ids, id])}
      />
    </Wrapper>
  )
}

export default MapScreen
