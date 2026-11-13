import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'
import {
  NO_TERRITORY_SHARING,
  type TerritorySharing,
  TerritorySharingContext,
} from '@/features/territories/hooks/useTerritorySharing'
import BuddiesNeededRow from '@/features/territories/components/sharing/BuddiesNeededRow'

vi.mock('lucide-react-native', () => ({ UserPlus: 'UserPlus' }))
vi.mock('@/components/ui/DirectionalIcon', () => ({
  ChevronForwardIcon: 'ChevronForward',
}))
vi.mock('@/components/ui/LucideIcon', () => ({ default: 'LucideIcon' }))
vi.mock('@/components/ui/inputs/InputRowButton', () => ({
  default: 'InputRowButton',
}))
vi.mock('@/contexts/theme', () => ({
  default: () => ({ colors: { textAlt: '#888' } }),
}))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))

const render = (sharing: Partial<TerritorySharing>) => {
  const onOpenBuddies = vi.fn()
  let tree: ReactTestRenderer | undefined
  act(() => {
    tree = create(
      <TerritorySharingContext.Provider
        value={{ ...NO_TERRITORY_SHARING, ...sharing }}
      >
        <BuddiesNeededRow onOpenBuddies={onOpenBuddies} />
      </TerritorySharingContext.Provider>
    )
  })
  const row = tree!.root.findByType('InputRowButton' as never)
  return { row, onOpenBuddies }
}

describe('BuddiesNeededRow', () => {
  it('leads to setting up Buddies when this device hasn’t', () => {
    const { row, onOpenBuddies } = render({
      buddiesAvailable: true,
      buddiesSetUp: false,
      canOpenBuddies: true,
    })
    expect(row.props.label).toBe('territories.share.setUpBuddies')
    expect(row.props.sublabel).toBe(
      'territories.share.setUpBuddies_description'
    )
    row.props.onPress()
    expect(onOpenBuddies).toHaveBeenCalled()
  })

  it('asks for a buddy once Buddies is set up', () => {
    const { row } = render({
      buddiesAvailable: true,
      buddiesSetUp: true,
      canOpenBuddies: true,
    })
    expect(row.props.label).toBe('territories.share.noBuddies')
  })

  it('is plain text while Buddies can’t be opened', () => {
    const { row } = render({ buddiesAvailable: true, canOpenBuddies: false })
    expect(row.props.onPress).toBeUndefined()
    expect(row.props.children).toBe(false)
  })
})
