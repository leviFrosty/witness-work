import { legacyDefinitionId } from '@/lib/legacyDefinitionId'
import { syncTimestamp } from '@/lib/syncClock'
import { Category } from '@/types/category'
import {
  LegacyTimeEntry,
  TimeEntry,
  TimeEntriesByYear,
} from '@/types/timeEntry'
import {
  LDC_BUILTIN_CATEGORY_ID,
  makeLdcBuiltinCategory,
} from '@/constants/categories'

type LegacyTagEntry = string | { value: string; credit?: boolean }

type CreditResolution = 'majority'

export type CategoryMigrationInput = {
  serviceReports: TimeEntriesByYear

  legacyTags: LegacyTagEntry[]

  now: number

  uuid?: () => string

  creditResolution?: CreditResolution
}

export type CategoryMigrationResult = {
  categories: Category[]

  serviceReports: TimeEntriesByYear

  reconciledCreditMismatches: number
}

export function migrateTagsToCategories(
  args: CategoryMigrationInput
): CategoryMigrationResult {
  const {
    serviceReports,
    legacyTags,
    uuid,
    creditResolution = 'majority',
  } = args

  const tagStats = new Map<
    string,
    { trueCount: number; falseCount: number; seedIsCredit?: boolean }
  >()

  const recordTag = (name: string, credit: boolean | undefined): void => {
    const trimmed = typeof name === 'string' ? name.trim() : ''
    if (!trimmed) return
    let entry = tagStats.get(trimmed)
    if (!entry) {
      entry = { trueCount: 0, falseCount: 0 }
      tagStats.set(trimmed, entry)
    }
    if (credit === true) entry.trueCount += 1
    else if (credit === false) entry.falseCount += 1
  }

  for (const year of Object.values(serviceReports)) {
    for (const month of Object.values(year)) {
      for (const report of month) {
        if (!report.tag) continue
        recordTag(report.tag, report.credit)
      }
    }
  }

  for (const raw of legacyTags) {
    if (typeof raw === 'string') {
      recordTag(raw, undefined)
      continue
    }
    if (raw && typeof raw === 'object' && typeof raw.value === 'string') {
      const trimmed = raw.value.trim()
      if (!trimmed) continue
      if (!tagStats.has(trimmed)) {
        tagStats.set(trimmed, {
          trueCount: 0,
          falseCount: 0,
          seedIsCredit: raw.credit === true,
        })
      } else if (typeof raw.credit === 'boolean') {
        const existing = tagStats.get(trimmed)!
        if (existing.seedIsCredit === undefined) {
          existing.seedIsCredit = raw.credit
        }
      }
    }
  }

  const resolveIsCredit = (stats: {
    trueCount: number
    falseCount: number
    seedIsCredit?: boolean
  }): boolean => {
    const { trueCount, falseCount, seedIsCredit } = stats
    if (creditResolution === 'majority') {
      if (trueCount > falseCount) return true
      if (falseCount > trueCount) return false

      return seedIsCredit ?? false
    }
    return false
  }

  const sortedNames = Array.from(tagStats.keys()).sort()
  const nameToId = new Map<string, string>()
  const categories: Category[] = []
  for (const name of sortedNames) {
    const stats = tagStats.get(name)!
    const id = uuid?.() ?? legacyDefinitionId('category', name)
    nameToId.set(name, id)
    categories.push({
      id,
      name,
      isCredit: resolveIsCredit(stats),
      updatedAt: 1,
    })
  }

  let reconciledCreditMismatches = 0
  const rebuiltReports: TimeEntriesByYear = {}
  for (const [yearKey, year] of Object.entries(serviceReports)) {
    rebuiltReports[yearKey] = {}
    for (const [monthKey, month] of Object.entries(year)) {
      rebuiltReports[yearKey][monthKey] = month.map((report) => {
        if (!report.tag) return report
        const id = nameToId.get(report.tag.trim())
        if (!id) return report
        const category = categories.find((c) => c.id === id)
        if (category && report.credit !== undefined) {
          if ((report.credit ?? false) !== category.isCredit) {
            reconciledCreditMismatches += 1
          }
        }

        const { tag: _drop, ...rest } = report as TimeEntry & {
          tag?: string
        }
        return {
          ...rest,
          categoryId: id,

          credit: category?.isCredit ?? report.credit,
        }
      })
    }
  }

  return {
    categories,
    serviceReports: rebuiltReports,
    reconciledCreditMismatches,
  }
}

export type LdcCollapseMigrationInput = {
  serviceReports: TimeEntriesByYear

  categories: Category[]

  now: number
}

export type LdcCollapseMigrationResult = {
  categories: Category[]

  serviceReports: TimeEntriesByYear

  rewrittenCount: number

  conflictedCount: number

  seededLdcBuiltin: boolean
}

export function migrateLdcToCategory(
  args: LdcCollapseMigrationInput
): LdcCollapseMigrationResult {
  const { serviceReports, categories, now } = args

  const hasLdcBuiltin = categories.some((c) => c.id === LDC_BUILTIN_CATEGORY_ID)
  const seededLdcBuiltin = !hasLdcBuiltin

  const outCategories: Category[] = hasLdcBuiltin
    ? categories
    : [...categories, makeLdcBuiltinCategory(now)]

  let rewrittenCount = 0
  let conflictedCount = 0
  const rebuiltReports: TimeEntriesByYear = {}

  for (const [yearKey, year] of Object.entries(serviceReports)) {
    rebuiltReports[yearKey] = {}
    for (const [monthKey, month] of Object.entries(year)) {
      rebuiltReports[yearKey][monthKey] = month.map((report) => {
        const legacy = report as LegacyTimeEntry
        if (legacy.ldc !== true) {
          if ('ldc' in (legacy as Record<string, unknown>)) {
            const { ldc: _drop, ...rest } = legacy as TimeEntry & {
              ldc?: boolean
            }
            return rest
          }
          return report
        }

        const hasNonLdcCategory =
          typeof legacy.categoryId === 'string' &&
          legacy.categoryId !== LDC_BUILTIN_CATEGORY_ID
        if (hasNonLdcCategory) {
          conflictedCount += 1
          const { ldc: _drop, ...rest } = legacy as TimeEntry & {
            ldc?: boolean
          }
          return rest
        }

        rewrittenCount += 1
        const { ldc: _drop, ...rest } = legacy as TimeEntry & {
          ldc?: boolean
        }
        return {
          ...rest,
          categoryId: LDC_BUILTIN_CATEGORY_ID,
          credit: true,
        }
      })
    }
  }

  return {
    categories: outCategories,
    serviceReports: rebuiltReports,
    rewrittenCount,
    conflictedCount,
    seededLdcBuiltin,
  }
}

export type CreditRestampResult = {
  changed: boolean
  serviceReports: TimeEntriesByYear
}

const rewriteTimeEntriesCredit = (
  serviceReports: TimeEntriesByYear,
  targetIsCredit: (entry: TimeEntry) => boolean | undefined,
  stamp: (entry: TimeEntry) => TimeEntry
): CreditRestampResult => {
  let changed = false
  const next: TimeEntriesByYear = {}
  const needsRewrite = (entry: TimeEntry) => {
    const isCredit = targetIsCredit(entry)
    return isCredit !== undefined && (entry.credit === true) !== isCredit
  }

  for (const year of Object.keys(serviceReports)) {
    const months = serviceReports[year]
    const nextMonths: TimeEntriesByYear[string] = {}
    for (const month of Object.keys(months)) {
      const bucket = months[month]
      if (bucket.some(needsRewrite)) {
        changed = true
        nextMonths[month] = bucket.map((entry) =>
          needsRewrite(entry)
            ? stamp({ ...entry, credit: targetIsCredit(entry) })
            : entry
        )
      } else {
        nextMonths[month] = bucket
      }
    }
    next[year] = nextMonths
  }

  return changed
    ? { changed, serviceReports: next }
    : { changed, serviceReports }
}

export function restampTimeEntriesCredit(
  serviceReports: TimeEntriesByYear,
  categoryId: string,
  isCredit: boolean
): CreditRestampResult {
  return rewriteTimeEntriesCredit(
    serviceReports,
    (entry) => (entry.categoryId === categoryId ? isCredit : undefined),
    (entry) => ({ ...entry, updatedAt: syncTimestamp(entry.updatedAt) })
  )
}

export function normalizeTimeEntriesCredit(
  serviceReports: TimeEntriesByYear,
  categories: Category[]
): CreditRestampResult {
  if (categories.length === 0) return { changed: false, serviceReports }
  const isCreditById = new Map(categories.map((c) => [c.id, c.isCredit]))
  return rewriteTimeEntriesCredit(
    serviceReports,
    (entry) =>
      entry.categoryId === undefined
        ? undefined
        : isCreditById.get(entry.categoryId),
    (entry) => entry
  )
}
