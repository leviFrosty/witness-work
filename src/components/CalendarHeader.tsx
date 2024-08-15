import { View } from 'react-native'
import useTheme from '../contexts/theme'
import Text from './MyText'
import i18n from '../lib/locales'

export default function CalendarHeader() {
  const theme = useTheme()
  return (
    <View style={{ flex: 1, paddingBottom: 10 }}>
      <Text
        style={{
          fontSize: theme.fontSize('xl'),
          fontFamily: theme.fonts.semiBold,
        }}
      >
        {i18n.t('schedule')}
      </Text>
    </View>
  )
}
