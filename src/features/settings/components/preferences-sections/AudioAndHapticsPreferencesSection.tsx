import { View } from 'react-native'
import i18n from '@/lib/locales'
import Section from '@/components/ui/inputs/Section'
import InputRowSwitch from '@/components/ui/inputs/InputRowSwitch'
import { usePreferences } from '@/stores/preferences'

const AudioAndHapticsPreferencesSection = () => {
  const { audioEnabled, set } = usePreferences()

  return (
    <View style={{ gap: 3 }}>
      <Section>
        <InputRowSwitch
          label={i18n.t('playSounds')}
          description={i18n.t('playSounds_description')}
          value={audioEnabled}
          onValueChange={(value) => set({ audioEnabled: value })}
          lastInSection
        />
      </Section>
    </View>
  )
}

export default AudioAndHapticsPreferencesSection
