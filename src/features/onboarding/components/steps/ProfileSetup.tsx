import { View } from 'react-native'
import { styles } from '@/features/onboarding/components/Onboarding.styles'
import OnboardingNav from '@/features/onboarding/components/OnboardingNav'
import OnboardingFooter, {
  STEP_BOTTOM_PADDING,
} from '@/features/onboarding/components/OnboardingFooter'
import OnboardingScrollView from '@/features/onboarding/components/OnboardingScrollView'
import Text from '@/components/ui/MyText'
import i18n from '@/lib/locales'
import Wrapper from '@/components/ui/layout/Wrapper'
import ActionButton from '@/components/ui/ActionButton'
import useTheme from '@/contexts/theme'
import ProfileCard from '@/features/profile/components/ProfileCard'
import { useProfile } from '@/stores/profile'

interface Props {
  goBack: () => void
  goNext: () => void
}

/**
 * The last question: a name and a picture, both optional. It comes last because
 * it's the most personal thing setup asks for.
 */
const ProfileSetup = ({ goBack, goNext }: Props) => {
  const theme = useTheme()
  const { set } = useProfile()

  const handleContinue = () => {
    set({ hasCompletedProfileSetup: true })
    goNext()
  }

  return (
    <Wrapper
      style={{
        flex: 1,
        paddingHorizontal: 20,
        paddingTop: 60,
        paddingBottom: STEP_BOTTOM_PADDING,
      }}
    >
      <OnboardingNav goBack={goBack} />
      <OnboardingScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: 30,
          paddingBottom: 20,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.stepContentContainer, { marginRight: 0 }]}>
          <Text
            accessibilityRole='header'
            style={[styles.stepTitle, { fontFamily: theme.fonts.bold }]}
          >
            {i18n.t('profileSetupNameTitle')}
          </Text>
          <Text
            style={{
              fontSize: 14,
              color: theme.colors.textAlt,
              marginBottom: 24,
              lineHeight: 20,
            }}
          >
            {i18n.t('profileSetupNameDesc')}
          </Text>
          {/* Both answers are optional, so the keyboard waits to be asked
              for instead of covering the step on arrival. */}
          <ProfileCard hideBadges autoFocusName={false} />
        </View>
      </OnboardingScrollView>
      <OnboardingFooter>
        <ActionButton onPress={handleContinue}>
          {i18n.t('continue')}
        </ActionButton>
      </OnboardingFooter>
    </Wrapper>
  )
}

export default ProfileSetup
