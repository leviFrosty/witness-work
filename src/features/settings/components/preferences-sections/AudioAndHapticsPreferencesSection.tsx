import { Platform, View } from 'react-native'
import i18n, { type TranslationKey } from '@/lib/locales'
import { hasCapability } from '@/lib/platformCapabilities'
import Section from '@/components/ui/inputs/Section'
import InputRowSwitch from '@/components/ui/inputs/InputRowSwitch'
import { usePreferences } from '@/stores/preferences'

const AudioAndHapticsPreferencesSection = () => {
  const { audioEnabled, hapticsEnabled, set } = usePreferences()

  return (
    <View style={{ gap: 3 }}>
      <Section>
        <InputRowSwitch
          label={i18n.t('playSounds')}
          info={i18n.t(
            Platform.select<TranslationKey>({
              android: 'playSounds_descriptionAndroid',
              web: 'playSounds_descriptionWeb',
              default: 'playSounds_description',
            })
          )}
          value={audioEnabled}
          onValueChange={(value) => set({ audioEnabled: value })}
          lastInSection={!hasCapability('haptics')}
        />
        {hasCapability('haptics') && (
          <InputRowSwitch
            label={i18n.t('haptics')}
            info={i18n.t('haptics_description')}
            value={hapticsEnabled}
            onValueChange={(value) => set({ hapticsEnabled: value })}
            lastInSection
          />
        )}
      </Section>
    </View>
  )
}

export default AudioAndHapticsPreferencesSection
