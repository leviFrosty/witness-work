import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const largeText = vi.hoisted(() => ({ value: false }))

vi.mock('react-native', () => ({
  Platform: { OS: 'web' },
  Pressable: 'Pressable',
  StyleSheet: {
    absoluteFill: { position: 'absolute' },
    flatten: (style: unknown) => style,
  },
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
vi.mock('@/components/ui/PointerHover', () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
  HoverTint: () => null,
}))

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

  describe('screen readers', () => {
    const labelHolders = (element: React.ReactElement) => {
      let renderer: ReactTestRenderer | undefined
      act(() => {
        renderer = create(element)
      })
      const label = renderer!.root.find(
        (node) =>
          (node.type as unknown) === 'Text' && node.props.children === 'Topic'
      )
      const holders = []
      for (let node = label.parent; node; node = node.parent) {
        holders.push(node)
      }
      return holders
    }
    const hidden = (element: React.ReactElement) =>
      labelHolders(element).some(
        (node) =>
          node.props.importantForAccessibility === 'no-hide-descendants' &&
          node.props.accessibilityElementsHidden === true
      )

    it('reads a plain label', () => {
      expect(
        hidden(
          <InputRowContainer label='Topic'>
            <></>
          </InputRowContainer>
        )
      ).toBe(false)
    })

    it("skips a label its control reads, so the name isn't read twice", () => {
      expect(
        hidden(
          <InputRowContainer label='Topic' labelReadByControl>
            <></>
          </InputRowContainer>
        )
      ).toBe(true)

      const holders = labelHolders(
        <InputRowContainer label='Topic' onLabelPress={() => {}}>
          <></>
        </InputRowContainer>
      )
      const pressable = holders.find(
        (node) => (node.type as unknown) === 'Pressable'
      )
      expect(pressable?.props).toMatchObject({
        accessible: false,
        importantForAccessibility: 'no-hide-descendants',
      })
      expect(pressable?.props.accessibilityRole).toBeUndefined()
    })

    it('skips a description its control reads as a hint', () => {
      const description = (descriptionReadByControl: boolean) => {
        let renderer: ReactTestRenderer | undefined
        act(() => {
          renderer = create(
            <InputRowContainer
              label='Topic'
              description='Shown under the label'
              descriptionReadByControl={descriptionReadByControl}
            >
              <></>
            </InputRowContainer>
          )
        })
        return renderer!.root.find(
          (node) => node.props.children === 'Shown under the label'
        ).props
      }
      expect(description(false).importantForAccessibility).toBeUndefined()
      expect(description(true).importantForAccessibility).toBe(
        'no-hide-descendants'
      )
    })
  })
})

describe('InputRowContainer with onRowPress', () => {
  let renderer: ReactTestRenderer | undefined

  afterEach(() => {
    act(() => renderer?.unmount())
    renderer = undefined
  })

  const render = (
    props: Partial<React.ComponentProps<typeof InputRowContainer>>
  ) => {
    act(() => {
      renderer = create(
        <InputRowContainer
          label='Saved it'
          description='Somewhere safe'
          {...props}
        >
          {React.createElement('Switch')}
        </InputRowContainer>
      )
    })
    return renderer!.root
  }

  it('presses from a target behind the whole row', () => {
    const onRowPress = vi.fn()
    const target = render({ onRowPress }).findByType('Pressable' as never)
    expect(target.props.style).toContainEqual({ position: 'absolute' })
    expect(target.props.tabIndex).toBe(-1)
    act(() => target.props.onPress())
    expect(onRowPress).toHaveBeenCalledOnce()
  })

  it('lets taps on the text through, and keeps the controls on top', () => {
    const root = render({ onRowPress: vi.fn(), info: 'More' })
    for (const text of root.findAllByType('Text' as never))
      expect(text.props.pointerEvents ?? text.parent?.props.pointerEvents).toBe(
        'none'
      )

    const target = root.findByType('Pressable' as never)
    expect(target.findAllByType('Switch' as never)).toHaveLength(0)
    expect(target.findAllByType('InfoPopover' as never)).toHaveLength(0)
    expect(root.findAllByType('InfoPopover' as never)).toHaveLength(1)
  })

  it('has no row target without onRowPress', () => {
    expect(render({}).findAllByType('Pressable' as never)).toHaveLength(0)
  })
})
