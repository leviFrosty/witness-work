import i18n from '@/lib/locales'
import type { ProgressCardSize } from '@/lib/progressCards'

export const progressCardSizeLabel = (size: ProgressCardSize) =>
  i18n.t(`progressCards.size.${size}`)

export const progressCardSizeName = (size: ProgressCardSize) =>
  i18n.t(`progressCards.sizeName.${size}`)
