import i18n from '@/lib/locales'
import type { ProgressCardSize } from '@/lib/progressCards'

/** A size in a sentence, e.g. "full length". */
export const progressCardSizeLabel = (size: ProgressCardSize) =>
  i18n.t(`progressCards.size.${size}`)

/** A size as a standalone label, e.g. "Full Length". */
export const progressCardSizeName = (size: ProgressCardSize) =>
  i18n.t(`progressCards.sizeName.${size}`)
