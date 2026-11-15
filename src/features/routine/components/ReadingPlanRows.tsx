import { Alert } from 'react-native'
import useToday from '@/hooks/useToday'
import { localDayKey } from '@/lib/dayKeys'
import i18n from '@/lib/locales'
import { usePreferences } from '@/stores/preferences'
import useRoutine from '@/stores/routine'
import ReadingChoiceRows from '@/features/routine/components/ReadingChoiceRows'
import { applyPlanChoice } from '@/features/routine/lib/applyPlanChoice'
import {
  activeRun,
  choiceOf,
  leavingLosesPlace,
  liveRun,
  planDay,
  progressOf,
  sameConfig,
  type PlanChoice,
} from '@/features/routine/lib/readingPlanChoice'

export default function ReadingPlanRows({
  lastInSection,
}: {
  lastInSection?: boolean
}) {
  const today = localDayKey(useToday())
  const runId = usePreferences((state) => state.readingPlanRunId)
  const runs = useRoutine((state) => state.readingPlans)
  const entries = useRoutine((state) => state.routineEntries)
  const lastRun = activeRun(runs, runId)
  const run = liveRun(lastRun)
  const progress = progressOf(run, entries)

  const change = (next: PlanChoice) => {
    if (run ? sameConfig(run, next) : next.kind === 'today') return
    const restart = !run && !!lastRun?.finishedOn && sameConfig(lastRun, next)
    const apply = () => applyPlanChoice(next, today, { restart })
    if (!progress || !leavingLosesPlace(run, progress, next)) return apply()
    Alert.alert(
      i18n.t('routine.plan.leaveTitle'),
      i18n.t('routine.plan.leaveBody', { day: planDay(progress) }),
      [
        { text: i18n.t('cancel'), style: 'cancel' },
        { text: i18n.t('routine.plan.leaveConfirm'), onPress: apply },
      ]
    )
  }

  return (
    <ReadingChoiceRows
      choice={choiceOf(run)}
      onChange={change}
      description={
        progress && progress.read > 0
          ? i18n.t('routine.screen.planRead', {
              read: progress.read,
              total: progress.total,
            })
          : undefined
      }
      lastInSection={lastInSection}
    />
  )
}
