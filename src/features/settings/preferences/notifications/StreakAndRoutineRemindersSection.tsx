import InputRowSwitch from '@/components/ui/inputs/InputRowSwitch'
import useNotifications from '@/hooks/notifications'
import usePublisher from '@/hooks/usePublisher'
import { analytics } from '@/lib/analytics'
import i18n from '@/lib/locales'
import { usePreferences } from '@/stores/preferences'
import RoutineReminderFields from '@/features/routine/components/RoutineReminderFields'
import SettingsSearchTarget from '@/features/settings/components/search/SettingsSearchTarget'
import SettingsGroup from '@/features/settings/components/shared/SettingsGroup'

export default function StreakAndRoutineRemindersSection() {
  const { streakKind } = usePublisher()
  const showStreaks = usePreferences((s) => s.showStreaks)
  const streakReminders = usePreferences((s) => s.streakReminders)
  const routineEnabled = usePreferences((s) => s.routineEnabled === true)
  const routineReminders = usePreferences((s) => s.routineReminders)
  const routineReminderTime = usePreferences((s) => s.routineReminderTime)
  const set = usePreferences((s) => s.set)
  const notifications = useNotifications()

  if (!showStreaks && !routineEnabled) return null

  const toggleStreakReminders = async (on: boolean) => {
    if (on && !notifications.allowed && !(await notifications.turnOn())) return
    set({ streakReminders: on })
    analytics.capture('streak_reminders_changed', { enabled: on })
  }

  const toggleRoutineReminder = async (on: boolean) => {
    if (on && !notifications.allowed && !(await notifications.turnOn())) return
    set({ routineReminders: on })
    analytics.capture('routine_reminder_toggled', { on })
  }

  return (
    <SettingsGroup title={i18n.t('notificationSettings_groupHabits')}>
      {showStreaks && (
        <SettingsSearchTarget id='streakReminders'>
          <InputRowSwitch
            label={i18n.t('streakReminders')}
            info={i18n.t(
              streakKind === 'months'
                ? 'streakReminders_infoMonths'
                : 'streakReminders_info'
            )}
            value={streakReminders}
            onValueChange={(on) => void toggleStreakReminders(on)}
            lastInSection={!routineEnabled}
          />
        </SettingsSearchTarget>
      )}
      {routineEnabled && (
        <SettingsSearchTarget id='routineReminder'>
          <RoutineReminderFields
            label={i18n.t('routine.reminder.settingsLabel')}
            enabled={routineReminders}
            time={routineReminderTime}
            onEnabledChange={(on) => void toggleRoutineReminder(on)}
            onTimeChange={(time) => set({ routineReminderTime: time })}
          />
        </SettingsSearchTarget>
      )}
    </SettingsGroup>
  )
}
