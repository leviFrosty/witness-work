import { analytics } from '@/lib/analytics'
import i18n from '@/lib/locales'
import { usePreferences } from '@/stores/preferences'
import useRoutine from '@/stores/routine'
import type { ReadingPlanKind } from '@/types/routine'
import {
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
  const { set } = usePreferences.getState()
  if (choice.kind === 'today') {
    set({ readingPlanRunId: null })
    return
  }
  const existing = restart
    ? null
    : resumableRun(useRoutine.getState().readingPlans, choice)
  const id =
    existing?.id ??
    useRoutine.getState().startPlan({
      kind: choice.kind,
      ...(choice.kind === 'custom'
        ? {
            startBook: choice.startBook,
            chaptersPerDay: choice.chaptersPerDay,
          }
        : {}),
      today,
    })
  if (!id) return
  set({ readingPlanRunId: id })
  analytics.capture('routine_plan_started', {
    kind: choice.kind,
    chapters_per_day:
      choice.kind === 'custom' ? choice.chaptersPerDay : undefined,
    resumed: existing !== null,
  })
}
