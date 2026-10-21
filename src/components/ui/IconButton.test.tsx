import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  StyleSheet: {
    flatten: (style: unknown) =>
      Array.isArray(style) ? Object.assign({}, ...style) : style,
  },
  View: 'View',
}))
vi.mock('lucide-react-native', () => ({
  X: 'XIcon',
  Check: 'CheckIcon',
}))
vi.mock('@/lib/locales', () => ({
  default: { t: (key: string) => `t:${key}` },
}))
vi.mock('@/contexts/theme', () => ({
  ThemeContext: React.createContext({
    fontSize: () => 16,
    colors: { textAlt: '#999' },
  }),
}))
vi.mock('@/components/ui/Button', () => ({ default: 'Button' }))

import IconButton from '@/components/ui/IconButton'
import { X as XIcon, Check as CheckIcon } from 'lucide-react-native'

let root: ReactTestRenderer

afterEach(async () => {
  await act(async () => root.unmount())
})

const label = async (props: React.ComponentProps<typeof IconButton>) => {
  await act(async () => {
    root = create(<IconButton {...props} />)
  })
  return root.root.findByType('Button' as never).props.accessibilityLabel
}

describe('IconButton accessibility label', () => {
  it('reads the X icon as Close', async () => {
    expect(await label({ icon: XIcon, onPress: () => {} })).toBe('t:close')
  })

  it('lets a label override the X default', async () => {
    expect(
      await label({
        icon: XIcon,
        onPress: () => {},
        accessibilityLabel: 'Remove',
      })
    ).toBe('Remove')
  })

  it('gives a decorative X with no onPress no default', async () => {
    expect(await label({ icon: XIcon })).toBeUndefined()
  })

  it('leaves other icons unlabeled unless given one', async () => {
    expect(await label({ icon: CheckIcon, onPress: () => {} })).toBeUndefined()
  })
})

const hitSlop = async (props: React.ComponentProps<typeof IconButton>) => {
  await act(async () => {
    root = create(<IconButton {...props} />)
  })
  return root.root.findByType('Button' as never).props.hitSlop
}

describe('IconButton hitSlop', () => {
  it('pads an 18pt icon to a 44pt target by default', async () => {
    expect(await hitSlop({ icon: XIcon, size: 18, onPress: () => {} })).toBe(13)
  })

  it('pads a themed size from its point size', async () => {
    expect(await hitSlop({ icon: XIcon, size: 'lg', onPress: () => {} })).toBe(
      14
    )
  })

  it('rounds up so an odd gap still reaches 44pt', async () => {
    expect(await hitSlop({ icon: XIcon, size: 21, onPress: () => {} })).toBe(12)
  })

  it('adds nothing when the icon already meets the minimum', async () => {
    expect(await hitSlop({ icon: XIcon, size: 48, onPress: () => {} })).toBe(0)
  })

  it('counts the padding around the icon', async () => {
    expect(
      await hitSlop({
        icon: XIcon,
        size: 16,
        style: { padding: 7 },
        onPress: () => {},
      })
    ).toBe(7)
  })

  it('counts a fixed width and height over the icon', async () => {
    expect(
      await hitSlop({
        icon: XIcon,
        size: 16,
        style: { width: 40, height: 36, paddingHorizontal: 20 },
        onPress: () => {},
      })
    ).toEqual({ top: 4, bottom: 4, left: 2, right: 2 })
  })

  it('keeps the sides under half the gap to a neighbour', async () => {
    expect(
      await hitSlop({
        icon: XIcon,
        size: 20,
        neighborGap: 16,
        onPress: () => {},
      })
    ).toEqual({ top: 12, bottom: 12, left: 7, right: 7 })
  })

  it('keeps an odd gap clear in the middle', async () => {
    expect(
      await hitSlop({
        icon: XIcon,
        size: 12,
        neighborGap: 5,
        onPress: () => {},
      })
    ).toEqual({ top: 16, bottom: 16, left: 2, right: 2 })
  })

  it('prefers an explicit hitSlop', async () => {
    expect(
      await hitSlop({
        icon: XIcon,
        size: 18,
        neighborGap: 16,
        hitSlop: 4,
        onPress: () => {},
      })
    ).toBe(4)
  })

  it('lets hitSlop 0 opt out', async () => {
    expect(
      await hitSlop({ icon: XIcon, size: 18, hitSlop: 0, onPress: () => {} })
    ).toBe(0)
  })

  it('counts the border around the icon', async () => {
    expect(
      await hitSlop({
        icon: XIcon,
        size: 13,
        style: { padding: 7, borderWidth: 1 },
        onPress: () => {},
      })
    ).toBe(8)
  })
})

describe('IconButton frame', () => {
  const render = async (props: React.ComponentProps<typeof IconButton>) => {
    await act(async () => {
      root = create(<IconButton {...props} />)
    })
    return root.root.findByType('Button' as never)
  }

  it('grows a 30pt circle to a real 44pt frame that takes up 30pt', async () => {
    const look = { padding: 7, borderRadius: 999, backgroundColor: '#eee' }
    const button = await render({
      icon: XIcon,
      size: 16,
      frame: true,
      style: look,
      onPress: () => {},
    })
    expect(button.props.style).toEqual([
      expect.objectContaining({
        width: 44,
        height: 44,
        marginHorizontal: -7,
        marginVertical: -7,
      }),
      { borderRadius: 999 },
    ])
    expect(button.props.hitSlop).toBe(0)
    // The look is drawn inside the frame.
    expect(button.findByType('View' as never).props.style).toBe(look)
  })
})
