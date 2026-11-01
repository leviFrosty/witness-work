import { usePreferences } from '@/stores/preferences'
import useCategories from '@/stores/categories'
import useServiceReport from '@/stores/serviceReport'
import { migrateLdcToCategory, migrateTagsToCategories } from '@/lib/categories'

export function runTagsToCategoriesMigration() {
  const prefs = usePreferences.getState()
  if (prefs.hasMigratedTagsToCategories) return

  const { categories, deletedCategories } = useCategories.getState()
  if (categories.length > 0 || deletedCategories.length > 0) {
    usePreferences.setState({ hasMigratedTagsToCategories: true })
    return
  }

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

  useCategories.setState({
    categories: result.categories,
    deletedCategories: [],
  })

  if (result.categories.length > 0) {
    reports.set({ serviceReports: result.serviceReports })
  }

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

  if (result.seededLdcBuiltin) {
    useCategories.setState({ categories: result.categories })
  }

  if (result.rewrittenCount > 0 || result.conflictedCount > 0) {
    reports.set({ serviceReports: result.serviceReports })
  }

  usePreferences.setState({
    hasCollapsedLdcIntoCategory: true,
  } as never)
}
