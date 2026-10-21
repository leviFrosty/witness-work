import i18n, { type TranslationKey } from '@/lib/locales'
import { LDC_BUILTIN_CATEGORY_ID } from '@/constants/categories'
import type { Category } from '@/types/category'

/**
 * A Category's name as shown: LDC in the app's language (its stored name is
 * always the English "LDC"), otherwise the name the User gave it, translated
 * when it's one of the app's own keys.
 */
export const categoryLabel = (category: Category): string =>
  category.id === LDC_BUILTIN_CATEGORY_ID
    ? i18n.t('ldc')
    : i18n.t(category.name as TranslationKey, { defaultValue: category.name })

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
  return category ? categoryLabel(category) : i18n.t('standard')
}
