import i18n, { type TranslationKey } from '@/lib/locales'
import { LDC_BUILTIN_CATEGORY_ID } from '@/constants/categories'
import type { Category } from '@/types/category'

export const categoryLabel = (category: Category): string =>
  category.id === LDC_BUILTIN_CATEGORY_ID
    ? i18n.t('ldc')
    : i18n.t(category.name as TranslationKey, { defaultValue: category.name })

export const planTypeLabel = (
  plan: { categoryId?: string },
  categories: Category[]
): string => {
  const category = plan.categoryId
    ? categories.find((c) => c.id === plan.categoryId)
    : undefined
  return category ? categoryLabel(category) : i18n.t('standard')
}
