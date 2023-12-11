import { View } from 'react-native'
import { styles } from './Onboarding.styles'
import Text from '../MyText'
import i18n from '../../lib/locales'
import IconButton from '../IconButton'
import { faChevronLeft } from '@fortawesome/free-solid-svg-icons'
import Button from '../Button'

interface Props {
  noActions?: boolean
  goBack: () => void
}

const OnboardingNav = ({ noActions, goBack }: Props) => {
  return (
    <View style={styles.navContainer}>
      {!noActions ? (
        <Button style={styles.navBack} onPress={goBack}>
          <IconButton icon={faChevronLeft} />
        </Button>
      ) : null}
      <Text style={styles.navTitle}>{i18n.t('jwTime')}</Text>
    </View>
  )
}

export default OnboardingNav
