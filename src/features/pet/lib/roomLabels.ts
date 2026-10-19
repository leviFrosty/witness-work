import i18n, { type TranslationKey } from '@/lib/locales'
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

/**
 * When a locked option opens up, from `unlockMonthsFromNow`: "This month",
 * "Next month", "In 3 months".
 */
export const unlockBadgeText = (monthsFromNow: number): string =>
  monthsFromNow <= 0
    ? i18n.t('pet.room.unlockThisMonth')
    : i18n.t('pet.room.unlockIn' as TranslationKey, { count: monthsFromNow })
