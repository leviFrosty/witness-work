import { analytics } from '@/lib/analytics'
import i18n from '@/lib/locales'
import { BIBLE_BOOK_COUNT } from '@/lib/routine/bible'
import { usePreferences } from '@/stores/preferences'
import useRoutine from '@/stores/routine'
import type { ReadingPlanKind } from '@/types/routine'
import {
  activeRun,
  choiceShape,
  liveRun,
  resumableRun,
  type PlanChoice,
} from '@/features/routine/lib/readingPlanChoice'

export const planName = (kind: ReadingPlanKind): string =>
  i18n.t(`routine.plan.kind.${kind}`)

export function applyPlanChoice(
  choice: PlanChoice,
  today: string,
  { restart = false }: { restart?: boolean } = {}
): void {
  const { set, readingPlanRunId } = usePreferences.getState()
  if (choice.kind === 'today') {
    set({ readingPlanRunId: null })
    return
  }
  const routine = useRoutine.getState()
  const shape = { ...choiceShape(choice), today }
  const existing = restart ? null : resumableRun(routine.readingPlans, choice)
  const current = liveRun(activeRun(routine.readingPlans, readingPlanRunId))
  const changed =
    !existing && current && routine.changePlan(current.id, shape)
      ? current
      : null
  const id = existing?.id ?? changed?.id ?? routine.startPlan(shape)
  if (!id) return
  set({ readingPlanRunId: id })
  analytics.capture(
    changed?.kind === choice.kind
      ? 'routine_plan_changed'
      : 'routine_plan_started',
    {
      kind: choice.kind,
      chapters_per_day:
        choice.amount?.unit === 'chapters' ? choice.amount.count : undefined,
      verses_per_day:
        choice.amount?.unit === 'verses' ? choice.amount.count : undefined,
      books:
        choice.kind === 'custom'
          ? ((choice.endBook - choice.startBook + BIBLE_BOOK_COUNT) %
              BIBLE_BOOK_COUNT) +
            1
          : undefined,
      ...(changed?.kind === choice.kind ? {} : { resumed: !!existing }),
    }
  )
}
