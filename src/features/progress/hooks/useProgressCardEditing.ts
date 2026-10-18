import useEditMode from '@/hooks/useEditMode'
import usePublisher from '@/hooks/usePublisher'
import { analytics } from '@/lib/analytics'
import {
  describeProgressCardChange,
  getEffectiveProgressCards,
  sameProgressCards,
  type ProgressCardLayoutItem,
} from '@/lib/progressCards'
import { usePreferences } from '@/stores/preferences'

export type ProgressCardEditSource = 'header' | 'footer' | 'card' | 'add'

/**
 * Edit mode for the Progress cards. Changes save as they're made; finishing
 * reports what changed once (`progress_cards_customized`). Leaving the screen
 * finishes editing, and Android's Back finishes it rather than leaving.
 */
export default function useProgressCardEditing() {
  const { monthlyGoalHours } = usePublisher()

  const current = () => {
    const stored = usePreferences.getState().progressCards
    return {
      stored,
      layout: getEffectiveProgressCards(stored, {
        hasMonthlyGoal: monthlyGoalHours > 0,
      }),
    }
  }

  return useEditMode<ProgressCardEditSource>('progress', {
    lifecycle: true,
    snapshot: () => current().layout,
    onFinish: ({ source, snapshot }) => {
      const before = snapshot as ProgressCardLayoutItem[]
      const { stored, layout } = current()
      if (sameProgressCards(before, layout)) return
      // An edit back to the defaults stores `null` (see useProgressCards).
      analytics.capture('progress_cards_customized', {
        source,
        ...describeProgressCardChange(before, layout),
        reset: stored === null,
      })
    },
  })
}
