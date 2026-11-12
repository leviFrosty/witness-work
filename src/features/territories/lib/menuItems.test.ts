import { describe, expect, it } from 'vitest'
import {
  streetMenuItems,
  territoryMapTarget,
  territoryMenuItems,
} from '@/features/territories/lib/menuItems'
import type {
  Territory,
  TerritoryReceived,
  TerritoryStreet,
} from '@/features/territories/types/territory'

const street = (patch: Partial<TerritoryStreet> = {}): TerritoryStreet => ({
  id: 's1',
  name: 'Oak Street',
  numbering: 'even',
  next: 12,
  doors: [],
  ...patch,
})

const territory = (patch: Partial<Territory> = {}): Territory => ({
  id: 't1',
  number: '14',
  checkedOutAt: 0,
  createdAt: 0,
  streets: [street()],
  doNotCalls: [],
  coordinate: { latitude: 40, longitude: -75 },
  ...patch,
})

const received = (
  patch: Partial<TerritoryReceived> = {}
): TerritoryReceived => ({
  kind: 'shared',
  from: { id: 'p1', name: 'Sam Rivera', kind: 'buddy' },
  at: 0,
  ...patch,
})

const visible = { privacy: false }

describe('territoryMenuItems', () => {
  it('offers an owner every action on a checked-out territory', () => {
    expect(territoryMenuItems(territory(), visible)).toEqual([
      'map',
      'directions',
      'share',
      'notes',
      'edit',
      'return',
      'delete',
    ])
  })

  it('keeps a returned territory to what still applies', () => {
    expect(territoryMenuItems(territory({ finishedAt: 5 }), visible)).toEqual([
      'map',
      'directions',
      'edit',
      'reopen',
      'checkOutAgain',
      'delete',
    ])
  })

  it('hides notes in privacy mode and with no streets', () => {
    expect(territoryMenuItems(territory(), { privacy: true })).not.toContain(
      'notes'
    )
    expect(
      territoryMenuItems(territory({ streets: [] }), visible)
    ).not.toContain('notes')
  })

  it('leaves out the map and directions when there is nothing to show', () => {
    const items = territoryMenuItems(
      territory({ coordinate: undefined }),
      visible
    )
    expect(items).not.toContain('map')
    expect(items).not.toContain('directions')
  })

  it('opens the link when the territory has only a map link', () => {
    const linked = territory({
      coordinate: undefined,
      link: 'https://maps.example.com/t14',
    })
    expect(territoryMenuItems(linked, visible)).toContain('map')
    expect(territoryMapTarget(linked, false)).toEqual({
      kind: 'link',
      url: 'https://maps.example.com/t14',
    })
  })

  it('shows the card when the territory has only a photo', () => {
    expect(
      territoryMapTarget(
        territory({ coordinate: undefined, photo: 'card.jpg' }),
        false
      )
    ).toEqual({ kind: 'card', streetId: undefined })
  })

  it('gives a member of a shared territory no owner actions', () => {
    expect(
      territoryMenuItems(territory({ received: received() }), visible)
    ).toEqual(['map', 'directions', 'notes', 'leave'])
  })

  it('lets someone handed a street share it but not edit or return', () => {
    expect(
      territoryMenuItems(
        territory({
          received: received({ kind: 'handoff', streetIds: ['s1'] }),
        }),
        visible
      )
    ).toEqual(['map', 'directions', 'share', 'notes', 'leave'])
  })

  it('stops sharing once the sharer has ended it', () => {
    expect(
      territoryMenuItems(
        territory({ received: received({ kind: 'handoff', endedAt: 9 }) }),
        visible
      )
    ).not.toContain('share')
  })
})

describe('streetMenuItems', () => {
  const options = { privacy: false, buddiesAvailable: true }

  it('offers an owner every street action', () => {
    expect(streetMenuItems(territory(), street(), options)).toEqual([
      'markWorked',
      'map',
      'share',
      'handOff',
      'notes',
      'edit',
      'delete',
    ])
  })

  it('offers Mark Not Worked on a worked street', () => {
    const items = streetMenuItems(territory(), street({ workedAt: 3 }), options)
    expect(items).toContain('markNotWorked')
    expect(items).not.toContain('markWorked')
  })

  it('needs buddies to hand off', () => {
    expect(
      streetMenuItems(territory(), street(), {
        ...options,
        buddiesAvailable: false,
      })
    ).not.toContain('handOff')
  })

  it('keeps a handed-off street to the map and editing', () => {
    expect(
      streetMenuItems(
        territory(),
        street({ handoff: { personId: 'p1', at: 0 } }),
        options
      )
    ).toEqual(['map', 'edit', 'delete'])
  })

  it('keeps marking worked but drops notes in privacy mode', () => {
    expect(
      streetMenuItems(territory(), street(), { ...options, privacy: true })
    ).toEqual(['markWorked', 'map', 'share', 'handOff', 'edit', 'delete'])
  })

  it('offers nothing that changes a returned territory', () => {
    expect(
      streetMenuItems(territory({ finishedAt: 5 }), street(), options)
    ).toEqual(['map'])
  })

  it('leaves out the map when the territory has none', () => {
    expect(
      streetMenuItems(territory({ coordinate: undefined }), street(), options)
    ).not.toContain('map')
  })

  it('lets a member share only the streets they hold', () => {
    const member = territory({
      received: received({ streetIds: ['s2'] }),
      streets: [street(), street({ id: 's2', name: 'Elm Street' })],
    })
    expect(streetMenuItems(member, street(), options)).toEqual([
      'markWorked',
      'map',
      'notes',
    ])
    expect(streetMenuItems(member, street({ id: 's2' }), options)).toEqual([
      'markWorked',
      'map',
      'share',
      'notes',
    ])
  })
})
