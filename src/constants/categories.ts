import { Category } from '@/types/category'

/**
 * Stable, install-independent UUID for the LDC builtin Category. Hard-coded as
 * a constant (rather than generated per device) so cross-device iCloud merges
 * can match by id without ambiguity — every device that runs the LDC collapse
 * migration seeds the same record.
 *
 * Treat this id as forever-immutable: changing it would orphan every entry
 * migrated under the old value and create a duplicate "LDC" Category on
 * existing installs.
 *
 * Glossary: `LDC Time` is a common variety of `Credit Time` (see CONTEXT.md).
 * The builtin Category gives "LDC" first-class representation in the Categories
 * store; the cap math reads it through the normal Category seam (`isCredit:
 * true`).
 */
export const LDC_BUILTIN_CATEGORY_ID = 'ldc-builtin-3f9c4a1d'

/**
 * User-visible label for the LDC builtin Category. Stored on the Category
 * record at seed time so legacy locale rendering keeps working; the
 * picker/breakdown UI still routes through `i18n.t('ldc')` for translated
 * display.
 */
export const LDC_BUILTIN_CATEGORY_NAME = 'LDC'

/**
 * Returns true when the Category record represents the LDC builtin. Prefer the
 * `builtin` flag (post-seed) but fall back to id match so a record that
 * pre-dates the `builtin` field still resolves correctly.
 */
export const isLdcBuiltinCategory = (category: {
  id: string
  builtin?: boolean
}) => category.builtin === true || category.id === LDC_BUILTIN_CATEGORY_ID

/**
 * Produces the canonical LDC builtin Category record. Callers must stamp
 * `updatedAt` themselves (typically Date.now()) so the record participates in
 * iCloud last-writer-wins merge alongside user-created Categories.
 */
export const makeLdcBuiltinCategory = (now: number): Category => ({
  id: LDC_BUILTIN_CATEGORY_ID,
  name: LDC_BUILTIN_CATEGORY_NAME,
  isCredit: true,
  builtin: true,
  updatedAt: now,
})
