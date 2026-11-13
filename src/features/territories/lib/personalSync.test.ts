import fc from 'fast-check'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearDoorRecords,
  finishTerritory,
  type FormatDoorAddress,
} from '@/features/territories/lib/doors'
import {
  applyLedger,
  type HeldTerritories,
  HEADER,
  inStreetKey,
  isDeleted,
  isMarked,
  ledgerToSlice,
  mergeLedgers,
  mergeSlices,
  type PersonalLedger,
  restampLedger,
  sliceToLedger,
  streetKey,
  territoryFromEntry,
} from '@/features/territories/lib/personalSync'
import type {
  Territory,
  TerritoryDoor,
  TerritoryStreet,
} from '@/features/territories/types/territory'

const uuid = (n: number) =>
  `9d8c7b6a-5f4e-4d3c-8b2a-${String(n).padStart(12, '0')}`
const T0 = Date.UTC(2026, 10, 2, 15)
const OAK = uuid(100)
const ELM = uuid(200)
const TERRITORY = uuid(1)

let clock = T0
const stamp = (previous = 0) => {
  clock = Math.max(clock + 1, previous + 1)
  return clock
}

beforeEach(() => {
  clock = T0
})

const formatAddress: FormatDoorAddress = (street, door) =>
  `${door.label} ${street.name}`

const door = (
  n: number,
  label: string,
  patch: Partial<TerritoryDoor> = {}
): TerritoryDoor => ({
  id: uuid(n),
  label,
  outcome: 'notHome',
  at: T0,
  tries: 1,
  ...patch,
})

const street = (
  id: string,
  name: string,
  patch: Partial<TerritoryStreet> = {}
): TerritoryStreet => ({
  id,
  name,
  numbering: 'both',
  next: 1,
  doors: [],
  ...patch,
})

const territory = (patch: Partial<Territory> = {}): Territory => ({
  id: TERRITORY,
  number: '12',
  name: 'North Hill',
  checkedOutAt: T0,
  createdAt: T0,
  streets: [
    street(OAK, 'Oak Street', {
      next: 3,
      doors: [door(1, '1'), door(2, '2', { outcome: 'spoke' })],
      workedAt: T0,
    }),
    street(ELM, 'Elm Street', { numbering: 'odd' }),
  ],
  doNotCalls: [
    { id: uuid(9), address: '9 Elm Street', at: T0, streetId: ELM },
    { id: uuid(10), address: '1 Somewhere Else', at: T0 },
  ],
  ...patch,
})

type Device = {
  ledger: PersonalLedger
  personal: Territory[]
  held: Map<string, number | undefined>
  privacy: boolean
}

const device = (personal: Territory[] = []): Device => {
  const fresh: Device = {
    ledger: {},
    personal,
    held: new Map(),
    privacy: false,
  }
  fresh.ledger = restampLedger({}, personal, fresh.held, stamp)
  return fresh
}

const edit = (target: Device, change: (list: Territory[]) => Territory[]) => {
  target.personal = change(target.personal)
  target.ledger = restampLedger(
    target.ledger,
    target.personal,
    target.held,
    stamp
  )
}

const editTerritory = (
  target: Device,
  id: string,
  change: (territory: Territory) => Territory
) =>
  edit(target, (list) =>
    list.map((territory) =>
      territory.id === id ? change(territory) : territory
    )
  )

const pull = (target: Device, from: Pick<Device, 'ledger'>) => {
  const remote = from.ledger
  const result = applyLedger({
    before: target.ledger,
    after: mergeLedgers(target.ledger, remote),
    personal: target.personal,
    held: target.held as HeldTerritories,
    privacy: target.privacy,
    formatAddress,
  })
  target.ledger = result.ledger
  target.personal = result.personal
  target.ledger = restampLedger(
    target.ledger,
    target.personal,
    target.held,
    stamp
  )
}

const settle = (devices: Device[]) => {
  for (let round = 0; round < 4; round++)
    for (const a of devices) for (const b of devices) if (a !== b) pull(a, b)
}

const byId = <T extends { id: string }>(list: readonly T[]) =>
  [...list].sort((a, b) => (a.id < b.id ? -1 : 1))
const view = (territory: Territory) => ({
  ...territory,
  streets: territory.streets.map(({ next: _next, doors, ...rest }) => ({
    ...rest,
    doors: byId(doors),
  })),
  doNotCalls: byId(territory.doNotCalls),
})
const views = (target: Device) =>
  target.personal.map(view).sort((a, b) => (a.id < b.id ? -1 : 1))

describe('personal territory records', () => {
  it('round-trips a territory through its records', () => {
    const original = territory({ finishedAt: T0 + 5 })
    const ledger = restampLedger({}, [original], new Map(), stamp)
    const copy = territoryFromEntry(TERRITORY, ledger[TERRITORY])!
    expect(view(copy)).toEqual(
      view({
        ...original,
        doNotCalls: [...original.doNotCalls].sort((a, b) =>
          a.id < b.id ? -1 : 1
        ),
      })
    )
    expect(restampLedger(ledger, [copy], new Map(), stamp)).toBe(ledger)
  })

  it('keeps device-only fields out of the records', () => {
    const ledger = restampLedger(
      {},
      [territory({ photo: 'card.jpg' })],
      new Map(),
      stamp
    )
    const copy = territoryFromEntry(TERRITORY, ledger[TERRITORY])!
    expect(copy.photo).toBeUndefined()
    expect(JSON.stringify(ledger)).not.toContain('card.jpg')
    const withLocal = territoryFromEntry(
      TERRITORY,
      ledger[TERRITORY],
      territory({ photo: 'card.jpg' })
    )!
    expect(withLocal.photo).toBe('card.jpg')
    expect(withLocal.streets[0].next).toBe(3)
  })

  it('stamps only what changed', () => {
    const first = restampLedger({}, [territory()], new Map(), stamp)
    const changed = territory({
      streets: territory().streets.map((s) =>
        s.id === OAK ? { ...s, doors: [...s.doors, door(3, '3')] } : s
      ),
    })
    const second = restampLedger(first, [changed], new Map(), stamp)
    const before = first[TERRITORY].records
    const after = second[TERRITORY].records
    const moved = Object.keys(after).filter(
      (key) => after[key].updatedAt !== before[key]?.updatedAt
    )
    expect(moved).toEqual([inStreetKey(OAK, uuid(3))])
  })

  it('keeps fields a newer version wrote', () => {
    const first = restampLedger({}, [territory()], new Map(), stamp)
    const header = first[TERRITORY].records[HEADER]
    const newer = {
      ...first,
      [TERRITORY]: {
        ...first[TERRITORY],
        records: {
          ...first[TERRITORY].records,
          [HEADER]: { ...header, data: { ...header.data, color: 'blue' } },
        },
      },
    }
    const renamed = restampLedger(
      newer,
      [territory({ name: 'South Hill' })],
      new Map(),
      stamp
    )
    expect(renamed[TERRITORY].records[HEADER].data).toMatchObject({
      color: 'blue',
      name: 'South Hill',
    })
  })
})

describe('two devices on one account', () => {
  it('converge on edits made on either', () => {
    const a = device([territory()])
    const b = device()
    pull(b, a)
    expect(views(b)).toEqual(views(a))

    editTerritory(b, TERRITORY, (t) => ({
      ...t,
      name: 'North Hill East',
      streets: t.streets.map((s) =>
        s.id === ELM
          ? { ...s, doors: [door(20, '5', { outcome: 'doNotCall' })] }
          : s
      ),
    }))
    editTerritory(a, TERRITORY, (t) => ({
      ...t,
      streets: t.streets.map((s) =>
        s.id === OAK ? { ...s, doors: [...s.doors, door(30, '3')] } : s
      ),
    }))
    settle([a, b])
    expect(views(a)).toEqual(views(b))
    const oak = a.personal[0].streets.find((s) => s.id === OAK)!
    const elm = a.personal[0].streets.find((s) => s.id === ELM)!
    expect(a.personal[0].name).toBe('North Hill East')
    expect(oak.doors.map((d) => d.label).sort()).toEqual(['1', '2', '3'])
    expect(elm.doors.map((d) => d.outcome)).toEqual(['doNotCall'])
  })

  it('folds the same house recorded on both while offline', () => {
    const a = device([territory()])
    const b = device()
    pull(b, a)
    editTerritory(a, TERRITORY, (t) => ({
      ...t,
      streets: t.streets.map((s) =>
        s.id === ELM ? { ...s, doors: [door(40, '7', { at: T0 + 10 })] } : s
      ),
    }))
    editTerritory(b, TERRITORY, (t) => ({
      ...t,
      streets: t.streets.map((s) =>
        s.id === ELM
          ? {
              ...s,
              doors: [door(41, '7', { outcome: 'doNotCall', at: T0 + 5 })],
            }
          : s
      ),
    }))
    settle([a, b])
    expect(views(a)).toEqual(views(b))
    const elm = a.personal[0].streets.find((s) => s.id === ELM)!
    expect(elm.doors).toHaveLength(1)
    expect(elm.doors[0].outcome).toBe('doNotCall')
  })

  it('deletes a territory everywhere and never brings it back', () => {
    const a = device([territory()])
    const b = device()
    pull(b, a)
    const stale = structuredClone(b.ledger)
    edit(a, () => [])
    editTerritory(b, TERRITORY, (t) => ({ ...t, name: 'Edited later' }))
    settle([a, b])
    expect(a.personal).toEqual([])
    expect(b.personal).toEqual([])
    pull(a, { ledger: stale })
    expect(a.personal).toEqual([])
    expect(isDeleted(a.ledger[TERRITORY])).toBe(true)
    expect(Object.keys(a.ledger[TERRITORY].records)).toEqual([])
  })

  it('deletes a street for good, with its doors', () => {
    const a = device([territory()])
    const b = device()
    pull(b, a)
    editTerritory(a, TERRITORY, (t) => ({
      ...t,
      streets: t.streets.filter((s) => s.id !== OAK),
    }))
    editTerritory(b, TERRITORY, (t) => ({
      ...t,
      streets: t.streets.map((s) =>
        s.id === OAK ? { ...s, name: 'Oak Avenue', doors: [door(50, '9')] } : s
      ),
    }))
    settle([a, b])
    expect(views(a)).toEqual(views(b))
    expect(a.personal[0].streets.map((s) => s.id)).toEqual([ELM])
    const keys = Object.keys(a.ledger[TERRITORY].records)
    expect(keys.some((key) => key.startsWith(streetKey(OAK)))).toBe(false)
  })

  it('lets a removed door come back only through a newer edit', () => {
    const a = device([territory()])
    const b = device()
    pull(b, a)
    const stale = structuredClone(b.ledger)
    editTerritory(a, TERRITORY, (t) => ({
      ...t,
      streets: t.streets.map((s) =>
        s.id === OAK
          ? { ...s, doors: s.doors.filter((d) => d.label !== '1') }
          : s
      ),
    }))
    pull(b, a)
    pull(b, { ledger: stale })
    expect(b.personal[0].streets[0].doors.map((d) => d.label)).toEqual(['2'])
    editTerritory(b, TERRITORY, (t) => ({
      ...t,
      streets: t.streets.map((s) =>
        s.id === OAK ? { ...s, doors: [...s.doors, door(1, '1')] } : s
      ),
    }))
    pull(a, b)
    expect(a.personal[0].streets[0].doors.map((d) => d.label).sort()).toEqual([
      '1',
      '2',
    ])
  })

  it('keeps a returned territory returned', () => {
    const a = device([territory()])
    const b = device()
    pull(b, a)
    editTerritory(a, TERRITORY, (t) =>
      finishTerritory(t, T0 + 1000, formatAddress)
    )
    pull(b, a)
    expect(b.personal[0].finishedAt).toBe(T0 + 1000)
    expect(b.personal[0].streets.every((s) => s.doors.length === 0)).toBe(true)
    expect(b.personal[0].doNotCalls.map((d) => d.address).sort()).toEqual([
      '1 Somewhere Else',
      '9 Elm Street',
    ])
  })
})

describe('older versions', () => {
  it('never delete territories by leaving the slice out', () => {
    const a = device([territory()])
    const slice = ledgerToSlice(a.ledger)
    expect(mergeSlices(slice, undefined)).toEqual(slice)
    pull(a, { ledger: sliceToLedger(undefined) })
    expect(a.personal).toHaveLength(1)
  })
})

describe('shared territories', () => {
  const SPACE_CREATED = T0 + 10_000

  it('marks a territory that moved into a space instead of deleting it', () => {
    const a = device([territory()])
    const c = device()
    pull(c, a)
    clock = SPACE_CREATED + 1
    a.held.set(TERRITORY, SPACE_CREATED)
    edit(a, () => [])
    expect(isMarked(a.ledger[TERRITORY])).toBe(true)
    pull(c, a)
    expect(c.personal).toEqual([])
    expect(isDeleted(c.ledger[TERRITORY])).toBe(false)
  })

  it('brings a territory back to personal sync when its share ends', () => {
    const a = device([territory()])
    const b = device()
    pull(b, a)
    clock = SPACE_CREATED + 1
    a.held.set(TERRITORY, SPACE_CREATED)
    b.held.set(TERRITORY, SPACE_CREATED)
    edit(a, () => [])
    edit(b, () => [])
    settle([a, b])
    a.held.delete(TERRITORY)
    edit(a, () => [finishTerritory(territory(), clock + 5, formatAddress)])
    b.held.delete(TERRITORY)
    edit(b, () => [finishTerritory(territory(), clock + 9, formatAddress)])
    settle([a, b])
    expect(views(a)).toEqual(views(b))
    expect(a.personal).toHaveLength(1)
    expect(isMarked(a.ledger[TERRITORY])).toBe(false)
  })

  it('leaves a stale space alone instead of hiding a returned territory', () => {
    const a = device([territory()])
    const b = device()
    pull(b, a)
    clock = SPACE_CREATED + 1
    a.held.set(TERRITORY, SPACE_CREATED)
    b.held.set(TERRITORY, SPACE_CREATED)
    edit(a, () => [])
    edit(b, () => [])
    settle([a, b])
    a.held.delete(TERRITORY)
    edit(a, () => [finishTerritory(territory(), clock + 5, formatAddress)])
    settle([a, b])
    expect(a.personal).toHaveLength(1)
    expect(isMarked(a.ledger[TERRITORY])).toBe(false)
    expect(b.personal).toEqual([])
  })

  it('keeps a shared territory deleted elsewhere from returning', () => {
    const a = device([territory()])
    const b = device()
    pull(b, a)
    clock = SPACE_CREATED + 1
    a.held.set(TERRITORY, SPACE_CREATED)
    b.held.set(TERRITORY, SPACE_CREATED)
    edit(a, () => [])
    settle([a, b])
    a.held.delete(TERRITORY)
    edit(a, () => [])
    expect(isDeleted(a.ledger[TERRITORY])).toBe(true)
    b.held.delete(TERRITORY)
    edit(b, () => [finishTerritory(territory(), clock + 9, formatAddress)])
    settle([a, b])
    expect(a.personal).toEqual([])
    expect(b.personal).toEqual([])
  })

  it('does not delete a marked territory a reset dropped', () => {
    const a = device([territory()])
    clock = SPACE_CREATED + 1
    a.held.set(TERRITORY, SPACE_CREATED)
    edit(a, () => [])
    a.held.delete(TERRITORY)
    edit(a, () => [])
    expect(isMarked(a.ledger[TERRITORY])).toBe(true)
  })
})

describe('territory privacy mode', () => {
  it('stores no incoming door records, and keeps do-not-calls', () => {
    const a = device([territory()])
    const b = device()
    b.privacy = true
    pull(b, a)
    expect(b.personal[0].streets.every((s) => s.doors.length === 0)).toBe(true)
    expect(
      Object.values(b.ledger[TERRITORY].records).some((r) => r.kind === 'door')
    ).toBe(false)
    editTerritory(a, TERRITORY, (t) => ({
      ...t,
      streets: t.streets.map((s) =>
        s.id === ELM
          ? { ...s, doors: [door(60, '3', { outcome: 'doNotCall' })] }
          : s
      ),
    }))
    pull(b, a)
    expect(b.personal[0].doNotCalls.map((d) => d.id)).toContain(uuid(60))
    expect(JSON.stringify(b.ledger)).not.toContain('"outcome"')
    pull(a, b)
    const oak = a.personal[0].streets.find((s) => s.id === OAK)!
    expect(oak.doors.map((d) => d.label).sort()).toEqual(['1', '2'])
  })

  it('does not bring back doors this device cleared', () => {
    const a = device([territory()])
    const b = device()
    pull(b, a)
    const stale = structuredClone(a.ledger)
    b.privacy = true
    editTerritory(b, TERRITORY, (t) => clearDoorRecords(t, formatAddress))
    pull(b, { ledger: stale })
    pull(b, a)
    expect(b.personal[0].streets.every((s) => s.doors.length === 0)).toBe(true)
    pull(a, b)
    expect(a.personal[0].streets.every((s) => s.doors.length === 0)).toBe(true)
  })
})

const deviceCount = 3

type Op =
  | { type: 'rename'; who: number; name: string }
  | { type: 'addStreet'; who: number; n: number }
  | { type: 'dropStreet'; who: number; pick: number }
  | { type: 'log'; who: number; pick: number; label: string; dnc: boolean }
  | { type: 'unlog'; who: number; pick: number }
  | { type: 'worked'; who: number; pick: number; on: boolean }
  | { type: 'dnc'; who: number; n: number }
  | { type: 'finish'; who: number; on: boolean }
  | { type: 'add'; who: number; n: number }
  | { type: 'delete'; who: number; pick: number }
  | { type: 'sync'; who: number; from: number }

const who = fc.integer({ min: 0, max: deviceCount - 1 })
const pick = fc.nat({ max: 20 })
const opArb: fc.Arbitrary<Op> = fc.oneof(
  fc.record({
    type: fc.constant('rename' as const),
    who,
    name: fc.constantFrom('A', 'B', 'C'),
  }),
  fc.record({
    type: fc.constant('addStreet' as const),
    who,
    n: fc.nat({ max: 50 }),
  }),
  fc.record({ type: fc.constant('dropStreet' as const), who, pick }),
  fc.record({
    type: fc.constant('log' as const),
    who,
    pick,
    label: fc.constantFrom('1', '2', '3', '4'),
    dnc: fc.boolean(),
  }),
  fc.record({ type: fc.constant('unlog' as const), who, pick }),
  fc.record({
    type: fc.constant('worked' as const),
    who,
    pick,
    on: fc.boolean(),
  }),
  fc.record({ type: fc.constant('dnc' as const), who, n: fc.nat({ max: 50 }) }),
  fc.record({ type: fc.constant('finish' as const), who, on: fc.boolean() }),
  fc.record({ type: fc.constant('add' as const), who, n: fc.nat({ max: 3 }) }),
  fc.record({ type: fc.constant('delete' as const), who, pick }),
  fc.record({ type: fc.constant('sync' as const), who, from: who })
)

let ids = 1000
const nextId = () => uuid(++ids)

const at = <T>(list: readonly T[], index: number) =>
  list.length > 0 ? list[index % list.length] : undefined

function run(devices: Device[], op: Op) {
  const target = devices[op.who]
  const first = target.personal[0]
  const onFirst = (change: (t: Territory) => Territory) =>
    first && editTerritory(target, first.id, change)
  switch (op.type) {
    case 'sync':
      if (op.from !== op.who) pull(target, devices[op.from])
      return
    case 'add':
      if (target.personal.some((t) => t.id === uuid(op.n + 1))) return
      return edit(target, (list) => [
        ...list,
        territory({ id: uuid(op.n + 1), streets: [], doNotCalls: [] }),
      ])
    case 'delete': {
      const gone = at(target.personal, op.pick)
      if (gone) edit(target, (list) => list.filter((t) => t !== gone))
      return
    }
    case 'rename':
      return onFirst((t) => ({ ...t, name: op.name }))
    case 'finish':
      return onFirst((t) =>
        op.on
          ? finishTerritory(t, clock, formatAddress)
          : { ...t, finishedAt: undefined }
      )
    case 'addStreet':
      return onFirst((t) => ({
        ...t,
        streets: [...t.streets, street(nextId(), `Street ${op.n}`)],
      }))
    case 'dropStreet': {
      const gone = first && at(first.streets, op.pick)
      if (gone)
        onFirst((t) => ({
          ...t,
          streets: t.streets.filter((s) => s.id !== gone.id),
        }))
      return
    }
    case 'worked': {
      const target = first && at(first.streets, op.pick)
      if (target)
        onFirst((t) => ({
          ...t,
          streets: t.streets.map((s) =>
            s.id === target.id
              ? { ...s, workedAt: op.on ? clock : undefined }
              : s
          ),
        }))
      return
    }
    case 'log': {
      const target = first && at(first.streets, op.pick)
      if (target)
        onFirst((t) => ({
          ...t,
          streets: t.streets.map((s) => {
            if (s.id !== target.id) return s
            const outcome = op.dnc ? ('doNotCall' as const) : ('spoke' as const)
            const had = s.doors.find((d) => d.label === op.label)
            return {
              ...s,
              doors: had
                ? s.doors.map((d) =>
                    d === had ? { ...d, outcome, at: clock } : d
                  )
                : [...s.doors, door(++ids, op.label, { outcome, at: clock })],
            }
          }),
        }))
      return
    }
    case 'unlog': {
      const target = first && at(first.streets, op.pick)
      const gone = target && at(target.doors, op.pick)
      if (gone)
        onFirst((t) => ({
          ...t,
          streets: t.streets.map((s) =>
            s.id === target.id
              ? { ...s, doors: s.doors.filter((d) => d !== gone) }
              : s
          ),
        }))
      return
    }
    case 'dnc':
      return onFirst((t) => ({
        ...t,
        doNotCalls: [
          ...t.doNotCalls,
          { id: nextId(), address: `${op.n} Main Street`, at: clock },
        ],
      }))
  }
}

describe('properties', () => {
  it('converges whatever order devices sync in', () => {
    fc.assert(
      fc.property(fc.array(opArb, { maxLength: 40 }), (ops) => {
        clock = T0
        ids = 1000
        const devices = Array.from({ length: deviceCount }, () => device())
        edit(devices[0], () => [territory()])
        for (const op of ops) run(devices, op)
        settle(devices)
        const [first, ...rest] = devices
        for (const other of rest) {
          expect(views(other)).toEqual(views(first))
          expect(other.ledger).toEqual(first.ledger)
        }
        for (const each of devices)
          expect(
            restampLedger(each.ledger, each.personal, each.held, stamp)
          ).toBe(each.ledger)
      }),
      { numRuns: 150 }
    )
  })

  it('merges in any order and grouping to the same ledger', () => {
    fc.assert(
      fc.property(fc.array(opArb, { maxLength: 30 }), (ops) => {
        clock = T0
        ids = 1000
        const devices = Array.from({ length: deviceCount }, () => device())
        edit(devices[0], () => [territory()])
        for (const op of ops) run(devices, op)
        const [x, y, z] = devices.map((d) => d.ledger)
        expect(mergeLedgers(x, y)).toEqual(mergeLedgers(y, x))
        expect(mergeLedgers(mergeLedgers(x, y), z)).toEqual(
          mergeLedgers(x, mergeLedgers(y, z))
        )
        const xy = mergeLedgers(x, y)
        expect(mergeLedgers(xy, xy)).toEqual(xy)
        expect(sliceToLedger(ledgerToSlice(xy))).toEqual(xy)
      }),
      { numRuns: 150 }
    )
  })
})

describe('size', () => {
  it('keeps a well-worked territory within the snapshot limits', () => {
    const streets = Array.from({ length: 40 }, (_, s) =>
      street(uuid(10_000 + s), `Street number ${s}`, {
        doors: Array.from({ length: 125 }, (_, d) =>
          door(20_000 + s * 1000 + d, String(d + 1), {
            outcome: d % 7 === 0 ? 'spoke' : 'notHome',
            tries: 2,
            coordinate: { latitude: 40.123456, longitude: -75.123456 },
            coordinateSource: 'gps',
            description: 'Blue door behind the gate',
          })
        ),
      })
    )
    const big = territory({ streets })
    const ledger = restampLedger({}, [big], new Map(), stamp)
    const bytes = JSON.stringify(ledgerToSlice(ledger)).length
    expect(Object.keys(ledger[TERRITORY].records).length).toBeGreaterThan(5000)
    expect(bytes).toBeLessThan(2_500_000)
  })
})
