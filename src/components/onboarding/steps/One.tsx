import { View } from 'react-native'
import { styles } from '../Onboarding.styles'
import Text from '../../MyText'
import i18n from '../../../lib/locales'
import Wrapper from '../../layout/Wrapper'
import ActionButton from '../../ActionButton'

interface Props {
  goNext: () => void
  goBack?: () => void
}

const StepOne = ({ goNext }: Props) => {
  return (
    <Wrapper style={{ padding: 20, paddingBottom: 20 }}>
      <View style={styles.onboardingTitleWrapper}>
        <View style={styles.textContainer}>
          <Text style={styles.subTitle}>{i18n.t('welcomeTo')}</Text>
          <Text style={styles.title}>{i18n.t('witnessWork')}</Text>
        </View>
      </View>
      <ActionButton onPress={goNext}>{i18n.t('getStarted')}</ActionButton>
    </Wrapper>
  )
}

export default StepOne
