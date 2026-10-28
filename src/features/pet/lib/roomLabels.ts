import i18n, { type TranslationKey } from '@/lib/locales'
import { formatNumber } from '@/lib/numbers'
import {
  COINS_PER_MILESTONE,
  SHARED_MONTH_COINS,
} from '@/features/pet/lib/currency'
import type { RoomChoicePart, RoomTab } from '@/features/pet/lib/roomOptions'

/** A Decorate Room tab's name ("Window", "Light"). */
export const roomTabLabel = (tab: RoomTab): string =>
  i18n.t(`pet.room.tab.${tab}` as TranslationKey)

/** A section heading inside a tab, where the tab has two. */
export const roomSectionLabel = (part: RoomChoicePart): string | null =>
  part === 'windowTime' ||
  part === 'windowSeason' ||
  part === 'wallColor' ||
  part === 'wallPattern'
    ? i18n.t(`pet.room.section.${part}` as TranslationKey)
    : null

/** An option's short name ("Clay tile", "Hours this month", "Live"). */
export const roomOptionLabel = (part: RoomChoicePart, option: string): string =>
  i18n.t(`pet.room.option.${part}.${option}` as TranslationKey)

/** An amount of coins in words: "12 coins", "1 coin". */
export const coinsText = (amount: number): string =>
  i18n.t('pet.currency.coin' as TranslationKey, { count: amount })

/** A change in a count, signed: "+20", "−12". */
export const signedAmountText = (delta: number): string =>
  i18n.t(delta < 0 ? 'pet.currency.loss' : 'pet.currency.gain', {
    amount: formatNumber(Math.abs(delta)),
  })

/** What was earned, for a screen reader: "Earned 3 coins". Null for none. */
export const gainedText = (gain: number): string | null =>
  gain > 0
    ? i18n.t('pet.currency.earnedA11y', { amount: coinsText(gain) })
    : null

/**
 * How coins are earned, for the wallet's info. `monthlyHearts`: the User
 * reports by month, so a month they share in counts for more. `streaks`:
 * streaks show, so their milestones earn coins too.
 */
export const currencyInfoText = ({
  monthlyHearts,
  streaks,
}: {
  monthlyHearts: boolean
  streaks: boolean
}): string =>
  [
    i18n.t(
      monthlyHearts ? 'pet.currency.infoMonths' : 'pet.currency.infoDays',
      { floor: formatNumber(SHARED_MONTH_COINS) }
    ),
    streaks
      ? i18n.t('pet.currency.infoStreak', {
          amount: coinsText(COINS_PER_MILESTONE),
        })
      : null,
    i18n.t('pet.currency.infoSpend'),
  ]
    .filter(Boolean)
    .join(' ')

/** A price in words: "12 coins". */
export const priceText = (price: number): string => coinsText(price)
