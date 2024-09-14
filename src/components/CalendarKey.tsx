import { View } from 'react-native'
import i18n from '../lib/locales'
import Text from './MyText'
import XView from './layout/XView'
import useTheme from '../contexts/theme'

const size = 10

const Box = (props: { color: string }) => {
  return (
    <View
      style={{
        width: size,
        height: size,
        backgroundColor: props.color,
        borderRadius: size / 4,
      }}
    />
  )
}

const KeyText = (props: { text: string }) => {
  const theme = useTheme()
  return <Text style={{ fontSize: theme.fontSize('sm') }}>{props.text}</Text>
}

const CalendarKey = () => {
  const theme = useTheme()

  return (
    <View
      style={{
        flexDirection: 'column',
        width: '100%',
        paddingBottom: 5,
        borderBottomColor: theme.colors.border,
        borderBottomWidth: 1,
      }}
    >
      <XView style={{ gap: 8, flexWrap: 'wrap' }}>
        <XView>
          <KeyText text={i18n.t('missed')} />
          <Box color={theme.colors.error} />
        </XView>
        <XView>
          <KeyText text={i18n.t('partial')} />
          <Box color={theme.colors.warn} />
        </XView>
        <XView>
          <KeyText text={i18n.t('completed')} />
          <Box color={theme.colors.accent} />
        </XView>
        <XView>
          <KeyText text={i18n.t('planned')} />
          <Box color={theme.colors.background} />
        </XView>
      </XView>
    </View>
  )
}

export default CalendarKey
