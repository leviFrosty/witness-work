import i18n, { type TranslationKey } from '@/lib/locales'
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
 * When a locked option opens up in months mode, from `unlockRequirement`: "This
 * month", "Next month", "In 3 months".
 */
export const unlockBadgeText = (monthsFromNow: number): string =>
  monthsFromNow <= 0
    ? i18n.t('pet.room.unlockThisMonth')
    : i18n.t('pet.room.unlockIn' as TranslationKey, { count: monthsFromNow })

/**
 * How a locked option opens up, in words for its accessibility label: "At a
 * streak of 7", or the months badge. The streak badge itself shows a flame and
 * the number.
 */
export const unlockRequirementText = (
  requirement: UnlockRequirement
): string =>
  requirement.by === 'streak'
    ? i18n.t('pet.room.unlockAtStreak' as TranslationKey, {
        count: requirement.count,
      })
    : unlockBadgeText(requirement.monthsFromNow)

/** The note under a tab with locked options: how they open up. */
export const unlockNoteText = (mode: UnlockMode, kind: StreakKind): string =>
  mode === 'months'
    ? i18n.t('pet.room.unlockNote.months')
    : kind === 'plans'
      ? i18n.t('pet.room.unlockNote.streakPlans')
      : i18n.t('pet.room.unlockNote.streakMonths')
