import { describe, expect, it } from 'vitest'
import { scopeIdForStreet } from '@/lib/sharedSpaces/scopes'
import { diffTerritory } from '@/features/territories/lib/shared/diff'
import { migrateTerritories } from '@/features/territories/lib/shared/migration'
import { projectSpace } from '@/features/territories/lib/shared/projection'
import { emptySpace } from '@/features/territories/lib/shared/space'
import type {
  TerritorySpace,
  TerritorySpaceRecord,
} from '@/features/territories/types/sharedTerritory'
import type {
  Territory,
  TerritoryDoor,
} from '@/features/territories/types/territory'

const ME = 'A'.repeat(22)
const JOE = 'B'.repeat(22)
const ANN = 'C'.repeat(22)
const OAK = '11111111-1111-4111-8111-111111111111'
const ELM = '22222222-2222-4222-8222-222222222222'
const S_OAK = scopeIdForStreet(OAK)
const S_ELM = scopeIdForStreet(ELM)
const uuid = (n: number) =>
  `9d8c7b6a-5f4e-4d3c-8b2a-${String(n).padStart(12, '0')}`
const DAY = 24 * 60 * 60 * 1000
const T0 = Date.UTC(2026, 10, 2, 15)

let clock = T0
const stamp = (previous = 0) => {
  clock = Math.max(clock + 1, previous + 1)
  return clock
}

const door = (n: number, label: string, patch: Partial<TerritoryDoor> = {}) =>
  ({
    id: uuid(n),
    label,
    outcome: 'notHome',
    at: T0,
    tries: 1,
    ...patch,
  }) as TerritoryDoor

const territory = (patch: Partial<Territory> = {}): Territory => ({
  id: 'territory-1',
  number: '12',
  name: 'North Hill',
  checkedOutAt: T0 - DAY,
  createdAt: T0 - DAY,
  streets: [
    {
      id: OAK,
      name: 'Oak Street',
      numbering: 'both',
      next: 3,
      doors: [door(1, '1'), door(2, '2', { outcome: 'spoke' })],
      workedAt: T0,
    },
    { id: ELM, name: 'Elm Street', numbering: 'odd', next: 1, doors: [] },
  ],
  doNotCalls: [
    { id: uuid(9), address: '9 Elm Street', at: T0, streetId: ELM },
    { id: uuid(10), address: '1 Somewhere Else', at: T0 },
  ],
  ...patch,
})

const ownerSpace = (patch: Partial<TerritorySpace> = {}) =>
  emptySpace('S'.repeat(22), {
    territoryId: 'territory-1',
    myMemberId: ME,
    ownerId: ME,
    members: [
      { memberId: ME, dhPub: '', joinedAt: T0, scopes: null, invitedBy: null },
    ],
    ...patch,
  })

const seeded = (source = territory(), patch: Partial<TerritorySpace> = {}) => {
  const space = ownerSpace(patch)
  const changes = diffTerritory(null, source, space, {
    me: ME,
    myName: 'Me',
    houseRecords: true,
    stamp,
  })
  return { ...space, records: changes.records, local: changes.local }
}

const withRecords = (
  space: TerritorySpace,
  records: Record<string, TerritorySpaceRecord>
) => ({ ...space, records: { ...space.records, ...records } })

const project = (space: TerritorySpace, privacy = false) =>
  projectSpace(space, { privacy })

describe('seeding and projection', () => {
  it('a seeded territory projects back to what it was', () => {
    const space = seeded()
    const view = project(space)
    expect(view).toMatchObject({
      id: 'territory-1',
      number: '12',
      name: 'North Hill',
      shared: { role: 'owner', houseRecords: true, me: ME },
    })
    expect(view.streets.map((s) => s.name)).toEqual([
      'Oak Street',
      'Elm Street',
    ])
    expect(view.streets[0]).toMatchObject({ next: 3, workedAt: T0 })
    expect(view.streets[0]?.doors.map((d) => [d.id, d.by])).toEqual([
      [uuid(1), undefined],
      [uuid(2), undefined],
    ])
    expect(view.doNotCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: uuid(9), streetId: ELM }),
        expect.objectContaining({ id: uuid(10) }),
      ])
    )
    expect(view.received).toBeUndefined()
  })

  it('seeding writes the owner as the recorder and the grammar’s ids', () => {
    const space = seeded()
    expect(Object.keys(space.records).sort()).toEqual(
      [
        'h',
        `s.${S_OAK}`,
        `s.${S_ELM}`,
        `s.${S_OAK}.w`,
        `s.${S_OAK}.${uuid(1)}`,
        `s.${S_OAK}.${uuid(2)}`,
        `s.${S_ELM}.${uuid(9)}`,
        `d.${uuid(10)}`,
      ].sort()
    )
    expect(space.records[`s.${S_OAK}.${uuid(1)}`]?.data).toMatchObject({
      by: ME,
      byName: 'Me',
    })
    expect(space.records.h?.data?.houseRecords).toBe(true)
  })

  it('a re-diff of an unchanged view writes nothing', () => {
    const space = seeded()
    const view = project(space)
    const changes = diffTerritory(view, view, space, {
      me: ME,
      myName: 'Me',
      houseRecords: true,
      stamp,
    })
    expect(changes.records).toEqual({})
  })
})

describe('merge rules', () => {
  it('folds two records for one house: the later visit wins and days count as tries', () => {
    const space = withRecords(seeded(), {
      [`s.${S_OAK}.${uuid(5)}`]: {
        kind: 'door',
        data: {
          label: '1',
          outcome: 'spoke',
          at: T0 + DAY,
          tries: 1,
          by: JOE,
          byName: 'Joe',
        },
        stamp: T0 + DAY,
        deleted: false,
      },
    })
    const oak = project(space).streets[0]!
    const house = oak.doors.filter((d) => d.label === '1')
    expect(house).toHaveLength(1)
    expect(house[0]).toMatchObject({
      id: uuid(1),
      outcome: 'spoke',
      tries: 2,
      by: JOE,
    })
  })

  it('a do-not-call wins over a later visit to the same house', () => {
    const space = withRecords(seeded(), {
      [`s.${S_OAK}.${uuid(5)}`]: {
        kind: 'door',
        data: {
          label: '2',
          outcome: 'doNotCall',
          at: T0 - 1000,
          tries: 1,
          by: JOE,
        },
        stamp: T0,
        deleted: false,
      },
    })
    const house = project(space).streets[0]!.doors.find((d) => d.label === '2')
    expect(house?.outcome).toBe('doNotCall')
  })

  it('editing a folded house writes the lowest id and tombstones the others', () => {
    const space = withRecords(seeded(), {
      [`s.${S_OAK}.${uuid(5)}`]: {
        kind: 'door',
        data: { label: '1', outcome: 'spoke', at: T0 + DAY, tries: 1, by: JOE },
        stamp: T0 + DAY,
        deleted: false,
      },
    })
    const view = project(space)
    const after: Territory = {
      ...view,
      streets: view.streets.map((s, index) =>
        index === 0
          ? {
              ...s,
              doors: s.doors.map((d) =>
                d.label === '1'
                  ? { ...d, outcome: 'notHome', by: undefined }
                  : d
              ),
            }
          : s
      ),
    }
    const changes = diffTerritory(view, after, space, {
      me: ME,
      houseRecords: true,
      stamp,
    })
    expect(changes.records[`s.${S_OAK}.${uuid(1)}`]).toMatchObject({
      deleted: false,
      data: { outcome: 'notHome', by: ME },
    })
    expect(changes.records[`s.${S_OAK}.${uuid(5)}`]).toMatchObject({
      deleted: true,
    })
  })

  it('removing a street tombstones it and everything in it; a newer street record brings it back', () => {
    const space = seeded()
    const view = project(space)
    const changes = diffTerritory(
      view,
      { ...view, streets: view.streets.slice(1) },
      space,
      { me: ME, houseRecords: true, stamp }
    )
    const dropped = Object.entries(changes.records)
      .filter(([, r]) => r.deleted)
      .map(([id]) => id)
      .sort()
    expect(dropped).toEqual(
      [
        `s.${S_OAK}`,
        `s.${S_OAK}.w`,
        `s.${S_OAK}.${uuid(1)}`,
        `s.${S_OAK}.${uuid(2)}`,
      ].sort()
    )
    const removed = withRecords(space, changes.records)
    expect(project(removed).streets.map((s) => s.id)).toEqual([ELM])
    const back = withRecords(removed, {
      [`s.${S_OAK}`]: {
        kind: 'street',
        data: { id: OAK, name: 'Oak Street', numbering: 'both', order: 0 },
        stamp: clock + 10,
        deleted: false,
      },
    })
    expect(
      project(back)
        .streets.map((s) => s.id)
        .sort()
    ).toEqual([OAK, ELM])
  })

  it('undo puts the previous version again at a newer stamp', () => {
    const space = seeded()
    const view = project(space)
    const marked = {
      ...view,
      streets: view.streets.map((s) =>
        s.id === ELM ? { ...s, workedAt: T0 + 5 } : s
      ),
    }
    const first = diffTerritory(view, marked, space, {
      me: ME,
      houseRecords: true,
      stamp,
    })
    const after = withRecords(space, first.records)
    const undone = diffTerritory(project(after), view, after, {
      me: ME,
      houseRecords: true,
      stamp,
    })
    const record = undone.records[`s.${S_ELM}.w`]
    expect(record?.data?.at).toBeUndefined()
    expect(record!.stamp).toBeGreaterThan(first.records[`s.${S_ELM}.w`]!.stamp)
  })

  it('keeps fields a newer app added when writing a record back', () => {
    const space = withRecords(seeded(), {
      [`s.${S_ELM}`]: {
        kind: 'street',
        data: {
          id: ELM,
          name: 'Elm Street',
          numbering: 'odd',
          order: 1,
          color: 'red',
        },
        stamp: T0,
        deleted: false,
      },
    })
    const view = project(space)
    const changes = diffTerritory(
      view,
      {
        ...view,
        streets: view.streets.map((s) =>
          s.id === ELM ? { ...s, name: 'Elm Road' } : s
        ),
      },
      space,
      { me: ME, houseRecords: true, stamp }
    )
    expect(changes.records[`s.${S_ELM}`]?.data).toMatchObject({
      name: 'Elm Road',
      color: 'red',
    })
  })
})

describe('roles and privacy', () => {
  const memberSpace = (scopes: string[] | null) =>
    ({
      ...seeded(),
      myMemberId: JOE,
      members: [
        {
          memberId: ME,
          dhPub: '',
          joinedAt: T0,
          scopes: null,
          invitedBy: null,
        },
        { memberId: JOE, dhPub: '', joinedAt: T0 + 1, scopes, invitedBy: ME },
      ],
      records: {
        ...seeded().records,
        [`m.${ME}`]: {
          kind: 'member',
          data: { name: 'Anna', tag: 't', joinedAt: T0 },
          stamp: T0,
          deleted: false,
        },
      },
    }) as TerritorySpace

  it('a buddy sees the territory as received from the owner', () => {
    const view = project(memberSpace(null))
    expect(view.received).toMatchObject({
      kind: 'shared',
      from: { id: ME, name: 'Anna' },
    })
    expect(view.shared?.role).toBe('whole')
    expect(view.streets[0]?.doors[0]?.by).toBe(ME)
  })

  it('a buddy’s edits to the header are not written', () => {
    const space = memberSpace([S_OAK])
    const view = project(space)
    const changes = diffTerritory(view, { ...view, name: 'Mine now' }, space, {
      me: JOE,
      houseRecords: true,
      stamp,
    })
    expect(changes.records).toEqual({})
  })

  it('a holder sees the street as handed to them, the owner sees it handed off', () => {
    const holders = [
      { scopeId: S_OAK, memberId: JOE, inviteId: null, since: T0 },
    ]
    const onlyOak = memberSpace([S_OAK])
    const holder = project({
      ...onlyOak,
      holders,
      records: Object.fromEntries(
        Object.entries(onlyOak.records).filter(
          ([id]) => !id.startsWith(`s.${S_ELM}`) && !id.startsWith('d.')
        )
      ),
    })
    expect(holder.received?.kind).toBe('handoff')
    expect(holder.shared?.holds).toEqual([OAK])
    expect(holder.streets[0]?.handoff).toBeUndefined()
    const owner = project({
      ...memberSpace([S_OAK]),
      myMemberId: ME,
      holders,
    })
    expect(owner.streets[0]?.handoff).toMatchObject({ personId: JOE })
    expect(owner.shares?.some((share) => share.personId === JOE)).toBe(false)
  })

  it('privacy mode keeps only do-not-call doors, as place and date', () => {
    const space = withRecords(seeded(), {
      [`s.${S_OAK}.${uuid(6)}`]: {
        kind: 'door',
        data: {
          label: '6',
          outcome: 'doNotCall',
          at: T0,
          tries: 2,
          by: ANN,
          description: 'blue door',
        },
        stamp: T0,
        deleted: false,
      },
    })
    const hidden = project(space, true).streets[0]!.doors
    expect(hidden).toEqual([
      { id: uuid(6), label: '6', outcome: 'doNotCall', at: T0, tries: 1 },
    ])
    expect(project(space, false).streets[0]!.doors).toHaveLength(3)
  })

  it('the owner’s privacy mode hides doors from everyone', () => {
    const space = seeded()
    const off = withRecords(space, {
      h: {
        ...space.records.h!,
        data: { ...space.records.h!.data, houseRecords: false },
      },
    })
    const view = project({ ...off, myMemberId: JOE })
    expect(view.shared?.houseRecords).toBe(false)
    expect(view.streets[0]?.doors).toEqual([])
  })
})

describe('migration from the prototype', () => {
  it('drops simulated sharing and gives ids that aren’t UUIDs new ones', () => {
    const migrated = migrateTerritories(
      {
        territories: [
          {
            ...territory(),
            streets: [
              {
                id: 's1',
                name: 'Oak',
                numbering: 'both',
                next: 1,
                doors: [{ ...door(1, '1'), id: 'd1', by: 'p1' }],
                handoff: { personId: 'p1', at: T0 },
                workedBy: 'p1',
              },
            ],
            doNotCalls: [{ id: 'x', address: '1 Oak', at: T0, streetId: 's1' }],
            people: [{ id: 'p1', name: 'Joe', kind: 'buddy' }],
            shares: [{ id: 'sh', kind: 'link', createdAt: T0 }],
          },
          {
            ...territory({ id: 'received' }),
            received: {
              kind: 'shared',
              from: { id: 'p1', name: 'Joe', kind: 'buddy' },
              at: T0,
            },
          },
        ],
      },
      1
    ) as { territories: Territory[] }
    expect(migrated.territories).toHaveLength(1)
    const [only] = migrated.territories
    expect(only?.people).toBeUndefined()
    expect(only?.shares).toBeUndefined()
    const street = only!.streets[0]!
    expect(street.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(street.handoff).toBeUndefined()
    expect(street.workedBy).toBeUndefined()
    expect(street.doors[0]?.by).toBeUndefined()
    expect(street.doors[0]?.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(only!.doNotCalls[0]?.streetId).toBe(street.id)
  })
})
