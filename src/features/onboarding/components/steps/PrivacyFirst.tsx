import { ComponentType } from 'react'
import { Platform, View } from 'react-native'
import { useReducedMotion } from 'react-native-reanimated'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import { styles } from '@/features/onboarding/components/Onboarding.styles'
import OnboardingNav from '@/features/onboarding/components/OnboardingNav'
import {
  ExportIllustration,
  OfflineIllustration,
  OnDeviceIllustration,
  type PrivacyIllustrationProps,
  ShareLinkIllustration,
} from '@/features/onboarding/components/PrivacyIllustrations'
import Text from '@/components/ui/MyText'
import Wrapper from '@/components/ui/layout/Wrapper'
import ActionButton from '@/components/ui/ActionButton'
import useTheme from '@/contexts/theme'
import { withAlpha } from '@/lib/color'
import i18n, { TranslationKey } from '@/lib/locales'

interface Props {
  goBack: () => void
  goNext: () => void
}

interface Highlight {
  id: string
  Illustration: ComponentType<PrivacyIllustrationProps>
  titleKey: TranslationKey
  descriptionKey: TranslationKey
  color: string
}

const PrivacyFirst = ({ goBack, goNext }: Props) => {
  const theme = useTheme()
  const reduceMotion = useReducedMotion()

  const highlights: Highlight[] = [
    {
      id: 'offline',
      Illustration: OfflineIllustration,
      titleKey: 'privacyOfflineTitle',
      descriptionKey: 'privacyOfflineDesc',
      color: theme.colors.accent,
    },
    {
      id: 'on-device',
      Illustration: OnDeviceIllustration,
      titleKey:
        Platform.OS === 'android'
          ? 'privacyOnDeviceTitleAndroid'
          : 'privacyOnDeviceTitle',
      descriptionKey:
        Platform.OS === 'android'
          ? 'privacyOnDeviceDescAndroid'
          : 'privacyOnDeviceDesc',
      color: theme.colors.indigo,
    },
    {
      id: 'share-in-link',
      Illustration: ShareLinkIllustration,
      titleKey: 'privacyShareInLinkTitle',
      descriptionKey: 'privacyShareInLinkDesc',
      color: theme.colors.teal,
    },
    {
      id: 'your-data',
      Illustration: ExportIllustration,
      titleKey: 'privacyYourDataTitle',
      descriptionKey: 'privacyYourDataDesc',
      color: theme.colors.purple,
    },
  ]

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
          <Text style={styles.stepTitle}>{i18n.t('privacyFirstTitle')}</Text>
          <Text
            style={{
              fontSize: 14,
              color: theme.colors.textAlt,
              marginBottom: 24,
              lineHeight: 20,
            }}
          >
            {i18n.t(
              Platform.OS === 'android'
                ? 'privacyFirstDescAndroid'
                : 'privacyFirstDesc'
            )}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {highlights.map(
              ({ id, Illustration, titleKey, descriptionKey, color }) => (
                <View
                  key={id}
                  accessible
                  accessibilityLabel={i18n.t(titleKey)}
                  accessibilityHint={i18n.t(descriptionKey)}
                  style={{
                    flexBasis: '47%',
                    flexGrow: 1,
                    borderRadius: theme.numbers.borderRadiusLg,
                    borderCurve: 'continuous',
                    backgroundColor: theme.colors.backgroundLighter,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    overflow: 'hidden',
                  }}
                >
                  <View
                    style={{
                      height: 150,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: withAlpha(color, 0x14),
                    }}
                  >
                    <View style={{ transform: [{ scale: 1.35 }] }}>
                      <Illustration color={color} reduceMotion={reduceMotion} />
                    </View>
                  </View>
                  <Text
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      fontSize: theme.fontSize('sm'),
                      fontFamily: theme.fonts.semiBold,
                      color: theme.colors.text,
                    }}
                  >
                    {i18n.t(titleKey)}
                  </Text>
                </View>
              )
            )}
          </View>
        </View>
      </KeyboardAwareScrollView>
      <ActionButton onPress={goNext}>{i18n.t('continue')}</ActionButton>
    </Wrapper>
  )
}

export default PrivacyFirst
