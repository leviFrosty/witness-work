import { View } from 'react-native'
import Text from '../MyText'
import i18n from '../../lib/locales'
import IconButton from '../IconButton'
import { faChevronLeft } from '@fortawesome/free-solid-svg-icons'
import useTheme from '../../contexts/theme'
import { ThemeSize } from '../../types/theme'

interface Props {
  noActions?: boolean
  goBack: () => void
}

const OnboardingNav = ({ noActions, goBack }: Props) => {
  const theme = useTheme()
  const size: ThemeSize = 'md'

  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingBottom: 20,
        paddingHorizontal: 20,
      }}
    >
      {!noActions ? (
        <IconButton size={size} icon={faChevronLeft} onPress={goBack} />
      ) : null}
      <Text
        style={{
          fontFamily: theme.fonts.bold,
          fontSize: theme.fontSize('lg'),
          letterSpacing: -0.5,
        }}
      >
        {i18n.t('witnessWork')}
      </Text>
      <View style={{ width: theme.fontSize(size) }} />
    </View>
  )
}

export default OnboardingNav
