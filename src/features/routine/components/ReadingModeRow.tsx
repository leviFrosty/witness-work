import { useState } from 'react'
import { View } from 'react-native'
import { ChevronForwardIcon } from '@/components/ui/DirectionalIcon'
import IconButton from '@/components/ui/IconButton'
import InputRowButton from '@/components/ui/inputs/InputRowButton'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { usePreferences } from '@/stores/preferences'
import useRoutine from '@/stores/routine'
import ReadingPlanSheet from '@/features/routine/components/ReadingPlanSheet'
import { planName } from '@/features/routine/lib/applyPlanChoice'
import {
  activeRun,
  planDay,
  progressOf,
} from '@/features/routine/lib/readingPlanChoice'

export default function ReadingModeRow({
  lastInSection = true,
}: {
  lastInSection?: boolean
}) {
  const theme = useTheme()
  const [open, setOpen] = useState(false)
  const runId = usePreferences((state) => state.readingPlanRunId)
  const runs = useRoutine((state) => state.readingPlans)
  const entries = useRoutine((state) => state.routineEntries)
  const run = activeRun(runs, runId)
  const progress = progressOf(run, entries)
  const value =
    run && progress
      ? progress.finished
        ? i18n.t('routine.settings.planFinished', { plan: planName(run.kind) })
        : i18n.t('routine.settings.planProgress', {
            plan: planName(run.kind),
            day: planDay(progress),
            total: progress.total,
          })
      : i18n.t('routine.plan.today')
  return (
    <>
      <InputRowButton
        label={i18n.t('routine.settings.readingRow')}
        wrapValue
        lastInSection={lastInSection}
        onPress={() => setOpen(true)}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ color: theme.colors.textAlt, flexShrink: 1 }}>
            {value}
          </Text>
          <IconButton icon={ChevronForwardIcon} />
        </View>
      </InputRowButton>
      <ReadingPlanSheet open={open} onClose={() => setOpen(false)} />
    </>
  )
}
