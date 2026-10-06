import { Bug as BugIcon } from 'lucide-react-native'
import { View } from 'react-native'
import i18n from '@/lib/locales'
import Section from '@/components/ui/inputs/Section'
import InputRowContainer from '@/components/ui/inputs/InputRowContainer'
import Switch from '@/components/ui/Switch'
import SectionTitle from '@/features/settings/components/shared/SectionTitle'
import { usePreferences } from '@/stores/preferences'

const AdvancedSection = () => {
  const developerTools = usePreferences((s) => s.developerTools)
  const set = usePreferences((s) => s.set)

  return (
    <View style={{ gap: 3 }}>
      <SectionTitle alignWithIcons text={i18n.t('advanced')} />

      <Section>
        <InputRowContainer
          leftIcon={BugIcon}
          label={i18n.t('developerTools')}
          info={i18n.t('developerTools_info')}
          controlStyle={{ width: 'auto', flexShrink: 0 }}
          style={{ justifyContent: 'space-between' }}
          lastInSection
        >
          <Switch
            accessibilityLabel={i18n.t('developerTools')}
            value={developerTools}
            onValueChange={(value) => set({ developerTools: value })}
          />
        </InputRowContainer>
      </Section>
    </View>
  )
}

export default AdvancedSection
