import { RefreshCw as RefreshCwIcon } from 'lucide-react-native'
import InputRowContainer from '@/components/ui/inputs/InputRowContainer'
import InputRowSwitch from '@/components/ui/inputs/InputRowSwitch'
import { SectionRows } from '@/components/ui/inputs/Section'
import Select from '@/components/ui/Select'
import SettingsSearchTarget from '@/features/settings/components/search/SettingsSearchTarget'
import {
  AUTO_RESCHEDULE_GRACE_OPTIONS,
  AUTO_RESCHEDULE_MAX_COUNT_OPTIONS,
  resolveAutoRescheduleGrace,
  resolveAutoRescheduleOffset,
  type AutoRescheduleGrace,
  type AutoRescheduleUnit,
} from '@/lib/autoRescheduleFollowUps'
import i18n, { TranslationKey } from '@/lib/locales'
import { usePreferences } from '@/stores/preferences'

const OFFSET_OPTIONS: {
  id: string
  amount: number
  unit: AutoRescheduleUnit
}[] = [
  { id: '1:days', amount: 1, unit: 'days' },
  { id: '2:days', amount: 2, unit: 'days' },
  { id: '3:days', amount: 3, unit: 'days' },
  { id: '1:weeks', amount: 1, unit: 'weeks' },
  { id: '2:weeks', amount: 2, unit: 'weeks' },
  { id: '3:weeks', amount: 3, unit: 'weeks' },
  { id: '4:weeks', amount: 4, unit: 'weeks' },
]

function formatOffsetLabel(amount: number, unit: string): string {
  const key =
    unit === 'days'
      ? 'autoRescheduleDuration_days'
      : 'autoRescheduleDuration_weeks'
  return i18n.t(key, { count: amount })
}

export default function AutoRescheduleSettingsRows({
  lastInSection = false,
}: {
  lastInSection?: boolean
}) {
  const enabled = usePreferences((s) => s.autoRescheduleMissedFollowUps)
  const storedOffset = usePreferences((s) => s.autoRescheduleOffset)
  const storedGrace = usePreferences((s) => s.autoRescheduleGrace)
  const maxCount = usePreferences((s) => s.autoRescheduleMaxCount)
  const set = usePreferences((s) => s.set)

  const currentOffset = resolveAutoRescheduleOffset(storedOffset)
  const currentGrace = resolveAutoRescheduleGrace(storedGrace)
  const currentOffsetId = `${currentOffset.amount}:${currentOffset.unit}`

  const offsetOptions = [
    ...OFFSET_OPTIONS.map((option) => ({
      label: formatOffsetLabel(option.amount, option.unit),
      value: option.id,
      amount: option.amount,
      unit: option.unit,
    })),
    ...(OFFSET_OPTIONS.some((option) => option.id === currentOffsetId)
      ? []
      : [
          {
            label: formatOffsetLabel(currentOffset.amount, currentOffset.unit),
            value: currentOffsetId,
            amount: currentOffset.amount,
            unit: currentOffset.unit as AutoRescheduleUnit,
          },
        ]),
  ]

  const graceOptions: { label: string; value: AutoRescheduleGrace }[] =
    AUTO_RESCHEDULE_GRACE_OPTIONS.map((value) => ({
      label: i18n.t(`autoRescheduleGrace_${value}` as TranslationKey),
      value,
    }))

  const maxCountOptions = AUTO_RESCHEDULE_MAX_COUNT_OPTIONS.map((value) => ({
    label:
      value === null
        ? i18n.t('autoRescheduleStopAfter_never')
        : i18n.t('autoRescheduleStopAfter_times', { count: value }),
    value: value === null ? 'never' : String(value),
  }))

  const handleToggle = (value: boolean) => {
    set({
      autoRescheduleMissedFollowUps: value,
      ...(value ? { autoRescheduleEnabledAt: Date.now() } : {}),
    })
  }

  return (
    <SectionRows>
      <SettingsSearchTarget id='autoRescheduleMissedFollowUps'>
        <InputRowSwitch
          leftIcon={RefreshCwIcon}
          label={i18n.t('autoRescheduleMissed')}
          info={i18n.t('autoRescheduleMissed_info')}
          lastInSection={lastInSection && !enabled}
          value={enabled}
          onValueChange={handleToggle}
        />
      </SettingsSearchTarget>

      {enabled && (
        <>
          <InputRowContainer
            indented
            label={i18n.t('autoRescheduleBy')}
            controlWidth='auto'
          >
            <Select
              variant='plain'
              data={offsetOptions}
              value={currentOffsetId}
              onChange={({ amount, unit }) =>
                set({ autoRescheduleOffset: { amount, unit } })
              }
            />
          </InputRowContainer>

          <InputRowContainer
            indented
            label={i18n.t('autoRescheduleGrace')}
            controlWidth='auto'
          >
            <Select
              variant='plain'
              data={graceOptions}
              value={currentGrace}
              onChange={({ value }) => set({ autoRescheduleGrace: value })}
            />
          </InputRowContainer>

          <InputRowContainer
            indented
            label={i18n.t('autoRescheduleStopAfter')}
            lastInSection={lastInSection}
            controlWidth='auto'
          >
            <Select
              variant='plain'
              data={maxCountOptions}
              value={maxCount === null ? 'never' : String(maxCount)}
              onChange={({ value }) =>
                set({
                  autoRescheduleMaxCount:
                    value === 'never' ? null : Number(value),
                })
              }
            />
          </InputRowContainer>
        </>
      )}
    </SectionRows>
  )
}
