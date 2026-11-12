import { describe, expect, it } from 'vitest'
import {
  addPeople,
  findLiveLink,
  handedStreetId,
  isShareLive,
  liveShareCount,
  liveShares,
  mergeDoor,
  personShareScope,
  sharedStreets,
  sharedWithPeople,
  shareAdds,
  territoryAccess,
  workingNow,
} from '@/features/territories/lib/sharing'
import type {
  Territory,
  TerritoryDoor,
  TerritoryPerson,
  TerritoryShare,
  TerritoryStreet,
} from '@/features/territories/types/territory'

const street = (patch: Partial<TerritoryStreet> = {}): TerritoryStreet => ({
  id: 's1',
  name: 'Oak Street',
  numbering: 'both',
  next: 1,
  doors: [],
  ...patch,
})

const territory = (patch: Partial<Territory> = {}): Territory => ({
  id: 't1',
  number: '14',
  checkedOutAt: 0,
  createdAt: 0,
  streets: [street({ id: 'a' }), street({ id: 'b' })],
  doNotCalls: [],
  ...patch,
})

const ben: TerritoryPerson = {
  id: 'p-ben',
  name: 'Ben',
  kind: 'buddy',
  inboxId: 'inbox-ben',
}

const door = (patch: Partial<TerritoryDoor> = {}): TerritoryDoor => ({
  id: 'd1',
  label: '4',
  outcome: 'notHome',
  at: new Date(2026, 10, 10, 10).getTime(),
  tries: 1,
  ...patch,
})

const DAY = 24 * 60 * 60 * 1000

const person = (patch: Partial<TerritoryShare> = {}): TerritoryShare => ({
  id: 'share-1',
  kind: 'person',
  personId: 'p-ben',
  createdAt: 1,
  ...patch,
})

const link = (patch: Partial<TerritoryShare> = {}): TerritoryShare => ({
  id: 'l1',
  kind: 'link',
  createdAt: 1,
  expiresAt: 1 + DAY,
  ...patch,
})

describe('addPeople', () => {
  it('reuses the person already on the territory for the same buddy', () => {
    const first = addPeople(territory(), [ben])
    const again = addPeople(first.territory, [
      { ...ben, id: 'p-other', name: 'Benjamin' },
    ])
    expect(again.ids).toEqual(['p-ben'])
    expect(again.territory.people).toEqual([{ ...ben, name: 'Benjamin' }])
  })
})

describe('person shares', () => {
  it('reads what a person already has and whether a pick adds to it', () => {
    const three = territory({
      streets: [street({ id: 'a' }), street({ id: 'b' }), street({ id: 'c' })],
      people: [ben],
      shares: [
        person({ streetIds: ['a'] }),
        person({ id: 'share-2', streetIds: ['b'] }),
      ],
    })
    expect(personShareScope(three, 'p-ben', 2)).toEqual({
      streetIds: ['a', 'b'],
    })
    expect(personShareScope(three, 'p-other', 2)).toBeUndefined()
    expect(shareAdds(three, undefined, ['a'])).toBe(true)
    expect(shareAdds(three, {}, ['a'])).toBe(false)
    expect(shareAdds(three, {}, undefined)).toBe(false)
    expect(shareAdds(three, { streetIds: ['a', 'b'] }, ['a'])).toBe(false)
    expect(shareAdds(three, { streetIds: ['a', 'b'] }, ['b', 'c'])).toBe(true)
    expect(shareAdds(three, { streetIds: ['a'] }, undefined)).toBe(true)
  })

  it('lists who a territory is shared with until sharing ends', () => {
    const shared = territory({ people: [ben], shares: [person()] })
    expect(sharedWithPeople(shared, 2).map((entry) => entry.person.id)).toEqual(
      ['p-ben']
    )
    const ended = territory({
      people: [ben],
      shares: [person({ endedAt: 3 })],
    })
    expect(sharedWithPeople(ended, 4)).toEqual([])
  })
})

describe('link shares', () => {
  it('lasts until it expires or ends', () => {
    const share = link()
    expect(isShareLive(share, DAY)).toBe(true)
    expect(isShareLive(share, 1 + DAY)).toBe(false)
    expect(
      liveShares(territory({ shares: [link({ endedAt: 5 })] }), 6)
    ).toEqual([])
  })

  it('finds the live link for the same streets instead of making another', () => {
    const three = territory({
      streets: [street({ id: 'a' }), street({ id: 'b' }), street({ id: 'c' })],
      shares: [link(), link({ id: 'l2', streetIds: ['b', 'a'], createdAt: 2 })],
    })
    expect(findLiveLink(three, ['a', 'b'], 3)?.id).toBe('l2')
    expect(findLiveLink(three, ['a', 'b', 'c'], 3)?.id).toBe('l1')
    expect(findLiveLink(three, undefined, 3)?.id).toBe('l1')
    expect(findLiveLink(three, ['a'], 3)).toBeUndefined()
    expect(findLiveLink(three, undefined, 1 + DAY)).toBeUndefined()
  })

  it('finds a whole-territory link that names every street', () => {
    const named = territory({
      streets: [street({ id: 'a' }), street({ id: 'b' })],
      shares: [link({ streetIds: ['b', 'a'] })],
    })
    expect(findLiveLink(named, undefined, 3)?.id).toBe('l1')
    expect(findLiveLink(named, ['a'], 3)).toBeUndefined()
  })

  it('shows a link holder only the streets it covers', () => {
    const t = territory({
      streets: [
        street({ id: 'a' }),
        street({ id: 'b' }),
        street({ id: 'c', handoff: { personId: 'p-ben', at: 1 } }),
      ],
    })
    expect(sharedStreets(t, { streetIds: ['b'] }).map((s) => s.id)).toEqual([
      'b',
    ])
    expect(sharedStreets(t, {}).map((s) => s.id)).toEqual(['a', 'b'])
    expect(
      sharedStreets(t, { streetIds: ['c'], by: 'p-ben' }).map((s) => s.id)
    ).toEqual(['c'])
    expect(sharedStreets(t, { streetIds: ['c'], by: 'p-anna' })).toEqual([])
  })

  it('counts each person and each live link once', () => {
    const shared = territory({
      people: [ben],
      shares: [
        person({ streetIds: ['a'] }),
        person({ id: 'share-2', streetIds: ['b'] }),
        link({ id: 'l3' }),
      ],
    })
    expect(liveShareCount(territory(), 4)).toBe(0)
    expect(liveShareCount(shared, 4)).toBe(2)
  })
})

describe('handedStreetId', () => {
  const handed = (patch: Partial<Territory> = {}) =>
    territory({
      streets: [street({ id: 'w' })],
      received: { kind: 'handoff', from: ben, at: 1 },
      ...patch,
    })

  it('opens the one street handed to me directly', () => {
    expect(handedStreetId(handed())).toBe('w')
  })

  it('opens the territory page otherwise', () => {
    expect(handedStreetId(territory())).toBeUndefined()
    expect(
      handedStreetId(handed({ received: { kind: 'shared', from: ben, at: 1 } }))
    ).toBeUndefined()
    expect(
      handedStreetId(
        handed({ received: { kind: 'handoff', from: ben, at: 1, endedAt: 2 } })
      )
    ).toBeUndefined()
    expect(
      handedStreetId(handed({ streets: [street({ id: 'a' }), street()] }))
    ).toBeUndefined()
  })
})

describe('territoryAccess', () => {
  const from = { ...ben }
  it('tells owned, assigned and shared territories apart', () => {
    expect(territoryAccess({})).toBe('owner')
    expect(
      territoryAccess({ received: { kind: 'handoff', from, at: 1 } })
    ).toBe('assigned')
    expect(territoryAccess({ received: { kind: 'shared', from, at: 1 } })).toBe(
      'member'
    )
  })
})

describe('mergeDoor', () => {
  it('keeps the newer version of the same record', () => {
    const older = door({ outcome: 'notHome' })
    const newer = door({ outcome: 'spoke', at: older.at + 60_000, tries: 2 })
    expect(mergeDoor(older, newer)).toBe(newer)
    expect(mergeDoor(newer, older)).toBe(newer)
  })

  it('lets a do-not-call win over a later visit to the same house', () => {
    const blocked = door({ id: 'x', outcome: 'doNotCall', by: 'p-ben' })
    const later = door({ id: 'y', outcome: 'spoke', at: blocked.at + 1000 })
    expect(mergeDoor(blocked, later)).toMatchObject({
      outcome: 'doNotCall',
      by: 'p-ben',
    })
  })

  it('ends the same whichever side merges first', () => {
    const mine = door({ id: 'b', outcome: 'notHome' })
    const theirs = door({
      id: 'a',
      outcome: 'spoke',
      at: mine.at + 5000,
      by: 'p-ben',
      coordinate: { latitude: 1, longitude: 2 },
      coordinateSource: 'gps',
    })
    expect(mergeDoor(mine, theirs)).toEqual(mergeDoor(theirs, mine))
    expect(mergeDoor(mine, theirs)).toMatchObject({
      id: 'a',
      outcome: 'spoke',
      by: 'p-ben',
      tries: 1,
    })
  })

  it('counts a visit on another day as another try', () => {
    const monday = door({ id: 'a' })
    const tuesday = door({ id: 'b', at: monday.at + 24 * 60 * 60 * 1000 })
    expect(mergeDoor(monday, tuesday).tries).toBe(2)
  })
})

describe('workingNow', () => {
  it('lists people who recorded here recently, most recent first', () => {
    const now = 10_000_000
    const s = street({
      doors: [
        door({ id: '1', by: 'p-ann', at: now - 60_000 }),
        door({ id: '2', by: 'p-ben', at: now - 1_000 }),
        door({ id: '3', by: 'p-old', at: now - 2 * 60 * 60 * 1000 }),
        door({ id: '4', at: now }),
      ],
    })
    expect(workingNow(s, now)).toEqual(['p-ben', 'p-ann'])
  })
})
