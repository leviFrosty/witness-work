import React from 'react'
import { View } from 'react-native'
import { styles } from '../Onboarding.styles'
import OnboardingNav from '../OnboardingNav'
import Text from '../../MyText'
import i18n from '../../../lib/locales'
import Wrapper from '../../layout/Wrapper'
import ActionButton from '../../ActionButton'
import useNotifications from '../../../hooks/notifications'

interface Props {
  goNext: () => void
  goBack: () => void
}

const StepFour = ({ goNext, goBack }: Props) => {
  const notifications = useNotifications()

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
        <Text style={styles.stepTitle}>{i18n.t('youreAllSet')}</Text>
        <Text style={styles.description}>
          {notifications.allowed
            ? i18n.t('youreAllSet_description')
            : i18n.t('optInNotificationsLater')}
        </Text>
      </View>
      <ActionButton onPress={goNext}>{i18n.t('completeSetup')}</ActionButton>
    </Wrapper>
  )
}

export default StepFour
