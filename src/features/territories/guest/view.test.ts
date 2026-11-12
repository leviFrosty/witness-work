import { describe, expect, it, vi } from 'vitest'
import {
  inScopeRecordId,
  streetRecordId,
  workedRecordId,
} from '@/lib/sharedSpaces/records'
import { scopeIdForStreet } from '@/lib/sharedSpaces/scopes'
import type { GuestKeysData } from '@/features/territories/guest/codecs'
import type { GuestRecord } from '@/features/territories/guest/session'
import { projectGuestView } from '@/features/territories/guest/view'
import { guestChange } from '@/features/territories/guest/writes'
import { logDoor, updateStreet } from '@/features/territories/lib/doors'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))

const OAK = '11111111-1111-4111-8111-111111111111'
const ELM = '22222222-2222-4222-8222-222222222222'
const HIDDEN = '33333333-3333-4333-8333-333333333333'
const S1 = scopeIdForStreet(OAK)
const S2 = scopeIdForStreet(ELM)
const S3 = scopeIdForStreet(HIDDEN)
const D1 = 'aaaaaaaa-0000-4000-8000-000000000001'
const D2 = 'aaaaaaaa-0000-4000-8000-000000000002'
const D3 = 'aaaaaaaa-0000-4000-8000-000000000003'
const G = 'bbbbbbbb-0000-4000-8000-000000000001'
const N = 'cccccccc-0000-4000-8000-000000000001'

const keys = (houseRecords = true): GuestKeysData => ({
  title: '12 · North Hill',
  from: 'Anna',
  houseRecords,
  scopes: { [S1]: { 1: new Uint8Array(32) }, [S2]: { 1: new Uint8Array(32) } },
  expiresAt: 1000,
})

const rec = (
  recordId: string,
  kind: string,
  data: Record<string, unknown> | null,
  deleted = false
): [string, GuestRecord] => [
  recordId,
  { recordId, kind, data, deleted, stamp: 1 },
]

const records = new Map<string, GuestRecord>([
  rec(streetRecordId(S1), 'street', {
    id: OAK,
    name: 'Oak Street',
    numbering: 'both',
    order: 1,
  }),
  rec(streetRecordId(S2), 'street', {
    id: ELM,
    name: 'Elm Street',
    numbering: 'odd',
    order: 0,
  }),
  rec(streetRecordId(S3), 'street', {
    id: HIDDEN,
    name: 'Hidden',
    numbering: 'both',
    order: 0,
  }),
  rec(inScopeRecordId(S1, D2), 'door', {
    label: '1',
    outcome: 'doNotCall',
    at: 5,
    tries: 1,
    by: 'm1',
    byName: 'Anna',
  }),
  rec(inScopeRecordId(S1, D1), 'door', {
    label: '1',
    outcome: 'notHome',
    at: 9,
    tries: 1,
    by: 'm2',
    byName: 'Joe',
    future: true,
  }),
  rec(inScopeRecordId(S1, D3), 'door', {
    label: '2',
    outcome: 'spoke',
    at: 9,
    tries: 1,
    by: G,
  }),
  rec(inScopeRecordId(S1, G), 'guest', {
    name: 'Maria',
    linkId: 'L',
    joinedAt: 1,
  }),
  rec(inScopeRecordId(S2, N), 'doNotCall', {
    address: '7 Elm Street',
    at: 3,
    label: '7',
  }),
  rec(workedRecordId(S2), 'worked', { at: 4, by: 'm1', byName: 'Anna' }),
])

describe('projectGuestView', () => {
  it('shows only the link’s streets, in order, with the house numbers folded', () => {
    const view = projectGuestView('space', keys(), records, {})
    expect(view.streets.map((street) => street.name)).toEqual([
      'Elm Street',
      'Oak Street',
    ])
    const oak = view.streets[1]!
    expect(oak.doors).toHaveLength(2)
    const one = oak.doors.find((door) => door.label === '1')!
    expect(one).toMatchObject({ id: D1, outcome: 'doNotCall' })
    expect(view.folded.get(D1)).toEqual([D2])
    expect(oak.next).toBe(3)
    expect(view.streets[0]).toMatchObject({
      workedAt: 4,
      workedBy: 'm1',
      next: 1,
    })
    expect(view.territory.doNotCalls).toEqual([
      { id: N, address: '7 Elm Street', at: 3, label: '7', streetId: ELM },
    ])
    expect(view.territory.people).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: G, name: 'Maria', kind: 'guest' }),
        expect.objectContaining({ id: 'm2', name: 'Joe' }),
      ])
    )
  })

  it('keeps only do-not-call doors when house records are off', () => {
    const view = projectGuestView('space', keys(false), records, {})
    expect(view.houseRecords).toBe(false)
    expect(view.streets[1]!.doors.map((door) => door.outcome)).toEqual([
      'doNotCall',
    ])
  })

  it('hides a removed street and everything on it', () => {
    const removed = new Map(records)
    removed.set(...rec(streetRecordId(S1), 'street', null, true))
    expect(
      projectGuestView('space', keys(), removed, {}).streets.map((s) => s.name)
    ).toEqual(['Elm Street'])
  })
})

describe('guestChange', () => {
  const guest = { id: G, name: 'Maria' }

  it('writes a recorded door with its recorder, folding the house into its lowest id', () => {
    const view = projectGuestView('space', keys(), records, {})
    const after = updateStreet(view.territory, OAK, (street) =>
      logDoor(street, {
        id: 'dddddddd-0000-4000-8000-000000000001',
        label: '1',
        outcome: 'spoke',
        at: 20,
        by: G,
      })
    )
    const change = guestChange(view.territory, after, view, guest)
    expect(change.recorded).toBe(true)
    const put = change.writes.find(
      (write) => write.recordId === inScopeRecordId(S1, D1)
    )
    expect(put?.data).toMatchObject({
      label: '1',
      outcome: 'spoke',
      by: G,
      byName: 'Maria',
      future: true,
    })
    expect(change.writes).toContainEqual({
      recordId: inScopeRecordId(S1, D2),
      kind: 'door',
      deleted: true,
    })
  })

  it('tombstones a door the guest removed or undid, and keeps next on the device', () => {
    const view = projectGuestView('space', keys(), records, {})
    const after = updateStreet(view.territory, OAK, (street) => ({
      ...street,
      next: 8,
      doors: street.doors.filter((door) => door.id !== D3),
    }))
    const change = guestChange(view.territory, after, view, guest)
    expect(change.writes).toEqual([
      { recordId: inScopeRecordId(S1, D3), kind: 'door', deleted: true },
    ])
    expect(change.next).toEqual([{ streetId: OAK, next: 8 }])
  })

  it('marks a street worked and adds a do-not-call', () => {
    const view = projectGuestView('space', keys(false), records, {})
    const worked = updateStreet(view.territory, OAK, (street) => ({
      ...street,
      workedAt: 30,
      workedBy: G,
    }))
    const after = {
      ...worked,
      doNotCalls: [
        ...worked.doNotCalls,
        { id: N.replace('c', 'e'), address: '9 Oak', at: 31, streetId: OAK },
      ],
    }
    const change = guestChange(view.territory, after, view, guest)
    expect(change.writes).toEqual([
      {
        recordId: workedRecordId(S1),
        kind: 'worked',
        data: { at: 30, by: G, byName: 'Maria' },
      },
      {
        recordId: inScopeRecordId(S1, N.replace('c', 'e')),
        kind: 'doNotCall',
        data: { address: '9 Oak', at: 31 },
      },
    ])
  })
})
