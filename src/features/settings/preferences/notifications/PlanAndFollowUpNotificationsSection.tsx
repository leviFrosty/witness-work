import InputRowContainer from '@/components/ui/inputs/InputRowContainer'
import InputRowSwitch from '@/components/ui/inputs/InputRowSwitch'
import ReminderOffsetSelect from '@/components/ReminderOffsetSelect'
import i18n from '@/lib/locales'
import {
  DEFAULT_PLAN_NOTIFICATION_OFFSET,
  DEFAULT_RETURN_VISIT_NOTIFICATION_OFFSET,
  usePreferences,
} from '@/stores/preferences'
import SettingsSearchTarget from '@/features/settings/components/search/SettingsSearchTarget'
import SettingsGroup from '@/features/settings/components/shared/SettingsGroup'

const leadTimeRowStyle = {
  flexDirection: 'column',
  gap: 10,
  alignItems: 'flex-start',
} as const

export default function PlanAndFollowUpNotificationsSection() {
  const planOffset = usePreferences((s) => s.planNotificationOffset)
  const planAlwaysNotify = usePreferences((s) => s.planAlwaysNotify)
  const followUpOffset = usePreferences((s) => s.returnVisitNotificationOffset)
  const followUpAlwaysNotify = usePreferences((s) => s.returnVisitAlwaysNotify)
  const set = usePreferences((s) => s.set)

  return (
    <SettingsGroup title={i18n.t('notificationSettings_groupUpcoming')}>
      <SettingsSearchTarget id='planAlwaysNotify'>
        <InputRowSwitch
          label={i18n.t('planAlwaysNotify')}
          value={planAlwaysNotify}
          onValueChange={(value) => set({ planAlwaysNotify: value })}
        />
      </SettingsSearchTarget>
      <SettingsSearchTarget id='planNotification'>
        <InputRowContainer
          label={i18n.t('notificationSettings_planLeadTime')}
          info={i18n.t('planNotificationOffset_description')}
          controlWidth='full'
          style={leadTimeRowStyle}
        >
          <ReminderOffsetSelect
            value={planOffset ?? DEFAULT_PLAN_NOTIFICATION_OFFSET}
            onChange={(offset) => set({ planNotificationOffset: offset })}
          />
        </InputRowContainer>
      </SettingsSearchTarget>
      <SettingsSearchTarget id='conversationAlwaysNotify'>
        <InputRowSwitch
          label={i18n.t('notificationSettings_followUpAlwaysNotify')}
          value={followUpAlwaysNotify}
          onValueChange={(value) => set({ returnVisitAlwaysNotify: value })}
        />
      </SettingsSearchTarget>
      <SettingsSearchTarget id='conversationNotification'>
        <InputRowContainer
          label={i18n.t('notificationSettings_followUpLeadTime')}
          info={i18n.t('notificationOffset_description')}
          controlWidth='full'
          lastInSection
          style={leadTimeRowStyle}
        >
          <ReminderOffsetSelect
            value={followUpOffset ?? DEFAULT_RETURN_VISIT_NOTIFICATION_OFFSET}
            onChange={(offset) =>
              set({ returnVisitNotificationOffset: offset })
            }
          />
        </InputRowContainer>
      </SettingsSearchTarget>
    </SettingsGroup>
  )
}
