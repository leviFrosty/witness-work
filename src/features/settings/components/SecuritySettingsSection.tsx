import {
  Fingerprint as FingerprintIcon,
  Lock as LockIcon,
  ScanFace as ScanFaceIcon,
} from 'lucide-react-native'
import { Alert, Platform } from 'react-native'
import Section from '@/components/ui/inputs/Section'
import InputRowContainer from '@/components/ui/inputs/InputRowContainer'
import InputRowSelect from '@/components/ui/inputs/InputRowSelect'
import Switch from '@/components/ui/Switch'
import i18n, { type TranslationKey } from '@/lib/locales'
import { analytics } from '@/lib/analytics'
import {
  appLockRequireLabel,
  authenticateAppLock,
  getAppLockAvailability,
  openScreenLockSettings,
  type AppLockMethod,
} from '@/lib/appLock'
import { useAppLockAvailability } from '@/hooks/useAppLockAvailability'
import {
  APP_LOCK_DELAYS,
  type AppLockDelay,
  useAppLockSettings,
} from '@/stores/appLock'
import { appLockDelayLabel } from '@/features/settings/components/appLockDelayLabel'

const METHOD_ICONS = {
  faceId: ScanFaceIcon,
  touchId: FingerprintIcon,
  passcode: LockIcon,
  biometrics: FingerprintIcon,
  passkey: LockIcon,
}

const captureChange = (
  enabled: boolean,
  method: AppLockMethod,
  requireAfter: AppLockDelay
) =>
  analytics.capture('app_lock_changed', {
    enabled,
    method,
    require_after: requireAfter,
  })

const SecuritySettingsSection = () => {
  const { enabled, requireAfter, set } = useAppLockSettings()
  const availability = useAppLockAvailability()
  const method = availability?.method ?? 'passcode'
  const label = appLockRequireLabel(method)

  const handleToggle = async (value: boolean) => {
    if (value && !(await getAppLockAvailability()).available) {
      if (Platform.OS === 'android') {
        Alert.alert(
          i18n.t('appLock_unavailableTitleAndroid'),
          i18n.t('appLock_unavailableDescAndroid'),
          [
            { text: i18n.t('notNow'), style: 'cancel' },
            {
              text: i18n.t('appLock_openSettings'),
              onPress: () => void openScreenLockSettings(),
            },
          ]
        )
      } else {
        Alert.alert(
          i18n.t('appLock_unavailableTitle'),
          i18n.t('appLock_unavailableDesc')
        )
      }
      return
    }
    const result = await authenticateAppLock(
      i18n.t(value ? 'appLock_promptEnable' : 'appLock_promptDisable')
    )
    if (result !== 'success') return
    set({ enabled: value })
    captureChange(value, method, requireAfter)
  }

  return (
    <Section>
      <InputRowContainer
        leftIcon={METHOD_ICONS[method]}
        label={label}
        info={i18n.t(
          Platform.select<TranslationKey>({
            android: 'appLock_infoAndroid',
            default: 'appLock_info',
          })
        )}
        controlWidth='auto'
        lastInSection={!enabled}
        style={{ justifyContent: 'space-between' }}
      >
        <Switch
          accessibilityLabel={label}
          value={enabled}
          disabled={!availability}
          onValueChange={handleToggle}
        />
      </InputRowContainer>
      {enabled && (
        <InputRowSelect
          label={i18n.t('appLock_requireAfter')}
          lastInSection
          selectProps={{
            data: APP_LOCK_DELAYS.map((value) => ({
              value,
              label: appLockDelayLabel(value),
            })),
            value: requireAfter,
            onChange: ({ value }) => {
              set({ requireAfter: value })
              captureChange(true, method, value)
            },
          }}
        />
      )}
    </Section>
  )
}

export default SecuritySettingsSection
