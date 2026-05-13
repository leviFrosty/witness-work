import { View } from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import { styles } from '@/features/onboarding/components/Onboarding.styles'
import OnboardingNav from '@/features/onboarding/components/OnboardingNav'
import Text from '@/components/MyText'
import i18n from '@/lib/locales'
import Wrapper from '@/components/layout/Wrapper'
import ActionButton from '@/components/ActionButton'
import useTheme from '@/contexts/theme'
import ProfileCard from '@/components/ProfileCard'
import { usePreferences } from '@/stores/preferences'

interface Props {
  goBack: () => void
  goNext: () => void
}

const ProfileSetup = ({ goBack, goNext }: Props) => {
  const theme = useTheme()
  const { set } = usePreferences()

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
        paddingBottom: 60,
      }}
    >
      <OnboardingNav goBack={goBack} />
      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: 30,
          paddingBottom: 20,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.stepContentContainer, { marginRight: 0 }]}>
          <Text style={styles.stepTitle}>{i18n.t('profileSetupTitle')}</Text>
          <Text
            style={{
              fontSize: 14,
              color: theme.colors.textAlt,
              marginBottom: 24,
              lineHeight: 20,
            }}
          >
            {i18n.t('profileSetupDesc')}
          </Text>
          <ProfileCard editable />
        </View>
      </KeyboardAwareScrollView>
      <ActionButton onPress={handleContinue}>{i18n.t('continue')}</ActionButton>
    </Wrapper>
  )
}

export default ProfileSetup
