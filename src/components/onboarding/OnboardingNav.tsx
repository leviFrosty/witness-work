import { View } from 'react-native'
import { styles } from './Onboarding.styles'
import Text from '../MyText'
import i18n from '../../lib/locales'
import IconButton from '../IconButton'
import { faChevronLeft } from '@fortawesome/free-solid-svg-icons'
import Button from '../Button'
import useTheme from '../../contexts/theme'

interface Props {
  noActions?: boolean
  goBack: () => void
}

const OnboardingNav = ({ noActions, goBack }: Props) => {
  const theme = useTheme()
  return (
    <View style={styles.navContainer}>
      {!noActions ? (
        <Button style={styles.navBack} onPress={goBack}>
          <IconButton icon={faChevronLeft} />
        </Button>
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
    </View>
  )
}

export default OnboardingNav
