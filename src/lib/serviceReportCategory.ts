import { Category } from '@/types/category'
import { ServiceReport } from '@/types/serviceReport'

/**
 * Returns true when a ServiceReport belongs to a user-defined Category (i.e.
 * not a Standard entry, not LDC). Replaces the legacy `report.tag` truthiness
 * check, but also accepts the new `report.categoryId` so callers don't need to
 * know whether the migration has run yet.
 *
 * @see migrateTagsToCategories — converts legacy `tag` into `categoryId`.
 */
export const hasCategory = (report: ServiceReport): boolean =>
  Boolean(report.categoryId || report.tag)

/**
 * Returns the user-visible label for the Category this ServiceReport belongs
 * to. Prefers the categories store lookup by `categoryId`, falls back to the
 * legacy free-text `tag` for entries that pre-date the migration. Returns
 * `undefined` for entries with no category (Standard / LDC).
 */
export const getCategoryLabel = (
  report: ServiceReport,
  categories: Category[]
): string | undefined => {
  if (report.categoryId) {
    const found = categories.find((c) => c.id === report.categoryId)
    if (found) return found.name
  }
  return report.tag
}

/**
 * Resolves the credit attribution for a ServiceReport. Prefers the Category's
 * `isCredit` (the post-migration source of truth); falls back to the per-entry
 * `credit` boolean for unmigrated entries or entries whose `categoryId` no
 * longer resolves (e.g. category deleted across devices before sync caught
 * up).
 */
export const isReportCreditTime = (
  report: ServiceReport,
  categories: Category[]
): boolean => {
  if (report.ldc) return true
  if (report.categoryId) {
    const found = categories.find((c) => c.id === report.categoryId)
    if (found) return found.isCredit
  }
  return report.credit === true
}
