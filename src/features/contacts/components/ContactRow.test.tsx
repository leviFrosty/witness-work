import React, { type ReactNode } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'

import type { Contact } from '@/types/contact'
import type { ConversationIndex } from '@/lib/conversationIndex'

vi.mock('@/lib/locales', async () => {
  const { I18n } = await import('i18n-js')
  const { default: en } = await import('@/locales/en-US.json')
  return { default: new I18n({ en }, { locale: 'en' }) }
})
vi.mock('react-native', () => ({ View: 'View' }))
vi.mock('@/hooks/useAccessibilityTextSize', () => ({ default: () => false }))
vi.mock('lucide-react-native', () => ({
  BookOpen: 'BookOpen',
  Mail: 'Mail',
  MapPin: 'MapPin',
  MessageCircle: 'MessageCircle',
  Phone: 'Phone',
  Star: 'Star',
  Tag: 'Tag',
}))
vi.mock('@/components/ui/DirectionalIcon', () => ({
  ChevronForwardIcon: 'ChevronForward',
}))
vi.mock('@/components/ui/LucideIcon', () => ({ default: 'LucideIcon' }))
vi.mock('@/components/ui/IconButton', () => ({ default: 'IconButton' }))
vi.mock('@/contexts/theme', () => {
  const theme = { colors: {}, numbers: {} }
  return { default: () => theme }
})
vi.mock('@/components/ContactCard', async () => {
  const { createElement } = await import('react')
  return {
    default: ({ children, ...props }: { children?: ReactNode }) =>
      createElement('ContactCard', props, children),
    ContactCardBody: (props: {
      name: ReactNode
      subtitle: ReactNode
      trailing: ReactNode
    }) =>
      createElement('Body', null, props.name, props.subtitle, props.trailing),
    ContactCardSubtitle: ({ children }: { children?: ReactNode }) =>
      createElement('Subtitle', null, children),
  }
})
vi.mock('@/components/ui/ContextMenu', async () => {
  const { createElement } = await import('react')
  return {
    default: ({ children, ...props }: { children?: ReactNode }) =>
      createElement('ContextMenu', props, children),
  }
})
vi.mock('@/components/ui/SwipeableRow', () => ({
  default: ({ children }: { children?: ReactNode }) => children,
}))
vi.mock('@/lib/dates', () => ({ formatRelative: () => '3 weeks ago' }))
vi.mock('@/lib/haptics', () => ({ default: { light: vi.fn() } }))
vi.mock('@/lib/contactStaleness', () => ({ stalenessToColor: () => '#0f0' }))
vi.mock('@/hooks/useMarkerColors', () => ({ useMarkerColors: () => ({}) }))
vi.mock('@/hooks/useContactMenuActions', () => ({
  default: () => [],
  useContactRemovalActions: () => ({}),
}))
vi.mock('@/stores/preferences', () => ({
  usePreferences: (select: (s: object) => unknown) =>
    select({ dataProtectionMode: false }),
}))
vi.mock('@/features/contacts/hooks/useShareContact', () => ({
  default: () => vi.fn(),
}))
vi.mock('@/hooks/useDismissContact', () => ({
  default: () => vi.fn(),
  notNowDismissOption: {},
}))
vi.mock('@/features/contacts/components/HighlightedText', () => ({
  default: 'HighlightedText',
}))
vi.mock('@/features/contacts/components/ListSelection', () => ({
  SelectionCheck: 'SelectionCheck',
}))
vi.mock('@/features/contacts/components/swipeableActions/Archive', () => ({
  default: 'Archive',
}))
vi.mock('@/features/contacts/components/swipeableActions/Dismiss', () => ({
  default: 'Dismiss',
}))
vi.mock('@/features/contacts/components/DismissContactSheet', () => ({
  default: 'DismissContactSheet',
}))
vi.mock('@/components/ContactPreview', () => ({ default: 'ContactPreview' }))

import ContactRow from '@/features/contacts/components/ContactRow'

const contact: Contact = {
  id: 'c1',
  name: 'Jane Doe',
  address: { city: 'Springfield' },
  isFavorite: true,
  createdAt: new Date(2026, 0, 1),
} as Contact

const index = ({ studied = false } = {}) =>
  ({
    stalenessFor: () => 'fresh',
    studiedThisMonthIds: new Set(studied ? [contact.id] : []),
    studyContactIds: new Set(studied ? [contact.id] : []),
    mostRecentConvByContact: new Map([
      [contact.id, { date: new Date(2026, 8, 1) }],
    ]),
  }) as unknown as ConversationIndex

const render = (element: React.ReactElement) => {
  let renderer: ReactTestRenderer | undefined
  act(() => {
    renderer = create(element)
  })
  return renderer!.root
}

describe('ContactRow', () => {
  it('reads as one button with the second line and icons in its label', () => {
    const root = render(
      <ContactRow contact={contact} index={index({ studied: true })} />
    )
    const menu = root.findByType('ContextMenu' as never)
    expect(menu.props.accessible).toBe(true)
    expect(menu.props.accessibilityLabel).toBe(
      'Jane Doe, 3 weeks ago, Springfield, Bible study this month, Favorite'
    )

    const icons = root.findAllByType('IconButton' as never)[0].parent!
    expect(
      icons.findAllByType('IconButton' as never).map((b) => b.props.icon)
    ).toEqual(['BookOpen', 'Star', 'ChevronForward'])
    expect(icons.props.importantForAccessibility).toBe('no-hide-descendants')
    expect(icons.props.accessibilityElementsHidden).toBe(true)
  })

  it('reads a suggested section detail in place of the last visit', () => {
    const root = render(
      <ContactRow
        contact={{ ...contact, isFavorite: false }}
        index={index()}
        detail={{ text: 'Follow-up today · 12 Oak Street', tone: 'due' }}
      />
    )
    expect(
      root.findByType('ContextMenu' as never).props.accessibilityLabel
    ).toBe('Jane Doe, Follow-up today, 12 Oak Street')
  })

  it('keeps a phone or email search match left to right', () => {
    const snippetFor = (key: string, value: string) =>
      render(
        <ContactRow
          contact={contact}
          index={index()}
          searchMatches={[{ key, value, indices: [[0, 2]] }]}
        />
      )
        .findAllByType('HighlightedText' as never)
        .find((t) => t.props.text === value)!.props
    expect(snippetFor('contact.phone', '+1 415 555 0134').ltr).toBe(true)
    expect(snippetFor('contact.email', 'ada@example.com').ltr).toBe(true)

    expect(snippetFor('contact.address.line1', '12 Oak Street').ltr).toBe(false)
  })

  it('labels the checkbox the same way in Select mode', () => {
    const root = render(
      <ContactRow contact={contact} index={index()} selectionMode checked />
    )
    expect(root.findByType('ContextMenu' as never).props.accessible).toBe(false)
    const card = root.findByType('ContactCard' as never)
    expect(card.props.accessibilityRole).toBe('checkbox')
    expect(card.props.accessibilityLabel).toBe(
      'Jane Doe, 3 weeks ago, Springfield, Favorite'
    )
  })
})
