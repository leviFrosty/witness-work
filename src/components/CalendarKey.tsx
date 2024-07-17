import { View } from 'react-native'
import i18n from '../lib/locales'
import Text from './MyText'
import XView from './layout/XView'
import useTheme from '../contexts/theme'

const size = 15

const Box = (props: { color: string }) => {
  const theme = useTheme()
  return (
    <View
      style={{
        width: size,
        height: size,
        backgroundColor: props.color,
        borderRadius: theme.numbers.borderRadiusSm,
      }}
    />
  )
}

const CalendarKey = () => {
  const theme = useTheme()

  return (
    <View
      style={{
        flexDirection: 'column',
        gap: 12,
        width: '100%',
        paddingBottom: 10,
        borderBottomColor: theme.colors.border,
        borderBottomWidth: 1,
        marginBottom: 15,
      }}
    >
      <XView style={{ justifyContent: 'space-between' }}>
        <Text
          style={{
            fontFamily: theme.fonts.semiBold,
          }}
        >
          {i18n.t('colorKey')}
        </Text>
      </XView>
      <XView style={{ gap: 8, flexWrap: 'wrap' }}>
        <XView>
          <Text style={{ fontSize: theme.fontSize('sm') }}>
            {i18n.t('missed')}
          </Text>
          <Box color={theme.colors.error} />
        </XView>
        <XView>
          <Text style={{ fontSize: theme.fontSize('sm') }}>
            {i18n.t('partial')}
          </Text>
          <Box color={theme.colors.warn} />
        </XView>
        <XView>
          <Text style={{ fontSize: theme.fontSize('sm') }}>
            {i18n.t('completed')}
          </Text>
          <Box color={theme.colors.accent} />
        </XView>
        <XView>
          <Text style={{ fontSize: theme.fontSize('sm') }}>
            {i18n.t('planned')}
          </Text>
          <Box color={theme.colors.background} />
        </XView>
      </XView>
    </View>
  )
}

export default CalendarKey
