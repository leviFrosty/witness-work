import { View } from 'react-native'
import InputRowContainer from '@/components/ui/inputs/InputRowContainer'
import InputRowSwitch from '@/components/ui/inputs/InputRowSwitch'
import DateTimePicker from '@/components/ui/DateTimePicker'
import useNotifications from '@/hooks/notifications'
import usePublisher from '@/hooks/usePublisher'
import { analytics } from '@/lib/analytics'
import i18n from '@/lib/locales'
import { usePreferences } from '@/stores/preferences'
import SettingsSearchTarget from '@/features/settings/components/search/SettingsSearchTarget'

const UnloggedDayReminderRows = () => {
  const { showsTimeEntry } = usePublisher()
  const enabled = usePreferences((s) => s.unloggedDayReminders)
  const remindAt = usePreferences((s) => s.unloggedDayReminderTime)
  const set = usePreferences((s) => s.set)
  const notifications = useNotifications()

  if (!showsTimeEntry) return null
  const today = new Date()

  const handleChange = async (next: boolean) => {
    if (next && !notifications.allowed && !(await notifications.turnOn()))
      return
    set(
      next
        ? {
            unloggedDayReminders: true,
            unloggedDayRemindersEnabledAt: Date.now(),
          }
        : { unloggedDayReminders: false }
    )
    analytics.capture('unlogged_day_reminders_changed', { enabled: next })
  }

  return (
    <>
      <SettingsSearchTarget id='unloggedDayReminder'>
        <InputRowSwitch
          label={i18n.t('unloggedDayReminders')}
          info={i18n.t('unloggedDayReminders_info')}
          value={enabled}
          onValueChange={(next) => void handleChange(next)}
        />
      </SettingsSearchTarget>
      {enabled && (
        <InputRowContainer label={i18n.t('unloggedDayReminderTime')}>
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            <DateTimePicker
              value={
                new Date(
                  today.getFullYear(),
                  today.getMonth(),
                  today.getDate(),
                  0,
                  remindAt
                )
              }
              onChange={(_event, date) => {
                if (date)
                  set({
                    unloggedDayReminderTime:
                      date.getHours() * 60 + date.getMinutes(),
                  })
              }}
              iOSMode='time'
            />
          </View>
        </InputRowContainer>
      )}
    </>
  )
}

export default UnloggedDayReminderRows
