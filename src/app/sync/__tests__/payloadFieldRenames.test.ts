import { describe, expect, it } from 'vitest'
import { normalizeLegacyPayloadFieldNames } from '@/app/sync/payloadFieldRenames'

const makePayload = (
  values: Record<string, unknown>,
  updatedAt: Record<string, number>
) => ({
  version: 1,
  preferencesStore: { values, updatedAt },
})

describe('normalizeLegacyPayloadFieldNames', () => {
  it('renames excludedWeekdays → offDays and meetingWeekdays → meetingDays', () => {
    const d = makePayload(
      { excludedWeekdays: [0, 6], meetingWeekdays: [3] },
      { excludedWeekdays: 1700000001000, meetingWeekdays: 1700000002000 }
    )

    normalizeLegacyPayloadFieldNames(d)

    expect(d.preferencesStore.values.offDays).toEqual([0, 6])
    expect(d.preferencesStore.values.meetingDays).toEqual([3])
    expect(d.preferencesStore.values).not.toHaveProperty('excludedWeekdays')
    expect(d.preferencesStore.values).not.toHaveProperty('meetingWeekdays')
    expect(d.preferencesStore.updatedAt.offDays).toBe(1700000001000)
    expect(d.preferencesStore.updatedAt.meetingDays).toBe(1700000002000)
    expect(d.preferencesStore.updatedAt).not.toHaveProperty('excludedWeekdays')
    expect(d.preferencesStore.updatedAt).not.toHaveProperty('meetingWeekdays')
  })

  it('leaves a payload without the legacy keys untouched', () => {
    const d = makePayload(
      { offDays: [1], meetingDays: [2] },
      { offDays: 1700000005000, meetingDays: 1700000006000 }
    )

    normalizeLegacyPayloadFieldNames(d)

    expect(d.preferencesStore.values.offDays).toEqual([1])
    expect(d.preferencesStore.values.meetingDays).toEqual([2])
    expect(d.preferencesStore.updatedAt.offDays).toBe(1700000005000)
    expect(d.preferencesStore.updatedAt.meetingDays).toBe(1700000006000)
  })

  it('prefers the new key when a payload somehow carries both', () => {
    const d = makePayload(
      { excludedWeekdays: [9], offDays: [4, 5] },
      { excludedWeekdays: 1, offDays: 2 }
    )

    normalizeLegacyPayloadFieldNames(d)

    expect(d.preferencesStore.values.offDays).toEqual([4, 5])
    expect(d.preferencesStore.values).not.toHaveProperty('excludedWeekdays')
    expect(d.preferencesStore.updatedAt.offDays).toBe(2)
  })

  it('is idempotent', () => {
    const d = makePayload(
      { excludedWeekdays: [0], meetingWeekdays: [3] },
      { excludedWeekdays: 1, meetingWeekdays: 2 }
    )
    normalizeLegacyPayloadFieldNames(d)
    const snapshot = JSON.stringify(d)
    normalizeLegacyPayloadFieldNames(d)
    expect(JSON.stringify(d)).toBe(snapshot)
  })

  it('no-ops when preferencesStore is missing or malformed', () => {
    const d1 = {} as Record<string, unknown>
    const d2 = { preferencesStore: null } as Record<string, unknown>
    const d3 = {
      preferencesStore: { values: null, updatedAt: null },
    } as Record<string, unknown>
    expect(() => normalizeLegacyPayloadFieldNames(d1)).not.toThrow()
    expect(() => normalizeLegacyPayloadFieldNames(d2)).not.toThrow()
    expect(() => normalizeLegacyPayloadFieldNames(d3)).not.toThrow()
  })

  it('renames publisher → role on values and updatedAt (legacy peer payload)', () => {
    const d = makePayload(
      { publisher: 'regularPioneer' },
      { publisher: 1700000010000 }
    )

    normalizeLegacyPayloadFieldNames(d)

    expect(d.preferencesStore.values.role).toBe('regularPioneer')
    expect(d.preferencesStore.values).not.toHaveProperty('publisher')
    expect(d.preferencesStore.updatedAt.role).toBe(1700000010000)
    expect(d.preferencesStore.updatedAt).not.toHaveProperty('publisher')
  })

  it('preserves the canonical leaf value `publisher` when carried under the legacy publisher field', () => {
    // The field name renames, but the *value* `'publisher'` (= Regular
    // Publisher role) stays as-is.
    const d = makePayload({ publisher: 'publisher' }, {})

    normalizeLegacyPayloadFieldNames(d)

    expect(d.preferencesStore.values.role).toBe('publisher')
    expect(d.preferencesStore.values).not.toHaveProperty('publisher')
  })

  it('prefers role when a payload carries both publisher and role', () => {
    const d = makePayload(
      { publisher: 'publisher', role: 'specialPioneer' },
      { publisher: 1, role: 2 }
    )

    normalizeLegacyPayloadFieldNames(d)

    expect(d.preferencesStore.values.role).toBe('specialPioneer')
    expect(d.preferencesStore.values).not.toHaveProperty('publisher')
    expect(d.preferencesStore.updatedAt.role).toBe(2)
    expect(d.preferencesStore.updatedAt).not.toHaveProperty('publisher')
  })

  it('renames pioneerStartDate → tenureStartDate on values and updatedAt (legacy peer payload)', () => {
    // Glossary: Tenure Start Date (canonical) supersedes pioneerStartDate
    // (legacy). Older peers that pre-date wave-4 still write the legacy key.
    const d = makePayload(
      {
        role: 'regularPioneer',
        pioneerStartDate: '2020-01-01T00:00:00.000Z',
      },
      {
        role: 1700000000000,
        pioneerStartDate: 1700000001000,
      }
    )

    normalizeLegacyPayloadFieldNames(d)

    expect(d.preferencesStore.values.tenureStartDate).toBe(
      '2020-01-01T00:00:00.000Z'
    )
    expect(d.preferencesStore.values).not.toHaveProperty('pioneerStartDate')
    expect(d.preferencesStore.updatedAt.tenureStartDate).toBe(1700000001000)
    expect(d.preferencesStore.updatedAt).not.toHaveProperty('pioneerStartDate')
  })

  it('prefers tenureStartDate when a payload carries both keys (defensive)', () => {
    const d = makePayload(
      {
        pioneerStartDate: '2018-01-01T00:00:00.000Z',
        tenureStartDate: '2022-05-15T00:00:00.000Z',
      },
      { pioneerStartDate: 1, tenureStartDate: 2 }
    )

    normalizeLegacyPayloadFieldNames(d)

    expect(d.preferencesStore.values.tenureStartDate).toBe(
      '2022-05-15T00:00:00.000Z'
    )
    expect(d.preferencesStore.values).not.toHaveProperty('pioneerStartDate')
    expect(d.preferencesStore.updatedAt.tenureStartDate).toBe(2)
    expect(d.preferencesStore.updatedAt).not.toHaveProperty('pioneerStartDate')
  })

  it('converts legacy one-off goal Dates to the canonical Monthly Goal map', () => {
    const d = makePayload(
      {
        oneOffGoalHours: [
          { month: '2026-11-01T00:00:00.000Z', hours: 55 },
          { month: '2026-11-25T00:00:00.000Z', hours: 60.5 },
          { month: '2026-12-01T00:00:00.000Z', hours: -1 },
          { month: 'invalid', hours: 70 },
        ],
      },
      { oneOffGoalHours: 1700000010000 }
    )

    normalizeLegacyPayloadFieldNames(d)

    expect(d.preferencesStore.values.monthlyGoalOverrides).toEqual({
      '2026-11': 60.5,
    })
    expect(d.preferencesStore.values).not.toHaveProperty('oneOffGoalHours')
    expect(d.preferencesStore.updatedAt.monthlyGoalOverrides).toBe(
      1700000010000
    )
    expect(d.preferencesStore.updatedAt).not.toHaveProperty('oneOffGoalHours')
  })

  it('prefers canonical Monthly Goal overrides when a payload carries both shapes', () => {
    const d = makePayload(
      {
        oneOffGoalHours: [{ month: '2026-11-01T00:00:00.000Z', hours: 60 }],
        monthlyGoalOverrides: { '2026-11': 70 },
      },
      { oneOffGoalHours: 1, monthlyGoalOverrides: 2 }
    )

    normalizeLegacyPayloadFieldNames(d)

    expect(d.preferencesStore.values.monthlyGoalOverrides).toEqual({
      '2026-11': 70,
    })
    expect(d.preferencesStore.values).not.toHaveProperty('oneOffGoalHours')
    expect(d.preferencesStore.updatedAt.monthlyGoalOverrides).toBe(2)
    expect(d.preferencesStore.updatedAt).not.toHaveProperty('oneOffGoalHours')
  })
})

describe('normalizeLegacyPayloadFieldNames — profile-field routing (wave-3)', () => {
  it('moves name + avatar from preferencesStore.values into a synthesized profileStore', () => {
    const d = makePayload(
      {
        role: 'regularPioneer',
        name: 'Bob',
        avatar: { type: 'image', value: 'avatar://x' },
      },
      {
        role: 1700000000000,
        name: 1700000001000,
        avatar: 1700000002000,
      }
    )

    normalizeLegacyPayloadFieldNames(d)

    // Profile slice was created and populated.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const profile = (d as any).profileStore
    expect(profile).toBeDefined()
    expect(profile.values.name).toBe('Bob')
    expect(profile.values.avatar).toEqual({
      type: 'image',
      value: 'avatar://x',
    })
    expect(profile.updatedAt.name).toBe(1700000001000)
    expect(profile.updatedAt.avatar).toBe(1700000002000)

    // Legacy fields dropped from preferencesStore.
    expect(d.preferencesStore.values).not.toHaveProperty('name')
    expect(d.preferencesStore.values).not.toHaveProperty('avatar')
    expect(d.preferencesStore.updatedAt).not.toHaveProperty('name')
    expect(d.preferencesStore.updatedAt).not.toHaveProperty('avatar')

    // Non-profile prefs survive untouched.
    expect(d.preferencesStore.values.role).toBe('regularPioneer')
    expect(d.preferencesStore.updatedAt.role).toBe(1700000000000)
  })

  it('routes customAvatarBackground + hasCompletedProfileSetup the same way', () => {
    const d = makePayload(
      {
        customAvatarBackground: '#AABBCC',
        hasCompletedProfileSetup: true,
      },
      {
        customAvatarBackground: 1700000003000,
        hasCompletedProfileSetup: 1700000004000,
      }
    )

    normalizeLegacyPayloadFieldNames(d)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const profile = (d as any).profileStore
    expect(profile.values.customAvatarBackground).toBe('#AABBCC')
    expect(profile.values.hasCompletedProfileSetup).toBe(true)
    expect(profile.updatedAt.customAvatarBackground).toBe(1700000003000)
    expect(profile.updatedAt.hasCompletedProfileSetup).toBe(1700000004000)
    expect(d.preferencesStore.values).not.toHaveProperty(
      'customAvatarBackground'
    )
    expect(d.preferencesStore.values).not.toHaveProperty(
      'hasCompletedProfileSetup'
    )
  })

  it('lands a legacy name value in the profile slice on read (spec test)', () => {
    // Legacy peer (running an older app version) writes the user's name
    // inside preferencesStore.values. On read, the canonical destination is
    // the profile slice.
    const d = makePayload({ name: 'Bob' }, {})
    normalizeLegacyPayloadFieldNames(d)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((d as any).profileStore.values.name).toBe('Bob')
  })

  it('prefers an existing profileStore slice when both schemas are present', () => {
    // Defensive: a hybrid payload (post-wave-3 device that somehow re-included
    // legacy fields) routes nothing — the canonical slice wins.
    const d = {
      version: 1,
      preferencesStore: {
        values: { name: 'OldName' },
        updatedAt: { name: 1 },
      },
      profileStore: {
        values: { name: 'NewName' },
        updatedAt: { name: 2 },
      },
    }

    normalizeLegacyPayloadFieldNames(d)

    expect(d.profileStore.values.name).toBe('NewName')
    expect(d.profileStore.updatedAt.name).toBe(2)
    expect(d.preferencesStore.values).not.toHaveProperty('name')
    expect(d.preferencesStore.updatedAt).not.toHaveProperty('name')
  })

  it('leaves a payload without profile fields untouched (no synthesized profileStore)', () => {
    const d = makePayload({ role: 'publisher' }, { role: 1 })
    normalizeLegacyPayloadFieldNames(d)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((d as any).profileStore).toBeUndefined()
  })

  it('is idempotent — second call on the post-routed payload is a no-op', () => {
    const d = makePayload(
      { name: 'Bob', avatar: { type: 'emoji', value: '🌱' } },
      { name: 1, avatar: 2 }
    )
    normalizeLegacyPayloadFieldNames(d)
    const snapshot = JSON.stringify(d)
    normalizeLegacyPayloadFieldNames(d)
    expect(JSON.stringify(d)).toBe(snapshot)
  })
})

// Kept in sync with `src/constants/categories.ts`'s `LDC_BUILTIN_CATEGORY_ID`.
// `payloadFieldRenames.ts` inlines it for the no-imports rule; the test
// inlines it for the same reason.
const LDC_BUILTIN = 'ldc-builtin-3f9c4a1d'

const makeReportsPayload = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  reports: any[]
) => ({
  version: 1,
  preferencesStore: { values: {}, updatedAt: {} },
  serviceReportStore: {
    serviceReports: {
      '2026': {
        '0': reports,
      },
    },
  },
})

describe('normalizeLegacyPayloadFieldNames — TimeEntry.ldc collapse', () => {
  it('rewrites a legacy `ldc: true` entry to the LDC builtin Category', () => {
    const d = makeReportsPayload([
      { id: 'r1', hours: 2, minutes: 0, ldc: true, credit: true },
    ])

    normalizeLegacyPayloadFieldNames(d)

    const report = d.serviceReportStore.serviceReports['2026']['0'][0]
    expect(report.categoryId).toBe(LDC_BUILTIN)
    expect(report.credit).toBe(true)
    expect(report).not.toHaveProperty('ldc')
  })

  it('keeps an existing non-LDC categoryId; drops the stray ldc flag', () => {
    // Data corruption shape: ldc: true coexisting with a real user Category.
    // Explicit Category wins, same precedence as `migrateLdcToCategory`.
    const d = makeReportsPayload([
      {
        id: 'r1',
        hours: 1,
        minutes: 0,
        ldc: true,
        categoryId: 'user-cat-bethel',
        credit: true,
      },
    ])

    normalizeLegacyPayloadFieldNames(d)

    const report = d.serviceReportStore.serviceReports['2026']['0'][0]
    expect(report.categoryId).toBe('user-cat-bethel')
    expect(report).not.toHaveProperty('ldc')
  })

  it('strips `ldc: false` so the on-disk shape matches the canonical type', () => {
    const d = makeReportsPayload([
      { id: 'r1', hours: 1, minutes: 0, ldc: false, credit: false },
    ])

    normalizeLegacyPayloadFieldNames(d)

    const report = d.serviceReportStore.serviceReports['2026']['0'][0]
    expect(report).not.toHaveProperty('ldc')
    expect(report.categoryId).toBeUndefined()
  })

  it('is idempotent on an already-collapsed payload', () => {
    const d = makeReportsPayload([
      {
        id: 'r1',
        hours: 2,
        minutes: 0,
        categoryId: LDC_BUILTIN,
        credit: true,
      },
    ])
    normalizeLegacyPayloadFieldNames(d)
    const snapshot = JSON.stringify(d)
    normalizeLegacyPayloadFieldNames(d)
    expect(JSON.stringify(d)).toBe(snapshot)
  })

  it('no-ops when serviceReportStore is missing or malformed', () => {
    const d1 = { version: 1, preferencesStore: { values: {}, updatedAt: {} } }
    expect(() =>
      normalizeLegacyPayloadFieldNames(d1 as Record<string, unknown>)
    ).not.toThrow()
    const d2 = {
      version: 1,
      preferencesStore: { values: {}, updatedAt: {} },
      serviceReportStore: { serviceReports: null },
    }
    expect(() =>
      normalizeLegacyPayloadFieldNames(d2 as Record<string, unknown>)
    ).not.toThrow()
  })
})
