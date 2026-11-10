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

    expect(flatten(field().props.style).minHeight).toBe(110)

    await act(async () => field().props.onChangeText('Ada'))
    expect(flatten(field().props.style).minHeight).not.toBe(110)
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

describe('TextInput on the web', () => {
  it('puts spellcheck and the accessible name on the element', async () => {
    platform.OS = 'web'
    const attributes = new Map<string, string>()
    const element = {
      setAttribute: (name: string, value: string) =>
        void attributes.set(name, value),
      removeAttribute: (name: string) => void attributes.delete(name),
    }
    await act(async () => {
      root = create(
        <TextInput
          multiline
          accessibilityLabel='Recovery key'
          spellCheck={false}
        />,
        { createNodeMock: () => element }
      )
    })

    expect(attributes.get('spellcheck')).toBe('false')
    expect(attributes.get('aria-label')).toBe('Recovery key')
  })

  it('gives the field its inset as padding a browser understands', async () => {
    platform.OS = 'web'
    await render({ placeholder: 'Optional' })

    const style = flatten(input().props.style)
    expect(style).toMatchObject({
      paddingTop: 10,
      paddingBottom: 10,
      paddingLeft: 16,
      paddingRight: 16,
    })
    expect(style).not.toHaveProperty('paddingHorizontal')
    expect(style).not.toHaveProperty('paddingVertical')
  })

  it("keeps a caller's spacing, with one side over an axis over the box", async () => {
    platform.OS = 'web'
    await render({
      style: {
        padding: 4,
        paddingHorizontal: 0,
        paddingLeft: 8,
        paddingEnd: 2,
        marginVertical: 6,
      },
    })

    const style = flatten(input().props.style)
    expect(style).toMatchObject({
      paddingTop: 10,
      paddingBottom: 10,
      paddingLeft: 8,
      paddingRight: 0,
      paddingInlineEnd: 2,
      marginTop: 6,
      marginBottom: 6,
    })
    for (const key of ['padding', 'paddingEnd', 'marginVertical'])
      expect(style).not.toHaveProperty(key)
  })

  it('turns a number field into text with a numeric keyboard', async () => {
    platform.OS = 'web'
    await render({ type: 'number' })
    expect(input().props).toMatchObject({ type: 'text', inputMode: 'numeric' })

    await render({ type: 'number', keyboardType: 'decimal-pad' })
    expect(input().props).toMatchObject({ type: 'text', inputMode: 'decimal' })

    await render({ type: 'number', inputMode: 'decimal' })
    expect(input().props).toMatchObject({ type: 'text', inputMode: 'decimal' })
  })

  it.each(['ios', 'android'])('keeps the number type on %s', async (os) => {
    platform.OS = os
    await render({ type: 'number' })

    expect(input().props.type).toBe('number')
    expect(input().props.inputMode).toBeUndefined()
  })

  it('leaves the style alone on iOS and Android', async () => {
    platform.OS = 'ios'
    await render({ placeholder: 'Optional' })

    expect(flatten(input().props.style)).toMatchObject({
      paddingHorizontal: 16,
      paddingVertical: 10,
    })
    expect(flatten(input().props.style)).not.toHaveProperty('paddingRight')
  })
})
