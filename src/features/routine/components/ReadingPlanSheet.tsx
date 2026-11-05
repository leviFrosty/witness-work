import { useEffect, useState } from 'react'
import { Alert, View } from 'react-native'
import ActionButton from '@/components/ui/ActionButton'
import InfoPopover from '@/components/ui/InfoPopover'
import InputRowButton from '@/components/ui/inputs/InputRowButton'
import Section from '@/components/ui/inputs/Section'
import Text from '@/components/ui/MyText'
import Sheet from '@/components/ui/Sheet'
import useTheme from '@/contexts/theme'
import useToday from '@/hooks/useToday'
import { localDayKey } from '@/lib/dayKeys'
import i18n from '@/lib/locales'
import { DEFAULT_CHAPTERS_PER_DAY } from '@/lib/routine/readingPlans'
import { usePreferences } from '@/stores/preferences'
import useRoutine from '@/stores/routine'
import CustomPlanFields from '@/features/routine/components/CustomPlanFields'
import {
  applyPlanChoice,
  planName,
} from '@/features/routine/lib/applyPlanChoice'
import {
  activeRun,
  choiceOf,
  leavingLosesPlace,
  PLAN_KINDS,
  planDay,
  progressOf,
  resumableRun,
  sameConfig,
  type PlanChoice,
} from '@/features/routine/lib/readingPlanChoice'

const choiceFor = (
  kind: PlanChoice['kind'],
  current: PlanChoice
): PlanChoice =>
  kind === 'custom'
    ? current.kind === 'custom'
      ? current
      : {
          kind: 'custom',
          startBook: 0,
          chaptersPerDay: DEFAULT_CHAPTERS_PER_DAY,
        }
    : { kind }

export default function ReadingPlanSheet({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const theme = useTheme()
  const today = localDayKey(useToday())
  const runId = usePreferences((state) => state.readingPlanRunId)
  const runs = useRoutine((state) => state.readingPlans)
  const entries = useRoutine((state) => state.routineEntries)
  const run = activeRun(runs, runId)
  const progress = progressOf(run, entries)
  const [choice, setChoice] = useState<PlanChoice>(choiceOf(run))

  useEffect(() => {
    if (open) setChoice(choiceOf(activeRun(runs, runId)))
  }, [open, runs, runId])

  const isCurrent = run ? sameConfig(run, choice) : choice.kind === 'today'
  const restart = isCurrent && !!progress?.finished
  const resumes =
    !isCurrent && choice.kind !== 'today' && !!resumableRun(runs, choice)
  const action = restart
    ? i18n.t('routine.plan.restart')
    : isCurrent || choice.kind === 'today'
      ? i18n.t('done')
      : resumes
        ? i18n.t('routine.plan.resume')
        : i18n.t('routine.plan.start')

  const apply = () => {
    if (!isCurrent || restart) applyPlanChoice(choice, today, { restart })
    onClose()
  }

  const confirm = () => {
    if (!leavingLosesPlace(run, progress, choice) || !progress) return apply()
    Alert.alert(
      i18n.t('routine.plan.leaveTitle'),
      i18n.t('routine.plan.leaveBody', { day: planDay(progress) }),
      [
        { text: i18n.t('cancel'), style: 'cancel' },
        { text: i18n.t('routine.plan.leaveConfirm'), onPress: apply },
      ]
    )
  }

  const options: { kind: PlanChoice['kind']; label: string; sub: string }[] = [
    {
      kind: 'today',
      label: i18n.t('routine.plan.today'),
      sub: i18n.t('routine.plan.todayDescription'),
    },
    ...PLAN_KINDS.map((kind) => ({
      kind,
      label: planName(kind),
      sub: i18n.t(`routine.plan.description.${kind}`),
    })),
  ]

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <Sheet.ScrollView
        contentContainerStyle={{ padding: 20, gap: 16 }}
        testID='routine-plan-sheet'
      >
        <View style={{ gap: 4 }}>
          <Text
            accessibilityRole='header'
            style={{
              fontSize: theme.fontSize('xl'),
              fontFamily: theme.fonts.semiBold,
            }}
          >
            {i18n.t('routine.plan.title')}
          </Text>
          {run && progress && (
            <Text style={{ color: theme.colors.textAlt }}>
              {progress.finished
                ? i18n.t('routine.settings.planFinished', {
                    plan: planName(run.kind),
                  })
                : i18n.t('routine.settings.planProgress', {
                    plan: planName(run.kind),
                    day: planDay(progress),
                    total: progress.total,
                  })}
            </Text>
          )}
        </View>
        <Section>
          {options.map((option, index) => (
            <InputRowButton
              key={option.kind}
              label={option.label}
              sublabel={option.sub}
              checked={choice.kind === option.kind}
              lastInSection={index === options.length - 1}
              onPress={() => setChoice(choiceFor(option.kind, choice))}
            >
              {option.kind === 'chronological' ? (
                <InfoPopover
                  title={option.label}
                  description={i18n.t('routine.plan.chronologicalInfo')}
                  inline
                />
              ) : undefined}
            </InputRowButton>
          ))}
        </Section>
        {choice.kind === 'custom' && (
          <Section>
            <CustomPlanFields
              startBook={choice.startBook}
              chaptersPerDay={choice.chaptersPerDay}
              onChange={(next) => setChoice({ kind: 'custom', ...next })}
              lastInSection
            />
          </Section>
        )}
        <ActionButton onPress={confirm} testID='routine-plan-apply'>
          {action}
        </ActionButton>
      </Sheet.ScrollView>
    </Sheet>
  )
}
