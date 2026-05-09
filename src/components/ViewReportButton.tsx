import { useNavigation } from '@react-navigation/native'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import { faFileLines } from '@fortawesome/free-solid-svg-icons'
import Button from './Button'
import Text from './MyText'
import useTheme from '../contexts/theme'
import i18n from '../lib/locales'
import { RootStackNavigation } from '../types/rootStack'

interface ViewReportButtonProps {
  month: number
  year: number
}

const ViewReportButton = ({ month, year }: ViewReportButtonProps) => {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()

  return (
    <Button
      accessibilityLabel={i18n.t('viewReport')}
      onPress={() => navigation.navigate('ServiceReportView', { month, year })}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: 999,
        borderCurve: 'continuous',
      }}
    >
      <FontAwesomeIcon
        icon={faFileLines}
        size={theme.fontSize('sm')}
        style={{ color: theme.colors.textAlt }}
      />
      <Text
        style={{
          color: theme.colors.textAlt,
          fontFamily: theme.fonts.semiBold,
          fontSize: theme.fontSize('sm'),
        }}
      >
        {i18n.t('viewReport')}
      </Text>
    </Button>
  )
}

export default ViewReportButton
