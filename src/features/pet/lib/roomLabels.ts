import i18n, { type TranslationKey } from '@/lib/locales'
import { formatNumber } from '@/lib/numbers'
import {
  COINS_PER_DAY,
  COINS_PER_MILESTONE,
  COINS_PER_PLAN_KEPT,
  SHARED_MONTH_COINS,
} from '@/features/pet/lib/currency'
import type { RoomChoicePart, RoomTab } from '@/features/pet/lib/roomOptions'
import type { ShopEntry } from '@/features/pet/lib/shopEntries'

export const roomTabLabel = (tab: RoomTab): string =>
  i18n.t(`pet.room.tab.${tab}` as TranslationKey)

export const roomSectionLabel = (part: RoomChoicePart): string | null =>
  part === 'windowTime' ||
  part === 'windowSeason' ||
  part === 'wallColor' ||
  part === 'wallPattern'
    ? i18n.t(`pet.room.section.${part}` as TranslationKey)
    : null

export const roomOptionLabel = (part: RoomChoicePart, option: string): string =>
  i18n.t(`pet.room.option.${part}.${option}` as TranslationKey)

const HAT_NOTES: ReadonlySet<string> = new Set([
  'mailbox',
  'cuckoo',
  'bowl',
  'lighthouse',
  'train',
  'dome',
  'fig',
])

export const hatNoteOf = (hat: string): string | null =>
  HAT_NOTES.has(hat)
    ? i18n.t(`pet.shop.hatNote.${hat}` as TranslationKey)
    : null

export const coinsText = (amount: number): string =>
  i18n.t('pet.currency.coin' as TranslationKey, { count: amount })

export const signedAmountText = (delta: number): string =>
  i18n.t(delta < 0 ? 'pet.currency.loss' : 'pet.currency.gain', {
    amount: formatNumber(Math.abs(delta)),
  })

export const gainedText = (gain: number): string | null =>
  gain > 0
    ? i18n.t('pet.currency.earnedA11y', { amount: coinsText(gain) })
    : null

export const currencyInfoText = ({
  monthlyHearts,
  streaks,
  routine = false,
}: {
  monthlyHearts: boolean
  streaks: boolean

  routine?: boolean
}): string =>
  [
    monthlyHearts
      ? i18n.t('pet.currency.infoMonths', {
          floor: formatNumber(SHARED_MONTH_COINS),
        })
      : i18n.t('pet.currency.infoDays', {
          day: coinsText(COINS_PER_DAY),
          kept: formatNumber(COINS_PER_PLAN_KEPT),
        }),
    streaks
      ? i18n.t('pet.currency.infoStreak', {
          amount: coinsText(COINS_PER_MILESTONE),
        })
      : null,
    routine ? i18n.t('pet.currency.infoRoutine') : null,
    i18n.t('pet.currency.infoSpend'),
  ]
    .filter(Boolean)
    .join(' ')

export const priceText = (price: number): string => coinsText(price)

export function shopItemLabel(entry: ShopEntry, name: string): string {
  switch (entry.state) {
    case 'secret':
      return i18n.t('pet.room.secret.a11y')
    case 'current':
    case 'owned':
      return i18n.t('pet.shop.itemOwned', { item: name })
    case 'forSale':
      return i18n.t('pet.shop.itemPrice', {
        item: name,
        price: priceText(entry.price!),
      })
    case 'short':
      return i18n.t('pet.shop.itemNotEnough', {
        item: name,
        price: priceText(entry.price!),
      })
  }
}
