import i18n, { type TranslationKey } from '@/lib/locales'
import type { Category } from '@/types/category'

/**
 * A Plan's Type as shown: its Category's (translated) name, or Standard when it
 * has none or the Category no longer exists.
 */
export const planTypeLabel = (
  plan: { categoryId?: string },
  categories: Category[]
): string => {
  const category = plan.categoryId
    ? categories.find((c) => c.id === plan.categoryId)
    : undefined
  return category
    ? i18n.t(category.name as TranslationKey, { defaultValue: category.name })
    : i18n.t('standard')
}
