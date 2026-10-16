import { useCallback, useRef, useState } from 'react'
import { Alert, ScrollView, View } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import {
  Monitor as MonitorIcon,
  Smartphone as SmartphoneIcon,
} from 'lucide-react-native'
import Wrapper from '@/components/ui/layout/Wrapper'
import Section from '@/components/ui/inputs/Section'
import InputRowButton from '@/components/ui/inputs/InputRowButton'
import SettingsInputLayout from '@/features/settings/components/shared/SettingsInputLayout'
import SectionTitle from '@/features/settings/components/shared/SectionTitle'
import SectionFooter from '@/features/settings/components/account/SectionFooter'
import LoadStatus from '@/features/settings/components/account/activity/LoadStatus'
import { deviceTitle } from '@/features/settings/components/account/activity/activityCopy'
import {
  type LoadFailure,
  loadFailure,
} from '@/features/settings/components/account/activity/loadState'
import {
  type AccountActivityContext,
  loadAccountDevices,
  signOutAccountDevice,
} from '@/app/account/accountActivity'
import type { AccountDevice } from '@/lib/serverAccount/activityClient'
import { analytics } from '@/lib/analytics'
import { formatRelative } from '@/lib/dates'
import i18n from '@/lib/locales'
import { logger } from '@/lib/logger'

type Loaded = { devices: AccountDevice[]; context: AccountActivityContext }

/**
 * Settings → Account → Signed-In Devices (ADR 0028): the account's live
 * sessions, this device first, each other one signable out. Names come from the
 * sealed labels, opened here.
 */
const AccountDevicesScreen = () => {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [loading, setLoading] = useState(true)
  const [failure, setFailure] = useState<LoadFailure | null>(null)
  const latest = useRef(0)
  const reported = useRef(false)

  // Memoized for useFocusEffect, which re-runs whenever its callback changes.
  const refresh = useCallback(async () => {
    const run = ++latest.current
    setLoading(true)
    try {
      const next = await loadAccountDevices()
      if (run !== latest.current) return
      setLoaded(next)
      setFailure(null)
      if (!reported.current) {
        reported.current = true
        analytics.capture('account_devices_viewed', {
          devices: next.devices.length,
        })
      }
    } catch (error) {
      if (run !== latest.current) return
      logger.warn('[account] listing devices failed', error)
      setFailure(loadFailure(error))
    } finally {
      if (run === latest.current) setLoading(false)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      void refresh()
    }, [refresh])
  )

  const signOut = (device: AccountDevice, name: string) =>
    Alert.alert(
      i18n.t('accountDevices_signOutTitle', { device: name }),
      i18n.t('accountDevices_signOutBody'),
      [
        { text: i18n.t('cancel'), style: 'cancel' },
        {
          text: i18n.t('accountDevices_signOut'),
          style: 'destructive',
          onPress: () =>
            void signOutAccountDevice(device.sessionId)
              .then(() =>
                analytics.capture('account_device_signed_out', {
                  outcome: 'ok',
                  platform: device.platform,
                })
              )
              .catch((error: unknown) => {
                logger.warn('[account] signing out a device failed', error)
                analytics.capture('account_device_signed_out', {
                  outcome: 'failed',
                  platform: device.platform,
                })
                Alert.alert(
                  i18n.t('accountDevices_signOutFailedTitle'),
                  i18n.t('accountDevices_signOutFailedBody')
                )
              })
              .finally(() => void refresh()),
        },
      ]
    )

  const devices = loaded
    ? [...loaded.devices].sort((a, b) => Number(b.current) - Number(a.current))
    : []
  const showList = loaded != null && failure == null

  return (
    <SettingsInputLayout>
      <Wrapper insets='bottom'>
        <ScrollView
          contentContainerStyle={{ gap: 30, paddingTop: 30, paddingBottom: 30 }}
        >
          {showList ? (
            <View style={{ gap: 5 }}>
              <SectionTitle
                text={i18n.t('accountDevices_section')}
                info={i18n.t('accountDevices_info')}
                alignWithIcons
              />
              <Section>
                {devices.map((device, index) => {
                  const name = deviceTitle(device, loaded.context)
                  return (
                    <InputRowButton
                      key={device.sessionId}
                      leftIcon={
                        (loaded.context.readLabel(device.device)?.platform ??
                          device.platform) === 'dev'
                          ? MonitorIcon
                          : SmartphoneIcon
                      }
                      label={name}
                      sublabel={
                        device.current
                          ? i18n.t('accountDevices_thisDevice')
                          : i18n.t('accountDevices_lastActive', {
                              when: formatRelative(device.lastActiveAt),
                            })
                      }
                      onPress={
                        device.current ? undefined : () => signOut(device, name)
                      }
                      lastInSection={index === devices.length - 1}
                    />
                  )
                })}
              </Section>
              {devices.some((device) => !device.current) && (
                <SectionFooter text={i18n.t('accountDevices_footer')} />
              )}
            </View>
          ) : (
            <LoadStatus
              loading={loading && loaded == null}
              message={
                failure === 'offline'
                  ? i18n.t('accountDevices_offline')
                  : failure
                    ? i18n.t('accountDevices_loadFailed')
                    : null
              }
              onRetry={() => void refresh()}
            />
          )}
        </ScrollView>
      </Wrapper>
    </SettingsInputLayout>
  )
}

export default AccountDevicesScreen
