import { View } from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import { styles } from '../Onboarding.styles'
import OnboardingNav from '../OnboardingNav'
import Text from '../../MyText'
import i18n from '../../../lib/locales'
import Wrapper from '../../layout/Wrapper'
import ActionButton from '../../ActionButton'
import SupporterBenefits from '../../SupporterBenefits'
import useTheme from '../../../contexts/theme'
import { usePreferences } from '../../../stores/preferences'
import { Publisher } from '../../../types/publisher'

interface Props {
  goBack: () => void
  goNext: () => void
}

const personalizationKeyByPublisher: Record<
  Publisher,
  | 'supporterOnboardingPersonalPublisher'
  | 'supporterOnboardingPersonalRegularAuxiliary'
  | 'supporterOnboardingPersonalRegularPioneer'
  | 'supporterOnboardingPersonalCircuitOverseer'
  | 'supporterOnboardingPersonalSpecialPioneer'
  | 'supporterOnboardingPersonalCustom'
> = {
  publisher: 'supporterOnboardingPersonalPublisher',
  regularAuxiliary: 'supporterOnboardingPersonalRegularAuxiliary',
  regularPioneer: 'supporterOnboardingPersonalRegularPioneer',
  circuitOverseer: 'supporterOnboardingPersonalCircuitOverseer',
  specialPioneer: 'supporterOnboardingPersonalSpecialPioneer',
  custom: 'supporterOnboardingPersonalCustom',
}

const Supporter = ({ goBack, goNext }: Props) => {
  const theme = useTheme()
  const prefs = usePreferences()
  const { publisher } = prefs

  // Read `onboardingIntents` defensively — the field is being added by a
  // sibling worktree and may not exist in the preferences store yet. Typing
  // through `unknown` avoids coupling this component to the prefs shape.
  const intents =
    (prefs as unknown as { onboardingIntents?: string[] }).onboardingIntents ??
    []

  const personalizationKey = publisher
    ? personalizationKeyByPublisher[publisher]
    : undefined

  const intentCount = intents.length
  const intentsLine =
    intentCount === 0
      ? null
      : intentCount === 1
        ? i18n.t('supporterOnboardingIntentsLineOne')
        : i18n.t('supporterOnboardingIntentsLine', { count: intentCount })

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
          {/* From-the-maker lead-in: volunteer framing + free-forever reassurance. */}
          <View
            style={{
              alignSelf: 'flex-start',
              backgroundColor: theme.colors.supporterTranslucent,
              borderWidth: 1,
              borderColor: theme.colors.supporter,
              borderRadius: theme.numbers.borderRadiusSm,
              paddingHorizontal: 10,
              paddingVertical: 4,
              marginBottom: 20,
            }}
          >
            <Text
              style={{
                fontSize: 12,
                color: theme.colors.supporter,
                fontFamily: theme.fonts.semiBold,
              }}
            >
              {i18n.t('supporterOnboardingFreeForever')}
            </Text>
          </View>
          <Text
            style={{
              fontSize: 24,
              color: theme.colors.text,
              fontFamily: theme.fonts.bold,
              lineHeight: 30,
              marginBottom: 10,
            }}
          >
            {i18n.t('supporterSheetTitle')}
          </Text>
          <Text
            style={{
              fontSize: 14,
              color: theme.colors.textAlt,
              lineHeight: 20,
              marginBottom: 12,
            }}
          >
            {i18n.t('supporterOnboardingLeadIn')}
          </Text>

          {/* Personalized lines — only render when we actually have data. */}
          {personalizationKey ? (
            <Text
              style={{
                fontSize: 14,
                color: theme.colors.text,
                lineHeight: 20,
                marginBottom: intentsLine ? 6 : 20,
              }}
            >
              {i18n.t(personalizationKey)}
            </Text>
          ) : null}
          {intentsLine ? (
            <Text
              style={{
                fontSize: 13,
                color: theme.colors.textAlt,
                lineHeight: 18,
                marginBottom: 20,
              }}
            >
              {intentsLine}
            </Text>
          ) : null}

          <SupporterBenefits />
        </View>
      </KeyboardAwareScrollView>
      <ActionButton onPress={goNext}>{i18n.t('continue')}</ActionButton>
    </Wrapper>
  )
}

export default Supporter
