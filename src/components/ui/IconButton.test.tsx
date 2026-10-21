import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('react-native', () => ({
  StyleSheet: { flatten: (style: unknown) => style },
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
  it('pads an 18pt icon to a 44pt target with minTarget', async () => {
    expect(
      await hitSlop({
        icon: XIcon,
        size: 18,
        minTarget: true,
        onPress: () => {},
      })
    ).toBe(13)
  })

  it('rounds up so an odd gap still reaches 44pt', async () => {
    expect(
      await hitSlop({
        icon: XIcon,
        size: 21,
        minTarget: true,
        onPress: () => {},
      })
    ).toBe(12)
  })

  it('adds nothing when the icon already meets the minimum', async () => {
    expect(
      await hitSlop({
        icon: XIcon,
        size: 48,
        minTarget: true,
        onPress: () => {},
      })
    ).toBe(0)
  })

  it('prefers an explicit hitSlop', async () => {
    expect(
      await hitSlop({
        icon: XIcon,
        size: 18,
        minTarget: true,
        hitSlop: 4,
        onPress: () => {},
      })
    ).toBe(4)
  })

  it('adds no slop by default', async () => {
    expect(
      await hitSlop({ icon: XIcon, size: 18, onPress: () => {} })
    ).toBeUndefined()
  })
})
