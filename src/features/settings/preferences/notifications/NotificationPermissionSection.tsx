import InputRowButton from '@/components/ui/inputs/InputRowButton'
import i18n from '@/lib/locales'
import { openAppSettings } from '@/lib/openAppSettings'
import useNotificationPermission from '@/features/buddies/hooks/useNotificationPermission'
import SettingsGroup from '@/features/settings/components/shared/SettingsGroup'
import SettingsRowValue from '@/features/settings/components/shared/SettingsRowValue'

export default function NotificationPermissionSection() {
  const { granted, turnOn } = useNotificationPermission()

  return (
    <SettingsGroup>
      <InputRowButton
        wrapValue
        label={i18n.t('allowNotifications')}
        sublabel={
          granted === false ? i18n.t('notificationSettings_off') : undefined
        }
        onPress={() => void (granted ? openAppSettings() : turnOn())}
        lastInSection
      >
        <SettingsRowValue
          value={
            granted === null
              ? undefined
              : i18n.t(granted ? 'settingOn' : 'settingOff')
          }
        />
      </InputRowButton>
    </SettingsGroup>
  )
}
