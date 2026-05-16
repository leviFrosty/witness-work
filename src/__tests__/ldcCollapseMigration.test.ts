import { describe, expect, it, vi } from 'vitest'
import moment from 'moment'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
// `migrateLdcToCategory` doesn't call expo-crypto, but `lib/categories.ts`
// imports `Crypto.randomUUID` at module scope (used by the tag → Category
// migration); stub it so the import resolves under vitest.
vi.mock('expo-crypto', () => ({
  randomUUID: vi.fn(() => 'mock-uuid'),
}))

import { migrateLdcToCategory } from '@/lib/categories'
import {
  LDC_BUILTIN_CATEGORY_ID,
  LDC_BUILTIN_CATEGORY_NAME,
} from '@/constants/categories'
import { Category } from '@/types/category'
import {
  LegacyServiceReport,
  ServiceReportsByYears,
} from '@/types/serviceReport'
import { normalizeDateForStorage } from '@/lib/normalizeDate'
import {
  adjustedMinutesForSpecificMonth,
  ldcMinutesForSpecificMonth,
} from '@/lib/serviceReport'

type ReportInput = {
  id?: string
  month: number
  year: number
  hours?: number
  minutes?: number
  ldc?: boolean
  categoryId?: string
  credit?: boolean
}

const makeReport = (input: ReportInput, idx: number): LegacyServiceReport => ({
  id: input.id ?? `r-${idx}`,
  date: normalizeDateForStorage(
    new Date(Date.UTC(input.year, input.month, 15))
  ),
  hours: input.hours ?? 1,
  minutes: input.minutes ?? 0,
  ldc: input.ldc,
  categoryId: input.categoryId,
  credit: input.credit,
})

const buildReports = (inputs: ReportInput[]): ServiceReportsByYears => {
  const out: ServiceReportsByYears = {}
  inputs.forEach((input, idx) => {
    const report = makeReport(input, idx)
    const m = moment(report.date)
    const y = m.year()
    const mo = m.month()
    if (!out[y]) out[y] = {}
    if (!out[y][mo]) out[y][mo] = []
    out[y][mo].push(report)
  })
  return out
}

const NOW = 1700000000000

describe('migrateLdcToCategory', () => {
  it('seeds the LDC builtin Category record on first run', () => {
    const reports = buildReports([])
    const result = migrateLdcToCategory({
      serviceReports: reports,
      categories: [],
      now: NOW,
    })
    expect(result.seededLdcBuiltin).toBe(true)
    const ldc = result.categories.find((c) => c.id === LDC_BUILTIN_CATEGORY_ID)
    expect(ldc).toBeDefined()
    expect(ldc!.name).toBe(LDC_BUILTIN_CATEGORY_NAME)
    expect(ldc!.isCredit).toBe(true)
    expect(ldc!.builtin).toBe(true)
    expect(ldc!.updatedAt).toBe(NOW)
  })

  it('does not re-seed when the LDC builtin already exists', () => {
    const existing: Category = {
      id: LDC_BUILTIN_CATEGORY_ID,
      name: LDC_BUILTIN_CATEGORY_NAME,
      isCredit: true,
      builtin: true,
      updatedAt: 1234,
    }
    const result = migrateLdcToCategory({
      serviceReports: buildReports([]),
      categories: [existing],
      now: NOW,
    })
    expect(result.seededLdcBuiltin).toBe(false)
    expect(result.categories).toHaveLength(1)
    expect(result.categories[0].updatedAt).toBe(1234)
  })

  it('rewrites a legacy `ldc: true` entry to the LDC builtin Category', () => {
    const reports = buildReports([
      {
        id: 'r-ldc',
        month: 0,
        year: 2026,
        hours: 2,
        ldc: true,
        credit: true,
      },
    ])

    const result = migrateLdcToCategory({
      serviceReports: reports,
      categories: [],
      now: NOW,
    })

    const migrated = result.serviceReports[2026][0][0]
    expect(migrated.categoryId).toBe(LDC_BUILTIN_CATEGORY_ID)
    expect(migrated.credit).toBe(true)
    expect((migrated as LegacyServiceReport).ldc).toBeUndefined()
    expect(result.rewrittenCount).toBe(1)
    expect(result.conflictedCount).toBe(0)
  })

  it('is idempotent — re-running on already-migrated state is a no-op', () => {
    const seed: Category = {
      id: LDC_BUILTIN_CATEGORY_ID,
      name: LDC_BUILTIN_CATEGORY_NAME,
      isCredit: true,
      builtin: true,
      updatedAt: NOW,
    }
    const reports = buildReports([
      { id: 'r-ldc', month: 0, year: 2026, hours: 2 },
    ])
    // Hand-craft a "post-migration" entry pointing at the builtin id.
    reports[2026][0][0] = {
      ...reports[2026][0][0],
      categoryId: LDC_BUILTIN_CATEGORY_ID,
      credit: true,
    }

    const first = migrateLdcToCategory({
      serviceReports: reports,
      categories: [seed],
      now: NOW,
    })
    const second = migrateLdcToCategory({
      serviceReports: first.serviceReports,
      categories: first.categories,
      now: NOW,
    })
    expect(second.rewrittenCount).toBe(0)
    expect(second.conflictedCount).toBe(0)
    expect(second.seededLdcBuiltin).toBe(false)
    expect(JSON.stringify(second.serviceReports)).toBe(
      JSON.stringify(first.serviceReports)
    )
  })

  it('keeps an existing non-LDC categoryId when ldc:true coexists (explicit wins)', () => {
    // Data corruption shape: legacy ldc: true alongside a real user Category.
    // The Category wins; the ldc flag is dropped; counted under conflicts.
    const reports = buildReports([
      {
        id: 'r-mixed',
        month: 0,
        year: 2026,
        hours: 1,
        ldc: true,
        categoryId: 'user-cat-bethel',
        credit: true,
      },
    ])

    const result = migrateLdcToCategory({
      serviceReports: reports,
      categories: [
        {
          id: 'user-cat-bethel',
          name: 'Bethel',
          isCredit: true,
          updatedAt: 1234,
        },
      ],
      now: NOW,
    })

    const migrated = result.serviceReports[2026][0][0]
    expect(migrated.categoryId).toBe('user-cat-bethel')
    expect((migrated as LegacyServiceReport).ldc).toBeUndefined()
    expect(result.conflictedCount).toBe(1)
    expect(result.rewrittenCount).toBe(0)
  })

  it('strips a stray `ldc: false` field so the canonical shape matches', () => {
    const reports = buildReports([
      { id: 'r-std', month: 0, year: 2026, hours: 1, ldc: false },
    ])
    const result = migrateLdcToCategory({
      serviceReports: reports,
      categories: [],
      now: NOW,
    })
    const migrated = result.serviceReports[2026][0][0]
    expect((migrated as LegacyServiceReport).ldc).toBeUndefined()
    expect(migrated.categoryId).toBeUndefined()
  })

  it('leaves non-LDC entries untouched (no categoryId, no field added)', () => {
    const reports = buildReports([
      { id: 'r1', month: 0, year: 2026, hours: 1 },
      { id: 'r2', month: 1, year: 2026, hours: 2, categoryId: 'cat-user' },
    ])
    const result = migrateLdcToCategory({
      serviceReports: reports,
      categories: [
        {
          id: 'cat-user',
          name: 'Hospital',
          isCredit: true,
          updatedAt: 1234,
        },
      ],
      now: NOW,
    })
    expect(result.serviceReports[2026][0][0].categoryId).toBeUndefined()
    expect(result.serviceReports[2026][1][0].categoryId).toBe('cat-user')
    expect(result.rewrittenCount).toBe(0)
  })

  it('preserves cap-math output for the same input as the legacy shape', () => {
    // The brief calls this out as the regression to guard against: the cap
    // math must produce identical output for an LDC entry before and after
    // the collapse migration. Pioneer with no override → 55h cap.
    const month = 0
    const year = 2026
    const before = buildReports([
      { id: 'a', month, year, hours: 30, ldc: true },
      { id: 'b', month, year, hours: 30 }, // standard
    ])
    const beforeMinutes = adjustedMinutesForSpecificMonth(
      before[year][month] as LegacyServiceReport[],
      month,
      year,
      'regularPioneer'
    )

    const result = migrateLdcToCategory({
      serviceReports: before,
      categories: [],
      now: NOW,
    })

    const afterMinutes = adjustedMinutesForSpecificMonth(
      result.serviceReports[year][month],
      month,
      year,
      'regularPioneer'
    )

    expect(afterMinutes.value).toBe(beforeMinutes.value)
    expect(afterMinutes.standard).toBe(beforeMinutes.standard)
    expect(afterMinutes.credit).toBe(beforeMinutes.credit)
    expect(afterMinutes.creditOverage).toBe(beforeMinutes.creditOverage)

    // And the LDC slice of the breakdown should still report LDC minutes.
    expect(
      ldcMinutesForSpecificMonth(
        result.serviceReports[year][month],
        month,
        year
      )
    ).toBe(30 * 60)
  })
})
