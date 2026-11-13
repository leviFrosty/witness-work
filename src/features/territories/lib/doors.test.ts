import { describe, expect, it } from 'vitest'
import {
  checkOutAgain,
  clearDoorRecords,
  countsAsAnotherTry,
  doNotCallAt,
  doorCounts,
  doorsInWalkingOrder,
  finishTerritory,
  sharesWithOthers,
  isOverdue,
  logDoor,
  nextStreet,
  territoryWorkState,
  removeDoNotCall,
  removeStreet,
  reopenTerritory,
  returnBy,
  saveStreet,
  startNumber,
  stepNumber,
  streetDoNotCalls,
  switchSide,
  territoryCounts,
  territoryDoNotCalls,
} from '@/features/territories/lib/doors'
import type {
  Territory,
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
  streets: [],
  doNotCalls: [],
  ...patch,
})

const address = (s: Pick<TerritoryStreet, 'name'>, d: { label: string }) =>
  `${d.label} ${s.name}`

describe('startNumber', () => {
  it('moves the start onto the side being worked', () => {
    expect(startNumber('even', 11)).toBe(12)
    expect(startNumber('odd', 12)).toBe(13)
    expect(startNumber('both', 12)).toBe(12)
  })

  it('starts counting at 1 where there are no house numbers', () => {
    expect(startNumber('none', 40)).toBe(1)
    expect(startNumber('both')).toBe(1)
  })
})

describe('stepNumber', () => {
  it('skips the other side of the street', () => {
    expect(stepNumber(street(), 12, 1)).toBe(14)
    expect(stepNumber(street({ numbering: 'both' }), 12, 1)).toBe(13)
  })

  it('never goes below 1', () => {
    expect(stepNumber(street(), 2, -1)).toBe(1)
  })
})

describe('logDoor', () => {
  it('records the door and moves to the next number', () => {
    const next = logDoor(street(), {
      id: 'd1',
      label: '12',
      outcome: 'notHome',
      at: 100,
    })
    expect(next.doors).toEqual([
      { id: 'd1', label: '12', outcome: 'notHome', at: 100, tries: 1 },
    ])
    expect(next.next).toBe(14)
  })

  it('counts down when the street is walked the other way', () => {
    const next = logDoor(street({ descending: true }), {
      id: 'd1',
      label: '12',
      outcome: 'spoke',
      at: 100,
    })
    expect(next.next).toBe(10)
  })

  const DAY = 24 * 60 * 60 * 1000

  it('counts another try when a door is called on again another day', () => {
    const first = logDoor(street(), {
      id: 'd1',
      label: '12',
      outcome: 'notHome',
      at: 100,
    })
    const again = logDoor(
      { ...first, next: 20 },
      { id: 'd2', label: '12', outcome: 'spoke', at: 100 + 2 * DAY }
    )
    expect(again.doors).toEqual([
      { id: 'd1', label: '12', outcome: 'spoke', at: 100 + 2 * DAY, tries: 2 },
    ])
    expect(again.next).toBe(14)
  })

  it('corrects the outcome without another try on the same day', () => {
    const first = logDoor(street(), {
      id: 'd1',
      label: '12',
      outcome: 'doNotCall',
      at: 100,
    })
    const fixed = logDoor(first, {
      id: 'd2',
      label: '12',
      outcome: 'notHome',
      at: 200,
    })
    expect(fixed.doors).toEqual([
      { id: 'd1', label: '12', outcome: 'notHome', at: 200, tries: 1 },
    ])
  })

  it('moves on to the next house that has no record', () => {
    const worked = street({
      next: 12,
      doors: [
        { id: 'a', label: '12', outcome: 'notHome', at: 1, tries: 1 },
        { id: 'b', label: '14', outcome: 'spoke', at: 1, tries: 1 },
      ],
    })
    const next = logDoor(worked, {
      id: 'c',
      label: '12',
      outcome: 'spoke',
      at: 2,
    })
    expect(next.next).toBe(16)
  })

  const log = (from: TerritoryStreet, label: string) =>
    logDoor(from, { id: label, label, outcome: 'notHome', at: 1 })

  it('follows a house filled in behind', () => {
    expect(log(street({ next: 20 }), '14').next).toBe(16)
  })

  it('follows the last number entered, not the furthest', () => {
    const both = street({ numbering: 'both', next: 1 })
    const far = log(both, '100')
    expect(far.next).toBe(101)
    expect(log(far, '5').next).toBe(6)
  })

  it('follows the last number on one side of the street', () => {
    const even = log(street({ next: 2 }), '100')
    expect(even.next).toBe(102)
    expect(log(even, '6').next).toBe(8)
    const odd = log(street({ numbering: 'odd', next: 1 }), '101')
    expect(odd.next).toBe(103)
    expect(log(odd, '5').next).toBe(7)
  })

  it('follows the last number down a street walked the other way', () => {
    const down = log(street({ numbering: 'both', descending: true }), '5')
    expect(down.next).toBe(4)
    expect(log(down, '100').next).toBe(99)
    const evenDown = log(street({ descending: true, next: 4 }), '4')
    expect(log(evenDown, '50').next).toBe(48)
  })

  it('skips recorded doors after the last number', () => {
    let worked = street({ numbering: 'both', next: 1 })
    for (const label of ['6', '7', '9', '100']) worked = log(worked, label)
    expect(worked.next).toBe(101)
    const back = log(worked, '5')
    expect(back.next).toBe(8)
    expect(log({ ...back, descending: true }, '8').next).toBe(4)
  })

  it('lands on this side after a number from the other side', () => {
    expect(log(street({ next: 2 }), '5').next).toBe(6)
    expect(log(street({ next: 2, descending: true }), '5').next).toBe(4)
    expect(log(street({ numbering: 'odd', next: 1 }), '8').next).toBe(9)
  })

  it('keeps the stepper where it is for a label that is not a number', () => {
    const next = logDoor(street(), {
      id: 'd1',
      label: '12A',
      outcome: 'notHome',
      at: 100,
    })
    expect(next.doors[0]?.label).toBe('12A')
    expect(next.next).toBe(12)
  })
})

describe('countsAsAnotherTry', () => {
  const day = new Date(2026, 10, 10, 9).getTime()

  it('is another try on a later day', () => {
    expect(
      countsAsAnotherTry({ at: day }, new Date(2026, 10, 11, 9).getTime())
    ).toBe(true)
  })

  it('replaces the result on the same day', () => {
    expect(
      countsAsAnotherTry({ at: day }, new Date(2026, 10, 10, 18).getTime())
    ).toBe(false)
  })
})

describe('switchSide', () => {
  const door = (label: string) => ({
    id: label,
    label,
    outcome: 'notHome' as const,
    at: 0,
    tries: 1,
  })

  it('crosses to the house facing the last one and walks back', () => {
    const crossed = switchSide(
      street({ next: 24, doors: [door('20'), door('22')] })
    )
    expect(crossed).toMatchObject({
      numbering: 'odd',
      next: 23,
      descending: true,
    })
  })

  it('crosses back the other way from a side walked downward', () => {
    const crossed = switchSide(
      street({
        numbering: 'odd',
        next: 3,
        descending: true,
        doors: [door('7'), door('5')],
      })
    )
    expect(crossed.numbering).toBe('even')
    expect(crossed.next).toBe(4)
    expect(crossed.descending).toBeUndefined()
  })

  it('skips a facing house that is already recorded', () => {
    const crossed = switchSide(
      street({ next: 24, doors: [door('22'), door('23')] })
    )
    expect(crossed.next).toBe(21)
  })

  it('keeps the direction when nothing is recorded yet', () => {
    expect(switchSide(street({ next: 2 }))).toMatchObject({
      numbering: 'odd',
      next: 1,
    })
    expect(switchSide(street({ next: 2 })).descending).toBeUndefined()
  })

  it('never lands below the first house', () => {
    const crossed = switchSide(
      street({
        numbering: 'odd',
        next: 1,
        doors: [door('3')],
        descending: true,
      })
    )
    expect(crossed.next).toBe(2)
  })

  it('leaves streets without sides alone', () => {
    const both = street({ numbering: 'both' })
    expect(switchSide(both)).toBe(both)
  })
})

describe('counts', () => {
  it('totals each outcome', () => {
    const worked = [
      { id: 'a', label: '2', outcome: 'notHome', at: 1, tries: 1 },
      { id: 'b', label: '4', outcome: 'spoke', at: 1, tries: 1 },
      { id: 'c', label: '6', outcome: 'notHome', at: 1, tries: 2 },
      { id: 'd', label: '8', outcome: 'doNotCall', at: 1, tries: 1 },
    ] as const
    expect(doorCounts(worked)).toEqual({
      total: 4,
      notHome: 2,
      spoke: 1,
      doNotCall: 1,
    })
    expect(
      territoryCounts(
        territory({
          streets: [
            street({ doors: [...worked] }),
            street({ id: 's2', workedAt: 5 }),
          ],
        })
      )
    ).toMatchObject({ total: 4, notHome: 2, streets: 2, streetsWorked: 1 })
  })
})

describe('doorsInWalkingOrder', () => {
  it('sorts by house number, with lettered doors last', () => {
    const doors = ['10', '2', '12A', '4'].map((label) => ({
      id: label,
      label,
      outcome: 'notHome' as const,
      at: 1,
      tries: 1,
    }))
    expect(doorsInWalkingOrder(doors).map((door) => door.label)).toEqual([
      '2',
      '4',
      '10',
      '12A',
    ])
  })
})

describe('streets', () => {
  it('adds, replaces and removes a street', () => {
    const added = saveStreet(territory(), street())
    expect(added.streets).toHaveLength(1)
    const renamed = saveStreet(added, street({ name: 'Elm Street' }))
    expect(renamed.streets.map((s) => s.name)).toEqual(['Elm Street'])
    expect(removeStreet(renamed, 's1').streets).toEqual([])
  })
})

describe('clearing door records', () => {
  const worked = territory({
    streets: [
      street({
        doors: [
          { id: 'a', label: '2', outcome: 'notHome', at: 10, tries: 1 },
          { id: 'b', label: '4', outcome: 'doNotCall', at: 20, tries: 1 },
        ],
      }),
    ],
  })

  it('keeps only do-not-calls, as an address and a date', () => {
    const cleared = clearDoorRecords(worked, address)
    expect(cleared.streets[0]?.doors).toEqual([])
    expect(cleared.doNotCalls).toEqual([
      {
        id: 'b',
        address: '4 Oak Street',
        at: 20,
        coordinate: undefined,
        streetId: 's1',
        label: '4',
      },
    ])
  })

  it('does the same when the territory is finished', () => {
    const finished = finishTerritory(worked, 99, address)
    expect(finished.finishedAt).toBe(99)
    expect(finished.streets[0]?.doors).toEqual([])
    expect(finished.doNotCalls).toHaveLength(1)
    const reopened = reopenTerritory(finished)
    expect(reopened.finishedAt).toBeUndefined()
  })

  it('ends shares and takes hand-offs back when the territory is finished', () => {
    const shared = {
      ...worked,
      streets: worked.streets.map((s) => ({
        ...s,
        handoff: { personId: 'p1', at: 10 },
      })),
      shares: [
        { id: 'a', kind: 'link' as const, token: 't', createdAt: 1 },
        {
          id: 'b',
          kind: 'person' as const,
          personId: 'p1',
          createdAt: 1,
          endedAt: 5,
        },
      ],
    }
    expect(sharesWithOthers(shared)).toBe(true)
    const finished = finishTerritory(shared, 99, address)
    expect(finished.streets.every((s) => s.handoff === undefined)).toBe(true)
    expect(finished.shares?.map((share) => share.endedAt)).toEqual([99, 5])
    expect(sharesWithOthers(finished)).toBe(false)
    expect(sharesWithOthers(worked)).toBe(false)
  })

  it('starts fresh when the territory is checked out again', () => {
    const finished = finishTerritory(
      {
        ...worked,
        returnBy: 50,
        streets: worked.streets.map((s) => ({ ...s, workedAt: 30 })),
      },
      99,
      address
    )
    const again = checkOutAgain(finished, 500)
    expect(again.checkedOutAt).toBe(500)
    expect(again.returnBy).toBeUndefined()
    expect(again.finishedAt).toBeUndefined()
    expect(again.streets[0]).toMatchObject({ next: 2, doors: [] })
    expect(
      checkOutAgain(
        territory({ streets: [street({ first: 100, next: 140 })] }),
        500
      ).streets[0]?.next
    ).toBe(100)
    expect(again.streets[0]?.workedAt).toBeUndefined()
    expect(again.doNotCalls).toHaveLength(1)
  })
})

describe('do-not-calls', () => {
  const worked = territory({
    doNotCalls: [{ id: 'typed', address: '7 Hill Lane', at: 5 }],
    streets: [
      street({
        doors: [
          { id: 'a', label: '2', outcome: 'notHome', at: 10, tries: 1 },
          { id: 'b', label: '4', outcome: 'doNotCall', at: 20, tries: 1 },
        ],
      }),
    ],
  })

  it('lists the ones recorded at a door with the ones typed in', () => {
    expect(
      territoryDoNotCalls(worked, address).map((entry) => entry.address)
    ).toEqual(['7 Hill Lane', '4 Oak Street'])
  })

  it('removes either kind', () => {
    const [typed, atDoor] = territoryDoNotCalls(worked, address)
    expect(removeDoNotCall(worked, typed!).doNotCalls).toEqual([])
    expect(
      removeDoNotCall(worked, atDoor!).streets[0]?.doors.map((d) => d.id)
    ).toEqual(['a'])
  })

  it('finds the do-not-call at a house, however it was added', () => {
    const [oak] = worked.streets
    expect(doNotCallAt(worked, oak!, '4', address)?.id).toBe('b')
    expect(doNotCallAt(worked, oak!, '6', address)).toBeUndefined()
    const hill = street({ id: 's2', name: 'Hill Lane' })
    expect(doNotCallAt(worked, hill, ' 7 ', address)?.id).toBe('typed')
    expect(
      streetDoNotCalls(worked, hill, address).map((entry) => entry.id)
    ).toEqual(['typed'])
    expect(
      streetDoNotCalls(worked, oak!, address).map((entry) => entry.id)
    ).toEqual(['b'])
  })

  it('lists each once after door records are cleared', () => {
    const cleared = clearDoorRecords(worked, address)
    expect(territoryDoNotCalls(cleared, address)).toHaveLength(2)
  })

  it('still guards the house after the records are cleared', () => {
    const cleared = clearDoorRecords(worked, address)
    const [oak] = cleared.streets
    const renamed = { ...oak!, name: 'Oak St' }
    expect(doNotCallAt(cleared, renamed, '4', address)?.id).toBe('b')
    expect(doNotCallAt(cleared, renamed, '6', address)).toBeUndefined()
  })

  it('guards a described door on a street without numbers', () => {
    const market = street({
      id: 'm',
      name: 'Market Road',
      numbering: 'none',
      doors: [
        {
          id: 'x',
          label: '4',
          outcome: 'doNotCall',
          at: 1,
          tries: 1,
          description: 'Blue gate',
        },
      ],
    })
    const there = territory({ streets: [market] })
    const described = (
      s: Pick<TerritoryStreet, 'name'>,
      d: { label: string; description?: string }
    ) => `${d.description ?? d.label}, ${s.name}`
    expect(doNotCallAt(there, market, '4', described)?.id).toBe('x')
    const cleared = clearDoorRecords(there, described)
    expect(cleared.doNotCalls[0]?.label).toBeUndefined()
    expect(doNotCallAt(cleared, cleared.streets[0]!, '4', described)).toBe(
      undefined
    )
  })
})

describe('returnBy', () => {
  it('is four months after the territory was checked out', () => {
    const due = returnBy(new Date(2026, 10, 10).getTime())
    expect([due.getFullYear(), due.getMonth(), due.getDate()]).toEqual([
      2027, 2, 10,
    ])
  })
})

describe('nextStreet', () => {
  it('is the first street not yet marked worked', () => {
    const streets = [
      street({ id: 'a', workedAt: 1 }),
      street({ id: 'b' }),
      street({ id: 'c' }),
    ]
    expect(nextStreet({ streets })?.id).toBe('b')
    expect(
      nextStreet({ streets: streets.map((s) => ({ ...s, workedAt: 1 })) })
    ).toBeUndefined()
  })
})

describe('handed-off streets', () => {
  const handoff = { personId: 'p1', at: 5 }

  it('skips a handed-off street when choosing what to work next', () => {
    const streets = [
      street({ id: 'a', handoff }),
      street({ id: 'b', workedAt: 1 }),
      street({ id: 'c' }),
    ]
    expect(nextStreet({ streets })?.id).toBe('c')
    expect(nextStreet({ streets }, 'c')).toBeUndefined()
  })

  it('counts handed-off streets, and as worked once the buddy marks them', () => {
    expect(
      territoryCounts(
        territory({
          streets: [
            street({ id: 'a', handoff, workedAt: 3 }),
            street({ id: 'b', workedAt: 1 }),
            street({ id: 'c' }),
          ],
        })
      )
    ).toMatchObject({ streets: 3, streetsWorked: 2, handedOff: 1 })
    expect(
      territoryCounts(
        territory({
          streets: [street({ id: 'a', handoff }), street({ id: 'b' })],
        })
      )
    ).toMatchObject({ streets: 2, streetsWorked: 0, handedOff: 1 })
  })

  it('does not count a handed-off street towards every street being worked', () => {
    expect(territoryWorkState({ streets: [] })).toBe('empty')
    expect(
      territoryWorkState({
        streets: [street({ id: 'a', handoff }), street({ id: 'b' })],
      })
    ).toBe('working')
    expect(
      territoryWorkState({
        streets: [
          street({ id: 'a', handoff }),
          street({ id: 'b', workedAt: 1 }),
        ],
      })
    ).toBe('allWorked')
    expect(
      territoryWorkState({ streets: [street({ id: 'a', handoff })] })
    ).toBe('allHandedOff')
  })

  it('takes every street back when the territory is checked out again', () => {
    const again = checkOutAgain(
      territory({
        streets: [street({ handoff, workedAt: 2, workedBy: 'p1' })],
      }),
      10
    )
    expect(again.streets[0]).toMatchObject({
      handoff: undefined,
      workedAt: undefined,
      workedBy: undefined,
    })
  })
})

describe('logDoor authorship', () => {
  it('records who logged the door, and takes it over when you call again', () => {
    const theirs = logDoor(street(), {
      id: 'd1',
      label: '12',
      outcome: 'notHome',
      at: 1,
      by: 'p1',
    })
    expect(theirs.doors[0]?.by).toBe('p1')
    const mine = logDoor(theirs, {
      id: 'd2',
      label: '12',
      outcome: 'spoke',
      at: 2,
    })
    expect(mine.doors).toHaveLength(1)
    expect(mine.doors[0]).toMatchObject({ id: 'd1', by: undefined })
  })
})

describe('isOverdue', () => {
  const checkedOutAt = new Date(2026, 0, 10).getTime()

  it('is overdue once the return date has passed', () => {
    expect(isOverdue({ checkedOutAt }, new Date(2026, 4, 9).getTime())).toBe(
      false
    )
    expect(isOverdue({ checkedOutAt }, new Date(2026, 4, 11).getTime())).toBe(
      true
    )
  })

  it('goes by the return date the publisher was given', () => {
    const returnBy = new Date(2026, 2, 1).getTime()
    expect(
      isOverdue({ checkedOutAt, returnBy }, new Date(2026, 2, 1, 18).getTime())
    ).toBe(false)
    expect(
      isOverdue({ checkedOutAt, returnBy }, new Date(2026, 2, 2).getTime())
    ).toBe(true)
  })

  it('never applies to a finished territory', () => {
    expect(
      isOverdue({ checkedOutAt, finishedAt: 1 }, new Date(2027, 0, 1).getTime())
    ).toBe(false)
  })
})
