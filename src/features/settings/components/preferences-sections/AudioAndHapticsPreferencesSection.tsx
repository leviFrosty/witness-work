import { Platform, View } from 'react-native'
import i18n from '@/lib/locales'
import Section from '@/components/ui/inputs/Section'
import InputRowSwitch from '@/components/ui/inputs/InputRowSwitch'
import { usePreferences } from '@/stores/preferences'
import SettingsSearchTarget from '@/features/settings/components/search/SettingsSearchTarget'

const AudioAndHapticsPreferencesSection = () => {
  const { audioEnabled, hapticsEnabled, set } = usePreferences()

  return (
    <View style={{ gap: 3 }}>
      <Section>
        <SettingsSearchTarget id='playSounds'>
          <InputRowSwitch
            label={i18n.t('playSounds')}
            info={i18n.t(
              Platform.OS === 'android'
                ? 'playSounds_descriptionAndroid'
                : 'playSounds_description'
            )}
            value={audioEnabled}
            onValueChange={(value) => set({ audioEnabled: value })}
          />
        </SettingsSearchTarget>
        <SettingsSearchTarget id='haptics'>
          <InputRowSwitch
            label={i18n.t('haptics')}
            info={i18n.t('haptics_description')}
            value={hapticsEnabled}
            onValueChange={(value) => set({ hapticsEnabled: value })}
            lastInSection
          />
        </SettingsSearchTarget>
      </Section>
    </View>
  )
}

export default AudioAndHapticsPreferencesSection
