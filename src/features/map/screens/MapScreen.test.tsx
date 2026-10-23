import React, { useImperativeHandle, useRef } from 'react'
import { act, create } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Contact } from '@/types/contact'

const mocks = vi.hoisted(() => ({
  isWide: false,
  platform: 'ios',
  listeners: new Map<string, Set<() => void>>(),
  locationGranted: true,
  navigate: vi.fn(),
  addListener: vi.fn(),
  updateContact: vi.fn(),
  animateCamera: vi.fn(),
  animateToRegion: vi.fn(),
  fitToCoordinates: vi.fn(),
  fitToSuppliedMarkers: vi.fn(),
  scrollTo: vi.fn(),
  getCurrentIndex: vi.fn(),
  onExplore: vi.fn(),
  appearance: {} as Record<string, unknown>,
  appStateListeners: new Set<(state: string) => void>(),
  watchPositionAsync: vi.fn(),
  removeWatch: vi.fn(),
  mapViewRenders: 0,
  markerRenders: 0,
}))
// Stands in for a rendered overlay and records the appearance it receives.
const appearanceProbe = vi.hoisted(() => (name: string) => async () => {
  const { useContext } = await import('react')
  const { ThemeContext } = await import('@/contexts/theme')
  const { GlassColorSchemeOverrideContext } = await import(
    '@/contexts/glassColorScheme'
  )
  const { MapImageryContext } = await import(
    '@/features/map/lib/mapImageryTheme'
  )
  return {
    default: function AppearanceProbe() {
      mocks.appearance[name] = {
        theme: useContext(ThemeContext),
        glass: useContext(GlassColorSchemeOverrideContext),
        imagery: useContext(MapImageryContext),
      }
      return null
    },
  }
})
vi.mock('@react-navigation/native', () => ({
  useNavigation: () => mocks,
  // Follows the `focus` and `blur` events the tests emit.
  useIsFocused: () => {
    const [focused, setFocused] = React.useState(true)
    React.useEffect(() => {
      const offFocus = mocks.addListener('focus', () => setFocused(true))
      const offBlur = mocks.addListener('blur', () => setFocused(false))
      return () => {
        offFocus()
        offBlur()
      }
    }, [])
    return focused
  },
}))
vi.mock('react-native', () => ({
  AppState: {
    currentState: 'active',
    addEventListener: (_event: string, listener: (state: string) => void) => {
      mocks.appStateListeners.add(listener)
      return { remove: () => mocks.appStateListeners.delete(listener) }
    },
  },
  I18nManager: { isRTL: false },
  Platform: {
    get OS() {
      return mocks.platform
    },
  },
  View: 'View',
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  TextInput: 'TextInput',
  StyleSheet: { absoluteFill: {}, create: (styles: object) => styles },
  useWindowDimensions: () => ({ width: 390, height: 844 }),
}))
vi.mock('react-native-maps', () => ({
  default: function MapView({ ref, ...props }: { ref: React.Ref<unknown> }) {
    useImperativeHandle(ref, () => ({
      animateCamera: mocks.animateCamera,
      animateToRegion: mocks.animateToRegion,
      fitToCoordinates: mocks.fitToCoordinates,
      fitToSuppliedMarkers: mocks.fitToSuppliedMarkers,
    }))
    mocks.mapViewRenders++
    return React.createElement('MapView', props)
  },
  Marker: function Marker(props: object) {
    mocks.markerRenders++
    return React.createElement('Marker', props)
  },
}))
vi.mock('react-native-reanimated-carousel', () => ({
  Carousel: ({
    ref,
    ...props
  }: {
    ref: React.Ref<unknown>
    defaultIndex: number
    data: unknown[]
    renderItem: (info: { item: unknown }) => React.ReactNode
  }) => {
    const index = useRef(props.defaultIndex)
    useImperativeHandle(ref, () => {
      mocks.getCurrentIndex.mockImplementation(() => index.current)
      return {
        getCurrentIndex: mocks.getCurrentIndex,
        scrollTo: (options: { index: number }) => {
          index.current = options.index
          mocks.scrollTo(options)
        },
      }
    })
    return React.createElement(
      'Carousel',
      props,
      props.renderItem({ item: props.data[index.current] })
    )
  },
}))
vi.mock('react-native-reanimated', () => ({
  default: { View: 'AnimatedView' },
  Easing: { bezier: () => undefined, inOut: () => undefined },
  useAnimatedStyle: () => ({}),
  useSharedValue: (value: number) =>
    useRef({
      value,
      get() {
        return this.value
      },
      set(next: number) {
        this.value = next
      },
    }).current,
  withSpring: (value: number) => value,
  withTiming: (value: number) => value,
}))
vi.mock('react-native-gesture-handler', () => {
  // Records the handlers so tests can play a gesture's end.
  const gesture = (type: string) => {
    const g: Record<string, unknown> = { type }
    for (const method of [
      'runOnJS',
      'activeOffsetY',
      'failOffsetX',
      'failOffsetY',
      'onUpdate',
      'enabled',
      'maxPointers',
      'minDistance',
      'onStart',
      'onFinalize',
    ])
      g[method] = () => g
    g.onEnd = (handler: unknown) => ((g.handler = handler), g)
    return g
  }
  return {
    Gesture: {
      Pan: () => gesture('pan'),
      Tap: () => gesture('tap'),
      Exclusive: (...gestures: unknown[]) => ({ gestures }),
      Simultaneous: (...gestures: unknown[]) => ({ gestures }),
    },
    GestureDetector: ({
      gesture,
      children,
    }: {
      gesture: unknown
      children: React.ReactNode
    }) => React.createElement('GestureDetector', { gesture }, children),
  }
})
vi.mock('tamagui', () => ({ Input: 'Input' }))
vi.mock('@/components/ui/BlurView', () => ({ BlurView: 'BlurView' }))
vi.mock('expo-glass-effect', () => ({
  GlassView: 'GlassView',
  isLiquidGlassAvailable: () => false,
}))
vi.mock('expo-image', () => ({ Image: 'Image' }))
vi.mock('@/components/ui/Avatar', () => ({
  default: 'Avatar',
  isRenderableImageValue: (value: string) =>
    !!value && !value.startsWith('icloud://'),
}))
vi.mock('expo-crypto', () => ({ randomUUID: () => 'new-contact' }))
vi.mock('expo-location', () => ({
  Accuracy: { BestForNavigation: 6 },
  getForegroundPermissionsAsync: async () => ({
    granted: mocks.locationGranted,
  }),
  getLastKnownPositionAsync: async () => null,
  watchPositionAsync: mocks.watchPositionAsync,
}))
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0 }),
}))
vi.mock('lucide-react-native', () => ({
  BookUser: 'BookUser',
  Check: 'Check',
  ChevronUp: 'ChevronUp',
  Clock: 'Clock',
  Expand: 'Expand',
  Info: 'Info',
  LassoSelect: 'LassoSelect',
  Layers: 'Layers',
  MapPinned: 'MapPinned',
  Navigation: 'Navigation',
  Plus: 'Plus',
  Search: 'Search',
  Star: 'Star',
}))
vi.mock('@/components/ui/DirectionalIcon', () => ({
  PanelTrailingCloseIcon: 'PanelRightClose',
  PanelTrailingOpenIcon: 'PanelRightOpen',
}))
vi.mock('@/stores/contactsStore', async () => {
  const { create } = await import('zustand')
  return {
    default: create(() => ({
      contacts: [] as Contact[],
      deletedContacts: [] as Contact[],
      customFieldDefs: [] as unknown[],
      updateContact: mocks.updateContact,
    })),
  }
})
vi.mock('@/stores/conversationStore', async () => {
  const { create } = await import('zustand')
  return {
    default: create(() => ({
      conversations: [] as unknown[],
      deletedConversations: [] as unknown[],
    })),
  }
})
vi.mock('@/stores/preferences', async () => {
  const { create } = await import('zustand')
  const usePreferences = create<Record<string, unknown>>((set) => ({
    hasCompletedMapOnboarding: true,
    mapLayer: 'standard',
    set: (partial: Record<string, unknown>) => set(partial),
  }))
  return { usePreferences }
})
vi.mock('@/contexts/theme', async () => {
  const { createContext } = await import('react')
  const theme = {
    colors: { card: '#fff' },
    fonts: {},
    numbers: {},
    fontSize: () => 16,
  }
  return { default: () => theme, ThemeContext: createContext(theme) }
})
vi.mock('@/features/map/lib/mapImageryTheme', async () => {
  const { createContext } = await import('react')
  return {
    getMapImageryTheme: (theme: object) => ({
      ...theme,
      colors: { card: '#000' },
    }),
    MapImageryContext: createContext(false),
  }
})
vi.mock('@/hooks/useDevice', () => ({
  default: () => ({ isTablet: mocks.isWide }),
}))
vi.mock('@/hooks/useAdaptiveLayout', () => ({
  default: () => ({
    isWide: mocks.isWide,
    hasSidebar: mocks.isWide,
    sidebarWidth: mocks.isWide ? 200 : 0,
    contentWidth: mocks.isWide ? 1000 : 390,
  }),
}))
vi.mock('@/hooks/useGlassColorScheme', () => ({ default: () => 'light' }))
vi.mock('@/hooks/useMarkerColors', () => ({ useMarkerColors: () => ({}) }))
vi.mock('@/lib/contactStaleness', () => ({ stalenessToColor: () => '#0f0' }))
// The test theme has no badge colors to read against.
vi.mock('@/lib/color', () => ({ getReadableTextColor: () => '#000' }))
vi.mock('@/hooks/useConversationIndex', () => ({
  default: () => ({
    mostRecentConvMs: new Map(),
    mostRecentConvByContact: new Map(),
    nextFollowUpMs: new Map(),
    missedFollowUpMs: new Map(),
    nowMs: 0,
    stalenessFor: () => 'never',
  }),
}))
vi.mock('@/lib/dates', () => ({
  formatDisplay: () => '',
  formatMonthDayCompact: () => '',
  formatTime: () => '',
}))
vi.mock('react-native-worklets', () => ({
  scheduleOnRN: (fn: (...args: unknown[]) => void, ...args: unknown[]) =>
    fn(...args),
}))
vi.mock('@/lib/address', () => ({
  addressToString: () => '',
  coordinateAsString: () => '',
}))
vi.mock('@/lib/analytics', () => ({ analytics: { capture: vi.fn() } }))
vi.mock('@/lib/haptics', () => ({ default: { light: vi.fn() } }))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
vi.mock('@/components/ui/MyText', () => ({ default: 'Text' }))
vi.mock('@/components/ui/Button', () => ({ default: 'Button' }))
vi.mock('@/components/ui/LucideIcon', () => ({ default: 'LucideIcon' }))
vi.mock('@/components/ui/layout/Wrapper', () => ({ default: 'Wrapper' }))
vi.mock('@/components/ui/PointerTooltip', () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}))
vi.mock('@/components/ui/Popover', () => ({ default: 'Popover' }))
vi.mock('@/components/ui/TabBar', () => ({ TAB_BAR_HEIGHT: 60 }))
vi.mock(
  '@/features/map/components/MapCarouselCard',
  appearanceProbe('carouselCard')
)
vi.mock('@/features/map/components/CreateContactCard', () => ({
  default: 'CreateContactCard',
}))
vi.mock('@/features/map/components/MapContactInspector', () => ({
  default: 'MapContactInspector',
}))
vi.mock('@/features/map/components/MapColorKey', () => ({
  default: 'MapColorKey',
}))
vi.mock('@/features/map/components/MapOnboarding', () => ({
  default: 'MapOnboarding',
}))
vi.mock('@/features/map/components/MapFindContacts', () => ({
  default: 'MapFindContacts',
}))
vi.mock('@/features/map/components/MapSelectionBar', () => ({
  default: 'MapSelectionBar',
}))
vi.mock('@/features/map/components/MapGroupList', () => ({
  default: 'MapGroupList',
}))
vi.mock('@/features/map/components/MapLassoPath', () => ({
  default: 'MapLassoPath',
}))
vi.mock('@/features/map/components/MapDueChip', () => ({
  default: 'MapDueChip',
}))
vi.mock('@/features/map/components/MapTodayRouteButton', () => ({
  default: 'MapTodayRouteButton',
}))

import MapScreen from '@/features/map/screens/MapScreen'
import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import { usePreferences } from '@/stores/preferences'
import CreateContactCard from '@/features/map/components/CreateContactCard'
import MapView from 'react-native-maps'
import { Carousel } from 'react-native-reanimated-carousel'
import { Input } from 'tamagui'

let root: ReturnType<typeof create>
const stored = () => useContacts.getState().contacts
const setContacts = (contacts: Contact[]) => useContacts.setState({ contacts })
// `shown` stands in for the contacts the Contacts filters let through.
const screen = (shown: Contact[] = stored()) => (
  <MapScreen
    contacts={shown}
    renderContactRow={() => null}
    onExplore={mocks.onExplore}
  />
)
const emit = (event: string) => {
  for (const listener of [...(mocks.listeners.get(event) ?? [])]) listener()
}
const contact = (id: string, name: string): Contact => ({
  id,
  name,
  createdAt: new Date(),
  coordinate: { latitude: 40, longitude: -73 },
})

beforeEach(async () => {
  vi.clearAllMocks()
  mocks.listeners.clear()
  mocks.appStateListeners.clear()
  mocks.watchPositionAsync.mockResolvedValue({ remove: mocks.removeWatch })
  mocks.locationGranted = true
  mocks.isWide = false
  mocks.platform = 'ios'
  setContacts([
    contact('first', 'First'),
    {
      ...contact('second', 'Second'),
      coordinate: { latitude: 41, longitude: -73 },
    },
  ])
  usePreferences.setState({ mapLayer: 'standard' })
  mocks.addListener.mockImplementation((event, listener) => {
    const listeners = mocks.listeners.get(event) ?? new Set()
    listeners.add(listener)
    mocks.listeners.set(event, listeners)
    return () => listeners.delete(listener)
  })
  await act(async () => {
    root = create(screen())
  })
})

afterEach(async () => {
  await act(async () => root.unmount())
})

const layoutEvent = { nativeEvent: { layout: { height: 800 } } }

async function startCreation(search: string) {
  await act(async () => root.root.findByType(Input).props.onChangeText(search))
  await act(async () =>
    root.root.findByType(MapView).props.onLongPress({
      nativeEvent: { coordinate: { latitude: 40, longitude: -73 } },
    })
  )
  await act(async () =>
    root.root.findByType(CreateContactCard).props.onCreate()
  )
  await act(async () => emit('blur'))
}

describe('Map padding readiness', () => {
  it('defers Android native padding until the map is ready, even after layout', async () => {
    mocks.platform = 'android'
    await act(async () => root.update(screen()))
    const map = () => root.root.findByType(MapView)
    expect(map().props.mapPadding).toBeUndefined()
    await act(async () => map().props.onLayout(layoutEvent))
    expect(map().props.mapPadding).toBeUndefined()
    await act(async () => map().props.onMapReady())
    expect(map().props.mapPadding).toEqual({
      top: expect.any(Number),
      right: 0,
      left: 0,
      bottom: expect.any(Number),
    })
  })

  it('keeps initial iOS padding', () => {
    expect(root.root.findByType(MapView).props.mapPadding).toBeDefined()
  })
})

describe('Map camera initialization', () => {
  it('uses street zoom for multiple contacts at the same location', async () => {
    const coordinate = { latitude: 40, longitude: -73 }
    await act(async () => {
      setContacts(stored().map((contact) => ({ ...contact, coordinate })))
      root.update(screen())
    })
    await act(async () => {
      const map = root.root.findByType(MapView)
      map.props.onMapReady()
      map.props.onLayout(layoutEvent)
    })
    expect(mocks.fitToCoordinates).not.toHaveBeenCalled()
    expect(mocks.animateToRegion).toHaveBeenCalledExactlyOnceWith(
      { ...coordinate, latitudeDelta: 0.005, longitudeDelta: 0.005 },
      225
    )
  })

  it.each([
    ['onLayout', 'onMapReady'],
    ['onMapReady', 'onLayout'],
  ])(
    'waits for both %s and %s before fitting contacts',
    async (first, second) => {
      const map = () => root.root.findByType(MapView)
      expect(mocks.fitToSuppliedMarkers).not.toHaveBeenCalled()
      expect(mocks.fitToCoordinates).not.toHaveBeenCalled()
      await act(async () => map().props[first](layoutEvent))
      expect(mocks.fitToCoordinates).not.toHaveBeenCalled()
      await act(async () => map().props[second](layoutEvent))
      expect(mocks.fitToCoordinates).toHaveBeenCalledExactlyOnceWith(
        stored().map((contact) => contact.coordinate),
        { animated: true }
      )
    }
  )

  it('on Android, fits without animating once the map has drawn', async () => {
    mocks.platform = 'android'
    await act(async () => root.unmount())
    await act(async () => {
      root = create(screen())
    })
    const map = () => root.root.findByType(MapView)
    await act(async () => {
      map().props.onLayout(layoutEvent)
      map().props.onMapReady()
    })
    expect(mocks.fitToCoordinates).not.toHaveBeenCalled()
    await act(async () => map().props.onMapLoaded())
    expect(mocks.fitToCoordinates).toHaveBeenCalledExactlyOnceWith(
      stored().map((contact) => contact.coordinate),
      { animated: false }
    )
  })

  it('frames the first contact added after an empty map becomes ready', async () => {
    await act(async () => {
      setContacts([])
      root.update(screen())
    })
    await act(async () => {
      const map = root.root.findByType(MapView)
      map.props.onLayout(layoutEvent)
      map.props.onMapReady()
    })
    expect(mocks.animateToRegion).not.toHaveBeenCalled()
    const saved = contact('new', 'New contact')
    await act(async () => {
      setContacts([saved])
      root.update(screen())
    })
    expect(mocks.animateToRegion).toHaveBeenCalledExactlyOnceWith(
      { ...saved.coordinate, latitudeDelta: 0.005, longitudeDelta: 0.005 },
      225
    )
    await act(async () => root.update(screen()))
    expect(mocks.animateToRegion).toHaveBeenCalledTimes(1)
  })
})

describe('Map carousel after contact creation', () => {
  it.each(['Second', 'no matching contacts'])(
    'reveals the new card on return when the previous search was "%s"',
    async (search) => {
      await startCreation(search)
      const saved = {
        ...contact('new-contact', 'New contact'),
        coordinate: { latitude: 0, longitude: -73.123456789 },
      }
      await act(async () => {
        setContacts([...stored(), saved])
        root.update(screen())
      })
      expect(root.root.findByType(Input).props.value).toBe(search)

      await act(async () => emit('focus'))
      const carousel = root.root.findByType(Carousel)
      expect(root.root.findByType(Input).props.value).toBe('')
      expect(carousel.props.data[mocks.getCurrentIndex()].id).toBe(saved.id)
      expect(mocks.animateCamera).toHaveBeenLastCalledWith(
        { center: saved.coordinate },
        { duration: 225 }
      )
      if (search === 'Second') {
        expect(mocks.scrollTo).toHaveBeenLastCalledWith({
          index: 2,
          animated: false,
        })
      } else {
        expect(carousel.props.defaultIndex).toBe(2)
      }
    }
  )

  it('preserves the old search and card after abandoning the form', async () => {
    await startCreation('Second')
    await act(async () => emit('focus'))
    expect(root.root.findByType(Input).props.value).toBe('Second')
    const carousel = root.root.findByType(Carousel)
    expect(carousel.props.data[mocks.getCurrentIndex()].id).toBe('second')
  })
})

describe('Map with the Contacts filters', () => {
  const pins = () =>
    root.root
      .findAllByType('Marker' as never)
      .map((marker) => marker.props.identifier)

  it('pins only the contacts the filters let through', async () => {
    await act(async () => root.update(screen([stored()[1]])))
    expect(pins()).toEqual(['second'])
  })

  it('says the filters hide every pin instead of showing the empty map', async () => {
    await act(async () => root.update(screen([])))
    expect(
      root.root.findAllByProps({
        description: 'map_noFilterResults_description',
      }).length
    ).toBeGreaterThan(0)
    expect(
      root.root.findAllByProps({ children: 'map_emptyNoContactsTitle' })
    ).toHaveLength(0)
  })

  it('keeps a contact made from a dropped pin that the filters would hide', async () => {
    const filtered = [stored()[0]]
    await act(async () => root.update(screen(filtered)))
    await startCreation('')
    await act(async () => {
      setContacts([...stored(), contact('new-contact', 'New contact')])
      root.update(screen(filtered))
    })
    await act(async () => emit('focus'))
    expect(pins()).toEqual(['first', 'new-contact'])
    const carousel = root.root.findByType(Carousel)
    expect(carousel.props.data[mocks.getCurrentIndex()].id).toBe('new-contact')
  })
})

describe('Dropped pin on an empty tablet map', () => {
  it('replaces the empty card in place and restores it when cancelled', async () => {
    mocks.isWide = true
    await act(async () => {
      setContacts([])
      root.update(screen())
    })
    const emptyCard = root.root.findAll(
      (node) =>
        String(node.type) === 'AnimatedView' &&
        typeof node.props.onLayout === 'function'
    )[0]
    const { left, bottom, width } = emptyCard.props.style
    const locationButton = () =>
      root.root.findByProps({
        accessibilityLabel: 'map_centerOnMyLocation',
      })
    const locationPlacement = locationButton().parent?.props.style

    await act(async () =>
      root.root.findByType(MapView).props.onLongPress({
        nativeEvent: { coordinate: { latitude: 40, longitude: -73 } },
      })
    )
    const card = root.root.findByType(CreateContactCard)
    expect(card.parent?.props.style).toMatchObject({ left, bottom, width })
    expect(card.parent?.props.style.right).toBeUndefined()
    expect(locationButton().parent?.props.style).toEqual(locationPlacement)
    expect(
      root.root.findAllByProps({ children: 'map_emptyNoContactsTitle' })
    ).toHaveLength(0)

    await act(async () => card.props.onCancel())
    expect(root.root.findAllByType(CreateContactCard)).toHaveLength(0)
    expect(
      root.root.findAllByProps({ children: 'map_emptyNoContactsTitle' }).length
    ).toBeGreaterThan(0)
  })
})

describe('Map layer', () => {
  it('remembers the chosen layer in preferences', async () => {
    const { default: MapLayerMenu } = await import(
      '@/features/map/components/MapLayerMenu'
    )
    await act(async () =>
      root.root.findByType(MapLayerMenu).props.onChange('hybrid')
    )

    expect(usePreferences.getState().mapLayer).toBe('hybrid')
    expect(root.root.findByType(MapLayerMenu).props.value).toBe('hybrid')
  })

  it('stays on this device instead of syncing', async () => {
    const { NON_SYNCABLE_PREFERENCE_KEYS } = await import(
      '@/lib/syncPreferencePolicy'
    )
    expect(NON_SYNCABLE_PREFERENCE_KEYS.has('mapLayer')).toBe(true)
  })
})

describe('Map store subscriptions', () => {
  const renders = () => ({
    map: mocks.mapViewRenders,
    markers: mocks.markerRenders,
  })

  it.each<[string, () => void]>([
    [
      'a contact tombstone',
      () =>
        useContacts.setState({ deletedContacts: [contact('gone', 'Gone')] }),
    ],
    [
      'a custom field definition',
      () =>
        useContacts.setState({
          customFieldDefs: [
            {
              id: 'field',
              label: 'Field',
              order: 0,
              createdAt: 0,
              updatedAt: 0,
            },
          ],
        }),
    ],
    [
      'a visit tombstone',
      () =>
        useConversations.setState({
          deletedConversations: [{ id: 'gone', deletedAt: 0 }],
        }),
    ],
    [
      'an unrelated preference',
      () => usePreferences.setState({ timeDisplayFormat: 'decimal' }),
    ],
  ])('leaves the map and its pins alone on %s', async (_, write) => {
    const before = renders()
    await act(async () => {
      write()
    })
    expect(renders()).toEqual(before)
  })

  it('re-renders the pins when a contact changes', async () => {
    const before = renders()
    await act(async () => {
      setContacts([...stored(), contact('third', 'Third')])
      root.update(screen())
    })
    expect(renders().markers).toBeGreaterThan(before.markers)
  })
})

describe('Map overlays over satellite imagery', () => {
  it('switches overlays to the imagery appearance', async () => {
    const { default: MapLayerMenu } = await import(
      '@/features/map/components/MapLayerMenu'
    )
    const appAppearance = {
      theme: expect.objectContaining({ colors: { card: '#fff' } }),
      glass: undefined,
      imagery: false,
    }
    expect(mocks.appearance.carouselCard).toEqual(appAppearance)

    await act(async () =>
      root.root.findByType(MapLayerMenu).props.onChange('satellite')
    )

    expect(mocks.appearance.carouselCard).toEqual({
      theme: expect.objectContaining({ colors: { card: '#000' } }),
      glass: 'dark',
      imagery: true,
    })
  })
})

type PanGesture = {
  type: string
  handler: (e?: { translationY: number; velocityY: number }) => void
}
// The cards' detectors; the map's own (hover and Select mode's lasso) is left
// out.
const gestureDetectors = () =>
  root.root
    .findAllByType('GestureDetector' as never)
    .filter((detector) => detector.findAllByType(MapView).length === 0)
// The cards' swipe-down gesture is the first detector; the stowed handle's
// tap/swipe-up gestures come after it.
const swipeCards = (translationY: number, velocityY = 0) =>
  act(async () =>
    (gestureDetectors()[0].props.gesture as PanGesture).handler({
      translationY,
      velocityY,
    })
  )

describe('Exploring the map', () => {
  const cardsTray = () => root.root.findByType(Carousel).parent!

  it('reports exploration when the map is dragged', async () => {
    expect(mocks.onExplore).not.toHaveBeenCalled()
    await act(async () => root.root.findByType(MapView).props.onPanDrag())
    expect(mocks.onExplore).toHaveBeenCalled()
  })

  it('stows the cards on a swipe down and brings them back on a pin tap', async () => {
    expect(cardsTray().props.pointerEvents).toBe('box-none')
    expect(
      root.root.findAllByProps({ accessibilityLabel: 'map_hideContactCards' })
    ).toHaveLength(0)

    await swipeCards(80)
    expect(cardsTray().props.pointerEvents).toBe('none')
    expect(mocks.onExplore).toHaveBeenCalled()

    const marker = root.root.findByProps({ identifier: 'second' })
    await act(async () => marker.props.onPress())
    expect(cardsTray().props.pointerEvents).toBe('box-none')
  })
})

describe('Stowed cards handle', () => {
  const stowed = () =>
    root.root.findByType(Carousel).parent!.props.pointerEvents === 'none'
  const peek = (type: string) =>
    (
      gestureDetectors()[1].props.gesture as {
        gestures: PanGesture[]
      }
    ).gestures.find((g) => g.type === type)!

  it('stows on a long swipe or a flick, not a nudge', async () => {
    await swipeCards(10, 50)
    expect(stowed()).toBe(false)
    await swipeCards(10, 800)
    expect(stowed()).toBe(true)
  })

  it('brings the cards back on a tap', async () => {
    await swipeCards(80)
    await act(async () => peek('tap').handler())
    expect(stowed()).toBe(false)
    expect(gestureDetectors()).toHaveLength(1)
  })

  it('brings the cards back on an upward swipe, not a nudge', async () => {
    await swipeCards(80)
    await act(async () =>
      peek('pan').handler({ translationY: -10, velocityY: -50 })
    )
    expect(stowed()).toBe(true)
    await act(async () =>
      peek('pan').handler({ translationY: -60, velocityY: -50 })
    )
    expect(stowed()).toBe(false)
  })
})

describe('Following my location', () => {
  const locationButton = () =>
    root.root.find(
      (node) =>
        typeof node.props.onPress === 'function' &&
        ['map_centerOnMyLocation', 'map_stopFollowingLocation'].includes(
          node.props.accessibilityLabel
        )
    )
  const following = () =>
    locationButton().props.accessibilityLabel === 'map_stopFollowingLocation'
  const follow = () => act(async () => locationButton().props.onPress())

  it('stops the location watch when the map loses focus', async () => {
    await follow()
    expect(following()).toBe(true)
    expect(mocks.removeWatch).not.toHaveBeenCalled()

    await act(async () => emit('blur'))
    expect(mocks.removeWatch).toHaveBeenCalledTimes(1)
    expect(following()).toBe(false)
  })

  it('stops the location watch when the app goes to the background', async () => {
    await follow()
    await act(async () => {
      for (const listener of mocks.appStateListeners) listener('inactive')
    })
    expect(following()).toBe(true)

    await act(async () => {
      for (const listener of mocks.appStateListeners) listener('background')
    })
    expect(mocks.removeWatch).toHaveBeenCalledTimes(1)
    expect(following()).toBe(false)
  })

  it('removes a watch that finishes starting after the map lost focus', async () => {
    let finishStarting!: (subscription: { remove: () => void }) => void
    mocks.watchPositionAsync.mockReturnValue(
      new Promise((resolve) => (finishStarting = resolve))
    )
    await follow()
    expect(mocks.watchPositionAsync).toHaveBeenCalledTimes(1)

    await act(async () => emit('blur'))
    expect(mocks.removeWatch).not.toHaveBeenCalled()
    await act(async () => finishStarting({ remove: mocks.removeWatch }))
    expect(mocks.removeWatch).toHaveBeenCalledTimes(1)
    expect(following()).toBe(false)
  })

  it('removes the location watch when the map closes', async () => {
    await follow()
    await act(async () => root.unmount())
    expect(mocks.removeWatch).toHaveBeenCalledTimes(1)
    await act(async () => {
      root = create(screen())
    })
  })
})

describe('User location dot', () => {
  const showsDot = () => root.root.findByType(MapView).props.showsUserLocation
  const setAppState = (state: string) => {
    for (const listener of [...mocks.appStateListeners]) listener(state)
  }

  it('stays off without location permission', async () => {
    mocks.locationGranted = false
    await act(async () => root.unmount())
    await act(async () => {
      root = create(screen())
    })
    expect(showsDot()).toBe(false)
  })

  it('hides while the map is out of view and comes back on return', async () => {
    expect(showsDot()).toBe(true)
    await act(async () => emit('blur'))
    expect(showsDot()).toBe(false)
    await act(async () => emit('focus'))
    expect(showsDot()).toBe(true)
  })

  it('hides while the app is in the background', async () => {
    await act(async () => setAppState('background'))
    expect(showsDot()).toBe(false)
    await act(async () => setAppState('active'))
    expect(showsDot()).toBe(true)
  })
})

describe('Select mode', () => {
  const routeActions = {
    todayStopCount: 1,
    todayContactIds: new Set(['second']),
    openTodayRoute: vi.fn(),
    planRoute: vi.fn(),
    maxStops: 30,
    supporter: true,
  }
  const bar = () => root.root.findByType('MapSelectionBar' as never)
  const tapPin = (id: string) =>
    act(async () => root.root.findByProps({ identifier: id }).props.onPress())

  beforeEach(async () => {
    await act(async () =>
      root.update(
        <MapScreen
          contacts={stored()}
          renderContactRow={() => null}
          routeActions={routeActions}
        />
      )
    )
    await act(async () =>
      root.root
        .findByProps({ accessibilityLabel: 'map_select' })
        .props.onPress()
    )
  })

  it("counts only picks not on today's route against the room it has", async () => {
    await tapPin('first')
    await tapPin('second')
    expect(bar().props).toMatchObject({
      count: 2,
      newCount: 1,
      todayStopCount: 1,
      maxStops: 30,
    })
    await tapPin('first')
    expect(bar().props).toMatchObject({ count: 1, newCount: 0 })
  })

  it('leaves picks the search hides out of the count and the route', async () => {
    await tapPin('first')
    await tapPin('second')
    await act(async () =>
      root.root.findByType(Input).props.onChangeText('Second')
    )
    expect(bar().props.count).toBe(1)
    await act(async () => bar().props.onPlanRoute())
    expect(routeActions.planRoute).toHaveBeenCalledExactlyOnceWith(['second'])
  })
})
