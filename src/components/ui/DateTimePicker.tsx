import { View } from 'react-native'
import RNDateTimePicker, {
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker'
import { getLocales } from 'expo-localization'
import { usePreferences } from '@/stores/preferences'

type IOSMode = 'date' | 'time' | 'datetime' | 'countdown'

type Props = {
  value: Date
  onChange: (event: DateTimePickerEvent, date?: Date | undefined) => void
  maximumDate?: Date | undefined
  minimumDate?: Date | undefined
  iOSMode?: IOSMode
}

const DateTimePicker = ({
  value,
  onChange,
  maximumDate,
  minimumDate,
  iOSMode,
}: Props) => {
  const { colorScheme } = usePreferences()

  return (
    <View>
      <RNDateTimePicker
        themeVariant={colorScheme || undefined}
        locale={getLocales()[0].languageCode || undefined}
        maximumDate={maximumDate}
        minimumDate={minimumDate}
        value={value}
        onChange={onChange}
        mode={iOSMode}
      />
    </View>
  )
}

export default DateTimePicker
