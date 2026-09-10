import { View } from 'react-native'
import Section from '@/components/ui/inputs/Section'
import { usePreferences } from '@/stores/preferences'
import InputRowContainer from '@/components/ui/inputs/InputRowContainer'
import InputRowSwitch from '@/components/ui/inputs/InputRowSwitch'
import i18n from '@/lib/locales'
import Select from '@/components/ui/Select'

const RemindMeAboutBackups = () => {
  const { remindMeAboutBackups, set } = usePreferences()

  return (
    <InputRowSwitch
      label={i18n.t('remindMeToBackup')}
      value={remindMeAboutBackups}
      onValueChange={(value) => set({ remindMeAboutBackups: value })}
    />
  )
}

const ReminderFrequency = () => {
  const { backupNotificationFrequencyAsDays, set } = usePreferences()

  const options = Array.from({ length: 365 }, (_, i) => i + 1).map((_, i) => ({
    label: `${i + 1}`,
    value: i + 1,
  }))

  return (
    <InputRowContainer
      label={i18n.t('daysSinceLastBackup')}
      controlStyle={{ width: 80, flexShrink: 0 }}
      description={i18n.t('daysSinceLastBackup_description')}
      lastInSection
    >
      <Select
        data={options}
        value={backupNotificationFrequencyAsDays}
        onChange={({ value }) =>
          set({ backupNotificationFrequencyAsDays: value })
        }
      />
    </InputRowContainer>
  )
}

const BackupsPreferencesSection = () => {
  return (
    <View style={{ gap: 3 }}>
      <Section>
        <RemindMeAboutBackups />
        <ReminderFrequency />
      </Section>
    </View>
  )
}

export default BackupsPreferencesSection
