import { useEffect } from 'react'
import { View } from 'react-native'
import Switch from '@/components/ui/Switch'
import { getLocales } from 'expo-localization'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import { styles } from '@/features/onboarding/components/Onboarding.styles'
import OnboardingNav from '@/features/onboarding/components/OnboardingNav'
import Text from '@/components/ui/MyText'
import Card from '@/components/ui/Card'
import InfoPopover from '@/components/ui/InfoPopover'
import Wrapper from '@/components/ui/layout/Wrapper'
import ActionButton from '@/components/ui/ActionButton'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { isDataProtectionRegion } from '@/lib/dataProtection'
import { usePreferences } from '@/stores/preferences'

interface Props {
  goBack: () => void
  goNext: () => void
}

const DataProtection = ({ goBack, goNext }: Props) => {
  const theme = useTheme()
  const { dataProtectionMode, dataProtectionModeSetByUser, set } =
    usePreferences()

  // Until the user makes an explicit choice, the switch reflects the device
  // region (EU/EEA, UK, CH default to on). Once they toggle it themselves,
  // `dataProtectionModeSetByUser` pins their answer and this stops running.
  useEffect(() => {
    if (dataProtectionModeSetByUser) return
    set({
      dataProtectionMode: isDataProtectionRegion(getLocales()[0]?.regionCode),
    })
  }, [dataProtectionModeSetByUser, set])

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
          <Text style={styles.stepTitle}>{i18n.t('dataProtectionTitle')}</Text>
          <Text
            style={{
              fontSize: 14,
              color: theme.colors.textAlt,
              marginBottom: 24,
              lineHeight: 20,
            }}
          >
            {i18n.t('dataProtectionDesc')}
          </Text>
          <Card
            flexDirection='row'
            style={{
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingVertical: 12,
              paddingHorizontal: 16,
              gap: 0,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                flexShrink: 1,
              }}
            >
              <Text
                style={{
                  fontSize: 16,
                  fontFamily: theme.fonts.semiBold,
                  color: theme.colors.text,
                  flexShrink: 1,
                }}
              >
                {i18n.t('dataProtectionSwitchLabel')}
              </Text>
              <InfoPopover
                title={i18n.t('dataProtectionInfoTitle')}
                description={i18n.t('dataProtectionInfoDesc')}
              />
            </View>
            <View>
              <Switch
                accessibilityLabel={i18n.t('dataProtectionSwitchLabel')}
                value={dataProtectionMode}
                onValueChange={(value) =>
                  set({
                    dataProtectionMode: value,
                    dataProtectionModeSetByUser: true,
                  })
                }
              />
            </View>
          </Card>
          <Text
            style={{
              fontSize: 12,
              color: theme.colors.textAlt,
              marginTop: 10,
              lineHeight: 16,
            }}
          >
            {i18n.t('dataProtectionSubtext')}
          </Text>
        </View>
      </KeyboardAwareScrollView>
      <ActionButton onPress={goNext}>{i18n.t('continue')}</ActionButton>
    </Wrapper>
  )
}

export default DataProtection
