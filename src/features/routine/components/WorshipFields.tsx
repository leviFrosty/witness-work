import InputRowSelect from '@/components/ui/inputs/InputRowSelect'
import i18n from '@/lib/locales'
import { habitName } from '@/lib/routine/habitNames'
import type { WorshipKind } from '@/types/routine'
import {
  anyDayOptions,
  fromOption,
  NO_DAY,
} from '@/features/routine/lib/weekdays'

export default function WorshipFields({
  kind,
  day,
  onKindChange,
  onDayChange,
  showKind = true,
  lastInSection,
}: {
  kind: WorshipKind
  day: number | null
  onKindChange: (kind: WorshipKind) => void
  onDayChange: (day: number | null) => void
  showKind?: boolean
  lastInSection?: boolean
}) {
  return (
    <>
      {showKind && (
        <InputRowSelect
          label={i18n.t('routine.settings.worshipKind')}
          selectProps={{
            data: (['family', 'personal'] as const).map((value) => ({
              label: habitName('worship', value),
              value,
            })),
            value: kind,
            onChange: ({ value }) => onKindChange(value),
          }}
        />
      )}
      <InputRowSelect
        label={i18n.t('routine.settings.worshipDay')}
        lastInSection={lastInSection}
        selectProps={{
          data: anyDayOptions(),
          value: day ?? NO_DAY,
          onChange: ({ value }) => onDayChange(fromOption(value)),
        }}
      />
    </>
  )
}
