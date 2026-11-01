import { Category } from '@/types/category'

export const LDC_BUILTIN_CATEGORY_ID = 'ldc-builtin-3f9c4a1d'

export const STANDARD_CATEGORY_ID = '__standard__'

export const LDC_BUILTIN_CATEGORY_NAME = 'LDC'

export const makeLdcBuiltinCategory = (_now: number): Category => ({
  id: LDC_BUILTIN_CATEGORY_ID,
  name: LDC_BUILTIN_CATEGORY_NAME,
  isCredit: true,
  builtin: true,
  updatedAt: 1,
})

export const isSeededBuiltinCategory = (category: Category) => {
  const seed = makeLdcBuiltinCategory(0)
  return (
    category.id === seed.id &&
    category.name === seed.name &&
    category.isCredit === seed.isCredit &&
    category.builtin === seed.builtin &&
    !category.legacyIds?.length
  )
}
