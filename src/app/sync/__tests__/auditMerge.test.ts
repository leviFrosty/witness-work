import { describe, expect, it } from 'vitest'
import { mergePayload } from '@/app/sync/merge'
import type { SyncPayload } from '@/app/sync/payload'

const emptyLocal = (): Parameters<typeof mergePayload>[0] => ({
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
})
const remote = (): SyncPayload => ({
  version: 1,
  writtenAt: Date.now(),
  deviceId: 'peer',
  contactStore: { contacts: [], deletedContacts: [] },
  conversationStore: { conversations: [] },
  serviceReportStore: { serviceReports: {}, dayPlans: [], recurringPlans: [] },
  preferencesStore: { values: {}, updatedAt: {} },
})

describe('audit merge regressions', () => {
  it('converges equal-stamp definitions carrying different alias histories', () => {
    const a = emptyLocal(),
      b = emptyLocal(),
      pa = remote(),
      pb = remote()
    a.categories = [
      {
        id: 'a',
        name: 'Alpha',
        isCredit: false,
        updatedAt: 100,
        legacyIds: ['b'],
      },
    ]
    b.categories = [
      {
        id: 'a',
        name: 'Beta',
        isCredit: false,
        updatedAt: 100,
        legacyIds: ['c'],
      },
    ]
    pa.categoryStore = { categories: a.categories }
    pb.categoryStore = { categories: b.categories }
    expect(mergePayload(a, pb).categories).toEqual(
      mergePayload(b, pa).categories
    )
    expect(mergePayload(a, pb).categories[0]).toMatchObject({
      name: 'Beta',
      legacyIds: ['b', 'c'],
    })
  })
  it('propagates an older peer deletion through canonical definition aliases', () => {
    const local = emptyLocal(),
      peer = remote()
    local.categories = [
      {
        id: 'a',
        legacyIds: ['b'],
        name: 'Work',
        isCredit: false,
        updatedAt: 100,
      },
    ]
    local.customFieldDefs = [
      {
        id: 'x',
        legacyIds: ['y'],
        label: 'Field',
        order: 0,
        createdAt: 1,
        updatedAt: 100,
      },
    ]
    local.contacts = [
      {
        id: 'c',
        name: 'Name',
        createdAt: new Date(0),
        customFields: { x: 'private' },
      },
    ]
    peer.categoryStore = {
      categories: [],
      deletedCategories: [{ id: 'b', deletedAt: 200 }],
    }
    peer.contactStore.deletedCustomFieldDefs = [{ id: 'y', deletedAt: 200 }]
    const result = mergePayload(local, peer)
    expect(result.categories).toEqual([])
    expect(result.customFieldDefs).toEqual([])
    expect(result.contacts[0].customFields).toEqual({})
    expect(result.deletedCategories[0].legacyIds).toContain('a')
    expect(result.deletedCustomFieldDefs[0].legacyIds).toContain('x')
  })
  it('keeps the greatest deletion stamp across overlapping aliases', () => {
    const local = emptyLocal(),
      peer = remote()
    local.categories = [
      {
        id: 'a',
        legacyIds: ['b'],
        name: 'Work',
        isCredit: false,
        updatedAt: 180,
      },
    ]
    local.deletedCategories = [{ id: 'a', legacyIds: ['b'], deletedAt: 200 }]
    peer.categoryStore = {
      categories: [],
      deletedCategories: [{ id: 'b', deletedAt: 150 }],
    }
    expect(mergePayload(local, peer).categories).toEqual([])
  })
  it('preserves alias history when an older client edits the canonical definition', () => {
    const local = emptyLocal(),
      peer = remote()
    local.categories = [
      {
        id: 'a',
        legacyIds: ['b'],
        name: 'Work',
        isCredit: false,
        updatedAt: 100,
      },
    ]
    peer.categoryStore = {
      categories: [
        { id: 'a', name: 'Renamed', isCredit: false, updatedAt: 200 },
      ],
    }
    expect(mergePayload(local, peer).categories[0]).toMatchObject({
      name: 'Renamed',
      legacyIds: ['b'],
    })
  })
  it('converges when two copies have equal timestamps', () => {
    const a = emptyLocal(),
      b = emptyLocal()
    a.categories = [{ id: 'same', name: 'A', isCredit: false, updatedAt: 100 }]
    b.categories = [{ id: 'same', name: 'B', isCredit: false, updatedAt: 100 }]
    const pa = remote(),
      pb = remote()
    pa.categoryStore = { categories: a.categories }
    pb.categoryStore = { categories: b.categories }
    expect(mergePayload(a, pb).categories).toEqual(
      mergePayload(b, pa).categories
    )
  })
  it('persists tombstones whose timestamp changes without changing their count', () => {
    const local = emptyLocal(),
      peer = remote()
    local.deletedConversations = [
      { id: 'deleted', deletedAt: Date.now() - 1000 },
    ]
    peer.conversationStore.deletedConversations = [
      { id: 'deleted', deletedAt: Date.now() },
    ]
    expect(mergePayload(local, peer).changed).toBe(true)
  })
  it('does not report a change when a stale copy is removed by an existing tombstone', () => {
    const local = emptyLocal(),
      peer = remote()
    local.deletedCategories = [{ id: 'deleted', deletedAt: Date.now() }]
    peer.categoryStore = {
      categories: [
        { id: 'deleted', name: 'Old', isCredit: false, updatedAt: 1 },
      ],
    }
    expect(mergePayload(local, peer).changed).toBe(false)
  })
  it('keeps device identity, onboarding and address prefill local', () => {
    const local = emptyLocal(),
      peer = remote()
    local.preferencesValues = {
      iCloudDeviceId: 'ours',
      onboardingComplete: true,
      prefillAddress: { address: 'local' },
    }
    peer.preferencesStore = {
      values: {
        iCloudDeviceId: 'theirs',
        onboardingComplete: false,
        prefillAddress: { address: 'private' },
      },
      updatedAt: {
        iCloudDeviceId: 100,
        onboardingComplete: 100,
        prefillAddress: 100,
      },
    }
    expect(mergePayload(local, peer).preferencesValues).toEqual(
      local.preferencesValues
    )
  })
  it('retains edits to different months in preference maps', () => {
    const local = emptyLocal(),
      peer = remote()
    local.preferencesValues = { monthlyGoalOverrides: { '2026-08': 20 } }
    local.preferenceUpdatedAt = { monthlyGoalOverrides: 100 }
    peer.preferencesStore = {
      values: { monthlyGoalOverrides: { '2026-09': 30 } },
      updatedAt: { monthlyGoalOverrides: 200 },
    }
    expect(
      mergePayload(local, peer).preferencesValues.monthlyGoalOverrides
    ).toEqual({ '2026-08': 20, '2026-09': 30 })
  })
})

it('keeps old deletion evidence when a writer clock is behind', () => {
  const local = emptyLocal(),
    peer = remote()
  local.categories = [
    { id: 'old', name: 'Old', isCredit: false, updatedAt: 10 },
  ]
  peer.categoryStore = {
    categories: [],
    deletedCategories: [{ id: 'old', deletedAt: 20 }],
  }
  const merged = mergePayload(local, peer)
  expect(merged.categories).toEqual([])
  expect(merged.deletedCategories).toEqual([{ id: 'old', deletedAt: 20 }])
})

it('retains independent role changes and map removals across devices', () => {
  const local = emptyLocal(),
    peer = remote()
  local.preferencesValues = {
    role: 'publisher',
    roleHistory: {
      initial: 'publisher',
      changes: { '2026-08': 'regularAuxiliary' },
    },
    reportCommentOverrides: { '2026-09': 'delete me', '2026-08': 'keep me' },
    submittedReportMonths: ['2026-08', '2026-09'],
  }
  local.preferenceUpdatedAt = {
    role: 100,
    roleHistory: 100,
    reportCommentOverrides: 100,
    submittedReportMonths: 100,
  }
  peer.preferencesStore = {
    values: {
      role: 'regularPioneer',
      roleHistory: {
        initial: 'publisher',
        changes: { '2026-09': 'regularPioneer' },
      },
      reportCommentOverrides: {},
      submittedReportMonths: [],
    },
    updatedAt: {
      role: 200,
      roleHistory: 200,
      'roleHistory:2026-09': 200,
      'reportCommentOverrides:2026-09': 200,
      'submittedReportMonths:2026-09': 200,
    },
  }
  const merged = mergePayload(local, peer)
  expect(merged.preferencesValues.roleHistory).toEqual({
    initial: 'publisher',
    changes: { '2026-08': 'regularAuxiliary', '2026-09': 'regularPioneer' },
  })
  expect(merged.preferencesValues.reportCommentOverrides).toEqual({
    '2026-08': 'keep me',
  })
  expect(merged.preferencesValues.submittedReportMonths).toEqual(['2026-08'])
})
