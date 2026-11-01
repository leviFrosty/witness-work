import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'

import type { NotificationItem } from '@/types/notifications'

vi.mock('@/lib/locales', async () => {
  const { I18n } = await import('i18n-js')
  const { default: en } = await import('@/locales/en-US.json')
  return { default: new I18n({ en }, { locale: 'en' }) }
})
vi.mock('react-native', () => ({ Pressable: 'Pressable', View: 'View' }))
vi.mock('lucide-react-native', () => ({ Bell: 'Bell', X: 'X' }))
vi.mock('@/components/toast/UnlockArtTile', () => ({
  default: 'UnlockArtTile',
  UNLOCK_ART_SIZE: 52,
}))
vi.mock('@/components/ui/Button', () => ({ default: 'Button' }))
vi.mock('@/components/ui/IconButton', () => ({ default: 'IconButton' }))
vi.mock('@/components/ui/touchTarget', () => ({ touchTargetFrame: () => ({}) }))
vi.mock('@/components/ui/LucideIcon', () => ({ default: 'LucideIcon' }))
vi.mock('@/components/ui/MyText', () => ({ default: 'Text' }))
vi.mock('@/components/ui/layout/XView', () => ({ default: 'XView' }))
vi.mock('@/contexts/theme', () => {
  const theme = {
    colors: {},
    fonts: {},
    numbers: {},
    fontSize: () => 14,
  }
  return { default: () => theme }
})
vi.mock('@/lib/dates', () => ({ formatRelative: () => 'a day ago' }))

const { default: NotificationRow } = await import('./NotificationRow')

function render(item: NotificationItem) {
  const onAction = vi.fn()
  const onDismiss = vi.fn()
  let tree!: ReactTestRenderer
  act(() => {
    tree = create(
      <NotificationRow
        item={item}
        at={0}
        unread
        last
        onAction={onAction}
        onDismiss={onDismiss}
      />
    )
  })
  const row = tree.root.findByType('Pressable' as never)
  const perform = (actionName: string) =>
    act(() => row.props.onAccessibilityAction({ nativeEvent: { actionName } }))
  return { tree, row, perform, onAction, onDismiss }
}

const action = (id: string) => ({ id, label: id, onPress: vi.fn() })

describe('NotificationRow', () => {
  it('offers the second action and Dismiss to screen readers', () => {
    const secondary = action('Not Now')
    const { row, perform, onAction, onDismiss } = render({
      id: 'calendar_sync_intro',
      kind: 'calendar_sync',
      title: 'Follow-ups in Your Calendar',
      actions: [action('Add to Calendar'), secondary],
    })

    expect(row.props.accessibilityActions).toEqual([
      { name: 'secondary', label: 'Not Now' },
      { name: 'dismiss', label: 'Dismiss' },
    ])
    perform('secondary')
    expect(onAction).toHaveBeenCalledWith(secondary)
    perform('dismiss')
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it("keeps a row without actions enabled, so it isn't read as dimmed", () => {
    const { row, perform, onDismiss } = render({
      id: 'announcement:test',
      kind: 'announcement',
      title: 'An announcement',
    })

    expect(row.props.disabled).toBeUndefined()
    expect(row.props.onPress).toBeUndefined()
    expect(row.props.accessibilityActions).toEqual([
      { name: 'dismiss', label: 'Dismiss' },
    ])
    perform('dismiss')
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
  it("previews an unlock's art in place of the icon, as its toast did", () => {
    const art = vi.fn(() => null)
    const { tree } = render({
      id: 'pet_unlock:hat:beret',
      kind: 'pet_unlock',
      title: 'New hat: Beret',
      art,
      actions: [action('View')],
    })

    expect(tree.root.findByType('UnlockArtTile' as never).props.art).toBe(art)
    expect(tree.root.findAllByType('LucideIcon' as never)).toHaveLength(0)

    const actions = tree.root
      .findAllByType('XView' as never)
      .find((view) => view.props.style?.paddingLeft !== undefined)
    expect(actions?.props.style.paddingLeft).toBe(62)
  })
})
