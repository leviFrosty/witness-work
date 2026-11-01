import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Fonts } from '@/constants/theme'

const a11y = vi.hoisted(() => ({
  os: 'ios',
  boldText: false,
  fontWeightAdjustment: 0,
  listeners: new Set<(value: boolean) => void>(),
  appStateListeners: new Set<(state: string) => void>(),
  loaded: new Set<string>(),
  loadAsync: vi.fn(),
}))

vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return a11y.os
    },
  },
  AppState: {
    addEventListener: (_event: string, listener: (state: string) => void) => {
      a11y.appStateListeners.add(listener)
      return { remove: () => a11y.appStateListeners.delete(listener) }
    },
  },
  AccessibilityInfo: {
    isBoldTextEnabled: async () => a11y.boldText,
    addEventListener: (event: string, listener: (value: boolean) => void) => {
      if (event === 'boldTextChanged') a11y.listeners.add(listener)
      return { remove: () => a11y.listeners.delete(listener) }
    },
  },
}))
vi.mock('expo-font', () => ({
  isLoaded: (name: string) => a11y.loaded.has(name),
  loadAsync: a11y.loadAsync,
}))
vi.mock('@expo-google-fonts/inter', () => ({ Inter_800ExtraBold: 1 }))
vi.mock('../../modules/font-weight-adjustment', () => ({
  getFontWeightAdjustment: () => a11y.fontWeightAdjustment,
}))
vi.mock('expo-device', () => ({ deviceType: 1, DeviceType: { TABLET: 2 } }))

import { fonts } from '@/constants/theme'
import { boldTextFonts } from '@/lib/boldTextFonts'
import useBoldTextFonts from '@/hooks/useBoldTextFonts'

function Probe() {
  return JSON.stringify(useBoldTextFonts())
}

const flush = () => act(async () => {})

describe('boldTextFonts', () => {
  it('steps every face one weight heavier', () => {
    expect(boldTextFonts(fonts, true)).toEqual({
      regular: 'Inter_600SemiBold',
      medium: 'Inter_700Bold',
      semiBold: 'Inter_700Bold',
      bold: 'Inter_800ExtraBold',
    })
  })

  it('keeps bold as bold until extra bold has loaded', () => {
    expect(boldTextFonts(fonts, false).bold).toBe('Inter_700Bold')
  })
})

describe('useBoldTextFonts', () => {
  let renderer: ReactTestRenderer | undefined

  beforeEach(() => {
    a11y.os = 'ios'
    a11y.boldText = false
    a11y.fontWeightAdjustment = 0
    a11y.listeners.clear()
    a11y.appStateListeners.clear()
    a11y.loaded.clear()
    a11y.loadAsync.mockReset()
    a11y.loadAsync.mockImplementation(async (map: Record<string, unknown>) => {
      for (const name of Object.keys(map)) a11y.loaded.add(name)
    })
  })

  afterEach(() => {
    act(() => renderer?.unmount())
    renderer = undefined
  })

  const fontsNow = () =>
    JSON.parse(renderer?.toJSON() as unknown as string) as Fonts

  const render = async () => {
    await act(async () => {
      renderer = create(<Probe />)
    })
    await flush()
  }

  it('uses the regular faces while Bold Text is off', async () => {
    await render()
    expect(fontsNow()).toEqual(fonts)
    expect(a11y.loadAsync).not.toHaveBeenCalled()
  })

  it('uses heavier faces when Bold Text is on at launch', async () => {
    a11y.boldText = true
    await render()
    expect(a11y.loadAsync).toHaveBeenCalledTimes(1)
    expect(fontsNow()).toEqual(boldTextFonts(fonts, true))
  })

  it('follows Bold Text as it is toggled', async () => {
    await render()
    await act(async () => {
      for (const listener of a11y.listeners) listener(true)
    })
    await flush()
    expect(fontsNow().regular).toBe('Inter_600SemiBold')
    expect(fontsNow().bold).toBe('Inter_800ExtraBold')

    await act(async () => {
      for (const listener of a11y.listeners) listener(false)
    })
    expect(fontsNow()).toEqual(fonts)
  })

  it('falls back to bold when extra bold fails to load', async () => {
    a11y.loadAsync.mockRejectedValue(new Error('missing asset'))
    a11y.boldText = true
    await render()
    expect(fontsNow()).toEqual(boldTextFonts(fonts, false))
  })

  it("follows Android's Bold text when the app comes back to the foreground", async () => {
    a11y.os = 'android'
    a11y.fontWeightAdjustment = 300
    await render()
    expect(fontsNow()).toEqual(boldTextFonts(fonts, true))

    a11y.fontWeightAdjustment = 0
    await act(async () => {
      for (const listener of a11y.appStateListeners) listener('background')
    })
    expect(fontsNow().regular).toBe('Inter_600SemiBold')
    await act(async () => {
      for (const listener of a11y.appStateListeners) listener('active')
    })
    expect(fontsNow()).toEqual(fonts)
  })
})
