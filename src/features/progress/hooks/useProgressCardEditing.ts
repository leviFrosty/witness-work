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

const SURFACE: Record<ProgressCardScope, string> = {
  month: 'progress',
  year: 'progressYear',
  allTime: 'progressAllTime',
}

const TAB: Record<ProgressCardScope, string> = {
  month: 'month',
  year: 'year',
  allTime: 'all_time',
}

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

      analytics.capture('progress_cards_customized', {
        tab: TAB[scope],
        source,
        ...describeProgressCardChange(before, layout),
        reset: stored === null,
      })
    },
  })
}
