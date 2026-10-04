import React, { useImperativeHandle, useRef } from 'react'
import { View } from 'react-native'
import { act, create } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Contact } from '@/types/contact'

const mocks = vi.hoisted(() => ({
  contacts: [] as Contact[],
  isWide: false,
  platform: 'ios',
  listeners: new Map<string, Set<() => void>>(),
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
vi.mock('@react-navigation/native', () => ({ useNavigation: () => mocks }))
vi.mock('react-native', () => ({
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
    return React.createElement('MapView', props)
  },
  Marker: 'Marker',
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
  useSharedValue: (value: number) => useRef({ value }).current,
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
vi.mock('@react-native-menu/menu', () => ({ MenuView: 'MenuView' }))
vi.mock('expo-blur', () => ({ BlurView: 'BlurView' }))
vi.mock('expo-glass-effect', () => ({
  GlassView: 'GlassView',
  isLiquidGlassAvailable: () => false,
}))
vi.mock('expo-crypto', () => ({ randomUUID: () => 'new-contact' }))
vi.mock('expo-location', () => ({
  getForegroundPermissionsAsync: async () => ({ granted: false }),
}))
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0 }),
}))
vi.mock('lucide-react-native', () => ({
  BookUser: 'BookUser',
  ChevronUp: 'ChevronUp',
  Expand: 'Expand',
  Info: 'Info',
  Layers: 'Layers',
  MapPinned: 'MapPinned',
  Navigation: 'Navigation',
  PanelRightClose: 'PanelRightClose',
  PanelRightOpen: 'PanelRightOpen',
  Plus: 'Plus',
  Search: 'Search',
}))
vi.mock('@/stores/contactsStore', () => ({
  default: Object.assign(
    () => ({ contacts: mocks.contacts, updateContact: mocks.updateContact }),
    { getState: () => ({ contacts: mocks.contacts }) }
  ),
}))
vi.mock('@/stores/conversationStore', () => ({
  default: () => ({ conversations: [] }),
}))
vi.mock('@/stores/preferences', () => ({
  usePreferences: () => ({ hasCompletedMapOnboarding: true }),
}))
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
vi.mock('@/lib/conversationIndex', () => ({
  buildConversationIndex: () => ({ stalenessFor: () => 'never' }),
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
vi.mock('@/components/ui/AnchoredPopover', () => ({
  default: 'AnchoredPopover',
}))
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

import MapScreen from '@/features/map/screens/MapScreen'
import CreateContactCard from '@/features/map/components/CreateContactCard'
import MapView from 'react-native-maps'
import { Carousel } from 'react-native-reanimated-carousel'
import { Input } from 'tamagui'

let root: ReturnType<typeof create>
const screen = () => (
  <MapScreen renderContactRow={() => null} onExplore={mocks.onExplore} />
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
  mocks.isWide = false
  mocks.platform = 'ios'
  mocks.contacts = [contact('first', 'First'), contact('second', 'Second')]
  mocks.contacts[1].coordinate = { latitude: 41, longitude: -73 }
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
    mocks.contacts = mocks.contacts.map((contact) => ({
      ...contact,
      coordinate,
    }))
    await act(async () => root.update(screen()))
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
        mocks.contacts.map((contact) => contact.coordinate)
      )
    }
  )

  it('frames the first contact added after an empty map becomes ready', async () => {
    mocks.contacts = []
    await act(async () => root.update(screen()))
    await act(async () => {
      const map = root.root.findByType(MapView)
      map.props.onLayout(layoutEvent)
      map.props.onMapReady()
    })
    expect(mocks.animateToRegion).not.toHaveBeenCalled()
    const saved = contact('new', 'New contact')
    mocks.contacts = [saved]
    await act(async () => root.update(screen()))
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
      mocks.contacts = [...mocks.contacts, saved]
      await act(async () => root.update(screen()))
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

describe('Dropped pin on an empty tablet map', () => {
  it('replaces the empty card in place and restores it when cancelled', async () => {
    mocks.isWide = true
    mocks.contacts = []
    await act(async () => root.update(screen()))
    const emptyCard = root.root.findAll(
      (node) => node.type === View && typeof node.props.onLayout === 'function'
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
const gestureDetectors = () =>
  root.root.findAllByType('GestureDetector' as never)
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
