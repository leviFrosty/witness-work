import fc from 'fast-check'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('expo-crypto', () => ({ randomUUID: () => 'generated' }))
vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock(
  '@react-native-async-storage/async-storage',
  () => import('@/__tests__/mocks/asyncStorage')
)
vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))

import { mergePayload } from '@/app/sync/merge'
import {
  emptyDevice,
  payloadOf,
  pullFrom,
  type DeviceState,
} from '@/__tests__/helpers/syncPeer'
import {
  BASE_SETTINGS,
  PINNED_NOW,
  deviceArb,
  deviceSnapshot,
  fcSeed,
  flattenEntries,
} from '@/__tests__/helpers/dataArbitraries'

// Laws the sync merge (`mergePayload`, through `pullFrom` as `pullAndMerge`
// runs it) must keep for iCloud, Google Drive and Cloud Sync alike: the order
// devices pull in can't change what they end up with, pulling the same data
// again changes nothing, and a tombstone removes exactly the records it's
// newer than or tied with (#1003). Reproduce a failure with
// `FC_SEED=<seed> pnpm vitest run src/__tests__/syncMergeProperties.test.ts`.

const runs = { numRuns: 150, seed: fcSeed }

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(PINNED_NOW)
})
afterAll(() => {
  vi.useRealTimers()
})

const merge = (a: DeviceState, b: DeviceState) => pullFrom(a, b)

/** The tombstone lists each synced record list answers to. */
const TOMBSTONED_LISTS: [keyof DeviceState, keyof DeviceState][] = [
  ['conversations', 'deletedConversations'],
  ['dayPlans', 'deletedDayPlans'],
  ['recurringPlans', 'deletedRecurringPlans'],
  ['categories', 'deletedCategories'],
  ['vehicles', 'deletedMileageRecords'],
  ['fuels', 'deletedMileageRecords'],
  ['fuelPrices', 'deletedMileageRecords'],
  ['vehicleSetups', 'deletedMileageRecords'],
  ['trips', 'deletedMileageRecords'],
  ['pets', 'deletedPetRecords'],
  ['petRooms', 'deletedPetRecords'],
]

type Stamped = { id: string; updatedAt?: number }
type Tombstone = { id: string; deletedAt: number }

const recordsOf = (device: DeviceState, list: keyof DeviceState): Stamped[] =>
  list === 'serviceReports'
    ? flattenEntries(device.serviceReports)
    : (device[list] as Stamped[])

const ALL_LISTS: [keyof DeviceState, keyof DeviceState][] = [
  ...TOMBSTONED_LISTS,
  ['serviceReports', 'deletedServiceReports'],
]

/**
 * `device` without its pet's wakes, keepsakes and earned items. Each merge
 * unions them only over the copies it sees of the companion that wins, newer
 * than any tombstone it sees (`mergePetHistory`). So a copy that first meets a
 * release, or another adoption that wins for now, adds nothing, while meeting
 * the eventual winner first adds its history: the result depends on the order
 * until that copy's file is pulled again.
 */
const withoutPetHistory = (device: DeviceState): DeviceState => ({
  ...device,
  pets: device.pets.map(
    ({ wakes: _w, keepsakes: _k, earnedRoomItems: _e, ...pet }) =>
      pet as DeviceState['pets'][number]
  ),
})

/** Contacts some device permanently deleted (a redacted tombstone). */
const redactedIds = (devices: DeviceState[]) =>
  new Set(
    devices.flatMap((d) =>
      d.deletedContacts.filter((c) => c.redacted).map((c) => c.id)
    )
  )

/**
 * `device` without the contacts in `ids`. A redacted tombstone meeting an
 * archived copy keeps its own, older stamp, so an edit made between the two
 * brings the contact back when it meets the result, and not when it meets the
 * archived copy first: the outcome depends on the order devices pull in. (An
 * edit newer than the redaction also drops it when they meet first, while an
 * archived copy meeting it first is redacted.)
 */
const withoutRedacted = (device: DeviceState, ids: Set<string>) => ({
  ...device,
  contacts: device.contacts.filter((c) => !ids.has(c.id)),
  deletedContacts: device.deletedContacts.filter((c) => !ids.has(c.id)),
})

describe('sync merge laws', () => {
  // Values only: see `deviceSnapshot` on stamps.
  const values = (device: DeviceState) =>
    deviceSnapshot(device, { stamps: false })

  it('is commutative: two devices pulling each other agree', () => {
    fc.assert(
      fc.property(deviceArb, deviceArb, (a, b) => {
        expect(values(merge(a, b))).toBe(values(merge(b, a)))
      }),
      runs
    )
  })

  it('is idempotent: pulling a device into itself changes nothing', () => {
    fc.assert(
      fc.property(deviceArb, (a) => {
        expect(values(merge(a, a))).toBe(values(a))
      }),
      runs
    )
  })

  it('settles: pulling any file already merged reports no change', () => {
    // A pull that keeps reporting a change pushes again, and the devices
    // would trade the same files forever.
    //
    // The role's and Role History's stamps are left out. A merge gives both
    // the newer of the two, where the store stamps only the one that changed,
    // and adopting another device's history when this one had none takes its
    // stamp but not its per-month stamps (#1073); the next pull of
    // that device adds them.
    // Pet history and permanently deleted contacts are left out too, as in
    // associativity below.
    const settled = (
      device: DeviceState,
      redacted: Set<string>
    ): DeviceState => ({
      ...withoutRedacted(withoutPetHistory(device), redacted),
      preferenceUpdatedAt: Object.fromEntries(
        Object.entries(device.preferenceUpdatedAt).filter(
          ([key]) => key !== 'role' && !key.startsWith('roleHistory')
        )
      ),
    })
    fc.assert(
      fc.property(deviceArb, deviceArb, deviceArb, (a, b, c) => {
        const all = merge(merge(a, b), c)
        const redacted = redactedIds([a, b, c])
        for (const device of [a, b, c, all]) {
          const { changed, ...again } = mergePayload(all, payloadOf(device))
          expect(deviceSnapshot(settled(again, redacted))).toBe(
            deviceSnapshot(settled(all, redacted))
          )
          expect(changed).toBe(deviceSnapshot(again) !== deviceSnapshot(all))
          // Pulling that file a second time changes nothing at all.
          expect(mergePayload(again, payloadOf(device)).changed).toBe(false)
        }
      }),
      runs
    )
  })

  it('is associative across three devices', () => {
    // Three exceptions, each only until the next exchange between the
    // devices:
    //
    // - Pet history (see `withoutPetHistory`).
    // - A contact one device permanently deleted (see `withoutRedacted`).
    // - The role and Role History. A history meeting a device without one is
    //   kept or replaced whole, by the pair's stamps, but two histories merge
    //   month by month. So a month from an older history is gone if it first
    //   meets a newer role set without history, and kept if that device has
    //   since taken another history, which has no stamp for that month.
    //
    // Either way, the next pull between the two results agrees.
    const withoutRole = (device: DeviceState): DeviceState => {
      const { role: _r, roleHistory: _h, ...rest } = device.preferencesValues
      return { ...device, preferencesValues: rest }
    }
    fc.assert(
      fc.property(deviceArb, deviceArb, deviceArb, (a, b, c) => {
        const left = merge(merge(a, b), c)
        const right = merge(a, merge(b, c))
        const redacted = redactedIds([a, b, c])
        const strict = (device: DeviceState) =>
          values(
            withoutRole(withoutRedacted(withoutPetHistory(device), redacted))
          )
        expect(strict(left)).toBe(strict(right))
        expect(values(merge(left, right))).toBe(values(merge(right, left)))
      }),
      { ...runs, numRuns: 100 }
    )
  })

  it('a fresh install pulling a device gets every record and setting', () => {
    const freshInstall = emptyDevice({
      preferencesValues: structuredClone(BASE_SETTINGS),
      profileValues: { name: '' },
    })
    fc.assert(
      fc.property(deviceArb, (a) => {
        expect(values(merge(freshInstall, a))).toBe(values(a))
      }),
      runs
    )
  })
})

describe('sync merge tombstones (#1003)', () => {
  it('never resurrects a record its tombstone is newer than or tied with', () => {
    fc.assert(
      fc.property(deviceArb, deviceArb, deviceArb, (a, b, c) => {
        const devices = [a, b, c]
        const merged = merge(merge(a, b), c)
        for (const [list, tombs] of ALL_LISTS) {
          const deletedAt = new Map<string, number>()
          for (const device of devices)
            for (const t of device[tombs] as Tombstone[])
              deletedAt.set(
                t.id,
                Math.max(deletedAt.get(t.id) ?? 0, t.deletedAt)
              )
          for (const record of recordsOf(merged, list)) {
            const deleted = deletedAt.get(record.id)
            if (deleted !== undefined)
              expect(
                record.updatedAt ?? 0,
                `${String(list)} ${record.id} survived its tombstone`
              ).toBeGreaterThan(deleted)
          }
        }
      }),
      runs
    )
  })

  it('never drops a live record newer than every tombstone for it', () => {
    fc.assert(
      fc.property(deviceArb, deviceArb, deviceArb, (a, b, c) => {
        const devices = [a, b, c]
        const merged = merge(merge(a, b), c)
        for (const [list, tombs] of ALL_LISTS) {
          const deletedAt = new Map<string, number>()
          for (const device of devices)
            for (const t of device[tombs] as Tombstone[])
              deletedAt.set(
                t.id,
                Math.max(deletedAt.get(t.id) ?? 0, t.deletedAt)
              )
          const kept = new Set(recordsOf(merged, list).map((r) => r.id))
          for (const device of devices)
            for (const record of recordsOf(device, list))
              if ((record.updatedAt ?? 0) > (deletedAt.get(record.id) ?? -1))
                expect(
                  kept.has(record.id),
                  `${String(list)} ${record.id} was dropped`
                ).toBe(true)
        }
      }),
      runs
    )
  })

  it('keeps the newest copy of every surviving record', () => {
    fc.assert(
      fc.property(deviceArb, deviceArb, (a, b) => {
        const merged = merge(a, b)
        for (const [list] of ALL_LISTS) {
          const newest = new Map<string, number>()
          for (const device of [a, b])
            for (const r of recordsOf(device, list))
              newest.set(
                r.id,
                Math.max(newest.get(r.id) ?? 0, r.updatedAt ?? 0)
              )
          for (const r of recordsOf(merged, list))
            expect(r.updatedAt ?? 0).toBe(newest.get(r.id))
        }
      }),
      runs
    )
  })

  it('a contact is active exactly when its newest active copy beats every archived one', () => {
    fc.assert(
      fc.property(deviceArb, deviceArb, (a, b) => {
        const merged = merge(a, b)
        const newestActive = new Map<string, number>()
        const newestArchived = new Map<string, number>()
        for (const device of [a, b]) {
          for (const c of device.contacts)
            newestActive.set(
              c.id,
              Math.max(newestActive.get(c.id) ?? 0, c.updatedAt ?? 0)
            )
          for (const c of device.deletedContacts)
            newestArchived.set(
              c.id,
              Math.max(newestArchived.get(c.id) ?? 0, c.updatedAt ?? 0)
            )
        }
        const active = new Set(merged.contacts.map((c) => c.id))
        const archived = new Set(merged.deletedContacts.map((c) => c.id))
        for (const [id, stamp] of newestActive) {
          const shouldBeActive = stamp > (newestArchived.get(id) ?? -1)
          expect(active.has(id), `contact ${id} active`).toBe(shouldBeActive)
          expect(archived.has(id), `contact ${id} archived`).toBe(
            !shouldBeActive
          )
        }
        for (const id of newestArchived.keys())
          if (!newestActive.has(id)) expect(archived.has(id)).toBe(true)
      }),
      runs
    )
  })
})
