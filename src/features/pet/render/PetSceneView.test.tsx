import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'
import type { PlayerInput } from '@/features/pet/art'

const runtime = vi.hoisted(() => ({ pats: 0 }))

vi.mock('@/lib/locales', async () => {
  const { I18n } = await import('i18n-js')
  const { default: en } = await import('@/locales/en-US.json')
  return { default: new I18n({ en }, { locale: 'en' }) }
})
vi.mock('react-native', () => ({ View: 'View' }))
vi.mock('@shopify/react-native-skia', () => ({
  Canvas: 'Canvas',
  Image: 'SkiaImage',
  FilterMode: { Nearest: 0 },
  MipmapMode: { None: 0 },
}))
vi.mock('react-native-reanimated', () => ({
  useReducedMotion: () => false,
  useSharedValue: <T,>(value: T) => ({ value, set: () => {} }),
}))
vi.mock('react-native-gesture-handler', () => {
  const gesture = (): Record<string, unknown> =>
    new Proxy({}, { get: (_target, _key, proxy) => () => proxy })
  return {
    Gesture: { Tap: gesture, Pan: gesture, Race: gesture },
    GestureDetector: ({ children }: { children: React.ReactNode }) => children,
  }
})
vi.mock('@/components/ui/ContextMenu', () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}))
vi.mock('@/components/ui/PointerHover', () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
  HoverTint: () => null,
}))
vi.mock('@/lib/errorTracking', () => ({
  errorTracking: { captureException: vi.fn() },
}))
vi.mock('@/lib/haptics', () => ({
  default: { success: vi.fn(), light: vi.fn() },
}))
vi.mock('@/features/pet/art', () => ({
  PET_X: 90,
  PET_Y: 70,
  RUG_GIFT_POS: [60, 80],
  SCENE_W: 180,
  SCENE_H: 100,
  VIEW_CARD: [0, 0, 180, 100],
  VISITOR_SPOTS: [[86, 52]],
  createScenePlayer: () => ({
    frame: () => ({ buffer: null }),
    isBusy: () => false,
    setReduceMotion: () => {},
  }),
}))
vi.mock('@/features/pet/lib/patTricks', () => ({
  createPetToucher: () => ({
    touch: () => {
      runtime.pats++
      return 'pat'
    },
  }),
  createRubTracker: () => ({ move: () => 0, end: () => {} }),
}))
vi.mock('@/features/pet/lib/names', () => ({ petSound: () => '' }))
vi.mock('@/features/pet/render/frameLoop', () => ({
  createFrameLoop: () => ({
    kick: () => {},
    setActive: () => {},
    setIdleStops: () => {},
    dispose: () => {},
  }),
}))
vi.mock('@/features/pet/render/PetSpeechBubble', () => ({
  default: () => null,
}))
vi.mock('@/features/pet/render/skiaImage', () => ({
  bufferToSkImage: () => null,
}))
vi.mock('@/hooks/useOnScreen', () => ({ default: () => true }))
vi.mock('@/features/pet/render/useSceneActive', () => ({
  default: () => false,
}))

import PetSceneView from '@/features/pet/render/PetSceneView'

const pet = { species: 'lamb' } as PlayerInput['pet']

const render = (input: Partial<PlayerInput>, onGiftTap?: () => void) => {
  let renderer: ReactTestRenderer | undefined
  act(() => {
    renderer = create(
      <PetSceneView
        input={{ pet, ...input } as PlayerInput}
        accessibilityLabel='Sky’s room'
        onGiftTap={onGiftTap}
      />
    )
  })
  return renderer!.root.find((node) => node.props.accessible === true)
}

const act11y = (scene: ReturnType<typeof render>, actionName: string) =>
  act(() => scene.props.onAccessibilityAction({ nativeEvent: { actionName } }))

describe('PetSceneView screen reader gift', () => {
  it('offers to pick up a gift on the rug, and keeps it', () => {
    const onGiftTap = vi.fn()
    const scene = render({ moments: { gift: 'fig' } }, onGiftTap)
    expect(scene.props.accessibilityActions).toEqual([
      { name: 'pickUpGift', label: 'Pick up the fig' },
    ])
    runtime.pats = 0
    act11y(scene, 'pickUpGift')
    expect(onGiftTap).toHaveBeenCalledTimes(1)
    expect(runtime.pats).toBe(0)
  })

  it('names every gift kind', () => {
    for (const gift of ['olive', 'fig', 'pebble', 'feather', 'lily'] as const) {
      const scene = render({ moments: { gift } }, vi.fn())
      expect(scene.props.accessibilityActions[0].label).toBe(
        `Pick up the ${gift}`
      )
    }
  })

  it('has no gift action without a gift', () => {
    const onGiftTap = vi.fn()
    const scene = render({ moments: { gift: null } }, onGiftTap)
    expect(scene.props.accessibilityActions).toBeUndefined()
    expect(render({}, onGiftTap).props.accessibilityActions).toBeUndefined()
    act11y(scene, 'pickUpGift')
    expect(onGiftTap).not.toHaveBeenCalled()
  })

  it('has no gift action where the gift cannot be taken', () => {
    const scene = render({ moments: { gift: 'olive' } })
    expect(scene.props.accessibilityActions).toBeUndefined()
  })

  it('still pats on a screen reader tap', () => {
    const onGiftTap = vi.fn()
    const scene = render({ moments: { gift: 'olive' } }, onGiftTap)
    runtime.pats = 0
    act(() => scene.props.onAccessibilityTap())
    expect(runtime.pats).toBe(1)
    expect(onGiftTap).not.toHaveBeenCalled()
  })
})
