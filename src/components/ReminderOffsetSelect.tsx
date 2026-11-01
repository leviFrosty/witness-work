import { useState } from 'react'
import { View } from 'react-native'
import moment from 'moment'
import Select from '@/components/ui/Select'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n, { TranslationKey } from '@/lib/locales'
import {
  type NotificationOffset,
  offsetFromMinutes,
  offsetToMinutes,
} from '@/lib/notificationOffset'
import {
  isReminderPreset,
  REMINDER_OFFSET_OTHER,
  reminderOffsetOptions,
} from '@/lib/reminderOffsetOptions'

const amountOptions = [...Array(1000).keys()].map((value) => ({
  label: `${value}`,
  value,
}))
const unitOptions: {
  label: string
  value: moment.unitOfTime.DurationConstructor
}[] = ['minutes', 'hours', 'days', 'weeks'].map((value) => ({
  label: i18n.t(`${value}_lowercase` as TranslationKey),
  value: value as moment.unitOfTime.DurationConstructor,
}))

export default function ReminderOffsetSelect(props: {
  value: Partial<NotificationOffset>
  onChange: (offset: NotificationOffset) => void
}) {
  const theme = useTheme()
  const minutes = offsetToMinutes(props.value)
  const [otherChosen, setOtherChosen] = useState(false)
  const other = otherChosen || (minutes !== null && !isReminderPreset(minutes))

  return (
    <View style={{ gap: 10 }}>
      <Select
        data={reminderOffsetOptions()}
        value={other ? REMINDER_OFFSET_OTHER : minutes}
        onChange={({ value }) => {
          if (value === REMINDER_OFFSET_OTHER) {
            setOtherChosen(true)
            return
          }
          setOtherChosen(false)
          props.onChange(
            offsetFromMinutes(value) ?? { amount: 0, unit: 'minutes' }
          )
        }}
      />
      {other && (
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Select
              data={amountOptions}
              onChange={({ value: amount }) =>
                props.onChange({
                  unit: props.value.unit ?? 'minutes',
                  amount,
                })
              }
              placeholder={props.value.amount?.toString()}
              value={props.value.amount?.toString()}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Select
              data={unitOptions}
              onChange={({ value: unit }) =>
                props.onChange({ amount: props.value.amount ?? 0, unit })
              }
              value={props.value.unit}
            />
          </View>
          <Text style={{ color: theme.colors.textAlt }}>
            {i18n.t('before')}
          </Text>
        </View>
      )}
    </View>
  )
}
