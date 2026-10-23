import { View } from 'react-native'
import { styles } from '@/features/onboarding/components/Onboarding.styles'
import OnboardingNav from '@/features/onboarding/components/OnboardingNav'
import OnboardingFooter, {
  STEP_BOTTOM_PADDING,
} from '@/features/onboarding/components/OnboardingFooter'
import OnboardingScrollView from '@/features/onboarding/components/OnboardingScrollView'
import Text from '@/components/ui/MyText'
import i18n from '@/lib/locales'
import PublisherTypeSelector from '@/components/PublisherTypeSelector'
import Wrapper from '@/components/ui/layout/Wrapper'
import ActionButton from '@/components/ui/ActionButton'
import InfoPopover from '@/components/ui/InfoPopover'
import { usePreferences } from '@/stores/preferences'
import useTheme from '@/contexts/theme'
import { tracking } from '@/lib/tracking'

interface Props {
  goBack: () => void
  goNext: () => void
}

/**
 * The first question, once the tour has shown what the app does: it opens
 * personalizing, so it carries that heading above the question.
 */
const StepTwo = ({ goBack, goNext }: Props) => {
  const theme = useTheme()
  const { role } = usePreferences()
  // Reflect the user's just-made selection in the CTA. For 'custom' the role
  // label would be "Custom" which isn't meaningful as a subject — fall back
  // to plain "Continue" there.
  const ctaLabel =
    role && role !== 'custom'
      ? i18n.t('continueAs', { role: i18n.t(role) })
      : i18n.t('continue')

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
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
                style={{
                  fontSize: 13,
                  fontFamily: theme.fonts.semiBold,
                  color: theme.colors.accent,
                  letterSpacing: tracking(0.4),
                  marginBottom: 8,
                }}
              >
                {i18n.t('profileSetupTitle')}
              </Text>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  marginBottom: 20,
                }}
              >
                <Text
                  style={[
                    styles.stepTitle,
                    {
                      marginBottom: 0,
                      flexShrink: 1,
                      fontFamily: theme.fonts.bold,
                    },
                  ]}
                >
                  {i18n.t('whatTypePublisherAreYou')}
                </Text>
                <InfoPopover
                  title={i18n.t('status')}
                  description={i18n.t('publisherStatus_info')}
                />
              </View>
              <PublisherTypeSelector variant='list' />
            </View>
          </OnboardingScrollView>
          <OnboardingFooter>
            <ActionButton onPress={goNext}>{ctaLabel}</ActionButton>
          </OnboardingFooter>
        </Wrapper>
      </View>
    </View>
  )
}

export default StepTwo
