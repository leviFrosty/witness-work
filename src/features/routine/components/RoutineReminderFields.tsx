import { View } from 'react-native'
import DateTimePicker from '@/components/ui/DateTimePicker'
import InputRowContainer from '@/components/ui/inputs/InputRowContainer'
import InputRowSwitch from '@/components/ui/inputs/InputRowSwitch'
import i18n from '@/lib/locales'

const timeOfDay = (minutes: number): Date => {
  const today = new Date()
  return new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
    0,
    minutes
  )
}

export default function RoutineReminderFields({
  enabled,
  time,
  onEnabledChange,
  onTimeChange,
}: {
  enabled: boolean
  time: number
  onEnabledChange: (enabled: boolean) => void
  onTimeChange: (time: number) => void
}) {
  return (
    <>
      <InputRowSwitch
        label={i18n.t('routine.reminder.label')}
        info={i18n.t('routine.reminder.info')}
        value={enabled}
        onValueChange={onEnabledChange}
        lastInSection={!enabled}
      />
      {enabled && (
        <InputRowContainer
          label={i18n.t('routine.reminder.time')}
          lastInSection
        >
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            <DateTimePicker
              value={timeOfDay(time)}
              onChange={(_event, date) => {
                if (date) onTimeChange(date.getHours() * 60 + date.getMinutes())
              }}
              iOSMode='time'
            />
          </View>
        </InputRowContainer>
      )}
    </>
  )
}
