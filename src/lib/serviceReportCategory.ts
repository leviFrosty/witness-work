import { Category } from '@/types/category'
import { LegacyTimeEntry, TimeEntry } from '@/types/timeEntry'
import { LDC_BUILTIN_CATEGORY_ID } from '@/constants/categories'

/**
 * Returns true when a TimeEntry is an LDC entry — either pointing at the LDC
 * builtin Category (post-collapse) OR carrying the legacy `ldc: true` flag
 * (pre-collapse). Centralises the LDC predicate so callers don't have to know
 * whether the migration has run yet; mirrors how `hasCategory` smooths over the
 * tag → categoryId transition.
 *
 * @see migrateLdcToCategory — rewrites `ldc: true` → `categoryId: LDC_BUILTIN_CATEGORY_ID`.
 */
export const isLdcEntry = (report: TimeEntry): boolean => {
  if (report.categoryId === LDC_BUILTIN_CATEGORY_ID) return true
  // Legacy `ldc: true` field — still readable on persisted state that
  // pre-dates the collapse migration; the field is dropped on read by the
  // boot runner and by the iCloud field-rename shim.
  return (report as LegacyTimeEntry).ldc === true
}

/**
 * Returns true when a TimeEntry belongs to a user-defined Category (i.e. not a
 * Standard entry). Replaces the legacy `report.tag` truthiness check, but also
 * accepts the new `report.categoryId` so callers don't need to know whether the
 * migration has run yet.
 *
 * Note: post-LDC-collapse, LDC entries are also "categorised" (they reference
 * the LDC builtin Category). Callers that want to distinguish LDC from
 * user-created categories should chain `!isLdcEntry(report)`.
 *
 * @see migrateTagsToCategories — converts legacy `tag` into `categoryId`.
 */
export const hasCategory = (report: TimeEntry): boolean =>
  Boolean(report.categoryId || report.tag)

/**
 * Returns the user-visible label for the Category this TimeEntry belongs to.
 * Prefers the categories store lookup by `categoryId`, falls back to the legacy
 * free-text `tag` for entries that pre-date the migration. Returns `undefined`
 * for entries with no category (Standard / LDC).
 */
export const getCategoryLabel = (
  report: TimeEntry,
  categories: Category[]
): string | undefined => {
  if (report.categoryId) {
    const found = categories.find((c) => c.id === report.categoryId)
    if (found) return found.name
  }
  return report.tag
}

/**
 * Resolves the credit attribution for a TimeEntry. Prefers the Category's
 * `isCredit` (the post-migration source of truth); falls back to the per-entry
 * `credit` boolean for unmigrated entries or entries whose `categoryId` no
 * longer resolves (e.g. category deleted across devices before sync caught
 * up).
 */
export const isReportCreditTime = (
  report: TimeEntry,
  categories: Category[]
): boolean => {
  // Legacy `ldc: true` is still readable from pre-collapse persisted state
  // and incoming sync payloads from older peers (see
  // `payloadFieldRenames.ts`).
  if ((report as LegacyTimeEntry).ldc) return true
  if (report.categoryId) {
    const found = categories.find((c) => c.id === report.categoryId)
    if (found) return found.isCredit
  }
  return report.credit === true
}

/**
 * Resolves the credit attribution for a Plan (Day Plan or Recurring Plan).
 * Unlike Time Entries, Plans carry no stamped `credit` boolean — the referenced
 * Category is the single source of truth, derived at read time, so flipping a
 * Category's credit setting retroactively re-forecasts every Plan referencing
 * it. A Plan with no `categoryId`, or whose Category no longer exists,
 * forecasts Standard (ADR 0005).
 */
export const isPlanCreditTime = (
  plan: { categoryId?: string },
  categories: Category[]
): boolean => {
  if (!plan.categoryId) return false
  return categories.find((c) => c.id === plan.categoryId)?.isCredit ?? false
}
