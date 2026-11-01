import { View } from 'react-native'
import moment from 'moment'
import Section from '@/components/ui/inputs/Section'
import InputRowContainer from '@/components/ui/inputs/InputRowContainer'
import InputRowSelect from '@/components/ui/inputs/InputRowSelect'
import InputRowSwitch from '@/components/ui/inputs/InputRowSwitch'
import DateTimePicker from '@/components/ui/DateTimePicker'
import useNotifications from '@/hooks/notifications'
import { analytics } from '@/lib/analytics'
import i18n from '@/lib/locales'
import { usePreferences } from '@/stores/preferences'

const WeekPlanReminderSection = () => {
  const enabled = usePreferences((s) => s.weekPlanReminder)
  const weekday = usePreferences((s) => s.weekPlanReminderDay)
  const remindAt = usePreferences((s) => s.weekPlanReminderTime)
  const set = usePreferences((s) => s.set)
  const notifications = useNotifications()
  const today = new Date()

  const handleChange = async (next: boolean) => {
    if (next && !notifications.allowed && !(await notifications.turnOn()))
      return
    set(
      next
        ? { weekPlanReminder: true, weekPlanReminderEnabledAt: Date.now() }
        : { weekPlanReminder: false }
    )
    analytics.capture('week_plan_reminder_changed', { enabled: next })
  }

  const weekdays = moment.weekdays()
  const firstDay = moment.localeData().firstDayOfWeek()
  const weekdayData = weekdays.map((_, index) => {
    const value = (firstDay + index) % 7
    return { label: weekdays[value], value }
  })

  return (
    <Section>
      <InputRowSwitch
        label={i18n.t('weekPlanReminder')}
        info={i18n.t('weekPlanReminder_info')}
        value={enabled}
        onValueChange={(next) => void handleChange(next)}
        lastInSection={!enabled}
      />
      {enabled && (
        <InputRowSelect
          label={i18n.t('weekPlanReminderDay')}
          selectProps={{
            data: weekdayData,
            value: weekday,
            onChange: ({ value }) => set({ weekPlanReminderDay: value }),
          }}
        />
      )}
      {enabled && (
        <InputRowContainer label={i18n.t('weekPlanReminderTime')} lastInSection>
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
                    weekPlanReminderTime:
                      date.getHours() * 60 + date.getMinutes(),
                  })
              }}
              iOSMode='time'
            />
          </View>
        </InputRowContainer>
      )}
    </Section>
  )
}

export default WeekPlanReminderSection
