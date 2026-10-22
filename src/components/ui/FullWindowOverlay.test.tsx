import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const platform = vi.hoisted(() => ({ OS: 'ios' }))

vi.mock('react-native', () => ({
  Platform: platform,
  Modal: 'Modal',
  View: 'View',
  StyleSheet: { create: <T,>(s: T) => s, absoluteFill: {} },
}))
vi.mock('react-native-gesture-handler', () => ({
  GestureHandlerRootView: 'GestureHandlerRootView',
}))
vi.mock('react-native-screens', () => ({
  FullWindowOverlay: 'IOSFullWindowOverlay',
}))
vi.mock('@/stores/mmkv', () => ({
  MmkvStorage: {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  },
}))

import FullWindowOverlay from '@/components/ui/FullWindowOverlay'
import { useAppLockSession, useAppLockSettings } from '@/stores/appLock'

let renderer: ReactTestRenderer | undefined

function render(element: React.ReactElement) {
  act(() => {
    renderer = create(element)
  })
  return renderer!
}

const child = <View testID='child' />
function View(props: { testID: string }) {
  return React.createElement('Child', props)
}

beforeEach(() => {
  platform.OS = 'ios'
  useAppLockSettings.setState({ enabled: false })
  useAppLockSession.setState({ locked: false })
})

afterEach(() => {
  act(() => renderer?.unmount())
  renderer = undefined
})

describe('FullWindowOverlay on iOS', () => {
  it('keeps VoiceOver inside dialogs and takeovers', () => {
    const tree = render(
      <FullWindowOverlay onClose={() => {}}>{child}</FullWindowOverlay>
    )
    const overlay = tree.root.findByType('IOSFullWindowOverlay' as never)
    expect(overlay.props.unstable_accessibilityContainerViewIsModal).toBe(true)
    expect(tree.root.findAllByType('View' as never)).toHaveLength(0)
  })

  it('lets VoiceOver reach the app beside a toast', () => {
    const tree = render(
      <FullWindowOverlay interactive>{child}</FullWindowOverlay>
    )
    const overlay = tree.root.findByType('IOSFullWindowOverlay' as never)
    expect(overlay.props.unstable_accessibilityContainerViewIsModal).toBe(false)
    expect(tree.root.findByType('View' as never).props).toMatchObject({
      pointerEvents: 'box-none',
      accessibilityElementsHidden: false,
      importantForAccessibility: 'auto',
    })
  })

  it('hides decoration from touches and VoiceOver', () => {
    const tree = render(<FullWindowOverlay>{child}</FullWindowOverlay>)
    const overlay = tree.root.findByType('IOSFullWindowOverlay' as never)
    expect(overlay.props.unstable_accessibilityContainerViewIsModal).toBe(false)
    expect(tree.root.findByType('View' as never).props).toMatchObject({
      pointerEvents: 'none',
      accessibilityElementsHidden: true,
      importantForAccessibility: 'no-hide-descendants',
    })
  })
})

describe('FullWindowOverlay on Android', () => {
  beforeEach(() => {
    platform.OS = 'android'
  })

  it('opens dialogs in their own window', () => {
    const onClose = vi.fn()
    const tree = render(
      <FullWindowOverlay open={false} onClose={onClose}>
        {child}
      </FullWindowOverlay>
    )
    expect(tree.root.findByType('Modal' as never).props).toMatchObject({
      visible: false,
      onRequestClose: onClose,
    })
  })

  it('hides decoration from touches and TalkBack', () => {
    const tree = render(<FullWindowOverlay>{child}</FullWindowOverlay>)
    expect(tree.root.findByType('View' as never).props).toMatchObject({
      pointerEvents: 'none',
      importantForAccessibility: 'no-hide-descendants',
    })
  })
})

describe('FullWindowOverlay under App Lock', () => {
  beforeEach(() => {
    useAppLockSettings.setState({ enabled: true })
    useAppLockSession.setState({ locked: true })
  })

  it('waits to draw a toast or decoration until the app unlocks', () => {
    const tree = render(
      <FullWindowOverlay interactive>{child}</FullWindowOverlay>
    )
    expect(tree.toJSON()).toBeNull()

    act(() => useAppLockSession.setState({ locked: false }))
    expect(tree.root.findAllByType('Child' as never)).toHaveLength(1)
  })

  it('still draws dialogs, App Lock itself among them', () => {
    const tree = render(
      <FullWindowOverlay onClose={() => {}}>{child}</FullWindowOverlay>
    )
    expect(tree.root.findAllByType('Child' as never)).toHaveLength(1)
  })
})
