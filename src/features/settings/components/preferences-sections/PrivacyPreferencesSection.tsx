import {
  ShieldCheck as ShieldCheckIcon,
  Trash2 as Trash2Icon,
} from 'lucide-react-native'
import { Alert, View } from 'react-native'
import Section from '@/components/ui/inputs/Section'
import InputRowContainer from '@/components/ui/inputs/InputRowContainer'
import InputRowSwitch from '@/components/ui/inputs/InputRowSwitch'
import Switch from '@/components/ui/Switch'
import InputRowButton from '@/features/settings/components/inputs/InputRowButton'
import SectionTitle from '@/features/settings/components/shared/SectionTitle'
import i18n from '@/lib/locales'
import { usePreferences } from '@/stores/preferences'
import { deleteAllHouseholderData } from '@/stores/householderData'
import useTheme from '@/contexts/theme'

const PrivacyPreferencesSection = () => {
  const theme = useTheme()
  const { dataProtectionMode, analyticsEnabled, set } = usePreferences()

  // Art 17 erasure affordance: one action that hard-deletes every contact and
  // visit, leaving only redacted sync tombstones.
  const handleDeleteAllHouseholderData = () => {
    Alert.alert(
      i18n.t('dataProtectionDeleteAllTitle'),
      i18n.t('dataProtectionDeleteAllDesc'),
      [
        { text: i18n.t('cancel'), style: 'cancel' },
        {
          text: i18n.t('delete'),
          style: 'destructive',
          onPress: () => {
            const { contacts, visits } = deleteAllHouseholderData()
            Alert.alert(
              i18n.t('dataProtectionDeleteAllDoneTitle'),
              i18n.t('dataProtectionDeleteAllDoneDesc', { contacts, visits })
            )
          },
        },
      ]
    )
  }

  // Turning the mode on is always safe; turning it off re-exposes householder
  // fields and features, so confirm first.
  const handleDataProtectionToggle = (value: boolean) => {
    if (value) {
      set({ dataProtectionMode: true, dataProtectionModeSetByUser: true })
      return
    }
    Alert.alert(
      i18n.t('dataProtectionTurnOffTitle'),
      i18n.t('dataProtectionTurnOffDesc'),
      [
        { text: i18n.t('cancel'), style: 'cancel' },
        {
          text: i18n.t('dataProtectionTurnOffAction'),
          style: 'destructive',
          onPress: () =>
            set({
              dataProtectionMode: false,
              dataProtectionModeSetByUser: true,
            }),
        },
      ]
    )
  }

  return (
    <View style={{ gap: 30 }}>
      <View style={{ gap: 5 }}>
        <SectionTitle text={i18n.t('dataProtectionTitle')} alignWithIcons />
        <Section>
          <InputRowContainer
            leftIcon={ShieldCheckIcon}
            label={i18n.t('dataProtectionSwitchLabel')}
            info={i18n.t('dataProtectionInfoDesc')}
            controlWidth='auto'
            lastInSection={!dataProtectionMode}
            style={{ justifyContent: 'space-between' }}
          >
            <Switch
              accessibilityLabel={i18n.t('dataProtectionSwitchLabel')}
              value={dataProtectionMode}
              onValueChange={handleDataProtectionToggle}
            />
          </InputRowContainer>
          {dataProtectionMode && (
            <InputRowButton
              leftIcon={Trash2Icon}
              leftIconColor={theme.colors.error}
              label={i18n.t('dataProtectionDeleteAll')}
              onPress={handleDeleteAllHouseholderData}
              lastInSection
            />
          )}
        </Section>
      </View>
      <Section>
        <InputRowSwitch
          label={i18n.t('anonymousAnalytics')}
          description={i18n.t('anonymousAnalyticsDesc')}
          value={analyticsEnabled}
          onValueChange={(value) => set({ analyticsEnabled: value })}
          lastInSection
        />
      </Section>
    </View>
  )
}

export default PrivacyPreferencesSection
