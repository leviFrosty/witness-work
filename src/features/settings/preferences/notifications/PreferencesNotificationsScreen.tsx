import { useEffect } from 'react'
import Wrapper from '@/components/ui/layout/Wrapper'
import { analytics } from '@/lib/analytics'
import BackupRemindersSection from '@/features/settings/preferences/notifications/BackupRemindersSection'
import BuddiesNotificationSettingsSection from '@/features/settings/preferences/notifications/BuddiesNotificationSettingsSection'
import NotificationPermissionSection from '@/features/settings/preferences/notifications/NotificationPermissionSection'
import PlanAndFollowUpNotificationsSection from '@/features/settings/preferences/notifications/PlanAndFollowUpNotificationsSection'
import ServiceRemindersSection from '@/features/settings/preferences/notifications/ServiceRemindersSection'
import StreakAndRoutineRemindersSection from '@/features/settings/preferences/notifications/StreakAndRoutineRemindersSection'
import SettingsInputLayout from '@/features/settings/components/shared/SettingsInputLayout'
import SettingsScrollView from '@/features/settings/components/shared/SettingsScrollView'

const PreferencesNotificationsScreen = () => {
  useEffect(() => {
    analytics.capture('notification_settings_opened')
  }, [])

  return (
    <SettingsInputLayout>
      <Wrapper insets='bottom'>
        <SettingsScrollView
          contentContainerStyle={{ gap: 30, paddingTop: 30, paddingBottom: 30 }}
          testID='notification-settings'
        >
          <NotificationPermissionSection />
          <PlanAndFollowUpNotificationsSection />
          <ServiceRemindersSection />
          <StreakAndRoutineRemindersSection />
          <BuddiesNotificationSettingsSection />
          <BackupRemindersSection />
        </SettingsScrollView>
      </Wrapper>
    </SettingsInputLayout>
  )
}

export default PreferencesNotificationsScreen
