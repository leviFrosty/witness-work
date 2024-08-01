import { View } from 'react-native'
import Text from './MyText'
import useTheme from '../contexts/theme'
import i18n from '../lib/locales'
import XView from './layout/XView'

const TimeCategoryTableRow = ({
  title,
  number,
  credit,
}: {
  title: string
  number: number
  credit?: boolean
}) => {
  const theme = useTheme()

  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
      }}
    >
      <XView>
        <Text>{title}</Text>
        {credit && (
          <Text
            style={{
              borderColor: theme.colors.textAlt,
              borderWidth: 1,
              color: theme.colors.textAlt,
              borderRadius: theme.numbers.borderRadiusSm,
              paddingVertical: 1,
              paddingHorizontal: 6,
              fontFamily: theme.fonts.semiBold,
              fontSize: theme.fontSize('xs'),
            }}
          >
            {i18n.t('credit')}
          </Text>
        )}
      </XView>
      <View style={{ flexDirection: 'row', gap: 5 }}>
        <Text>{number}</Text>
      </View>
    </View>
  )
}

export default TimeCategoryTableRow
