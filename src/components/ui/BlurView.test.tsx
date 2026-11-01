import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const a11y = vi.hoisted(() => ({
  reduceTransparency: false,
  listeners: new Set<(value: boolean) => void>(),
}))

vi.mock('react-native', () => ({
  View: 'View',
  AccessibilityInfo: {
    isReduceTransparencyEnabled: async () => a11y.reduceTransparency,
    addEventListener: (event: string, listener: (value: boolean) => void) => {
      if (event === 'reduceTransparencyChanged') a11y.listeners.add(listener)
      return { remove: () => a11y.listeners.delete(listener) }
    },
  },
}))
vi.mock('expo-blur', () => ({ BlurView: 'ExpoBlurView' }))
vi.mock('expo-device', () => ({ deviceType: 1, DeviceType: { TABLET: 2 } }))

import getThemeFromColorScheme from '@/constants/theme'
import { BlurView } from '@/components/ui/BlurView'

const light = getThemeFromColorScheme('light').colors
const dark = getThemeFromColorScheme('dark').colors

describe('BlurView', () => {
  let renderer: ReactTestRenderer | undefined

  beforeEach(() => {
    a11y.reduceTransparency = false
    a11y.listeners.clear()
  })

  afterEach(() => {
    act(() => renderer?.unmount())
    renderer = undefined
  })

  const render = async (element: React.ReactElement) => {
    await act(async () => {
      renderer = create(element)
    })
  }

  const rendered = () =>
    renderer!.root.children[0] as ReturnType<ReactTestRenderer['root']['find']>
  const fill = () =>
    (rendered().props.style as object[]).at(-1) as { backgroundColor: string }

  it('blurs while Reduce Transparency is off', async () => {
    await render(<BlurView tint='light' intensity={60} />)
    expect(rendered().type).toBe('ExpoBlurView')
    expect(rendered().props.intensity).toBe(60)
  })

  it("paints the tint appearance's card color while it's on", async () => {
    a11y.reduceTransparency = true
    await render(<BlurView tint='dark' intensity={60} />)
    expect(rendered().type).toBe('View')
    expect(fill().backgroundColor).toBe(dark.card)
  })

  it('uses the given color over the default', async () => {
    a11y.reduceTransparency = true
    await render(
      <BlurView tint='light' reducedTransparencyColor={light.background} />
    )
    expect(fill().backgroundColor).toBe(light.background)
  })

  it('follows the setting as it is toggled', async () => {
    await render(<BlurView tint='systemThickMaterialDark' />)
    await act(async () => {
      for (const listener of a11y.listeners) listener(true)
    })
    expect(rendered().type).toBe('View')
    expect(fill().backgroundColor).toBe(dark.card)

    await act(async () => {
      for (const listener of a11y.listeners) listener(false)
    })
    expect(rendered().type).toBe('ExpoBlurView')
  })
})
