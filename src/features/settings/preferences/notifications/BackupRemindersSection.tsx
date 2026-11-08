import InputRowContainer from '@/components/ui/inputs/InputRowContainer'
import InputRowSwitch from '@/components/ui/inputs/InputRowSwitch'
import Select from '@/components/ui/Select'
import i18n from '@/lib/locales'
import { usePreferences } from '@/stores/preferences'
import SettingsSearchTarget from '@/features/settings/components/search/SettingsSearchTarget'
import SettingsGroup from '@/features/settings/components/shared/SettingsGroup'

const frequencyOptions = Array.from({ length: 365 }, (_, index) => ({
  label: `${index + 1}`,
  value: index + 1,
}))

export default function BackupRemindersSection() {
  const remindMeAboutBackups = usePreferences((s) => s.remindMeAboutBackups)
  const frequency = usePreferences((s) => s.backupNotificationFrequencyAsDays)
  const set = usePreferences((s) => s.set)

  return (
    <SettingsGroup title={i18n.t('backups')}>
      <SettingsSearchTarget id='backupReminder'>
        <InputRowSwitch
          label={i18n.t('remindMeToBackup')}
          value={remindMeAboutBackups}
          onValueChange={(value) => set({ remindMeAboutBackups: value })}
          lastInSection={!remindMeAboutBackups}
        />
      </SettingsSearchTarget>
      {remindMeAboutBackups && (
        <InputRowContainer
          label={i18n.t('daysSinceLastBackup')}
          controlStyle={{ width: 'auto', minWidth: 80, flexShrink: 0 }}
          description={i18n.t('daysSinceLastBackup_description')}
          lastInSection
        >
          <Select
            data={frequencyOptions}
            value={frequency}
            onChange={({ value }) =>
              set({ backupNotificationFrequencyAsDays: value })
            }
          />
        </InputRowContainer>
      )}
    </SettingsGroup>
  )
}
