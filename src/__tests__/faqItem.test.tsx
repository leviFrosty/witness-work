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
    select(specifics: Record<string, unknown>) {
      return this.OS in specifics ? specifics[this.OS] : specifics.default
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
vi.mock('@/components/richText/RichTextView', () => ({
  default: (props: object) => createElement('richtext', props),
}))
vi.mock('@/components/richText/richTextFonts', () => ({
  useItalicFonts: () => true,
}))
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
vi.mock('@/stores/toasts', () => ({ toast: {} }))
vi.mock('tamagui', () => ({
  Input: (props: object) => createElement('input', props),
}))
vi.mock('expo-clipboard', () => ({}))
vi.mock('lucide-react-native', () => ({ Search: () => null }))
vi.mock('@/lib/errorTracking', () => ({ errorTracking: {} }))
vi.mock('@/lib/links', () => ({ openURL: vi.fn() }))
vi.mock('@/lib/direction', () => ({
  alignInput: () => 'left',
  alignText: () => 'left',
}))
vi.mock('@/constants/links', () => ({ default: {} }))
vi.mock('@/constants/contactInformation', () => ({ email: '' }))

import { FAQItem, FAQSearch } from '@/features/updates/components/FAQContent'
import { helpEntry } from '@/__tests__/helpers/helpCenterFixture'

const entry = helpEntry('streaks', 'How do streaks work?', 'Log each day.', {
  category: 'streaks',
})

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
    expect(collapsible().props.label).toBe('How do streaks work?')
    expect(collapsible().props.isOpen).toBe(false)

    act(() => collapsible().props.onOpenChange(true))
    expect(collapsible().props.isOpen).toBe(true)

    act(() => collapsible().props.onOpenChange(false))
    expect(collapsible().props.isOpen).toBe(false)
  })

  it('gives the header its expanded or collapsed state', () => {
    expect(collapsible().props.stateDescription).toBe('a11y_collapsed')

    act(() => collapsible().props.onOpenChange(true))
    expect(collapsible().props.stateDescription).toBe('a11y_expanded')
  })

  it('renders the answer as rich text', () => {
    const answer = renderer!.root.findByType('richtext' as never)
    expect(answer.props.doc).toBe(entry.doc)
    expect(answer.props.showImages).toBe(false)
  })

  it('leaves announcing the state to the screen reader', () => {
    act(() => collapsible().props.onOpenChange(true))
    act(() => collapsible().props.onOpenChange(false))
    expect(native.announce).not.toHaveBeenCalled()
  })
})

describe('FAQSearch', () => {
  it('names the field for screen readers, not just with its placeholder', () => {
    let search: ReactTestRenderer | undefined
    act(() => {
      search = create(
        createElement(FAQSearch, { search: 'roll', setSearch: () => {} })
      )
    })
    const input = search!.root.findByType('input' as never)
    expect(input.props.accessibilityLabel).toBe('faq_searchPlaceholder')
    act(() => search?.unmount())
  })
})
