import i18n, { type TranslationKey } from '@/lib/locales'
import { formatNumber } from '@/lib/numbers'
import type { StreakKind } from '@/lib/serviceStreak'
import type {
  RoomChoicePart,
  RoomTab,
  UnlockRequirement,
} from '@/features/pet/lib/roomOptions'
import type { UnlockMode } from '@/features/pet/lib/unlocks'

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
 * A locked option's months-mode badge, from `unlockRequirement`: "1 more
 * month", "3 more months". It counts active months, not the calendar.
 */
export const unlockBadgeText = (monthsNeeded: number): string =>
  i18n.t('pet.room.unlockMonthsMore' as TranslationKey, {
    count: monthsNeeded,
  })

/**
 * How a locked option opens up, in words for its accessibility label and its
 * tooltip: "At a streak of 7", or what months mode needs ("Opens after 3 months
 * in which you log time …"). The streak badge itself shows a flame and the
 * number. A secret never says.
 */
export const unlockRequirementText = (
  requirement: UnlockRequirement
): string => {
  switch (requirement.by) {
    case 'streak':
      return i18n.t('pet.room.unlockAtStreak' as TranslationKey, {
        count: requirement.count,
      })
    case 'months':
      return i18n.t(
        (requirement.thisMonthCounts
          ? 'pet.room.unlockMonthsHow.fromThisMonth'
          : 'pet.room.unlockMonthsHow.fromNextMonth') as TranslationKey,
        { count: requirement.monthsNeeded }
      )
    case 'secret':
      return i18n.t('pet.room.secret.body')
  }
}

/**
 * A locked option's corner badge, beside the flame for a streak: the streak
 * count, the months badge, or a question mark for a secret.
 */
export const unlockPillText = (requirement: UnlockRequirement): string => {
  switch (requirement.by) {
    case 'streak':
      return formatNumber(requirement.count)
    case 'months':
      return unlockBadgeText(requirement.monthsNeeded)
    case 'secret':
      return i18n.t('pet.room.secret.badge')
  }
}

/**
 * The note under a tab with locked options: how they open up. Hats keep their
 * own pace in months mode.
 */
export const unlockNoteText = (
  mode: UnlockMode,
  kind: StreakKind,
  tab?: RoomTab
): string =>
  mode === 'months'
    ? i18n.t(
        tab === 'hat'
          ? 'pet.room.unlockNote.monthsHats'
          : 'pet.room.unlockNote.months'
      )
    : kind === 'plans'
      ? i18n.t('pet.room.unlockNote.streakPlans')
      : i18n.t('pet.room.unlockNote.streakMonths')

/**
 * The note above a tab's options while any are locked: how the regular ones
 * open up (`unlockNoteText`), and that some are secrets while a secret is
 * locked. Null with nothing locked.
 */
export function lockedNoteText(
  mode: UnlockMode,
  kind: StreakKind,
  tab: RoomTab,
  locked: { regular: boolean; secret: boolean }
): string | null {
  if (!locked.regular)
    return locked.secret ? i18n.t('pet.room.unlockNote.secrets') : null
  const note = unlockNoteText(mode, kind, tab)
  return locked.secret
    ? i18n.t('pet.room.unlockNote.withSecrets', { note })
    : note
}
