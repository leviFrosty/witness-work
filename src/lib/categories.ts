import * as Crypto from 'expo-crypto'
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
  serviceReports: TimeEntriesByYear
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
  serviceReports: TimeEntriesByYear
  /**
   * Count of ServiceReports whose `credit` boolean disagreed with the
   * majority-resolved Category `isCredit` they were folded into. Surfaced for
   * the PR description / observability — non-zero means at least one user
   * historically had inconsistent credit attribution under the same tag name.
   */
  reconciledCreditMismatches: number
}

/**
 * One-time migration that promotes the legacy free-text `TimeEntry.tag` field +
 * `preferences.serviceReportTags` list into first-class `Category` records.
 *
 * Algorithm:
 *
 * 1. Walk every TimeEntry. Each distinct `tag` string contributes one Category.
 *    Track per-tag counts of `credit: true` vs `credit: false`.
 * 2. Fold the user's saved `legacyTags` into the same map so Categories the user
 *    defined but never used still survive the migration. For object-form
 *    entries the stored `credit` boolean wins the tie when no ServiceReports
 *    reference that tag.
 * 3. Resolve `isCredit` per Category by majority of observed entry credit values;
 *    non-tag-bearing entries are ignored. Ties fall back to `false`
 *    (conservative — non-credit is the publisher's default monthly bucket).
 * 4. Rewrite every TimeEntry: drop `tag`, set `categoryId`. The per-entry `credit`
 *    boolean is left in place for legacy readers but should no longer be
 *    authoritative (callers now read `Category.isCredit`).
 *
 * The migration is pure: no store access, no side effects. The boot runner in
 * `src/app/App.tsx` is responsible for gating it on
 * `preferences.hasMigratedTagsToCategories` and writing the result back to the
 * Categories store, TimeEntry store, and Preferences store.
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
  // attached to a TimeEntry). Seed `isCredit` from object-form entries
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
        // Strip the legacy `tag` field by destructuring it off.
        const { tag: _drop, ...rest } = report as TimeEntry & {
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

export type LdcCollapseMigrationInput = {
  /** Persisted ServiceReports — may still carry the legacy `ldc: true` flag. */
  serviceReports: TimeEntriesByYear
  /** Existing Category records (post tag-to-Category migration). */
  categories: Category[]
  /** Now() in epoch ms — stamped onto the seeded LDC builtin record. */
  now: number
}

export type LdcCollapseMigrationResult = {
  /**
   * Updated Categories list. Includes the LDC builtin record if it wasn't
   * already present. Existing categories are returned unchanged.
   */
  categories: Category[]
  /**
   * Rewritten ServiceReports tree. Every entry that carried `ldc: true` now has
   * `categoryId: LDC_BUILTIN_CATEGORY_ID, credit: true` and no `ldc` field.
   * Entries that already had a non-LDC `categoryId` keep that `categoryId` (the
   * explicit Category wins per precedence rule); the `ldc` flag is dropped
   * regardless.
   */
  serviceReports: TimeEntriesByYear
  /**
   * Number of entries rewritten from `ldc: true` → LDC builtin Category.
   * Surfaced for observability — non-zero means the user had at least one LDC
   * entry that was collapsed onto the builtin.
   */
  rewrittenCount: number
  /**
   * Number of entries that had BOTH `ldc: true` AND a non-LDC `categoryId`
   * already set (data corruption — shouldn't happen but possible). The explicit
   * Category wins; the `ldc` flag is dropped. Surfaced for the PR description /
   * observability.
   */
  conflictedCount: number
  /**
   * True when the LDC builtin Category had to be seeded as part of this
   * migration (i.e. it wasn't already present in the categories list). Used by
   * the boot runner to decide whether to write the categories store.
   */
  seededLdcBuiltin: boolean
}

/**
 * One-time migration that collapses the legacy `TimeEntry.ldc` boolean into the
 * LDC builtin Category (`LDC_BUILTIN_CATEGORY_ID`). After this migration runs,
 * the `ldc` field is no longer authoritative — LDC entries carry `categoryId:
 * LDC_BUILTIN_CATEGORY_ID, credit: true` and look like any other credit-bearing
 * Category to the cap math.
 *
 * Algorithm:
 *
 * 1. Ensure the LDC builtin Category record exists in the user's categories list.
 *    If absent, seed it (`makeLdcBuiltinCategory(now)`).
 * 2. Walk every TimeEntry:
 *
 *    - If `ldc !== true`: drop the field if present, otherwise return unchanged.
 *    - If `ldc === true` AND `categoryId === undefined`: set `categoryId:
 *         LDC_BUILTIN_CATEGORY_ID, credit: true`; drop `ldc`.
 *    - If `ldc === true` AND `categoryId` is already set to a non-LDC value (data
 *         corruption): keep `categoryId` as-is (explicit Category wins); drop
 *         `ldc`. Count under `conflictedCount`.
 * 3. Idempotent — entries that already have `categoryId: LDC_BUILTIN_CATEGORY_ID`
 *    and no `ldc` field are returned unchanged; the builtin is only seeded if
 *    it wasn't already present.
 *
 * The migration is pure: no store access, no side effects. The boot runner in
 * `src/app/App.tsx` gates it on `preferences.hasCollapsedLdcIntoCategory` and
 * sequences it after `migrateTagsToCategories` so the categories list is fully
 * populated before LDC is folded in.
 */
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
        // Treat the input as the legacy shape so we can read `ldc` even
        // though the canonical type no longer exposes it.
        const legacy = report as LegacyTimeEntry
        if (legacy.ldc !== true) {
          // Defensive: an entry might carry `ldc: false` from older writers.
          // Strip the field so the on-disk shape matches the canonical type
          // after migration.
          if ('ldc' in (legacy as Record<string, unknown>)) {
            const { ldc: _drop, ...rest } = legacy as TimeEntry & {
              ldc?: boolean
            }
            return rest
          }
          return report
        }
        // `ldc === true` — figure out where the entry should land.
        const hasNonLdcCategory =
          typeof legacy.categoryId === 'string' &&
          legacy.categoryId !== LDC_BUILTIN_CATEGORY_ID
        if (hasNonLdcCategory) {
          // Explicit Category wins; drop the LDC flag. Count under conflicts.
          conflictedCount += 1
          const { ldc: _drop, ...rest } = legacy as TimeEntry & {
            ldc?: boolean
          }
          return rest
        }
        // Standard LDC entry (no other categoryId): fold onto the builtin.
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

/**
 * Helper used by readers that need the Category for a TimeEntry. Returns the
 * Category record when `categoryId` resolves; otherwise falls back to a
 * synthetic record built from the legacy `tag` + `credit` fields (for entries
 * that pre-date the migration and haven't been rewritten yet).
 *
 * Returns `null` when the entry has neither a categoryId nor a legacy tag —
 * i.e. it's a standard / LDC entry that doesn't belong to a user Category.
 */
export function resolveCategoryForReport(
  report: TimeEntry,
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

export type CreditRestampResult = {
  /** False when no entry references the Category — nothing to write back. */
  changed: boolean
  serviceReports: TimeEntriesByYear
}

/**
 * Re-stamps the legacy per-entry `credit` boolean on every TimeEntry
 * referencing `categoryId` after the Category's `isCredit` flips. The Category
 * record is the source of truth; the stamp only keeps legacy credit-math
 * readers consistent during the transition window. (Plans are never re-stamped
 * — they derive credit-ness from the Category at read time.)
 *
 * Pure and identity-preserving: untouched month buckets keep their array
 * identity (so report-keyed memoization survives), nothing in the input tree is
 * mutated, and `changed: false` tells the caller to skip the store write
 * entirely.
 */
export function restampTimeEntriesCredit(
  serviceReports: TimeEntriesByYear,
  categoryId: string,
  isCredit: boolean
): CreditRestampResult {
  let changed = false
  const next: TimeEntriesByYear = {}

  for (const year of Object.keys(serviceReports)) {
    const months = serviceReports[year]
    const nextMonths: TimeEntriesByYear[string] = {}
    for (const month of Object.keys(months)) {
      const bucket = months[month]
      if (bucket.some((r) => r.categoryId === categoryId)) {
        changed = true
        nextMonths[month] = bucket.map((r) =>
          r.categoryId === categoryId ? { ...r, credit: isCredit } : r
        )
      } else {
        nextMonths[month] = bucket
      }
    }
    next[year] = nextMonths
  }

  return { changed, serviceReports: next }
}
