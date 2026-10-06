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
  Platform: platform,
  StyleSheet: { flatten, absoluteFill: { position: 'absolute' } },
  Text: 'Text',
  View: 'View',
}))
vi.mock('tamagui', () => ({ Input: 'Input', TextArea: 'TextArea' }))
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
