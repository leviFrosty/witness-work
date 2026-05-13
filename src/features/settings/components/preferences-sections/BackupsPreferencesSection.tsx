import { Switch, View } from 'react-native'
import Section from '../../../../components/inputs/Section'
import { usePreferences } from '../../../../stores/preferences'
import InputRowContainer from '../../../../components/inputs/InputRowContainer'
import i18n from '../../../../lib/locales'
import Select from '../../../../components/Select'
import Text from '../../../../components/MyText'
import XView from '../../../../components/layout/XView'
import useTheme from '../../../../contexts/theme'

const RemindMeAboutBackups = () => {
  const { remindMeAboutBackups, set } = usePreferences()

  return (
    <InputRowContainer
      label={i18n.t('remindMeToBackup')}
      style={{ justifyContent: 'space-between' }}
    >
      <Switch
        value={remindMeAboutBackups}
        onValueChange={(value) => set({ remindMeAboutBackups: value })}
      />
    </InputRowContainer>
  )
}

const ReminderFrequency = () => {
  const { backupNotificationFrequencyAsDays, set } = usePreferences()
  const theme = useTheme()

  const options = Array.from({ length: 365 }, (_, i) => i + 1).map((_, i) => ({
    label: `${i + 1}`,
    value: i + 1,
  }))

  return (
    <InputRowContainer
      style={{
        flexDirection: 'column',
        gap: 10,
        alignItems: 'flex-start',
      }}
      lastInSection
    >
      <XView
        style={{ width: '100%', justifyContent: 'space-between', gap: 20 }}
      >
        <Text>{i18n.t('daysSinceLastBackup')}</Text>
        <View style={{ flex: 1 }}>
          <Select
            data={options}
            value={backupNotificationFrequencyAsDays}
            onChange={({ value }) =>
              set({ backupNotificationFrequencyAsDays: value })
            }
          />
        </View>
      </XView>
      <Text
        style={{
          fontSize: theme.fontSize('xs'),
          color: theme.colors.textAlt,
        }}
      >
        {i18n.t('daysSinceLastBackup_description')}
      </Text>
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
