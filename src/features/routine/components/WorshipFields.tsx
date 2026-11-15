import InputRowSelect from '@/components/ui/inputs/InputRowSelect'
import i18n from '@/lib/locales'
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
  indented,
  lastInSection,
}: {
  kind: WorshipKind
  day: number | null
  onKindChange: (kind: WorshipKind) => void
  onDayChange: (day: number | null) => void
  indented?: boolean
  lastInSection?: boolean
}) {
  return (
    <>
      <InputRowSelect
        indented={indented}
        label={i18n.t('routine.setup.family')}
        selectProps={{
          data: [
            { label: i18n.t('yes'), value: 'family' as const },
            { label: i18n.t('no'), value: 'personal' as const },
          ],
          value: kind,
          onChange: ({ value }) => onKindChange(value),
        }}
      />
      <InputRowSelect
        indented={indented}
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
