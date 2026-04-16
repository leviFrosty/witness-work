import { View } from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import { styles } from '../Onboarding.styles'
import OnboardingNav from '../OnboardingNav'
import Text from '../../MyText'
import i18n from '../../../lib/locales'
import Wrapper from '../../layout/Wrapper'
import ActionButton from '../../ActionButton'
import useTheme from '../../../contexts/theme'
import ProfileSetupForm from '../../ProfileSetupForm'
import ProfileCard from '../../ProfileCard'
import { usePreferences } from '../../../stores/preferences'

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
        paddingHorizontal: 30,
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
        enableOnAndroid={true}
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
          <ProfileSetupForm />
          <View style={{ marginTop: 24, gap: 8 }}>
            <Text
              style={{
                fontSize: 12,
                color: theme.colors.textAlt,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}
            >
              {i18n.t('profileSetupPreviewLabel')}
            </Text>
            <ProfileCard preview />
          </View>
        </View>
      </KeyboardAwareScrollView>
      <ActionButton onPress={handleContinue}>{i18n.t('continue')}</ActionButton>
    </Wrapper>
  )
}

export default ProfileSetup
