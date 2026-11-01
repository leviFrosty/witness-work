import moment from 'moment'
import InputRowSelect from '@/components/ui/inputs/InputRowSelect'
import { analytics } from '@/lib/analytics'
import { formatMonthDayCompact } from '@/lib/dates'
import i18n from '@/lib/locales'
import { logger } from '@/lib/logger'
import BuddiesSection from '@/features/buddies/components/BuddiesSection'
import {
  ScopedSelectRow,
  ScopedSwitchRow,
} from '@/features/buddies/components/ScopedSettingRows'
import {
  useBuddySettingsScope,
  useScopedSetting,
} from '@/features/buddies/hooks/useBuddySettingsScope'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import type { BuddyPlanTimes } from '@/features/buddies/lib/schemas'
import {
  isSharingPaused,
  PAUSED_INDEFINITELY,
} from '@/features/buddies/lib/state'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

type PauseChoice = 'off' | 'week' | 'month' | 'indefinite' | 'current'

function pauseEnd(choice: 'week' | 'month' | 'indefinite'): number {
  if (choice === 'indefinite') return PAUSED_INDEFINITELY
  return moment()
    .add(1, choice === 'week' ? 'week' : 'month')
    .endOf('day')
    .valueOf()
}

export default function BuddiesPlansSharingSection() {
  const { buddy, record } = useBuddySettingsScope()
  const plans = useScopedSetting('plans')
  const planTimes = useScopedSetting('planTimes')
  const pausedUntil = useBuddies((state) => state.sharing.pausedUntil)
  const paused = isSharingPaused({ pausedUntil }, Date.now())

  const planTimeChoices: { value: BuddyPlanTimes; label: string }[] = [
    { value: 'exact', label: i18n.t('buddies_planTimesExact') },
    { value: 'timeOfDay', label: i18n.t('buddies_planTimesTimeOfDay') },
    { value: 'daysOnly', label: i18n.t('buddies_planTimesDaysOnly') },
  ]

  const pauseChoices: { value: PauseChoice; label: string }[] = [
    { value: 'off', label: i18n.t('buddies_pauseOff') },

    ...(paused && pausedUntil !== PAUSED_INDEFINITELY
      ? [
          {
            value: 'current' as const,
            label: i18n.t('buddies_pauseUntilDate', {
              date: formatMonthDayCompact(moment(pausedUntil)),
            }),
          },
        ]
      : []),
    { value: 'week', label: i18n.t('buddies_pauseWeek') },
    { value: 'month', label: i18n.t('buddies_pauseMonth') },
    { value: 'indefinite', label: i18n.t('buddies_pauseIndefinitely') },
  ]
  const pauseValue: PauseChoice = !paused
    ? 'off'
    : pausedUntil === PAUSED_INDEFINITELY
      ? 'indefinite'
      : 'current'

  const setPause = (until: number) =>
    void buddiesEngine
      .setSharing({ pausedUntil: until })
      .catch((error) => logger.warn('[buddies] sharing', error))
  const pause = (until: number) => {
    const previous = pausedUntil
    record({ inboxId: null, revert: () => setPause(previous) })
    setPause(until)
  }

  return (
    <BuddiesSection title={i18n.t('buddies_plansSharingTitle')}>
      <ScopedSwitchRow
        setting={plans}
        label={i18n.t('buddies_shareMyPlans')}
        info={i18n.t('buddies_shareMyPlansInfo')}
        lastInSection={!plans.value && !!buddy}
      />
      {plans.value && (
        <ScopedSelectRow
          setting={planTimes}
          label={i18n.t('buddies_planTimes')}
          info={i18n.t('buddies_planTimesInfo')}
          choices={planTimeChoices}
          lastInSection={!!buddy}
        />
      )}
      {!buddy && (
        <InputRowSelect
          label={i18n.t('buddies_pauseSharing')}
          info={i18n.t('buddies_pauseSharingInfo')}
          lastInSection
          selectProps={{
            data: pauseChoices,
            value: pauseValue,
            onChange: ({ value }) => {
              if (value === 'current' || value === pauseValue) return
              analytics.capture('buddies_sharing_changed', {
                setting: 'pause',
                value,
                scope: 'all',
              })
              pause(value === 'off' ? 0 : pauseEnd(value))
            },
          }}
        />
      )}
    </BuddiesSection>
  )
}
