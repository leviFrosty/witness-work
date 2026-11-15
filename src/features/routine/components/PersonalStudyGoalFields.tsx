import InputRowContainer from '@/components/ui/inputs/InputRowContainer'
import InputRowSelect from '@/components/ui/inputs/InputRowSelect'
import i18n from '@/lib/locales'
import type { PersonalStudyGoal } from '@/types/routine'
import WeekdayToggles from '@/features/routine/components/WeekdayToggles'

const TIMES = [1, 2, 3, 4, 5, 6, 7]

export default function PersonalStudyGoalFields({
  goal,
  onChange,
  indented,
  lastInSection,
}: {
  goal: PersonalStudyGoal
  onChange: (goal: PersonalStudyGoal) => void
  indented?: boolean
  lastInSection?: boolean
}) {
  return (
    <>
      <InputRowSelect
        label={i18n.t('routine.settings.studyGoal')}
        indented={indented}
        selectProps={{
          data: [
            {
              label: i18n.t('routine.settings.studyGoalPerWeek'),
              value: 'perWeek',
            },
            {
              label: i18n.t('routine.settings.studyGoalDays'),
              value: 'days',
            },
          ],
          value: goal.kind,
          onChange: ({ value }) => {
            if (value === goal.kind) return
            onChange(
              value === 'days'
                ? { kind: 'days', days: [] }
                : { kind: 'perWeek', times: 1 }
            )
          },
        }}
      />
      {goal.kind === 'perWeek' ? (
        <InputRowSelect
          label={i18n.t('routine.settings.studyGoalPerWeek')}
          indented={indented}
          lastInSection={lastInSection}
          selectProps={{
            data: TIMES.map((count) => ({
              label: i18n.t('routine.settings.studyTimes', { count }),
              value: count,
            })),
            value: goal.times,
            onChange: ({ value }) =>
              onChange({ kind: 'perWeek', times: value }),
          }}
        />
      ) : (
        <InputRowContainer
          label={i18n.t('routine.settings.studyDays')}
          controlWidth='full'
          indented={indented}
          lastInSection={lastInSection}
          style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}
        >
          <WeekdayToggles
            days={goal.days}
            onChange={(days) => onChange({ kind: 'days', days })}
          />
        </InputRowContainer>
      )}
    </>
  )
}
