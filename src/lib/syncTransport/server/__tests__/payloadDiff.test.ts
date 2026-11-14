import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  applyPayloadChange,
  diffPayload,
  fingerprintPayload,
  heldBy,
  parsePayloadChange,
  type PayloadTree,
} from '@/lib/syncTransport/server/payloadDiff'

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

type Row = { id: string } & Record<string, unknown>

type Sample = PayloadTree & {
  contactStore: { contacts: Row[]; deletedContacts: Row[] }
  serviceReportStore: {
    serviceReports: Record<string, Record<string, Row[]>>
    dayPlans: Row[]
    recurringPlans: Row[]
  }
  preferencesStore: {
    values: Record<string, unknown>
    updatedAt: Record<string, number>
  }
}

const base = (): Sample => ({
  version: 1,
  writtenAt: 1_000,
  calibratedClock: true,
  deviceId: 'device-a',
  resetEpoch: { id: 'epoch-1', at: 5 },
  contactStore: {
    contacts: [
      { id: 'c1', name: 'Ada', updatedAt: 10 },
      { id: 'c2', name: 'Ben', updatedAt: 11 },
    ],
    deletedContacts: [],
  },
  conversationStore: { conversations: [], explicitFollowUps: true },
  serviceReportStore: {
    serviceReports: { 2026: { 10: [{ id: 'r1', minutes: 60 }] } },
    dayPlans: [],
    recurringPlans: [],
  },
  preferencesStore: {
    values: { theme: 'dark', savedViews: [{ id: 'v2' }, { id: 'v1' }] },
    updatedAt: { theme: 3 },
  },
})

const normal = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    const items = value.map(normal)
    const ids = items.map((item) =>
      item && typeof item === 'object' && !Array.isArray(item)
        ? (item as { id?: unknown }).id
        : undefined
    )
    return ids.every((id) => typeof id === 'string')
      ? [...items].sort((a, b) =>
          (a as { id: string }).id < (b as { id: string }).id ? -1 : 1
        )
      : items
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value).sort()) {
      const child = normal((value as Record<string, unknown>)[key])
      const empty =
        child !== null &&
        typeof child === 'object' &&
        Object.keys(child).length === 0
      if (!empty) out[key] = child
    }
    return out
  }
  return value
}

const publish = (previous: PayloadTree, next: PayloadTree) => {
  const diff = diffPayload(next, fingerprintPayload(previous)!)!
  const reader = clone(previous)
  if (diff.change) applyPayloadChange(reader, clone(diff.change))
  return { diff, reader }
}

describe('diffPayload', () => {
  it('sends nothing when only the write time moved', () => {
    const next = { ...base(), writtenAt: 2_000 }
    const { diff } = publish(base(), next)
    expect(diff.change).toBeNull()
    expect(diff.fingerprints).toEqual(fingerprintPayload(base()))
  })

  it('sends one edited record, whole, with the write time', () => {
    const next = base()
    next.writtenAt = 2_000
    next.contactStore.contacts[1].name = 'Benjamin'
    const { diff, reader } = publish(base(), next)
    expect(diff.change).toEqual({
      v: 1,
      records: {
        'contactStore/contacts': [
          { id: 'c2', name: 'Benjamin', updatedAt: 11 },
        ],
      },
      leaves: { writtenAt: 2_000, calibratedClock: true },
    })
    expect(reader).toEqual(next)
    expect(diff.needsBase).toBe(false)
  })

  it('carries a deletion as the record leaving and its tombstone arriving', () => {
    const next = base()
    next.contactStore.contacts.shift()
    next.contactStore.deletedContacts = [{ id: 'c1', deletedAt: 20 }]
    const { diff, reader } = publish(base(), next)
    expect(diff.change?.removedRecords).toEqual({
      'contactStore/contacts': ['c1'],
    })
    expect(diff.change?.records).toEqual({
      'contactStore/deletedContacts': [{ id: 'c1', deletedAt: 20 }],
    })
    expect(reader).toEqual(next)
  })

  it('adds a time entry under a month that is new', () => {
    const next = base()
    next.serviceReportStore.serviceReports[2026][11] = [
      { id: 'r2', minutes: 30 },
    ]
    const { diff, reader } = publish(base(), next)
    expect(diff.change?.records).toEqual({
      'serviceReportStore/serviceReports/2026/11': [{ id: 'r2', minutes: 30 }],
    })
    expect(reader).toEqual(next)
  })

  it('sends preferences as one piece, so their order stays', () => {
    const next = base()
    next.preferencesStore.values.theme = 'light'
    const { diff, reader } = publish(base(), next)
    expect(diff.change?.leaves?.preferencesStore).toEqual(next.preferencesStore)
    expect(diff.change?.records).toBeUndefined()
    expect(reader).toEqual(next)
  })

  it('asks for a base when the reset generation or the device changes', () => {
    const reset = { ...base(), resetEpoch: { id: 'epoch-2', at: 9 } }
    expect(publish(base(), reset).diff.needsBase).toBe(true)
    const gone = base()
    delete gone.resetEpoch
    expect(publish(base(), gone).diff.needsBase).toBe(true)
    expect(publish(base(), { ...base(), deviceId: 'x' }).diff.needsBase).toBe(
      true
    )
  })

  it('refuses a payload whose keys it could not address', () => {
    expect(diffPayload({ 'a/b': 1 }, {})).toBeNull()
    expect(fingerprintPayload({})).toBeNull()
  })

  it('skips a record another slot already holds, and sends it once that slot is gone', () => {
    const mine = base()
    const theirs = base()
    const received = { id: 'c3', name: 'Cy', updatedAt: 30 }
    theirs.contactStore.contacts.push(received)
    const merged = base()
    merged.contactStore.contacts.push({ ...received })
    const known = fingerprintPayload(mine)!

    const held = diffPayload(merged, known, heldBy([theirs]))!
    expect(held.change).toBeNull()
    expect(held.fingerprints).toEqual(known)

    const alone = diffPayload(merged, held.fingerprints, heldBy([]))!
    expect(alone.change?.records).toEqual({
      'contactStore/contacts': [received],
    })
  })

  it('sends a record it changed after another slot sent it', () => {
    const theirs = base()
    theirs.contactStore.contacts[0].name = 'Ada L.'
    const merged = clone(theirs)
    merged.contactStore.contacts[0].name = 'Ada Lovelace'
    const diff = diffPayload(
      merged,
      fingerprintPayload(base())!,
      heldBy([theirs])
    )!
    expect(diff.change?.records).toEqual({
      'contactStore/contacts': [
        { id: 'c1', name: 'Ada Lovelace', updatedAt: 10 },
      ],
    })
  })

  it('keeps a list that only holds other slots’ records', () => {
    const mine = base()
    mine.contactStore.contacts = []
    const theirs = base()
    const merged = clone(theirs)
    const { change } = diffPayload(
      merged,
      fingerprintPayload(mine)!,
      heldBy([theirs])
    )!
    const reader = clone(mine)
    if (change) applyPayloadChange(reader, change)
    expect(reader.contactStore.contacts).toEqual([])
  })
})

describe('applyPayloadChange', () => {
  it('never writes through an unsafe path', () => {
    const target: PayloadTree = { a: {} }
    applyPayloadChange(target, {
      v: 1,
      leaves: { '__proto__/polluted': true, 'a/constructor/x': 1 },
      records: { 'a/__proto__': [{ id: 'x' }] },
      removedLeaves: ['a/prototype'],
    })
    expect(({} as { polluted?: unknown }).polluted).toBeUndefined()
    expect(target).toEqual({ a: {} })
  })

  it('reads only a change of its own version', () => {
    expect(parsePayloadChange({ v: 1 })).toEqual({ v: 1 })
    expect(parsePayloadChange({ v: 2, leaves: {} })).toBe('newer')
    expect(parsePayloadChange({ v: 1, records: { a: 'x' } })).toBeNull()
    expect(parsePayloadChange({ v: 1, removedLeaves: [1] })).toBeNull()
    expect(parsePayloadChange([])).toBeNull()
  })
})

const record = fc.record({
  id: fc.constantFrom('a', 'b', 'c', 'd', 'e', 'f'),
  n: fc.integer({ min: 0, max: 3 }),
})
const records = fc.uniqueArray(record, { selector: (item) => item.id })
const leaf = fc.oneof(
  fc.integer({ min: 0, max: 2 }),
  fc.constantFrom('x', 'y'),
  fc.constant(null),
  fc.array(fc.integer({ min: 0, max: 2 }), { maxLength: 2 }),
  fc.constant({})
)
const store = fc.dictionary(
  fc.constantFrom('one', 'two', 'three'),
  fc.oneof(records, leaf, fc.dictionary(fc.constantFrom('7', '8'), records)),
  { maxKeys: 3 }
)
const payload = fc.record({
  version: fc.constant(1),
  writtenAt: fc.integer({ min: 1, max: 9 }),
  deviceId: fc.constant('device-a'),
  contactStore: store,
  serviceReportStore: store,
  preferencesStore: fc.record({
    values: fc.dictionary(fc.constantFrom('p', 'q'), leaf),
  }),
})

describe('a base and its changes', () => {
  it('rebuild what the writer holds, through any run of edits', () => {
    fc.assert(
      fc.property(
        fc.array(payload, { minLength: 2, maxLength: 6 }),
        (versions) => {
          const reader = clone(versions[0]) as PayloadTree
          let known = fingerprintPayload(versions[0])!
          for (const next of versions.slice(1)) {
            const diff = diffPayload(next, known)!
            if (diff.change) applyPayloadChange(reader, clone(diff.change))
            reader.writtenAt = next.writtenAt
            known = diff.fingerprints
            expect(normal(reader)).toEqual(normal(next))
            expect(known).toEqual(fingerprintPayload(next))
          }
        }
      ),
      { numRuns: 500 }
    )
  })

  it('send nothing for a payload that did not change', () => {
    fc.assert(
      fc.property(payload, (value) => {
        const diff = diffPayload(clone(value), fingerprintPayload(value)!)!
        expect(diff.change).toBeNull()
      })
    )
  })
})
