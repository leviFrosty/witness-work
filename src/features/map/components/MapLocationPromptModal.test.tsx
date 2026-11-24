import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  capture: vi.fn(),
  preferences: {
    mapLocationPromptSeen: false,
    hasCompletedMapOnboarding: false,
    placeSearchLocationAsked: false,
  } as Record<string, unknown>,
}))

vi.mock('react-native', () => ({ View: 'View' }))
vi.mock('lucide-react-native', () => ({
  LocateFixed: 'LocateFixed',
  ShieldCheck: 'ShieldCheck',
  X: 'X',
}))
vi.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: mocks.request,
}))
vi.mock('@/components/ui/ActionButton', () => ({ default: 'ActionButton' }))
vi.mock('@/components/ui/Button', () => ({ default: 'Button' }))
vi.mock('@/components/ui/IconButton', () => ({ default: 'IconButton' }))
vi.mock('@/components/ui/LucideIcon', () => ({ default: 'LucideIcon' }))
vi.mock('@/components/ui/MyText', () => ({ default: 'Text' }))
vi.mock('@/components/ui/Sheet', () => {
  const Sheet = ({
    open,
    children,
    ...props
  }: {
    open: boolean
    children: React.ReactNode
  }) => (open ? React.createElement('Sheet', props, children) : null)
  Sheet.ScrollView = ({ children }: { children: React.ReactNode }) =>
    React.createElement('SheetScrollView', null, children)
  return { default: Sheet }
})
vi.mock('@/contexts/theme', () => ({
  default: () => ({
    colors: {
      accent: '#0af',
      accentTranslucent: '#0af2',
      backgroundLighter: '#222',
      text: '#fff',
      textAlt: '#aaa',
      textInverse: '#000',
    },
    fonts: { bold: 'Bold', semiBold: 'SemiBold' },
    numbers: { borderRadiusMd: 12 },
    fontSize: () => 16,
  }),
}))
vi.mock('@/lib/analytics', () => ({ analytics: { capture: mocks.capture } }))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
vi.mock('@/stores/preferences', () => ({
  usePreferences: {
    getState: () => ({
      ...mocks.preferences,
      set: (patch: Record<string, unknown>) =>
        Object.assign(mocks.preferences, patch),
    }),
  },
}))

import MapLocationPromptModal from '@/features/map/components/MapLocationPromptModal'

let root: ReactTestRenderer

beforeEach(() => {
  vi.clearAllMocks()
  mocks.preferences.mapLocationPromptSeen = false
  mocks.preferences.hasCompletedMapOnboarding = false
  mocks.preferences.placeSearchLocationAsked = false
})

afterEach(async () => {
  if (root) await act(async () => root.unmount())
})

describe('MapLocationPromptModal', () => {
  it('requests location, records preferences and analytics, and reports grant', async () => {
    mocks.request.mockResolvedValue({ granted: true })
    const onDismiss = vi.fn()
    const onResult = vi.fn()

    await act(async () => {
      root = create(
        <MapLocationPromptModal
          open
          onDismiss={onDismiss}
          onResult={onResult}
        />
      )
    })

    const allow = root.root.findByProps({ testID: 'map-location-prompt-allow' })
    await act(async () => {
      await allow.props.onPress()
    })

    expect(mocks.request).toHaveBeenCalledOnce()
    expect(mocks.capture).toHaveBeenCalledWith(
      'map_location_permission_result',
      { granted: true }
    )
    expect(mocks.preferences).toMatchObject({
      mapLocationPromptSeen: true,
      hasCompletedMapOnboarding: true,
      placeSearchLocationAsked: true,
    })
    expect(onResult).toHaveBeenCalledWith(true)
    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('marks the prompt seen without requesting permission when dismissed', async () => {
    const onDismiss = vi.fn()
    const onResult = vi.fn()

    await act(async () => {
      root = create(
        <MapLocationPromptModal
          open
          onDismiss={onDismiss}
          onResult={onResult}
        />
      )
    })

    const dismiss = root.root.findByProps({
      testID: 'map-location-prompt-dismiss',
    })
    await act(async () => {
      dismiss.props.onPress()
    })

    expect(mocks.request).not.toHaveBeenCalled()
    expect(mocks.preferences).toMatchObject({
      mapLocationPromptSeen: true,
      hasCompletedMapOnboarding: true,
      placeSearchLocationAsked: false,
    })
    expect(onDismiss).toHaveBeenCalledOnce()
    expect(onResult).not.toHaveBeenCalled()
  })
})
