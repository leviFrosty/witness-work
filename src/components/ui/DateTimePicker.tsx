import { Platform, View } from 'react-native'
import RNDateTimePicker, {
  DateTimePickerAndroid,
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker'
import { getLocales } from 'expo-localization'
import { usePreferences } from '@/stores/preferences'
import moment from 'moment'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'

type IOSMode = 'date' | 'time' | 'datetime'

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
  iOSMode = 'date',
}: Props) => {
  const { colorScheme, timeFormat } = usePreferences()
  const theme = useTheme()

  if (Platform.OS === 'android') {
    const modes: Array<'date' | 'time'> =
      iOSMode === 'datetime' ? ['date', 'time'] : [iOSMode]
    const open = (mode: 'date' | 'time') => {
      DateTimePickerAndroid.open({
        value,
        mode,
        minimumDate: mode === 'date' ? minimumDate : undefined,
        maximumDate: mode === 'date' ? maximumDate : undefined,
        is24Hour: timeFormat
          ? timeFormat === '24'
          : !/a/i.test(moment.localeData().longDateFormat('LT')),
        onChange: (event, selected) => {
          if (event.type !== 'set' || !selected) return
          const next = new Date(value)
          if (mode === 'date') {
            next.setFullYear(
              selected.getFullYear(),
              selected.getMonth(),
              selected.getDate()
            )
          } else {
            next.setHours(selected.getHours(), selected.getMinutes())
          }
          const bounded = new Date(
            Math.max(
              minimumDate?.getTime() ?? -Infinity,
              Math.min(maximumDate?.getTime() ?? Infinity, next.getTime())
            )
          )
          onChange(event, bounded)
        },
      })
    }

    return (
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 8,
          justifyContent: 'flex-end',
        }}
      >
        {modes.map((mode) => (
          <Button
            key={mode}
            noTransform
            accessibilityRole='button'
            accessibilityLabel={i18n.t(mode)}
            onPress={() => open(mode)}
            style={{
              paddingHorizontal: 10,
              paddingVertical: 8,
              backgroundColor: theme.colors.card,
              borderRadius: theme.numbers.borderRadiusSm,
            }}
          >
            <Text>{moment(value).format(mode === 'date' ? 'll' : 'LT')}</Text>
          </Button>
        ))}
      </View>
    )
  }

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
