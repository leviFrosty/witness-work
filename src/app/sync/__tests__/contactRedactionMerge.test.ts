import { describe, expect, it } from 'vitest'
import { alignPayloadClock } from '@/app/sync/clockSkew'
import { mergePayload } from '@/app/sync/merge'
import { payloadSchema } from '@/app/sync/payloadValidation'
import { foldRemotePayloads } from '@/app/sync/foldRemotePayloads'
import type { SyncPayload } from '@/app/sync/payload'
import { stripContactForTombstone } from '@/lib/dataProtection'
import type { Contact } from '@/types/contact'

// Redaction is one-way. A permanent delete (or data protection) leaves a
// redacted tombstone; a full archived copy of the same contact stamped later on
// another device must not bring the householder's details back. Only adding the
// contact again (`readdedAt`) ends it.

type LocalState = Parameters<typeof mergePayload>[0]

const NOW = Date.now()
/** The phone deletes the contact permanently. */
const ERASED_AT = NOW - 60_000
/** The iPad, offline meanwhile, archives its copy afterwards. */
const ARCHIVED_AT = NOW - 30_000

const full = (updatedAt: number): Contact => ({
  id: 'c',
  name: 'Householder',
  phone: '555-0100',
  address: { line1: '1 Main St', city: 'Town' },
  customFields: { field: 'private' },
  createdAt: new Date('2025-01-01T12:00:00.000Z'),
  updatedAt,
})
const redacted = (updatedAt: number) =>
  stripContactForTombstone(full(updatedAt), updatedAt)
/** A copy descending from `addContact` replacing the tombstone at `readdedAt`. */
const readded = (updatedAt: number, readdedAt: number): Contact => ({
  ...full(updatedAt),
  name: 'Added again',
  readdedAt,
})

const localWith = (deletedContacts: Contact[], contacts: Contact[] = []) =>
  ({
    contacts,
    deletedContacts,
    customFieldDefs: [],
    deletedCustomFieldDefs: [],
    conversations: [],
    deletedConversations: [],
    serviceReports: {},
    dayPlans: [],
    recurringPlans: [],
    deletedServiceReports: [],
    categories: [],
    deletedCategories: [],
    vehicles: [],
    fuels: [],
    fuelPrices: [],
    vehicleSetups: [],
    trips: [],
    deletedMileageRecords: [],
    preferencesValues: {},
    preferenceUpdatedAt: {},
    profileValues: {},
    profileUpdatedAt: {},
  }) satisfies LocalState

const payload = (
  deviceId: string,
  deletedContacts: Contact[],
  contacts: Contact[] = []
): SyncPayload => ({
  version: 1,
  writtenAt: NOW,
  deviceId,
  // Wire shape: dates travel as JSON strings.
  contactStore: JSON.parse(JSON.stringify({ contacts, deletedContacts })),
  conversationStore: { conversations: [] },
  serviceReportStore: { serviceReports: {}, dayPlans: [], recurringPlans: [] },
  preferencesStore: { values: {}, updatedAt: {} },
})

describe('mergePayload — redacted contact tombstones', () => {
  it('keeps the tombstone redacted when a newer full copy arrives', () => {
    const result = mergePayload(
      localWith([redacted(ERASED_AT)]),
      payload('ipad', [full(ARCHIVED_AT)])
    )

    expect(result.deletedContacts).toEqual([redacted(ERASED_AT)])
    expect(result.contacts).toEqual([])
    // The phone already holds that tombstone; the iPad's copy is dropped.
    expect(result.changed).toBe(false)
  })

  it('redacts a newer full local copy when the tombstone arrives', () => {
    const result = mergePayload(
      localWith([full(ARCHIVED_AT)]),
      payload('phone', [redacted(ERASED_AT)])
    )

    expect(result.deletedContacts).toEqual([redacted(ERASED_AT)])
    expect(JSON.stringify(result.deletedContacts)).not.toMatch(
      /Householder|555|Main|private/
    )
    expect(result.changed).toBe(true)
  })

  it('keeps the tombstone at its own stamp, so files fold in any order', () => {
    const phone = payload('phone', [redacted(ERASED_AT)])
    const ipad = payload('ipad', [full(ARCHIVED_AT)])

    expect(
      foldRemotePayloads([phone, ipad])!.contactStore.deletedContacts
    ).toEqual(foldRemotePayloads([ipad, phone])!.contactStore.deletedContacts)
  })

  it('keeps a newer tombstone at its own stamp, from either side', () => {
    expect(
      mergePayload(
        localWith([redacted(ARCHIVED_AT)]),
        payload('ipad', [full(ERASED_AT)])
      ).deletedContacts
    ).toEqual([redacted(ARCHIVED_AT)])
    expect(
      mergePayload(
        localWith([full(ERASED_AT)]),
        payload('phone', [redacted(ARCHIVED_AT)])
      ).deletedContacts
    ).toEqual([redacted(ARCHIVED_AT)])
  })

  it('redacts on equal stamps, from either side', () => {
    expect(
      mergePayload(
        localWith([redacted(ERASED_AT)]),
        payload('ipad', [full(ERASED_AT)])
      ).deletedContacts
    ).toEqual([redacted(ERASED_AT)])
    expect(
      mergePayload(
        localWith([full(ERASED_AT)]),
        payload('phone', [redacted(ERASED_AT)])
      ).deletedContacts
    ).toEqual([redacted(ERASED_AT)])
  })

  it('settles: merging the same file again changes nothing', () => {
    const remote = payload('ipad', [full(ARCHIVED_AT)])
    const { changed: _changed, ...once } = mergePayload(
      localWith([redacted(ERASED_AT)]),
      remote
    )

    expect(mergePayload(once, remote).changed).toBe(false)
  })

  it('lands on the same tombstone whatever order the files fold in', () => {
    const phone = payload('phone', [redacted(ERASED_AT)])
    const ipad = payload('ipad', [full(ARCHIVED_AT)])
    const mac = payload('mac', [full(ERASED_AT - 60_000)])
    const orders = [
      [phone, ipad, mac],
      [ipad, phone, mac],
      [mac, ipad, phone],
      [ipad, mac, phone],
    ]

    for (const files of orders) {
      expect(foldRemotePayloads(files)!.contactStore.deletedContacts).toEqual([
        redacted(ERASED_AT),
      ])
    }
  })

  it('keeps alias history on the tombstone', () => {
    const aliased = { ...full(ARCHIVED_AT), legacyIds: ['old-id'] } as Contact

    const result = mergePayload(
      localWith([redacted(ERASED_AT)]),
      payload('ipad', [aliased])
    )

    expect(result.deletedContacts).toEqual([
      { ...redacted(ERASED_AT), legacyIds: ['old-id'] },
    ])
  })

  it('still lets a strictly newer active copy win (adding the contact again)', () => {
    const readded = { ...full(NOW - 1_000), name: 'Added again' }

    const result = mergePayload(
      localWith([redacted(ERASED_AT)]),
      payload('ipad', [], [readded])
    )

    expect(result.contacts.map((contact) => contact.name)).toEqual([
      'Added again',
    ])
    expect(result.deletedContacts).toEqual([])
  })

  it('leaves unredacted deleted contacts to plain last-writer-wins', () => {
    const result = mergePayload(
      localWith([full(ERASED_AT)]),
      payload('ipad', [{ ...full(ARCHIVED_AT), name: 'Renamed' }])
    )

    expect(result.deletedContacts.map((contact) => contact.name)).toEqual([
      'Renamed',
    ])
  })
})

describe('mergePayload — a re-added contact ends the redaction', () => {
  /** `addContact` replaced the tombstone, stamped newer than it. */
  const READDED_AT = ERASED_AT + 10_000
  /** The re-added contact is later deleted normally. */
  const REARCHIVED_AT = NOW - 1_000

  it('keeps the archive of a re-added contact, from either side', () => {
    expect(
      mergePayload(
        localWith([readded(REARCHIVED_AT, READDED_AT)]),
        payload('stale', [redacted(ERASED_AT)])
      ).deletedContacts
    ).toEqual([readded(REARCHIVED_AT, READDED_AT)])

    const pulled = mergePayload(
      localWith([redacted(ERASED_AT)]),
      payload('phone', [readded(REARCHIVED_AT, READDED_AT)])
    )
    expect(JSON.parse(JSON.stringify(pulled.deletedContacts))).toEqual(
      JSON.parse(JSON.stringify([readded(REARCHIVED_AT, READDED_AT)]))
    )
    expect(pulled.changed).toBe(true)
  })

  it('keeps it whatever order the files fold in', () => {
    const files = [
      payload('stale', [redacted(ERASED_AT)]),
      payload('phone', [readded(REARCHIVED_AT, READDED_AT)]),
      // Offline meanwhile, the iPad archived its copy from before the
      // permanent delete, last of all.
      payload('ipad', [full(REARCHIVED_AT + 500)]),
      payload('mac', [full(ERASED_AT - 60_000)]),
    ]
    const permutations = (list: SyncPayload[]): SyncPayload[][] =>
      list.length <= 1
        ? [list]
        : list.flatMap((file, i) =>
            permutations([...list.slice(0, i), ...list.slice(i + 1)]).map(
              (rest) => [file, ...rest]
            )
          )

    for (const order of permutations(files)) {
      const deleted = foldRemotePayloads(order)!.contactStore.deletedContacts
      expect(
        deleted.map((contact) => [contact.name, contact.readdedAt])
      ).toEqual([['Added again', READDED_AT]])
    }
  })

  it('still redacts a copy from before the latest permanent delete', () => {
    // Re-added once before, then deleted permanently: the offline iPad's
    // archive descends from the earlier re-add.
    const earlierReadd = readded(ARCHIVED_AT, ERASED_AT - 30_000)

    for (const [local, remote] of [
      [[redacted(ERASED_AT)], [earlierReadd]],
      [[earlierReadd], [redacted(ERASED_AT)]],
    ]) {
      expect(
        mergePayload(localWith(local), payload('peer', remote)).deletedContacts
      ).toEqual([redacted(ERASED_AT)])
    }
  })

  it('redacts again when the re-added contact is deleted permanently', () => {
    const ERASED_AGAIN_AT = REARCHIVED_AT + 500
    const files = [
      payload('stale', [redacted(ERASED_AT)]),
      payload('ipad', [readded(REARCHIVED_AT, READDED_AT)]),
      payload('phone', [redacted(ERASED_AGAIN_AT)]),
    ]

    for (const order of [files, [...files].reverse()]) {
      expect(foldRemotePayloads(order)!.contactStore.deletedContacts).toEqual([
        redacted(ERASED_AGAIN_AT),
      ])
    }
    // A copy archived after that permanent delete, on a device that hadn't
    // pulled it, still descends from the earlier re-add.
    expect(
      mergePayload(
        localWith([redacted(ERASED_AGAIN_AT)]),
        payload('ipad', [readded(NOW, READDED_AT)])
      ).deletedContacts
    ).toEqual([redacted(ERASED_AGAIN_AT)])
  })

  it('compares the re-add on a skewed clock after aligning it', () => {
    // The re-adding device's clock runs an hour slow and predates calibrated
    // payloads, so its file is aligned to the container's modification date.
    const SKEW = 60 * 60_000
    const skewed = alignPayloadClock(
      {
        ...payload('slow', [readded(REARCHIVED_AT - SKEW, READDED_AT - SKEW)]),
        writtenAt: NOW - SKEW,
      },
      NOW
    )
    const aligned = skewed.contactStore.deletedContacts[0] as Contact
    expect([aligned.updatedAt, aligned.readdedAt]).toEqual([
      REARCHIVED_AT,
      READDED_AT,
    ])

    const result = mergePayload(localWith([redacted(ERASED_AT)]), skewed)

    expect(result.deletedContacts.map((contact) => contact.name)).toEqual([
      'Added again',
    ])
  })

  it('accepts payloads with or without the marker', () => {
    const older = payload('old', [full(ARCHIVED_AT)], [full(ARCHIVED_AT)])
    const newer = payload('new', [readded(REARCHIVED_AT, READDED_AT)])
    const invalid = payload('bad', [
      { ...full(ARCHIVED_AT), readdedAt: 'soon' as unknown as number },
    ])

    expect(payloadSchema.safeParse(older).success).toBe(true)
    expect(payloadSchema.safeParse(newer).success).toBe(true)
    expect(payloadSchema.safeParse(invalid).success).toBe(false)
  })

  it('leaves older copies without the marker redacted, as before', () => {
    expect(
      mergePayload(
        localWith([full(REARCHIVED_AT)]),
        payload('stale', [redacted(ERASED_AT)])
      ).deletedContacts
    ).toEqual([redacted(ERASED_AT)])
  })

  it('prefers the more recent re-add between two full copies', () => {
    const before = full(READDED_AT + 5_000)
    const after = readded(REARCHIVED_AT - 5_000, READDED_AT)

    for (const [local, remote] of [
      [before, after],
      [after, before],
    ]) {
      expect(
        mergePayload(
          localWith([local]),
          payload('peer', [remote])
        ).deletedContacts.map((contact) => contact.name)
      ).toEqual(['Added again'])
    }
  })
})
