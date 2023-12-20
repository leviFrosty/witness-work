import { View } from 'react-native'
import { styles } from '../Onboarding.styles'
import OnboardingNav from '../OnboardingNav'
import { registerForPushNotificationsAsync } from '../../../lib/notifications'
import Text from '../../MyText'
import i18n from '../../../lib/locales'
import Wrapper from '../../Wrapper'
import ActionButton from '../../ActionButton'
import Button from '../../Button'

interface Props {
  goBack: () => void
  goNext: () => void
}

const StepThree = ({ goBack, goNext }: Props) => {
  return (
    <Wrapper
      style={{
        flexGrow: 1,
        paddingHorizontal: 30,
        paddingTop: 60,
        paddingBottom: 100,
        justifyContent: 'space-between',
      }}
    >
      <OnboardingNav goBack={goBack} />
      <View>
        <Text style={styles.stepTitle}>
          {i18n.t('neverForgetAReturnVisit')}
        </Text>
        <Text style={styles.description}>
          {i18n.t('neverForgetAReturnVisit_description')}
        </Text>
      </View>
      <View>
        <ActionButton
          onPress={async () => {
            registerForPushNotificationsAsync().then(() => {
              goNext()
            })
          }}
        >
          {i18n.t('allowNotifications')}
        </ActionButton>
        <View style={{ alignItems: 'center', marginTop: 15 }}>
          <Button onPress={goNext}>
            <Text style={styles.navSkip}>{i18n.t('skip')}</Text>
          </Button>
        </View>
      </View>
    </Wrapper>
  )
}

export default StepThree
