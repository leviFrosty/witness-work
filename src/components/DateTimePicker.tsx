import { Platform, View } from 'react-native'
import Text from './MyText'
import moment from 'moment'
import RNDateTimePicker, {
  DateTimePickerAndroid,
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker'
import i18n from '../lib/locales'
import Button from './Button'
import { useContext } from 'react'
import { ThemeContext } from '../contexts/theme'
import { getLocales } from 'expo-localization'
import { usePreferences } from '../stores/preferences'

type IOSMode = 'date' | 'time' | 'datetime' | 'countdown'
type AndroidMode = 'date' | 'time'

type Props = {
  value: Date
  onChange: (event: DateTimePickerEvent, date?: Date | undefined) => void
  maximumDate?: Date | undefined
  minimumDate?: Date | undefined
  /** Renders second picker for Android, so a time can be selected. */
  timeAndDate?: boolean
  /**
   * Mode provides the first picker's mode. If you need both date and time,
   * Native Android UI does not support this functionality. Use the timeAndDate
   * prop to enable two separate selectors. These selectors edit the same
   * incoming value (Date)
   *
   * @example
   *   ;<AndroidDateTimePicker
   *     value={date}
   *     onChange={handleDateChange}
   *     timeAndDate={true}
   *   />
   *   // value: 10/28/2023 10:00:00 AM
   *   // First selector changes date -> 10/10/2023 10:00:00 AM
   *   // Second selector changes time -> 10/10/2023 02:00:00 PM
   */
  androidFirstPickerMode?: AndroidMode
  iOSMode?: IOSMode
}

const DateTimePicker = ({
  value,
  onChange,
  maximumDate,
  minimumDate,
  timeAndDate,
  androidFirstPickerMode,
  iOSMode,
}: Props) => {
  const theme = useContext(ThemeContext)
  const { colorScheme } = usePreferences()

  if (Platform.OS !== 'android') {
    return (
      <RNDateTimePicker
        themeVariant={colorScheme || undefined}
        locale={getLocales()[0].languageCode || undefined}
        maximumDate={maximumDate}
        minimumDate={minimumDate}
        value={value}
        onChange={onChange}
        mode={iOSMode}
      />
    )
  }

  return (
    <View style={{ flexDirection: timeAndDate ? 'column' : 'row', gap: 10 }}>
      <Text style={{ fontFamily: theme.fonts.semiBold }}>
        {moment(value).format(timeAndDate ? 'LLL' : 'LL')}
      </Text>
      <View style={{ flexDirection: 'row', gap: 7 }}>
        <Button
          onPress={() => {
            DateTimePickerAndroid.open({
              mode: androidFirstPickerMode,
              minimumDate,
              maximumDate,
              value,
              onChange,
            })
          }}
        >
          <Text
            style={{
              textDecorationLine: 'underline',
            }}
          >
            {i18n.t('selectDate')}
          </Text>
        </Button>
        {timeAndDate && (
          <Button
            onPress={() => {
              DateTimePickerAndroid.open({
                mode: 'time',
                minimumDate,
                maximumDate,
                value: value,
                onChange,
              })
            }}
          >
            <Text
              style={{
                textDecorationLine: 'underline',
              }}
            >
              {i18n.t('selectTime')}
            </Text>
          </Button>
        )}
      </View>
    </View>
  )
}

export default DateTimePicker
