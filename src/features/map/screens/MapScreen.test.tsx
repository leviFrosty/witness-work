import React, { useImperativeHandle, useRef } from 'react'
import { act, create } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Contact } from '@/types/contact'

const mocks = vi.hoisted(() => ({
  contacts: [] as Contact[],
  listeners: new Map<string, Set<() => void>>(),
  navigate: vi.fn(),
  addListener: vi.fn(),
  updateContact: vi.fn(),
  animateCamera: vi.fn(),
  fitToSuppliedMarkers: vi.fn(),
  scrollTo: vi.fn(),
  getCurrentIndex: vi.fn(),
}))
vi.mock('@react-navigation/native', () => ({ useNavigation: () => mocks }))
vi.mock('react-native', () => ({
  View: 'View',
  Pressable: 'Pressable',
  TextInput: 'TextInput',
  StyleSheet: { absoluteFill: {} },
  useWindowDimensions: () => ({ width: 390, height: 844 }),
}))
vi.mock('react-native-maps', () => ({
  default: function MapView({ ref, ...props }: { ref: React.Ref<unknown> }) {
    useImperativeHandle(ref, () => ({
      animateCamera: mocks.animateCamera,
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
    return React.createElement('Carousel', props)
  },
}))
vi.mock('react-native-reanimated', () => ({
  default: { View: 'AnimatedView' },
  Easing: { bezier: () => undefined },
  useAnimatedStyle: () => ({}),
  useSharedValue: (value: number) => useRef({ value }).current,
  withSpring: (value: number) => value,
}))
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
  Expand: 'Expand',
  Info: 'Info',
  Layers: 'Layers',
  MapPinned: 'MapPinned',
  Navigation: 'Navigation',
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
vi.mock('@/contexts/theme', () => ({
  default: () => ({
    colors: { card: '#fff' },
    fonts: {},
    numbers: {},
    fontSize: () => 16,
  }),
}))
vi.mock('@/hooks/useDevice', () => ({ default: () => ({ isTablet: false }) }))
vi.mock('@/hooks/useAdaptiveLayout', () => ({
  default: () => ({
    isWide: false,
    hasSidebar: false,
    sidebarWidth: 0,
    contentWidth: 390,
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
vi.mock('@/features/map/components/MapCarouselCard', () => ({
  default: 'MapCarouselCard',
}))
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
vi.mock('@/features/map/components/ShareAddressSheet', () => ({
  default: 'ShareAddressSheet',
}))

import MapScreen from '@/features/map/screens/MapScreen'
import CreateContactCard from '@/features/map/components/CreateContactCard'
import MapView from 'react-native-maps'
import { Carousel } from 'react-native-reanimated-carousel'
import { Input } from 'tamagui'

let root: ReturnType<typeof create>
const screen = () => <MapScreen renderContactRow={() => null} />
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
  mocks.contacts = [contact('first', 'First'), contact('second', 'Second')]
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
