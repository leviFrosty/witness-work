import i18n from '@/lib/locales'
import MonthReportReminderRows from '@/features/settings/preferences/notifications/MonthReportReminderRows'
import UnloggedDayReminderRows from '@/features/settings/preferences/notifications/UnloggedDayReminderRows'
import WeekPlanReminderRows from '@/features/settings/preferences/notifications/WeekPlanReminderRows'
import SettingsGroup from '@/features/settings/components/shared/SettingsGroup'

export default function ServiceRemindersSection() {
  return (
    <SettingsGroup title={i18n.t('notificationSettings_groupService')}>
      <WeekPlanReminderRows />
      <UnloggedDayReminderRows />
      <MonthReportReminderRows />
    </SettingsGroup>
  )
}
