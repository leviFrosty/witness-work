import { describe, expect, it, vi } from 'vitest'
import moment from 'moment'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
// expo-crypto pulls in react-native through the expo runtime; stub it before
// importing the migration module so the test runner doesn't try to parse RN's
// flow-typed entry point.
vi.mock('expo-crypto', () => ({
  randomUUID: vi.fn(() => 'mock-uuid'),
}))

import {
  migrateTagsToCategories,
  resolveCategoryForReport,
} from '@/lib/categories'
import {
  LegacyTimeEntry,
  TimeEntry,
  TimeEntriesByYear,
} from '@/types/timeEntry'
import { normalizeDateForStorage } from '@/lib/normalizeDate'

type ReportInput = {
  id?: string
  month: number
  year: number
  hours?: number
  minutes?: number
  ldc?: boolean
  tag?: string
  credit?: boolean
}

const makeReport = (input: ReportInput, idx: number): LegacyTimeEntry => ({
  id: input.id ?? `r-${idx}`,
  date: normalizeDateForStorage(
    new Date(Date.UTC(input.year, input.month, 15))
  ),
  hours: input.hours ?? 1,
  minutes: input.minutes ?? 0,
  ldc: input.ldc,
  tag: input.tag,
  credit: input.credit,
})

const buildReports = (inputs: ReportInput[]): TimeEntriesByYear => {
  const out: TimeEntriesByYear = {}
  inputs.forEach((input, idx) => {
    const report = makeReport(input, idx) as TimeEntry
    const m = moment(report.date)
    const y = m.year()
    const mo = m.month()
    if (!out[y]) out[y] = {}
    if (!out[y][mo]) out[y][mo] = []
    out[y][mo].push(report)
  })
  return out
}

// Predictable uuid generator for stable test assertions.
const makeUuid = (): (() => string) => {
  let i = 0
  return () => `uuid-${++i}`
}

const NOW = 1700000000000

describe('migrateTagsToCategories', () => {
  it('creates one Category per distinct tag, keyed by name', () => {
    const reports = buildReports([
      { month: 0, year: 2026, tag: 'Hospital', credit: true },
      { month: 1, year: 2026, tag: 'Bethel', credit: true },
      { month: 2, year: 2026, tag: 'Hospital', credit: true },
    ])

    const result = migrateTagsToCategories({
      serviceReports: reports,
      legacyTags: [],
      now: NOW,
      uuid: makeUuid(),
    })

    expect(result.categories).toHaveLength(2)
    const names = result.categories.map((c) => c.name).sort()
    expect(names).toEqual(['Bethel', 'Hospital'])
  })

  it('rewrites ServiceReports to use categoryId and drops the legacy tag field', () => {
    const reports = buildReports([
      { id: 'r-hospital', month: 0, year: 2026, tag: 'Hospital', credit: true },
    ])

    const result = migrateTagsToCategories({
      serviceReports: reports,
      legacyTags: [],
      now: NOW,
      uuid: makeUuid(),
    })

    const hospitalCategory = result.categories.find(
      (c) => c.name === 'Hospital'
    )
    expect(hospitalCategory).toBeDefined()
    expect(hospitalCategory!.isCredit).toBe(true)

    const migratedReport = result.serviceReports[2026][0][0]
    expect(migratedReport.categoryId).toBe(hospitalCategory!.id)
    expect((migratedReport as { tag?: string }).tag).toBeUndefined()
  })

  it('resolves isCredit by majority across entries with the same tag', () => {
    // Two `credit: true` Hospital entries, one `credit: false` Hospital entry.
    // Majority is `true` — the Category should land as credit-bearing, and
    // the dissenting entry contributes to `reconciledCreditMismatches`.
    const reports = buildReports([
      { month: 0, year: 2026, tag: 'Hospital', credit: true },
      { month: 1, year: 2026, tag: 'Hospital', credit: true },
      { month: 2, year: 2026, tag: 'Hospital', credit: false },
    ])

    const result = migrateTagsToCategories({
      serviceReports: reports,
      legacyTags: [],
      now: NOW,
      uuid: makeUuid(),
    })

    const hospital = result.categories.find((c) => c.name === 'Hospital')!
    expect(hospital.isCredit).toBe(true)
    expect(result.reconciledCreditMismatches).toBe(1)
  })

  it('falls back to non-credit on credit ties (conservative default)', () => {
    const reports = buildReports([
      { month: 0, year: 2026, tag: 'Mixed', credit: true },
      { month: 1, year: 2026, tag: 'Mixed', credit: false },
    ])

    const result = migrateTagsToCategories({
      serviceReports: reports,
      legacyTags: [],
      now: NOW,
      uuid: makeUuid(),
    })

    const mixed = result.categories.find((c) => c.name === 'Mixed')!
    expect(mixed.isCredit).toBe(false)
  })

  it('reconciles per-entry `credit` boolean to the Category isCredit value', () => {
    // After migration, the entry that disagreed should be re-stamped so
    // every entry on a credit-bearing Category reads `credit: true`, and
    // vice versa — the Category record becomes the single source of truth.
    const reports = buildReports([
      { id: 'a', month: 0, year: 2026, tag: 'Hospital', credit: true },
      { id: 'b', month: 1, year: 2026, tag: 'Hospital', credit: false },
      { id: 'c', month: 2, year: 2026, tag: 'Hospital', credit: true },
    ])

    const result = migrateTagsToCategories({
      serviceReports: reports,
      legacyTags: [],
      now: NOW,
      uuid: makeUuid(),
    })

    const all = [
      ...result.serviceReports[2026][0],
      ...result.serviceReports[2026][1],
      ...result.serviceReports[2026][2],
    ]
    for (const r of all) {
      expect(r.credit).toBe(true)
    }
  })

  it('absorbs unused preferences.serviceReportTags entries (object form)', () => {
    // The user defined "Bethel" as credit in their saved tag list but never
    // attached a TimeEntry to it. The Category should still be created
    // with isCredit: true so the user's intent isn't lost.
    const reports = buildReports([])
    const result = migrateTagsToCategories({
      serviceReports: reports,
      legacyTags: [{ value: 'Bethel', credit: true }],
      now: NOW,
      uuid: makeUuid(),
    })

    const bethel = result.categories.find((c) => c.name === 'Bethel')
    expect(bethel).toBeDefined()
    expect(bethel!.isCredit).toBe(true)
  })

  it('absorbs unused preferences.serviceReportTags entries (legacy string form) as non-credit', () => {
    const result = migrateTagsToCategories({
      serviceReports: buildReports([]),
      legacyTags: ['Memorial Campaign'],
      now: NOW,
      uuid: makeUuid(),
    })
    const memorial = result.categories.find(
      (c) => c.name === 'Memorial Campaign'
    )
    expect(memorial).toBeDefined()
    expect(memorial!.isCredit).toBe(false)
  })

  it('leaves untagged entries alone — no categoryId, no tag rewrite', () => {
    const reports = buildReports([
      { month: 0, year: 2026 },
      { month: 1, year: 2026, ldc: true, credit: true },
    ])

    const result = migrateTagsToCategories({
      serviceReports: reports,
      legacyTags: [],
      now: NOW,
      uuid: makeUuid(),
    })

    expect(result.categories).toHaveLength(0)
    const standard = result.serviceReports[2026][0][0]
    const ldcReport = result.serviceReports[2026][1][0]
    expect(standard.categoryId).toBeUndefined()
    expect(ldcReport.categoryId).toBeUndefined()
    // `migrateTagsToCategories` leaves the legacy LDC flag alone — the
    // LDC → builtin Category collapse runs as a separate migration step.
    expect((ldcReport as LegacyTimeEntry).ldc).toBe(true)
  })

  it('trims tag names so "Hospital" and " Hospital " collapse to one Category', () => {
    const reports = buildReports([
      { month: 0, year: 2026, tag: 'Hospital', credit: true },
      { month: 1, year: 2026, tag: ' Hospital ', credit: true },
    ])
    const result = migrateTagsToCategories({
      serviceReports: reports,
      legacyTags: [],
      now: NOW,
      uuid: makeUuid(),
    })
    expect(result.categories).toHaveLength(1)
    expect(result.categories[0].name).toBe('Hospital')
  })

  it('stamps updatedAt on every newly-created Category for iCloud LWW merge', () => {
    const result = migrateTagsToCategories({
      serviceReports: buildReports([
        { month: 0, year: 2026, tag: 'Hospital', credit: true },
      ]),
      legacyTags: [],
      now: NOW,
      uuid: makeUuid(),
    })
    expect(result.categories[0].updatedAt).toBe(NOW)
  })

  it('is a structural no-op when there are no tags anywhere', () => {
    const reports = buildReports([
      { month: 0, year: 2026 },
      { month: 1, year: 2026 },
    ])
    const result = migrateTagsToCategories({
      serviceReports: reports,
      legacyTags: [],
      now: NOW,
      uuid: makeUuid(),
    })
    expect(result.categories).toEqual([])
    expect(result.reconciledCreditMismatches).toBe(0)
  })
})

describe('resolveCategoryForReport', () => {
  it('returns the matching Category when categoryId is set', () => {
    const category = {
      id: 'cat-1',
      name: 'Hospital',
      isCredit: true,
    }
    const report: TimeEntry = {
      id: 'r1',
      hours: 1,
      minutes: 0,
      date: new Date(),
      categoryId: 'cat-1',
    }
    expect(resolveCategoryForReport(report, [category])).toEqual(category)
  })

  it('falls back to a synthetic Category for legacy `tag`-only entries', () => {
    const report: TimeEntry = {
      id: 'r1',
      hours: 1,
      minutes: 0,
      date: new Date(),
      tag: 'Hospital',
      credit: true,
    }
    const synthesized = resolveCategoryForReport(report, [])
    expect(synthesized).not.toBeNull()
    expect(synthesized!.name).toBe('Hospital')
    expect(synthesized!.isCredit).toBe(true)
  })

  it('returns null for entries with neither categoryId nor tag', () => {
    const report: TimeEntry = {
      id: 'r1',
      hours: 1,
      minutes: 0,
      date: new Date(),
    }
    expect(resolveCategoryForReport(report, [])).toBeNull()
  })
})
