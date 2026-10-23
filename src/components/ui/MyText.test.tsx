import React from 'react'
import type { TextStyle } from 'react-native'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { flatten } = vi.hoisted(() => {
  const flatten = (style: unknown): Record<string, unknown> =>
    Array.isArray(style)
      ? Object.assign({}, ...style.map(flatten))
      : ((style as Record<string, unknown>) ?? {})
  return { flatten }
})

vi.mock('react-native', () => ({
  Platform: { OS: 'android' },
  StyleSheet: { flatten },
  Text: 'Text',
}))
vi.mock('@/contexts/theme', () => ({
  default: () => ({
    colors: { text: 'black' },
    fonts: { regular: 'Regular', semiBold: 'SemiBold' },
    fontSize: () => 16,
  }),
}))
vi.mock('@/stores/preferences', () => ({
  usePreferences: (select: (s: { fontSizeOffset: number }) => unknown) =>
    select({ fontSizeOffset: 0 }),
}))
vi.mock('@/lib/direction', () => ({ alignText: () => 'left' }))
vi.mock('@/lib/tracking', () => ({ tracking: (value: unknown) => value }))
vi.mock('@/lib/numbers', () => ({
  appDigitSystem: () => 'latn',
  formatPlainNumber: String,
}))

import Text from '@/components/ui/MyText'

let root: ReactTestRenderer

const fontFamilyOf = async (style?: TextStyle) => {
  await act(async () => {
    root = create(<Text style={style}>Hello</Text>)
  })
  return flatten(root.root.findByType('Text' as never).props.style).fontFamily
}

afterEach(async () => {
  await act(async () => root.unmount())
})

describe('Text font', () => {
  it('uses the theme regular font by default', async () => {
    expect(await fontFamilyOf()).toBe('Regular')
  })

  it('uses a family the style sets', async () => {
    expect(await fontFamilyOf({ fontFamily: 'SemiBold' })).toBe('SemiBold')
  })

  it('keeps the theme font when a style sets the family to undefined', async () => {
    // Merged last, an undefined family would drop Inter for the system font.
    expect(await fontFamilyOf({ fontFamily: undefined, color: 'red' })).toBe(
      'Regular'
    )
  })
})
