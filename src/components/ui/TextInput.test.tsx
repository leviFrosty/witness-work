import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { platform, flatten } = vi.hoisted(() => {
  const flatten = (style: unknown): Record<string, unknown> =>
    Array.isArray(style)
      ? Object.assign({}, ...style.map(flatten))
      : ((style as Record<string, unknown>) ?? {})
  return { platform: { OS: 'android' }, flatten }
})

vi.mock('react-native', () => ({
  I18nManager: { isRTL: false },
  Platform: platform,
  StyleSheet: { flatten, absoluteFill: { position: 'absolute' } },
  Text: 'Text',
  View: 'View',
}))
vi.mock('tamagui', () => ({ Input: 'Input', TextArea: 'TextArea' }))
vi.mock('@/lib/tracking', () => ({ tracking: (value: unknown) => value }))
vi.mock('@/contexts/theme', () => ({
  default: () => ({
    colors: { textAlt: 'gray', border: 'silver', error: 'red' },
    numbers: { borderRadiusMd: 10 },
    fonts: { regular: 'Regular' },
    fontSize: () => 16,
  }),
}))

import TextInput, { type TextInputProps } from '@/components/ui/TextInput'

let root: ReactTestRenderer

const render = async (props: TextInputProps) => {
  await act(async () => {
    root = create(<TextInput {...props} />)
  })
}
const input = () => root.root.findByType('Input' as never)
const overlay = () => root.root.findAllByType('Text' as never)

beforeEach(() => {
  platform.OS = 'android'
})

afterEach(async () => {
  await act(async () => root.unmount())
})

describe('TextInput placeholder on Android', () => {
  it('keeps the label as the accessible name and the placeholder as the hint', async () => {
    await render({
      accessibilityLabel: 'Name',
      placeholder: "What's their name?",
    })

    expect(input().props.placeholder).toBeUndefined()
    expect(input().props.accessibilityLabel).toBe('Name')
    expect(input().props.accessibilityHint).toBe("What's their name?")
    expect(overlay()).toHaveLength(1)
    expect(overlay()[0].props.children).toBe("What's their name?")
  })

  it('hides the drawn placeholder once the field has text', async () => {
    const onChangeText = vi.fn()
    await render({
      accessibilityLabel: 'Name',
      placeholder: "What's their name?",
      onChangeText,
    })

    await act(async () => input().props.onChangeText('Ada'))

    expect(onChangeText).toHaveBeenCalledWith('Ada')
    expect(overlay()).toHaveLength(0)
    expect(input().props.accessibilityHint).toBeUndefined()
  })

  it('moves outer layout to the wrapper so the field keeps its size', async () => {
    await render({
      accessibilityLabel: 'Name',
      placeholder: "What's their name?",
      style: { width: '100%', flex: 1, marginTop: 4, color: 'black' },
    })

    const wrapper = root.root.findAllByType('View' as never)[0]
    expect(wrapper.props.style).toEqual({
      width: '100%',
      flex: 1,
      marginTop: 4,
    })
    expect(flatten(input().props.style)).not.toHaveProperty('width')
    expect(flatten(input().props.style)).toMatchObject({ color: 'black' })
  })

  it('grows a multiline field to fit a placeholder that wraps', async () => {
    await render({
      accessibilityLabel: 'Name',
      placeholder: "What's their name?",
      multiline: true,
    })
    const field = () => root.root.findByType('TextArea' as never)

    expect(overlay()[0].props.numberOfLines).toBeUndefined()
    await act(async () =>
      overlay()[0].props.onLayout({ nativeEvent: { layout: { height: 90 } } })
    )
    // 90 tall text plus 10 padding and a 1 pt border on each side.
    expect(flatten(field().props.style).minHeight).toBe(112)

    await act(async () => field().props.onChangeText('Ada'))
    expect(flatten(field().props.style).minHeight).not.toBe(112)
  })

  it('uses the native placeholder when it already is the label', async () => {
    await render({ accessibilityLabel: 'Search', placeholder: 'Search' })

    expect(input().props.placeholder).toBe('Search')
    expect(overlay()).toHaveLength(0)
  })

  it('leaves iOS on the native placeholder', async () => {
    platform.OS = 'ios'
    await render({
      accessibilityLabel: 'Name',
      placeholder: "What's their name?",
    })

    expect(input().props.placeholder).toBe("What's their name?")
    expect(input().props.accessibilityHint).toBeUndefined()
    expect(overlay()).toHaveLength(0)
  })
})

describe('TextInput validation outline', () => {
  it.each(['ios', 'android'])(
    'outlines a borderless invalid field on %s and clears when corrected',
    async (os) => {
      platform.OS = os
      const props = {
        accessibilityLabel: 'Name',
        placeholder: 'Enter name',
        style: { borderWidth: 0, borderColor: 'transparent' },
      }
      await render({ ...props, invalid: true })
      expect(input().props.borderColor).toBe('red')
      expect(input().props.borderWidth).toBe(1)
      expect(input().props.invalid).toBeUndefined()
      await act(async () =>
        root.update(<TextInput {...props} invalid={false} />)
      )
      expect(input().props.borderColor).toBe('transparent')
      expect(input().props.borderWidth).toBe(0)
    }
  )
})

describe('TextInput focus', () => {
  it('passes autoFocus on as the native focus Tamagui reads', async () => {
    await render({ autoFocus: true })

    expect(input().props.autoFocusNative).toBe(true)
  })

  it('keeps an explicit autoFocusNative', async () => {
    await render({ autoFocus: true, autoFocusNative: false })

    expect(input().props.autoFocusNative).toBe(false)
  })
})

describe('TextInput font', () => {
  it('keeps the theme font when a style sets the family to undefined', async () => {
    await render({ style: { fontFamily: undefined, color: 'black' } })

    expect(flatten(input().props.style).fontFamily).toBe('Regular')
  })

  it('uses a family the style sets', async () => {
    await render({ style: { fontFamily: 'Bold' } })

    expect(flatten(input().props.style).fontFamily).toBe('Bold')
  })
})
