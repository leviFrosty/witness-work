import { createElement, type ReactNode } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const native = vi.hoisted(() => ({
  os: 'ios' as 'ios' | 'android',
  announce: vi.fn(),
}))

// A declaration, so the hoisted mock factories below can reach it.
function passthrough({ children }: { children?: ReactNode }) {
  return createElement('view', null, children)
}

vi.mock('react-native', () => ({
  View: passthrough,
  Image: () => null,
  Share: { share: vi.fn() },
  Platform: {
    get OS() {
      return native.os
    },
  },
  AccessibilityInfo: { announceForAccessibility: native.announce },
}))
vi.mock('@expo/ui', () => ({
  Host: passthrough,
  RNHostView: passthrough,
  Collapsible: (props: { children?: ReactNode }) =>
    createElement('collapsible', props),
}))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
vi.mock('@/contexts/theme', () => ({
  default: () => ({
    colors: { text: '#000', accent: '#00f', textAlt: '#666', border: '#ccc' },
    fonts: { semiBold: 'Semi', bold: 'Bold', regular: 'Regular' },
    numbers: { borderRadiusLg: 12 },
    fontSize: () => 16,
  }),
}))
vi.mock('@/stores/preferences', () => ({
  usePreferences: (select: (s: { colorScheme: string }) => unknown) =>
    select({ colorScheme: 'dark' }),
}))
vi.mock('@/components/ui/Card', () => ({
  default: passthrough,
  useCardStyle: () => ({}),
}))
vi.mock('@/components/ui/ContextMenu', () => ({ default: passthrough }))
vi.mock('@/components/ui/MyText', () => ({ default: passthrough }))
vi.mock('@/components/ui/IconButton', () => ({ default: () => null }))
vi.mock('@/components/ui/Button', () => ({ default: passthrough }))
vi.mock('@/components/ui/LucideIcon', () => ({ default: () => null }))
vi.mock('@/features/updates/components/AppVersionInfo', () => ({
  default: () => null,
}))
vi.mock('@tamagui/toast', () => ({ useToastController: () => ({}) }))
vi.mock('tamagui', () => ({ Input: () => null }))
vi.mock('expo-clipboard', () => ({}))
vi.mock('lucide-react-native', () => ({}))
vi.mock('@/lib/errorTracking', () => ({ errorTracking: {} }))
vi.mock('@/lib/links', () => ({ openURL: vi.fn() }))
vi.mock('@/constants/links', () => ({ default: {} }))
vi.mock('@/constants/contactInformation', () => ({ email: '' }))

import { FAQItem } from '@/features/updates/components/FAQContent'
import type { FAQEntry } from '@/features/updates/constants/faqs'

const entry = { id: 'streaks', category: 'streaks' } as unknown as FAQEntry

let renderer: ReactTestRenderer | undefined
const collapsible = () => renderer!.root.findByType('collapsible' as never)

beforeEach(() => {
  native.os = 'ios'
  native.announce.mockClear()
  act(() => {
    renderer = create(createElement(FAQItem, { entry }))
  })
})
afterEach(() => {
  act(() => renderer?.unmount())
  renderer = undefined
})

describe('FAQItem', () => {
  it('starts collapsed under its question and opens on toggle', () => {
    expect(collapsible().props.label).toBe('faq_streaks_q')
    expect(collapsible().props.isOpen).toBe(false)

    act(() => collapsible().props.onOpenChange(true))
    expect(collapsible().props.isOpen).toBe(true)

    act(() => collapsible().props.onOpenChange(false))
    expect(collapsible().props.isOpen).toBe(false)
  })

  it('leaves the state announcement to SwiftUI on iOS', () => {
    act(() => collapsible().props.onOpenChange(true))
    expect(native.announce).not.toHaveBeenCalled()
  })

  it('announces expanded and collapsed on Android', () => {
    native.os = 'android'
    act(() => collapsible().props.onOpenChange(true))
    act(() => collapsible().props.onOpenChange(false))
    expect(native.announce.mock.calls).toEqual([
      ['a11y_expanded'],
      ['a11y_collapsed'],
    ])
  })
})
