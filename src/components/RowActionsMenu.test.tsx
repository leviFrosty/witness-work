import React, { type ReactNode } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('lucide-react-native', () => ({
  Ellipsis: 'Ellipsis',
  Share: 'Share',
}))

vi.mock('react-native', async () => {
  const ReactModule = await import('react')
  const host =
    (name: string) =>
    ({ children, ...props }: { children?: ReactNode }) =>
      ReactModule.createElement(name, props, children)

  return {
    AccessibilityInfo: { setAccessibilityFocus: vi.fn() },
    findNodeHandle: () => null,
    Keyboard: {
      addListener: () => ({ remove: () => {} }),
      dismiss: () => {},
      isVisible: () => false,
    },
    // Stays mounted while `visible` is false, like RN's iOS Modal, which only
    // unmounts after the native dismissal fires `onDismiss`.
    Modal: host('Modal'),
    Pressable: host('Pressable'),
    ScrollView: host('ScrollView'),
    StatusBar: () => null,
    useWindowDimensions: () => ({ width: 400, height: 800 }),
    View: ReactModule.forwardRef(
      (
        { children, ...props }: { children?: ReactNode },
        ref: React.Ref<unknown>
      ) => ReactModule.createElement('View', { ...props, ref }, children)
    ),
  }
})

vi.mock('react-native-reanimated', async () => {
  const ReactModule = await import('react')
  return {
    default: {
      View: ({ children, ...props }: { children?: ReactNode }) =>
        ReactModule.createElement('AnimatedView', props, children),
    },
    useAnimatedStyle: () => ({}),
    useSharedValue: (value: number) => ({ value }),
    withTiming: (value: number) => value,
  }
})

vi.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    addListener: () => () => {},
    isFocused: () => true,
  }),
}))

vi.mock('@/contexts/theme', () => ({
  default: () => ({
    colors: {
      border: '#ddd',
      card: '#fff',
      error: '#f00',
      text: '#000',
      textAlt: '#555',
    },
    fonts: { semiBold: 'SemiBold' },
    fontSize: () => 12,
    numbers: { borderRadiusMd: 8, borderRadiusSm: 4 },
  }),
}))
vi.mock('@/components/ui/LucideIcon', () => ({ default: () => null }))
vi.mock('@/components/ui/MyText', async () => {
  const ReactModule = await import('react')
  return {
    default: ({ children }: { children?: ReactNode }) =>
      ReactModule.createElement('Text', null, children),
  }
})

import { Share as ShareIcon } from 'lucide-react-native'
import { Modal, Pressable } from 'react-native'
import RowActionsMenu from '@/components/RowActionsMenu'

const pressables = (renderer: ReactTestRenderer) =>
  renderer.root.findAllByType(Pressable)

const modal = (renderer: ReactTestRenderer) => renderer.root.findByType(Modal)

describe('RowActionsMenu', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('requestAnimationFrame', (cb: () => void) =>
      setTimeout(cb, 0)
    )
    vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  // Share.share presents UIActivityViewController on the topmost presented
  // controller. If that is still the popover's Modal, the Modal's later
  // dismissal takes the share sheet down with it and strands the Modal.
  it('runs the action only after the popover Modal has fully dismissed', () => {
    const onShare = vi.fn()
    let renderer!: ReactTestRenderer

    act(() => {
      renderer = create(
        <RowActionsMenu
          accessibilityLabel='More actions'
          actions={[
            { id: 'share', label: 'Share', icon: ShareIcon, onPress: onShare },
          ]}
        />,
        {
          createNodeMock: () => ({
            measureInWindow: (
              cb: (x: number, y: number, w: number, h: number) => void
            ) => cb(0, 0, 10, 10),
          }),
        }
      )
    })

    act(() => pressables(renderer)[0].props.onPress())
    act(() => {
      vi.runAllTimers()
    })
    expect(modal(renderer).props.visible).toBe(true)

    const [, , shareAction] = pressables(renderer)
    act(() => shareAction.props.onPress())
    act(() => {
      vi.runAllTimers()
    })

    // The Modal has been told to hide, but native hasn't finished dismissing.
    expect(modal(renderer).props.visible).toBe(false)
    expect(onShare).not.toHaveBeenCalled()

    act(() => modal(renderer).props.onDismiss())
    expect(onShare).toHaveBeenCalledTimes(1)
  })
})
