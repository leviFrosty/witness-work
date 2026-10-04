import { useState } from 'react'
import { ActivityIndicator, Alert, View } from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import { useToastController } from '@tamagui/toast'
import Wrapper from '@/components/ui/layout/Wrapper'
import Section from '@/components/ui/inputs/Section'
import { inputLayout } from '@/components/ui/inputs/InputLayout'
import InputRowContainer from '@/components/ui/inputs/InputRowContainer'
import InfoPopover from '@/components/ui/InfoPopover'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import IsSupporter from '@/components/IsSupporter'
import useTheme from '@/contexts/theme'
import i18n, { type TranslationKey } from '@/lib/locales'
import { analytics } from '@/lib/analytics'
import { formatRelative } from '@/lib/dates'
import {
  SyncDeviceFile,
  SyncDeviceHint,
  SyncDeviceListItem,
  isLegacySyncFilename,
  listSyncDevices,
  syncDeviceAgeBucket,
  syncDeviceHint,
} from '@/lib/syncDevices'
import { usePreferences } from '@/stores/preferences'
import { iCloudSync } from '@/app/sync/iCloudSync'
import SettingsInputLayout from '@/features/settings/components/shared/SettingsInputLayout'

const HINT_KEYS: Record<SyncDeviceHint, TranslationKey> = {
  stale: 'iCloudDeviceHint_stale',
  'newer-version': 'iCloudDeviceHint_newerVersion',
  unreadable: 'iCloudDeviceHint_unreadable',
  'pre-reset': 'iCloudDeviceHint_preReset',
  legacy: 'iCloudDeviceHint_legacy',
}

const deviceName = (device: { deviceName: string | null }) =>
  device.deviceName || i18n.t('iCloudDeviceUnknown')

/** Bounded analytics properties: never the device's id, name or filename. */
const removalProperties = (filename: string, entry: SyncDeviceFile) => ({
  status: entry.status,
  age_bucket: syncDeviceAgeBucket(entry),
  legacy: isLegacySyncFilename(filename),
})

const PreferencesiCloudDevicesScreenInner = () => {
  const theme = useTheme()
  const files = usePreferences((state) => state.iCloudSyncDevices)
  const ownDeviceId = usePreferences((state) => state.iCloudDeviceId)
  const [removing, setRemoving] = useState<string | null>(null)
  const toast = useToastController()
  const devices = listSyncDevices(files, ownDeviceId)

  const showBlocked = (
    device: SyncDeviceListItem,
    reason: 'sync-first' | 'update-app' | 'unavailable',
    entry: SyncDeviceFile
  ) => {
    analytics.capture('icloud_sync_device_remove_failed', {
      ...removalProperties(device.filename, entry),
      reason: reason.replace('-', '_'),
    })
    if (reason === 'sync-first')
      Alert.alert(
        i18n.t('iCloudDeviceSyncFirst_title'),
        i18n.t('iCloudDeviceSyncFirst_description')
      )
    else if (reason === 'update-app')
      Alert.alert(
        i18n.t('iCloudDeviceUpdateApp_title'),
        i18n.t('iCloudDeviceUpdateApp_description')
      )
    else
      Alert.alert(
        i18n.t('iCloudUnavailable_title'),
        i18n.t('iCloudUnavailable_description')
      )
  }

  const remove = async (device: SyncDeviceListItem) => {
    setRemoving(device.filename)
    try {
      const { outcome, entry } = await iCloudSync.removeSyncDevice(
        device.filename
      )
      if (outcome !== 'removed') {
        showBlocked(device, outcome, entry ?? device)
        return
      }
      analytics.capture(
        'icloud_sync_device_removed',
        removalProperties(device.filename, entry ?? device)
      )
      toast.show(i18n.t('iCloudDeviceRemoved', { name: deviceName(device) }), {
        native: true,
      })
    } catch {
      analytics.capture('icloud_sync_device_remove_failed', {
        ...removalProperties(device.filename, device),
        reason: 'error',
      })
      Alert.alert(i18n.t('error'), i18n.t('iCloudDeviceRemoveFailed'))
    } finally {
      setRemoving(null)
    }
  }

  const confirmRemove = (device: SyncDeviceListItem) => {
    if (device.status === 'newer-version') {
      showBlocked(device, 'update-app', device)
      return
    }
    Alert.alert(
      i18n.t('iCloudDeviceRemoveConfirm_title', { name: deviceName(device) }),
      i18n.t('iCloudDeviceRemoveConfirm_description'),
      [
        {
          text: i18n.t('cancel'),
          style: 'cancel',
        },
        {
          text: i18n.t('remove'),
          style: 'destructive',
          onPress: () => void remove(device),
        },
      ]
    )
  }

  const describe = (device: SyncDeviceListItem) => {
    const hint = syncDeviceHint(device.filename, device)
    return [
      i18n.t('iCloudDeviceLastSynced', {
        relative: formatRelative(device.modifiedAt),
      }),
      ...(hint ? [i18n.t(HINT_KEYS[hint])] : []),
    ].join(' · ')
  }

  return (
    <Wrapper insets='bottom'>
      <KeyboardAwareScrollView
        contentContainerStyle={{ gap: 8, paddingTop: 30, paddingBottom: 30 }}
      >
        <View
          style={{
            paddingHorizontal: inputLayout.horizontalPadding,
            flexDirection: 'row',
            alignItems: 'center',
          }}
        >
          <Text
            style={{
              fontSize: theme.fontSize('md'),
              fontFamily: theme.fonts.semiBold,
              color: theme.colors.text,
            }}
          >
            {i18n.t('iCloudDevices')}
          </Text>
          <InfoPopover
            title={i18n.t('iCloudDevices')}
            description={i18n.t('iCloudDevices_description')}
          />
        </View>
        {devices.length === 0 ? (
          <Text
            style={{
              fontSize: 13,
              color: theme.colors.textAlt,
              paddingHorizontal: inputLayout.horizontalPadding,
            }}
          >
            {i18n.t('iCloudDevicesEmpty')}
          </Text>
        ) : (
          <Section>
            {devices.map((device, index) => (
              <InputRowContainer
                key={device.filename}
                label={deviceName(device)}
                description={describe(device)}
                controlWidth='auto'
                lastInSection={index === devices.length - 1}
              >
                {device.isThisDevice ? (
                  <Text style={{ color: theme.colors.textAlt }}>
                    {i18n.t('iCloudDeviceThisDevice')}
                  </Text>
                ) : removing === device.filename ? (
                  <ActivityIndicator
                    size='small'
                    color={theme.colors.textAlt}
                  />
                ) : (
                  <Button
                    noTransform
                    disabled={removing !== null}
                    onPress={() => confirmRemove(device)}
                    accessibilityLabel={i18n.t(
                      'iCloudDeviceRemoveConfirm_title',
                      { name: deviceName(device) }
                    )}
                  >
                    <Text style={{ color: theme.colors.error }}>
                      {i18n.t('remove')}
                    </Text>
                  </Button>
                )}
              </InputRowContainer>
            ))}
          </Section>
        )}
      </KeyboardAwareScrollView>
    </Wrapper>
  )
}

const PreferencesiCloudDevicesScreen = () => (
  <SettingsInputLayout>
    <IsSupporter analyticsSurface='icloud_sync' feature='iCloudSync' fill>
      <PreferencesiCloudDevicesScreenInner />
    </IsSupporter>
  </SettingsInputLayout>
)

export default PreferencesiCloudDevicesScreen
