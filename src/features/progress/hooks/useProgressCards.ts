import usePublisher from '@/hooks/usePublisher'
import useMonthlyGoal from '@/hooks/useMonthlyGoal'
import i18n from '@/lib/locales'
import { showUndoToast } from '@/stores/undoToast'
import {
  addProgressCard,
  defaultProgressCards,
  getEffectiveProgressCards,
  keepUnknownProgressCards,
  moveProgressCard,
  removeProgressCard,
  resizeProgressCard,
  sameProgressCards,
  stepProgressCard,
  type ProgressCardId,
  type ProgressCardLayoutItem,
  type ProgressCardSize,
} from '@/lib/progressCards'
import { usePreferences } from '@/stores/preferences'
import { useShallow } from 'zustand/react/shallow'
import { PROGRESS_CARDS } from '@/features/progress/components/cards/progressCardRegistry'

/**
 * Which cards make sense for the month shown. A card that doesn't (no goal to
 * pace against, mileage off) stays in the layout, out of sight, and comes back
 * where it was when it does again.
 */
export function useProgressCardAvailability(month: number, year: number) {
  const { entryMode, hasAnnualGoal } = usePublisher({ month, year })
  const { effectiveGoalHours } = useMonthlyGoal({ month, year })
  const { showStreaks, mileageTrackingEnabled } = usePreferences(
    useShallow((s) => ({
      showStreaks: s.showStreaks,
      mileageTrackingEnabled: s.mileageTrackingEnabled,
    }))
  )
  return (id: ProgressCardId): boolean => {
    switch (id) {
      case 'dailyPace':
      case 'projected':
        return effectiveGoalHours > 0
      case 'credit':
        return entryMode === 'hours'
      case 'yearPace':
        return hasAnnualGoal
      case 'streak':
        return showStreaks
      case 'mileage':
        return mileageTrackingEnabled === true
      default:
        return true
    }
  }
}

/** The User's Progress cards for the month shown, and the edits to them. */
export default function useProgressCards(month: number, year: number) {
  const stored = usePreferences((s) => s.progressCards)
  // Defaults follow today's role so they don't change from month to month.
  const { monthlyGoalHours } = usePublisher()
  const defaults = { hasMonthlyGoal: monthlyGoalHours > 0 }
  const layout = getEffectiveProgressCards(stored, defaults)
  const isAvailable = useProgressCardAvailability(month, year)
  const shown = layout.filter((item) => isAvailable(item.id))

  // Edits read the store, not this render: a drag moves a card several times
  // between renders. A layout edited back to the defaults is stored as `null`,
  // so it keeps following the User's role.
  const edit =
    (change: (layout: ProgressCardLayoutItem[]) => ProgressCardLayoutItem[]) =>
    () => {
      const { progressCards, set } = usePreferences.getState()
      const next = keepUnknownProgressCards(
        progressCards,
        change(getEffectiveProgressCards(progressCards, defaults))
      )
      set({
        progressCards: sameProgressCards(next, defaultProgressCards(defaults))
          ? null
          : next,
      })
    }
  const shownIds = shown.map((item) => item.id)

  return {
    layout,
    shown,
    isAvailable,
    isCustomized: Array.isArray(stored),
    add: (id: ProgressCardId) => edit((l) => addProgressCard(l, id))(),
    /** Removes the card, with an Undo toast that puts the layout back. */
    remove: (id: ProgressCardId) => {
      const before = usePreferences.getState().progressCards
      edit((l) => removeProgressCard(l, id))()
      showUndoToast({
        message: i18n.t('progressCards.removed', {
          card: PROGRESS_CARDS[id].title(),
        }),
        onUndo: () => usePreferences.getState().set({ progressCards: before }),
      })
    },
    resize: (id: ProgressCardId, size: ProgressCardSize) =>
      edit((l) => resizeProgressCard(l, id, size))(),
    move: (id: ProgressCardId, target: ProgressCardId) =>
      edit((l) => moveProgressCard(l, id, target))(),
    /** Moves a card one place among `among` (the shown cards by default). */
    step: (
      id: ProgressCardId,
      direction: -1 | 1,
      among: ProgressCardId[] = shownIds
    ) => edit((l) => stepProgressCard(l, among, id, direction))(),
    reset: () => usePreferences.getState().set({ progressCards: null }),
  }
}
