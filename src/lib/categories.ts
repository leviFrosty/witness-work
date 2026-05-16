import * as Crypto from 'expo-crypto'
import { Category } from '@/types/category'
import { ServiceReport, ServiceReportsByYears } from '@/types/serviceReport'

/**
 * Shape of the legacy `preferences.serviceReportTags` entry. We accept both the
 * old `string` form and the newer `{value, credit}` object form so the
 * migration can absorb whichever the user happens to have on disk.
 */
type LegacyTagEntry = string | { value: string; credit?: boolean }

/**
 * Resolution policy when the same legacy tag string was recorded with both
 * `credit: true` and `credit: false` across different ServiceReports.
 *
 * - `'majority'` — counts entries per credit value; ties fall back to `false`.
 *
 * The brief calls this out as the data-inconsistency this refactor exists to
 * close: under the old shape the same Category name could differ in credit
 * attribution per entry. We pick a single value (majority wins, tie ⇒
 * non-credit) and stamp it on the Category record going forward.
 */
type CreditResolution = 'majority'

export type CategoryMigrationInput = {
  serviceReports: ServiceReportsByYears
  /** User's saved tag list from `preferences.serviceReportTags`. */
  legacyTags: LegacyTagEntry[]
  /** Now() in epoch ms — stamped onto every newly-created Category. */
  now: number
  /** UUID generator; injectable for tests. Defaults to `expo-crypto.randomUUID`. */
  uuid?: () => string
  /** Credit resolution strategy. See `CreditResolution`. */
  creditResolution?: CreditResolution
}

export type CategoryMigrationResult = {
  /** The fully-populated Categories list to seed the new store with. */
  categories: Category[]
  /**
   * The migrated ServiceReports tree. Each entry that had a legacy `tag` now
   * has `categoryId` pointing at the corresponding `Category.id`; the legacy
   * `tag` field is dropped. Entries that had no `tag` are returned unchanged.
   */
  serviceReports: ServiceReportsByYears
  /**
   * Count of ServiceReports whose `credit` boolean disagreed with the
   * majority-resolved Category `isCredit` they were folded into. Surfaced for
   * the PR description / observability — non-zero means at least one user
   * historically had inconsistent credit attribution under the same tag name.
   */
  reconciledCreditMismatches: number
}

/**
 * One-time migration that promotes the legacy free-text `ServiceReport.tag`
 * field + `preferences.serviceReportTags` list into first-class `Category`
 * records.
 *
 * Algorithm:
 *
 * 1. Walk every ServiceReport. Each distinct `tag` string contributes one
 *    Category. Track per-tag counts of `credit: true` vs `credit: false`.
 * 2. Fold the user's saved `legacyTags` into the same map so Categories the user
 *    defined but never used still survive the migration. For object-form
 *    entries the stored `credit` boolean wins the tie when no ServiceReports
 *    reference that tag.
 * 3. Resolve `isCredit` per Category by majority of observed entry credit values;
 *    non-tag-bearing entries are ignored. Ties fall back to `false`
 *    (conservative — non-credit is the publisher's default monthly bucket).
 * 4. Rewrite every ServiceReport: drop `tag`, set `categoryId`. The per-entry
 *    `credit` boolean is left in place for legacy readers but should no longer
 *    be authoritative (callers now read `Category.isCredit`).
 *
 * The migration is pure: no store access, no side effects. The boot runner in
 * `src/app/App.tsx` is responsible for gating it on
 * `preferences.hasMigratedTagsToCategories` and writing the result back to the
 * Categories store, ServiceReport store, and Preferences store.
 */
export function migrateTagsToCategories(
  args: CategoryMigrationInput
): CategoryMigrationResult {
  const {
    serviceReports,
    legacyTags,
    now,
    uuid = () => Crypto.randomUUID(),
    creditResolution = 'majority',
  } = args

  // tag-name → { trueCount, falseCount, seedIsCredit? } accumulator.
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

  // Pass 1: tags actually attached to ServiceReports.
  for (const year of Object.values(serviceReports)) {
    for (const month of Object.values(year)) {
      for (const report of month) {
        if (!report.tag) continue
        recordTag(report.tag, report.credit)
      }
    }
  }

  // Pass 2: user-defined tags from preferences (may include entries never
  // attached to a ServiceReport). Seed `isCredit` from object-form entries
  // so a tag the user defined as credit-bearing but never used keeps that
  // intent. String-form entries are treated as non-credit by default.
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
      // Tie (including 0/0): defer to the seed, then to `false`.
      return seedIsCredit ?? false
    }
    return false
  }

  // Build Category records in deterministic name order so test fixtures and
  // sync payloads are stable across runs.
  const sortedNames = Array.from(tagStats.keys()).sort()
  const nameToId = new Map<string, string>()
  const categories: Category[] = []
  for (const name of sortedNames) {
    const stats = tagStats.get(name)!
    const id = uuid()
    nameToId.set(name, id)
    categories.push({
      id,
      name,
      isCredit: resolveIsCredit(stats),
      updatedAt: now,
    })
  }

  // Pass 3: rewrite ServiceReports. Drop `tag`, set `categoryId`. Track
  // mismatches between the per-entry `credit` boolean and the resolved
  // Category `isCredit` for the PR description.
  let reconciledCreditMismatches = 0
  const rebuiltReports: ServiceReportsByYears = {}
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
        // Strip the legacy `tag` field by destructuring it off.
        const { tag: _drop, ...rest } = report as ServiceReport & {
          tag?: string
        }
        return {
          ...rest,
          categoryId: id,
          // Pin per-entry credit to the resolved Category value so existing
          // credit-math readers (which still read `report.credit`) agree
          // with the Category source of truth.
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

/**
 * Helper used by readers that need the Category for a ServiceReport. Returns
 * the Category record when `categoryId` resolves; otherwise falls back to a
 * synthetic record built from the legacy `tag` + `credit` fields (for entries
 * that pre-date the migration and haven't been rewritten yet).
 *
 * Returns `null` when the entry has neither a categoryId nor a legacy tag —
 * i.e. it's a standard / LDC entry that doesn't belong to a user Category.
 */
export function resolveCategoryForReport(
  report: ServiceReport,
  categories: Category[]
): Category | null {
  if (report.categoryId) {
    const found = categories.find((c) => c.id === report.categoryId)
    if (found) return found
  }
  if (report.tag) {
    return {
      id: report.categoryId ?? `__legacy:${report.tag}`,
      name: report.tag,
      isCredit: report.credit === true,
    }
  }
  return null
}
