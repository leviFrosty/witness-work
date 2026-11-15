import InputRowSelect from '@/components/ui/inputs/InputRowSelect'
import i18n from '@/lib/locales'
import PlanFields from '@/features/routine/components/PlanFields'
import { planName } from '@/features/routine/lib/applyPlanChoice'
import {
  DEFAULT_CUSTOM_CHOICE,
  PLAN_KINDS,
  type PlanChoice,
} from '@/features/routine/lib/readingPlanChoice'

export default function ReadingChoiceRows({
  choice,
  onChange,
  description,
  lastInSection,
}: {
  choice: PlanChoice
  onChange: (next: PlanChoice) => void
  description?: string
  lastInSection?: boolean
}) {
  return (
    <>
      <InputRowSelect
        label={i18n.t('routine.settings.readingRow')}
        info={
          choice.kind === 'chronological'
            ? i18n.t('routine.plan.chronologicalInfo')
            : undefined
        }
        description={description}
        indented
        lastInSection={lastInSection && choice.kind === 'today'}
        selectProps={{
          data: [
            { label: i18n.t('routine.plan.today'), value: 'today' as const },
            ...PLAN_KINDS.map((kind) => ({
              label: planName(kind),
              value: kind,
            })),
          ],
          value: choice.kind,
          onChange: ({ value }) => {
            if (value === choice.kind) return
            onChange(
              value === 'custom' ? DEFAULT_CUSTOM_CHOICE : { kind: value }
            )
          },
        }}
      />
      {choice.kind !== 'today' && (
        <PlanFields
          choice={choice}
          onChange={onChange}
          indented
          lastInSection={lastInSection}
        />
      )}
    </>
  )
}
