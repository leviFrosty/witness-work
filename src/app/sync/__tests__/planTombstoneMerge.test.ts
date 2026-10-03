import { describe, expect, it } from 'vitest'
import { mergePayload } from '@/app/sync/merge'
import { foldRemotePayloads } from '@/app/sync/foldRemotePayloads'
import type { SyncPayload } from '@/app/sync/payload'
import { payloadSchema } from '@/app/sync/payloadValidation'
import {
  RecurringPlanFrequencies,
  type DayPlan,
  type RecurringPlan,
} from '@/types/timeEntry'

// Deleting a Day Plan or Recurring Plan on one device must remove it on the
// others, and stay removed while any device's file still holds an older copy.

type LocalState = Parameters<typeof mergePayload>[0]

const NOW = Date.now()
const DAY = 24 * 60 * 60 * 1000

const emptyLocal = (): LocalState => ({
  contacts: [],
  deletedContacts: [],
  customFieldDefs: [],
  deletedCustomFieldDefs: [],
  conversations: [],
  deletedConversations: [],
  serviceReports: {},
  dayPlans: [],
  recurringPlans: [],
  deletedServiceReports: [],
  deletedDayPlans: [],
  deletedRecurringPlans: [],
  categories: [],
  deletedCategories: [],
  preferencesValues: {},
  preferenceUpdatedAt: {},
  profileValues: {},
  profileUpdatedAt: {},
})

const remote = (
  serviceReportStore: Partial<SyncPayload['serviceReportStore']>
): SyncPayload => ({
  version: 1,
  writtenAt: NOW,
  deviceId: 'phone',
  contactStore: { contacts: [], deletedContacts: [] },
  conversationStore: { conversations: [], deletedConversations: [] },
  serviceReportStore: {
    serviceReports: {},
    dayPlans: [],
    recurringPlans: [],
    deletedServiceReports: [],
    ...serviceReportStore,
  },
  preferencesStore: { values: {}, updatedAt: {} },
})

const dayPlan = (id: string, updatedAt: number): DayPlan => ({
  id,
  date: new Date('2026-10-05T12:00:00.000Z'),
  minutes: 60,
  updatedAt,
})

const recurringPlan = (id: string, updatedAt: number): RecurringPlan => ({
  id,
  startDate: new Date('2026-10-05T12:00:00.000Z'),
  minutes: 90,
  recurrence: {
    frequency: RecurringPlanFrequencies.WEEKLY,
    interval: 1,
    endDate: null,
  },
  updatedAt,
})

describe('mergePayload — Plan tombstones', () => {
  it('removes Plans another device deleted', () => {
    const local = {
      ...emptyLocal(),
      dayPlans: [dayPlan('d1', NOW - 2_000), dayPlan('d2', NOW - 2_000)],
      recurringPlans: [recurringPlan('r1', NOW - 2_000)],
    }

    const result = mergePayload(
      local,
      remote({
        dayPlans: [dayPlan('d2', NOW - 2_000)],
        deletedDayPlans: [{ id: 'd1', deletedAt: NOW - 1_000 }],
        deletedRecurringPlans: [{ id: 'r1', deletedAt: NOW - 1_000 }],
      })
    )

    expect(result.dayPlans.map((p) => p.id)).toEqual(['d2'])
    expect(result.recurringPlans).toEqual([])
    expect(result.deletedDayPlans).toEqual([
      { id: 'd1', deletedAt: NOW - 1_000 },
    ])
    expect(result.deletedRecurringPlans).toEqual([
      { id: 'r1', deletedAt: NOW - 1_000 },
    ])
    expect(result.changed).toBe(true)
  })

  it('keeps Plans deleted here from coming back', () => {
    const local = {
      ...emptyLocal(),
      deletedDayPlans: [{ id: 'd1', deletedAt: NOW - 1_000 }],
      deletedRecurringPlans: [{ id: 'r1', deletedAt: NOW - 1_000 }],
    }

    const result = mergePayload(
      local,
      remote({
        dayPlans: [dayPlan('d1', NOW - 2_000)],
        recurringPlans: [recurringPlan('r1', NOW - 2_000)],
      })
    )

    expect(result.dayPlans).toEqual([])
    expect(result.recurringPlans).toEqual([])
    expect(result.changed).toBe(false)
  })

  it('keeps a Plan edited after its deletion, and lets deletion win a tie', () => {
    const local = {
      ...emptyLocal(),
      deletedDayPlans: [
        { id: 'edited-later', deletedAt: NOW - 2_000 },
        { id: 'tie', deletedAt: NOW - 1_000 },
      ],
    }

    const result = mergePayload(
      local,
      remote({
        dayPlans: [
          dayPlan('edited-later', NOW - 1_000),
          dayPlan('tie', NOW - 1_000),
        ],
      })
    )

    expect(result.dayPlans.map((p) => p.id)).toEqual(['edited-later'])
  })

  it('combines tombstones from both sides, newest per id', () => {
    const local = {
      ...emptyLocal(),
      deletedDayPlans: [{ id: 'd1', deletedAt: NOW - 3_000 }],
    }

    const result = mergePayload(
      local,
      remote({
        deletedDayPlans: [
          { id: 'd1', deletedAt: NOW - 1_000 },
          { id: 'd2', deletedAt: NOW - 2_000 },
        ],
      })
    )

    expect(result.deletedDayPlans).toEqual([
      { id: 'd1', deletedAt: NOW - 1_000 },
      { id: 'd2', deletedAt: NOW - 2_000 },
    ])
  })

  it('keeps tombstones however old they are', () => {
    const local = {
      ...emptyLocal(),
      deletedRecurringPlans: [
        { id: 'old', deletedAt: NOW - 400 * DAY },
        { id: 'recent', deletedAt: NOW - 1_000 },
      ],
    }

    const result = mergePayload(
      local,
      remote({ recurringPlans: [recurringPlan('old', NOW - 401 * DAY)] })
    )

    expect(result.recurringPlans).toEqual([])
    expect(result.deletedRecurringPlans).toEqual(local.deletedRecurringPlans)
    expect(result.changed).toBe(false)
  })

  it('lands on the same Plans whatever order the files fold in', () => {
    const phone = remote({
      dayPlans: [dayPlan('d2', NOW - 3_000)],
      deletedDayPlans: [{ id: 'd1', deletedAt: NOW - 1_000 }],
    })
    const ipad = remote({
      dayPlans: [dayPlan('d1', NOW - 2_000), dayPlan('d2', NOW - 500)],
    })
    const mac = remote({
      dayPlans: [dayPlan('d1', NOW - 4_000)],
      deletedDayPlans: [{ id: 'd2', deletedAt: NOW - 1_000 }],
    })
    const folds = [
      [phone, ipad, mac],
      [mac, ipad, phone],
      [ipad, phone, mac],
    ].map(
      (files) =>
        foldRemotePayloads(files)!
          .serviceReportStore as SyncPayload['serviceReportStore']
    )

    for (const folded of folds) {
      // d2 was edited after its deletion; d1 wasn't.
      expect(folded.dayPlans.map((p: DayPlan) => p.id)).toEqual(['d2'])
      expect(
        [...folded.deletedDayPlans!].sort((a, b) => (a.id < b.id ? -1 : 1))
      ).toEqual([
        { id: 'd1', deletedAt: NOW - 1_000 },
        { id: 'd2', deletedAt: NOW - 1_000 },
      ])
    }
  })

  it('merges payloads from builds without Plan tombstones', () => {
    const local = {
      ...emptyLocal(),
      deletedDayPlans: [{ id: 'd1', deletedAt: NOW - 1_000 }],
    }
    const olderBuild = remote({ dayPlans: [dayPlan('d1', NOW - 2_000)] })
    delete olderBuild.serviceReportStore.deletedDayPlans
    delete olderBuild.serviceReportStore.deletedRecurringPlans

    const result = mergePayload(local, olderBuild)

    expect(result.dayPlans).toEqual([])
    expect(result.deletedDayPlans).toEqual(local.deletedDayPlans)
    expect(result.changed).toBe(false)
  })

  it('treats a local state without tombstone lists as having none', () => {
    const local: LocalState = { ...emptyLocal(), dayPlans: [] }
    delete local.deletedDayPlans
    delete local.deletedRecurringPlans

    expect(mergePayload(local, remote({}))).toMatchObject({
      deletedDayPlans: [],
      deletedRecurringPlans: [],
      changed: false,
    })
    expect(
      mergePayload(
        local,
        remote({ deletedDayPlans: [{ id: 'd1', deletedAt: NOW - 1_000 }] })
      )
    ).toMatchObject({
      deletedDayPlans: [{ id: 'd1', deletedAt: NOW - 1_000 }],
      changed: true,
    })
  })
})

describe('payload validation — Plan tombstones', () => {
  const parsePayload = (json: string) => {
    const result = payloadSchema.safeParse(JSON.parse(json))
    return result.success ? result.data : null
  }
  const wire = (serviceReportStore: Record<string, unknown>) =>
    JSON.stringify({
      ...remote({}),
      serviceReportStore: {
        serviceReports: {},
        dayPlans: [],
        recurringPlans: [],
        ...serviceReportStore,
      },
    })

  it('keeps both tombstone lists', () => {
    const parsed = parsePayload(
      wire({
        deletedDayPlans: [{ id: 'd1', deletedAt: NOW - 1_000 }],
        deletedRecurringPlans: [{ id: 'r1', deletedAt: NOW - 2_000 }],
      })
    )

    expect(parsed?.serviceReportStore.deletedDayPlans).toEqual([
      { id: 'd1', deletedAt: NOW - 1_000 },
    ])
    expect(parsed?.serviceReportStore.deletedRecurringPlans).toEqual([
      { id: 'r1', deletedAt: NOW - 2_000 },
    ])
  })

  it('accepts payloads from builds without them', () => {
    const parsed = parsePayload(wire({}))

    expect(parsed).not.toBeNull()
    expect(parsed?.serviceReportStore.deletedDayPlans).toBeUndefined()
  })

  it("keeps a buddy's linked Plan id and a Plan's reminder offset", () => {
    const id = 'buddy.AbC-_0123456789abcdefg.zYx_-9876543210ZYXWVUt'
    const parsed = parsePayload(
      wire({
        dayPlans: [{ ...dayPlan(id, NOW), reminderOffsetMinutes: 15 }],
        deletedDayPlans: [{ id, deletedAt: NOW - 1_000 }],
      })
    )

    expect(parsed?.serviceReportStore.dayPlans).toEqual([
      expect.objectContaining({ id, reminderOffsetMinutes: 15 }),
    ])
    expect(parsed?.serviceReportStore.deletedDayPlans).toEqual([
      { id, deletedAt: NOW - 1_000 },
    ])
  })

  it('rejects malformed tombstones', () => {
    expect(
      parsePayload(wire({ deletedDayPlans: [{ id: 'd1', deletedAt: -1 }] }))
    ).toBeNull()
    expect(
      parsePayload(
        wire({ deletedRecurringPlans: [{ id: '../d1', deletedAt: 1 }] })
      )
    ).toBeNull()
  })
})
