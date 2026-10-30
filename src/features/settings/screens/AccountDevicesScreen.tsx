import { useEffect, useRef, useState } from 'react'
import { Alert, Platform, RefreshControl, ScrollView, View } from 'react-native'
import { useIsFocused, useNavigation } from '@react-navigation/native'
import moment from 'moment'
import {
  Globe as GlobeIcon,
  Monitor as MonitorIcon,
  MonitorSmartphone as MonitorSmartphoneIcon,
  Smartphone as SmartphoneIcon,
  Tablet as TabletIcon,
} from 'lucide-react-native'
import type { AppIcon } from '@/components/ui/LucideIcon'
import useTheme from '@/contexts/theme'
import Wrapper from '@/components/ui/layout/Wrapper'
import Section from '@/components/ui/inputs/Section'
import InputRowButton from '@/components/ui/inputs/InputRowButton'
import SettingsInputLayout from '@/features/settings/components/shared/SettingsInputLayout'
import SectionTitle from '@/features/settings/components/shared/SectionTitle'
import SectionFooter from '@/features/settings/components/account/SectionFooter'
import LoadStatus from '@/features/settings/components/account/activity/LoadStatus'
import {
  type DeviceKind,
  deviceKind,
  deviceTitle,
} from '@/features/settings/components/account/activity/activityCopy'
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
import { addForegroundListener } from '@/lib/appLifecycle'
import { addReconnectListener } from '@/lib/http/online'
import {
  formatDate,
  formatMonthDayCompact,
  formatRelative,
  formatTime,
} from '@/lib/dates'
import i18n from '@/lib/locales'
import { logger } from '@/lib/logger'
import type { RootStackNavigation } from '@/types/rootStack'

type Loaded = { devices: AccountDevice[]; context: AccountActivityContext }

const ICONS: Record<DeviceKind, AppIcon> = {
  phone: SmartphoneIcon,
  tablet: TabletIcon,
  computer: MonitorIcon,
  browser: GlobeIcon,
  unknown: MonitorSmartphoneIcon,
}

/** "Oct 18", with the year when it isn't this one. */
const signInDay = (at: number) =>
  moment(at).isSame(moment(), 'year')
    ? formatMonthDayCompact(moment(at))
    : formatDate(at, { style: 'medium' })

/**
 * When a device signed in: its day, and the time too when another row with the
 * same name signed in that day (a phone wiped or reinstalled), so the two can
 * be told apart.
 */
function signedIn(
  device: AccountDevice,
  devices: { device: AccountDevice; name: string }[],
  name: string
): string {
  const day = signInDay(device.createdAt)
  const sameDay = devices.some(
    (other) =>
      other.device.sessionId !== device.sessionId &&
      other.name === name &&
      signInDay(other.device.createdAt) === day
  )
  return sameDay
    ? i18n.t('accountDevices_signedInAt', {
        date: day,
        time: formatTime(device.createdAt),
      })
    : i18n.t('accountDevices_signedIn', { date: day })
}

/**
 * Settings → Account → Signed-In Devices (ADR 0028): the account's live
 * sessions, this device first, each other one signable out. Names come from the
 * sealed labels, opened here. Lists again on focus, on returning to the app,
 * and on pull to refresh, so a device signed out elsewhere drops off.
 */
const AccountDevicesScreen = () => {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [loading, setLoading] = useState(true)
  const [failure, setFailure] = useState<LoadFailure | null>(null)
  // Pull to refresh, until its listing is in.
  const [refreshing, setRefreshing] = useState(false)
  // Bumped to list again: after a sign-out, Try Again, pull to refresh, or a
  // return to the app.
  const [reloads, setReloads] = useState(0)
  const focused = useIsFocused()
  const latest = useRef(0)
  const reported = useRef(false)

  // Lists the devices each time the screen comes into focus.
  useEffect(() => {
    if (!focused) return
    const run = ++latest.current
    setLoading(true)
    loadAccountDevices()
      .then((next) => {
        if (run !== latest.current) return
        setLoaded(next)
        setFailure(null)
        if (!reported.current) {
          reported.current = true
          analytics.capture('account_devices_viewed', {
            devices: next.devices.length,
          })
        }
      })
      .catch((error: unknown) => {
        if (run !== latest.current) return
        logger.warn('[account] listing devices failed', error)
        setFailure(loadFailure(error))
      })
      .finally(() => {
        if (run !== latest.current) return
        setLoading(false)
        setRefreshing(false)
      })
  }, [focused, reloads])

  // Signing out happens on other devices too, while this one was away.
  useEffect(() => {
    if (!focused) return
    const reload = () => setReloads((count) => count + 1)
    const foreground = addForegroundListener(reload)
    const reconnect = addReconnectListener(reload)
    return () => {
      foreground.remove()
      reconnect.remove()
    }
  }, [focused])

  const refresh = () => setReloads((count) => count + 1)

  // A lost device may still have the key: changing it stops the old one
  // working anywhere (ADR 0039 §1).
  const offerKeyChange = () =>
    Alert.alert(
      i18n.t('accountKeyChange_afterSignOutTitle'),
      i18n.t('accountKeyChange_afterSignOutBody'),
      [
        { text: i18n.t('accountKeyChange_notNow'), style: 'cancel' },
        {
          text: i18n.t('accountKeyChange_row'),
          onPress: () =>
            navigation.navigate('Change Account Key', {
              entry: 'device_signed_out',
            }),
        },
      ]
    )

  const signOut = (device: AccountDevice, name: string) =>
    Alert.alert(
      i18n.t('accountDevices_signOutTitle', { device: name }),
      i18n.t(
        device.platform === 'web'
          ? 'accountDevices_signOutWebBody'
          : 'accountDevices_signOutBody'
      ),
      [
        { text: i18n.t('cancel'), style: 'cancel' },
        {
          text: i18n.t('accountDevices_signOut'),
          style: 'destructive',
          onPress: () =>
            void signOutAccountDevice(device.sessionId)
              .then(() => {
                analytics.capture('account_device_signed_out', {
                  outcome: 'ok',
                  platform: device.platform ?? 'unknown',
                })
                // The web needs its passkey step-up wired first.
                if (Platform.OS !== 'web') offerKeyChange()
              })
              .catch((error: unknown) => {
                logger.warn('[account] signing out a device failed', error)
                analytics.capture('account_device_signed_out', {
                  outcome: 'failed',
                  platform: device.platform ?? 'unknown',
                })
                Alert.alert(
                  i18n.t('accountDevices_signOutFailedTitle'),
                  i18n.t('accountDevices_signOutFailedBody')
                )
              })
              .finally(refresh),
        },
      ]
    )

  const devices = loaded
    ? [...loaded.devices]
        .sort((a, b) => Number(b.current) - Number(a.current))
        .map((device) => ({
          device,
          name: deviceTitle(device, loaded.context),
        }))
    : []
  const showList = loaded != null && failure == null

  return (
    <SettingsInputLayout>
      <Wrapper insets='bottom'>
        <ScrollView
          contentContainerStyle={{ gap: 30, paddingTop: 30, paddingBottom: 30 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true)
                refresh()
              }}
              tintColor={theme.colors.accent}
            />
          }
        >
          {showList ? (
            <View style={{ gap: 5 }}>
              <SectionTitle
                text={i18n.t('accountDevices_section')}
                info={i18n.t('accountDevices_info')}
                alignWithIcons
              />
              <Section>
                {devices.map(({ device, name }, index) => {
                  return (
                    <InputRowButton
                      key={device.sessionId}
                      leftIcon={ICONS[deviceKind(device, loaded.context)]}
                      label={name}
                      sublabel={[
                        device.current
                          ? i18n.t('accountDevices_thisDevice')
                          : i18n.t('accountDevices_lastActive', {
                              when: formatRelative(device.lastActiveAt),
                            }),
                        signedIn(device, devices, name),
                        device.platform === 'web' &&
                          device.appVersion &&
                          i18n.t('accountDevices_version', {
                            version: device.appVersion,
                          }),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                      onPress={
                        device.current ? undefined : () => signOut(device, name)
                      }
                      lastInSection={index === devices.length - 1}
                    />
                  )
                })}
              </Section>
              {devices.some(({ device }) => !device.current) && (
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
              onRetry={refresh}
            />
          )}
        </ScrollView>
      </Wrapper>
    </SettingsInputLayout>
  )
}

export default AccountDevicesScreen
