import { Category } from '@/types/category'
import { LegacyTimeEntry, TimeEntry } from '@/types/timeEntry'
import { LDC_BUILTIN_CATEGORY_ID } from '@/constants/categories'

export const isLdcEntry = (report: TimeEntry): boolean => {
  if (report.categoryId === LDC_BUILTIN_CATEGORY_ID) return true

  return (report as LegacyTimeEntry).ldc === true
}

export const hasCategory = (report: TimeEntry): boolean =>
  Boolean(report.categoryId || report.tag)

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

export const isPlanCreditTime = (
  plan: { categoryId?: string },
  categories: Category[]
): boolean => {
  if (!plan.categoryId) return false
  return categories.find((c) => c.id === plan.categoryId)?.isCredit ?? false
}
