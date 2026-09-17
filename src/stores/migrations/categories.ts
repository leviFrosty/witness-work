import { usePreferences } from '@/stores/preferences'
import useCategories from '@/stores/categories'
import useServiceReport from '@/stores/serviceReport'
import { migrateLdcToCategory, migrateTagsToCategories } from '@/lib/categories'

export function runTagsToCategoriesMigration() {
  const prefs = usePreferences.getState()
  if (prefs.hasMigratedTagsToCategories) return

  const reports = useServiceReport.getState()
  const legacyTags = ((
    prefs as unknown as {
      serviceReportTags?: (string | { value: string; credit?: boolean })[]
    }
  ).serviceReportTags ?? []) as (string | { value: string; credit?: boolean })[]

  const result = migrateTagsToCategories({
    serviceReports: reports.serviceReports,
    legacyTags,
    now: Date.now(),
  })

  // Seed the new Categories store. Use raw setState to skip the per-store
  // stamping (we set updatedAt explicitly inside the migration result).
  useCategories.setState({
    categories: result.categories,
    deletedCategories: [],
  })

  // Apply the rewritten ServiceReports (categoryId + reconciled credit).
  // Raw setState bypasses the per-store `updatedAt` re-stamp — the
  // migration intentionally preserves each entry's existing `updatedAt`.
  if (result.categories.length > 0) {
    reports.set({ serviceReports: result.serviceReports })
  }

  // Drop the legacy preferences.serviceReportTags field from in-memory state
  // so it stops appearing in future persist writes (JSON.stringify drops
  // undefined). Use raw setState to bypass the syncing wrapper.
  usePreferences.setState({
    hasMigratedTagsToCategories: true,
    ...({ serviceReportTags: undefined } as Record<string, unknown>),
  } as never)
}

export function runLdcCategoryMigration() {
  const prefs = usePreferences.getState()
  if (prefs.hasCollapsedLdcIntoCategory) return

  const reports = useServiceReport.getState()
  const cats = useCategories.getState()

  const result = migrateLdcToCategory({
    serviceReports: reports.serviceReports,
    categories: cats.categories,
    now: Date.now(),
  })

  // Seed the LDC builtin Category record if it wasn't already present.
  // Raw setState avoids re-stamping `updatedAt` on every existing record —
  // `migrateLdcToCategory` stamps only the newly-seeded builtin.
  if (result.seededLdcBuiltin) {
    useCategories.setState({ categories: result.categories })
  }

  // Apply rewritten ServiceReports (categoryId + credit on former LDC
  // entries; `ldc` stripped). Raw setState skips the per-store updatedAt
  // re-stamp so existing entries keep their last-edit timestamp.
  if (result.rewrittenCount > 0 || result.conflictedCount > 0) {
    reports.set({ serviceReports: result.serviceReports })
  }

  usePreferences.setState({
    hasCollapsedLdcIntoCategory: true,
  } as never)
}
