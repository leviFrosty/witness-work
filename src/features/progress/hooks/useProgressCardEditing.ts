import useEditMode from '@/hooks/useEditMode'
import usePublisher from '@/hooks/usePublisher'
import { analytics } from '@/lib/analytics'
import {
  ALL_TIME_CARDS,
  defaultAllTimeProgressCards,
  defaultProgressCards,
  defaultYearProgressCards,
  describeProgressCardChange,
  getEffectiveProgressCards,
  MONTH_CARDS,
  PROGRESS_CARD_PREFERENCE,
  sameProgressCards,
  YEAR_CARDS,
  type ProgressCardLayoutItem,
  type ProgressCardScope,
} from '@/lib/progressCards'
import { usePreferences } from '@/stores/preferences'

export type ProgressCardEditSource = 'footer' | 'card' | 'add'

/** Each tab edits on its own, so one tab's Done doesn't end another's. */
const SURFACE: Record<ProgressCardScope, string> = {
  month: 'progress',
  year: 'progressYear',
  allTime: 'progressAllTime',
}

/** `progress_cards_customized`'s `tab`. */
const TAB: Record<ProgressCardScope, string> = {
  month: 'month',
  year: 'year',
  allTime: 'all_time',
}

/**
 * Edit mode for a Progress tab's cards. Changes save as they're made; finishing
 * reports what changed once (`progress_cards_customized`). Leaving the screen
 * finishes editing, and Android's Back finishes it rather than leaving. Call it
 * once per tab, from the screen.
 */
export default function useProgressCardEditing(scope: ProgressCardScope) {
  const { monthlyGoalHours, hasAnnualGoal, showsTimeEntry } = usePublisher()

  const current = (): {
    stored: unknown
    layout: ProgressCardLayoutItem<string>[]
  } => {
    const stored = usePreferences.getState()[PROGRESS_CARD_PREFERENCE[scope]]
    switch (scope) {
      case 'month':
        return {
          stored,
          layout: getEffectiveProgressCards(
            MONTH_CARDS,
            stored,
            defaultProgressCards({ hasMonthlyGoal: monthlyGoalHours > 0 })
          ),
        }
      case 'year':
        return {
          stored,
          layout: getEffectiveProgressCards(
            YEAR_CARDS,
            stored,
            defaultYearProgressCards({ hasAnnualGoal, showsTimeEntry })
          ),
        }
      case 'allTime':
        return {
          stored,
          layout: getEffectiveProgressCards(
            ALL_TIME_CARDS,
            stored,
            defaultAllTimeProgressCards()
          ),
        }
    }
  }

  return useEditMode<ProgressCardEditSource>(SURFACE[scope], {
    lifecycle: true,
    snapshot: () => current().layout,
    onFinish: ({ source, snapshot }) => {
      const before = snapshot as ProgressCardLayoutItem<string>[]
      const { stored, layout } = current()
      if (sameProgressCards(before, layout)) return
      // An edit back to the defaults stores `null` (see useProgressCardLayout).
      analytics.capture('progress_cards_customized', {
        tab: TAB[scope],
        source,
        ...describeProgressCardChange(before, layout),
        reset: stored === null,
      })
    },
  })
}
