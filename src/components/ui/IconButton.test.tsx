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
