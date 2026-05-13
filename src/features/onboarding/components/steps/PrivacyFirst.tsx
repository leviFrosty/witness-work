import { View } from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import { IconProp } from '@fortawesome/fontawesome-svg-core'
import {
  faWifi,
  faMobileScreen,
  faLink,
  faUserShield,
} from '@fortawesome/free-solid-svg-icons'
import { styles } from '@/features/onboarding/components/Onboarding.styles'
import OnboardingNav from '@/features/onboarding/components/OnboardingNav'
import Text from '@/components/ui/MyText'
import Card from '@/components/ui/Card'
import Wrapper from '@/components/ui/layout/Wrapper'
import ActionButton from '@/components/ui/ActionButton'
import useTheme from '@/contexts/theme'
import i18n, { TranslationKey } from '@/lib/locales'

interface Props {
  goBack: () => void
  goNext: () => void
}

interface Highlight {
  id: string
  icon: IconProp
  titleKey: TranslationKey
  descriptionKey: TranslationKey
  color: string
}

const PrivacyFirst = ({ goBack, goNext }: Props) => {
  const theme = useTheme()

  const highlights: Highlight[] = [
    {
      id: 'offline',
      icon: faWifi,
      titleKey: 'privacyOfflineTitle',
      descriptionKey: 'privacyOfflineDesc',
      color: theme.colors.accent,
    },
    {
      id: 'on-device',
      icon: faMobileScreen,
      titleKey: 'privacyOnDeviceTitle',
      descriptionKey: 'privacyOnDeviceDesc',
      color: theme.colors.indigo,
    },
    {
      id: 'share-in-link',
      icon: faLink,
      titleKey: 'privacyShareInLinkTitle',
      descriptionKey: 'privacyShareInLinkDesc',
      color: theme.colors.teal,
    },
    {
      id: 'your-data',
      icon: faUserShield,
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
            {i18n.t('privacyFirstDesc')}
          </Text>
          {highlights.map((h) => (
            <Card
              key={h.id}
              flexDirection='row'
              style={{
                alignItems: 'center',
                paddingVertical: 12,
                paddingHorizontal: 16,
                marginBottom: 8,
                gap: 0,
              }}
            >
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: h.color,
                  justifyContent: 'center',
                  alignItems: 'center',
                  marginRight: 12,
                }}
              >
                <FontAwesomeIcon
                  icon={h.icon}
                  size={18}
                  color={theme.colors.textInverse}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 16,
                    fontFamily: 'Inter_600SemiBold',
                    color: theme.colors.text,
                    marginBottom: 2,
                  }}
                >
                  {i18n.t(h.titleKey)}
                </Text>
                <Text
                  style={{
                    fontSize: 14,
                    color: theme.colors.textAlt,
                    lineHeight: 18,
                  }}
                >
                  {i18n.t(h.descriptionKey)}
                </Text>
              </View>
            </Card>
          ))}
        </View>
      </KeyboardAwareScrollView>
      <ActionButton onPress={goNext}>{i18n.t('continue')}</ActionButton>
    </Wrapper>
  )
}

export default PrivacyFirst
