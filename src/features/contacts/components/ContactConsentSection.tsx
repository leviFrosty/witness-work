import { View } from 'react-native'
import Switch from '@/components/ui/Switch'
import Text from '@/components/ui/MyText'
import Section from '@/components/ui/inputs/Section'
import InputRowContainer from '@/components/ui/inputs/InputRowContainer'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'

type Props = {
  agreed: boolean
  onConsentChange: (agreed: boolean) => void
  error?: string
  showRequiredHint: boolean
}

const ContactConsentSection = ({
  agreed,
  onConsentChange,
  error,
  showRequiredHint,
}: Props) => {
  const theme = useTheme()
  return (
    <>
      <View style={{ gap: 8 }}>
        <Text
          style={{
            fontSize: 11,
            color: theme.colors.textAlt,
            letterSpacing: 1.4,
            fontFamily: theme.fonts.semiBold,
            textTransform: 'uppercase',
            marginHorizontal: 12,
          }}
        >
          {i18n.t('dataProtectionConsentInfoTitle')}
        </Text>
        <Section>
          <InputRowContainer
            lastInSection
            label={i18n.t('dataProtectionConsentLabel')}
            info={i18n.t('dataProtectionConsentInfoDesc')}
            controlStyle={{ width: 'auto', flexShrink: 0 }}
          >
            <Switch
              accessibilityLabel={i18n.t('dataProtectionConsentLabel')}
              value={agreed}
              onValueChange={onConsentChange}
            />
          </InputRowContainer>
        </Section>
        {!!error && (
          <Text
            style={{
              fontSize: theme.fontSize('sm'),
              color: theme.colors.error,
              fontFamily: theme.fonts.semiBold,
              marginHorizontal: 12,
            }}
          >
            {error}
          </Text>
        )}
      </View>
      {showRequiredHint && (
        <Text
          style={{
            fontSize: theme.fontSize('sm'),
            color: theme.colors.textAlt,
            marginHorizontal: 12,
          }}
        >
          {i18n.t('dataProtectionConsentRequiredHint')}
        </Text>
      )}
    </>
  )
}

export default ContactConsentSection
