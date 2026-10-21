import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const largeText = vi.hoisted(() => ({ value: false }))

vi.mock('react-native', () => ({
  Pressable: 'Pressable',
  StyleSheet: { flatten: (style: unknown) => style },
  View: 'View',
}))
vi.mock('@/contexts/theme', () => {
  const theme = {
    colors: { border: '#dddddd', error: '#ff0000', textAlt: '#666666' },
    fonts: {},
    fontSize: () => 14,
    numbers: { borderRadiusMd: 8 },
  }
  return { default: () => theme }
})
vi.mock('@/hooks/useAccessibilityTextSize', () => ({
  default: () => largeText.value,
}))
vi.mock('@/components/ui/MyText', () => ({ default: 'Text' }))
vi.mock('@/components/ui/WholeWordsText', () => ({ default: 'Text' }))
vi.mock('@/components/ui/InfoPopover', () => ({ default: 'InfoPopover' }))
vi.mock('@/components/ui/LucideIcon', () => ({ default: 'LucideIcon' }))
vi.mock('@/components/ui/Switch', () => ({ default: 'Switch' }))

import InputRowContainer from '@/components/ui/inputs/InputRowContainer'

const rowDirection = (element: React.ReactElement) => {
  let renderer: ReactTestRenderer | undefined
  act(() => {
    renderer = create(element)
  })
  const row = renderer!.root.findAll(
    (node) => (node.type as unknown) === 'View'
  )[0]
  const style = [row.props.style]
    .flat(Infinity)
    .reduce(
      (merged: Record<string, unknown>, part) => ({ ...merged, ...part }),
      {}
    )
  return style.flexDirection
}

describe('InputRowContainer', () => {
  beforeEach(() => {
    largeText.value = false
  })

  it('keeps the control beside the label at regular text sizes', () => {
    expect(
      rowDirection(
        <InputRowContainer label='Distance'>
          <></>
        </InputRowContainer>
      )
    ).toBe('row')
  })

  it('moves the control under the label at accessibility text sizes', () => {
    largeText.value = true
    expect(
      rowDirection(
        <InputRowContainer label='Distance' controlWidth='auto'>
          <></>
        </InputRowContainer>
      )
    ).toBe('column')
  })

  it('keeps a switch beside its label at accessibility text sizes', () => {
    largeText.value = true
    const Switch = 'Switch' as unknown as React.ComponentType
    expect(
      rowDirection(
        <InputRowContainer label='Round Trip'>
          <Switch />
        </InputRowContainer>
      )
    ).toBe('row')
    expect(
      rowDirection(
        <InputRowContainer label='Sync' inlineAtLargeText>
          <></>
        </InputRowContainer>
      )
    ).toBe('row')
  })
})
