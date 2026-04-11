import React from 'react'
import { TouchableOpacity, View } from 'react-native'
import { styles } from '../Onboarding.styles'
import OnboardingNav from '../OnboardingNav'
import Text from '../../MyText'
import i18n from '../../../lib/locales'
import Wrapper from '../../layout/Wrapper'
import ActionButton from '../../ActionButton'
import useNotifications from '../../../hooks/notifications'
import useTheme from '../../../contexts/theme'
import { useTutorial } from '../../../stores/tutorial'

interface Props {
  goNext: () => void
  goBack: () => void
}

/**
 * Final onboarding screen. Instead of a single "Complete Setup" CTA, we now
 * offer a primary "Start tour" and a secondary "Skip tour". Either action
 * completes onboarding — the distinction is whether we record that the
 * post-onboarding tutorial prompt should still appear.
 *
 * Completing onboarding via "Skip tour" preemptively marks the prompt as seen
 * so the user is not re-asked immediately on the home screen. Starting the tour
 * leaves the flag alone; TutorialPromptSheet will open automatically once the
 * home screen mounts, and launching the tour from there sets the flag.
 */
const StepFour = ({ goNext, goBack }: Props) => {
  const notifications = useNotifications()
  const theme = useTheme()
  const { markPostOnboardingPromptSeen } = useTutorial()

  const handleStartTour = () => {
    // Leave hasSeenPostOnboardingPrompt false so the tour prompt fires when
    // the home stack mounts. goNext() in the parent marks onboardingComplete.
    goNext()
  }

  const handleSkipTour = () => {
    markPostOnboardingPromptSeen()
    goNext()
  }

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
          {i18n.t('tutorial.youreAllSetUpdated')}
        </Text>
        <Text style={styles.description}>
          {notifications.allowed
            ? i18n.t('youreAllSet_description')
            : i18n.t('optInNotificationsLater')}
        </Text>
        <Text style={[styles.description, { marginTop: 16 }]}>
          {i18n.t('tutorial.youreAllSetUpdated_description')}
        </Text>
      </View>
      <View style={{ gap: 12 }}>
        <ActionButton onPress={handleStartTour}>
          {i18n.t('tutorial.startTour')}
        </ActionButton>
        <TouchableOpacity
          onPress={handleSkipTour}
          style={{ alignSelf: 'center', paddingVertical: 8 }}
        >
          <Text
            style={{
              color: theme.colors.textAlt,
              fontSize: theme.fontSize('md'),
            }}
          >
            {i18n.t('tutorial.skipTour')}
          </Text>
        </TouchableOpacity>
      </View>
    </Wrapper>
  )
}

export default StepFour
