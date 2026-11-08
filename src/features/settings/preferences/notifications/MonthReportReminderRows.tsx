import { View } from 'react-native'
import InputRowContainer from '@/components/ui/inputs/InputRowContainer'
import InputRowSwitch from '@/components/ui/inputs/InputRowSwitch'
import DateTimePicker from '@/components/ui/DateTimePicker'
import i18n from '@/lib/locales'
import { usePreferences } from '@/stores/preferences'
import useMonthReportReminder from '@/features/service-reports/hooks/useMonthReportReminder'
import SettingsSearchTarget from '@/features/settings/components/search/SettingsSearchTarget'

const MonthReportReminderRows = () => {
  const { enabled, setEnabled } = useMonthReportReminder()
  const remindAt = usePreferences((s) => s.monthReportReminderTime)
  const set = usePreferences((s) => s.set)
  const today = new Date()

  return (
    <>
      <SettingsSearchTarget id='monthReportReminder'>
        <InputRowSwitch
          label={i18n.t('monthReportReminders')}
          info={i18n.t('monthReportReminders_info')}
          value={enabled}
          onValueChange={(next) => void setEnabled(next, 'settings')}
          lastInSection={!enabled}
        />
      </SettingsSearchTarget>
      {enabled && (
        <InputRowContainer
          label={i18n.t('monthReportReminderTime')}
          lastInSection
        >
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
                    monthReportReminderTime:
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

export default MonthReportReminderRows
