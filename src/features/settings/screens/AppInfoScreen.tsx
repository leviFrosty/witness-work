import { useEffect, useRef, useState } from 'react'
import { Image, Platform, Pressable, View } from 'react-native'
import Constants from 'expo-constants'
import * as Application from 'expo-application'
import * as Clipboard from 'expo-clipboard'
import * as Device from 'expo-device'
import moment from 'moment'
import Purchases from 'react-native-purchases'
import {
  CircleCheck as CircleCheckIcon,
  Cloud as CloudIcon,
  Copy as CopyIcon,
  GitCommitHorizontal as GitCommitIcon,
  Package as PackageIcon,
  Smartphone as SmartphoneIcon,
  UserRound as UserRoundIcon,
  Wallet as WalletIcon,
} from 'lucide-react-native'
import {
  GroupedList,
  GroupedListRow,
  GroupedListSection,
} from '@/components/ui/GroupedList'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import apis from '@/constants/apis'
import useTheme from '@/contexts/theme'
import { analytics } from '@/lib/analytics'
import { deviceName } from '@/lib/devicePlatform'
import { errorTracking } from '@/lib/errorTracking'
import Haptics from '@/lib/haptics'
import { hotUpdater } from '@/lib/hotUpdater'
import { request } from '@/lib/http/request'
import i18n from '@/lib/locales'
import { cachedServerAccount } from '@/lib/serverAccount'
import { usePreferences } from '@/stores/preferences'
import { toast } from '@/stores/toasts'

const APP_ICON = require('@/assets/icon.png')

const DEBUG_TAPS = 7
const DEBUG_TAP_WINDOW_MS = 1500

type CopyItem = 'account_id' | 'purchases_id' | 'all' | 'other'

type ServerVersion =
  | { state: 'checking' }
  | { state: 'unavailable' }
  | { state: 'ready'; version: string; deployedAt: string | null }

type HealthResponse = {
  versionId?: string
  versionTag?: string
  deployedAt?: string
}

const appVersion = Constants.expoConfig?.version ?? null
const buildNumber = Application.nativeBuildVersion
const commit =
  process.env.EXPO_PUBLIC_COMMIT_HASH ??
  Constants.expoConfig?.extra?.commitHash ??
  null
const serverHost = new URL(apis.apiHealth).host

const versionText = () =>
  !appVersion
    ? i18n.t('versionUnknown')
    : buildNumber
      ? i18n.t('appInfo_version', { version: appVersion, build: buildNumber })
      : i18n.t('appInfo_versionNoBuild', { version: appVersion })

const updateBundle = (): string | null => {
  if (Platform.OS === 'web') return null
  const bundleId = hotUpdater.getBundleId()
  return 'getMinBundleId' in hotUpdater &&
    bundleId === hotUpdater.getMinBundleId()
    ? i18n.t('appInfo_builtIn')
    : bundleId
}

const systemText = () =>
  Platform.OS === 'web'
    ? deviceName()
    : `${Device.osName ?? Platform.OS} ${Device.osVersion ?? Platform.Version}`

function useServerVersion(): ServerVersion {
  const [server, setServer] = useState<ServerVersion>({ state: 'checking' })
  useEffect(() => {
    let cancelled = false
    request<HealthResponse>({ url: apis.apiHealth, timeoutMs: 10_000 })
      .then(({ data }) => {
        const version = data.versionTag ?? data.versionId?.slice(0, 8)
        if (cancelled) return
        setServer(
          version
            ? { state: 'ready', version, deployedAt: data.deployedAt ?? null }
            : { state: 'unavailable' }
        )
      })
      .catch(() => {
        if (!cancelled) setServer({ state: 'unavailable' })
      })
    return () => {
      cancelled = true
    }
  }, [])
  return server
}

function usePurchasesId(): string | null {
  const [id, setId] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    Purchases.getAppUserID()
      .then((value) => {
        if (!cancelled) setId(value)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])
  return id
}

function AppInfoHeader() {
  const theme = useTheme()
  const developerTools = usePreferences((s) => s.developerTools)
  const set = usePreferences((s) => s.set)
  const taps = useRef({ count: 0, last: 0 })

  const onVersionPress = () => {
    const now = Date.now()
    const { count, last } = taps.current
    const next = now - last > DEBUG_TAP_WINDOW_MS ? 1 : count + 1
    taps.current = { count: next >= DEBUG_TAPS ? 0 : next, last: now }
    if (next < DEBUG_TAPS) return
    set({ developerTools: !usePreferences.getState().developerTools })
    Haptics.success()
  }

  return (
    <View style={{ alignItems: 'center', gap: 4, paddingTop: 8 }}>
      <View
        style={{
          borderRadius: 20,
          borderCurve: 'continuous',
          overflow: 'hidden',
          marginBottom: 8,
        }}
      >
        <Image
          source={APP_ICON}
          accessibilityIgnoresInvertColors
          style={{ width: 88, height: 88 }}
        />
      </View>
      <Text
        accessibilityRole='header'
        style={{
          fontFamily: theme.fonts.semiBold,
          fontSize: theme.fontSize('xl'),
          color: theme.colors.text,
        }}
      >
        {i18n.t('witnessWork')}
      </Text>
      <Pressable
        testID='app-info-version'
        onPress={onVersionPress}
        accessibilityLabel={
          developerTools
            ? `${versionText()}, ${i18n.t('appInfo_debuggingOn')}`
            : versionText()
        }
        style={{
          minHeight: 44,
          paddingHorizontal: 12,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <Text
          style={{
            color: theme.colors.textAlt,
            fontSize: theme.fontSize('sm'),
          }}
        >
          {versionText()}
        </Text>
        {developerTools ? (
          <LucideIcon
            icon={CircleCheckIcon}
            size={theme.fontSize('sm')}
            color={theme.colors.accent}
          />
        ) : null}
      </Pressable>
    </View>
  )
}

export default function AppInfoScreen() {
  const theme = useTheme()
  const server = useServerVersion()
  const purchasesId = usePurchasesId()
  const accountId = cachedServerAccount()?.accountId ?? null
  const bundle = updateBundle()

  const serverText =
    server.state === 'ready'
      ? server.version
      : i18n.t(
          server.state === 'checking'
            ? 'appInfo_checking'
            : 'appInfo_unavailable'
        )
  const serverDetail =
    server.state === 'ready' && server.deployedAt
      ? `${serverHost} · ${moment(server.deployedAt).format('ll')}`
      : serverHost

  const copy = async (value: string, item: CopyItem) => {
    try {
      await Clipboard.setStringAsync(value)
      toast.success(i18n.t('copied'))
      analytics.capture('app_info_copied', { item })
    } catch (error) {
      errorTracking.captureException(error)
      toast.error(i18n.t('appInfo_copyFailed'))
    }
  }

  const lines: [string, string | null][] = [
    [i18n.t('witnessWork'), versionText()],
    [i18n.t('appInfo_commit'), commit],
    [i18n.t('appInfo_update'), bundle],
    [i18n.t('appInfo_system'), systemText()],
    [i18n.t('appInfo_device'), deviceName()],
    [i18n.t('appInfo_server'), `${serverText} (${serverDetail})`],
    [i18n.t('appInfo_accountId'), accountId],
    [i18n.t('appInfo_purchasesId'), purchasesId],
  ]
  const allDetails = lines
    .filter((line): line is [string, string] => line[1] != null)
    .map(([label, value]) => `${label}: ${value}`)
    .join('\n')

  const value = (text: string) => (
    <Text style={{ color: theme.colors.textAlt }}>{text}</Text>
  )

  return (
    <GroupedList testID='app-info' header={<AppInfoHeader />}>
      <GroupedListSection title={i18n.t('appInfo_versions')}>
        {commit ? (
          <GroupedListRow
            icon={GitCommitIcon}
            label={i18n.t('appInfo_commit')}
            trailing={value(commit)}
            accessory='none'
            onPress={() => copy(commit, 'other')}
          />
        ) : null}
        {bundle ? (
          <GroupedListRow
            icon={PackageIcon}
            label={i18n.t('appInfo_update')}
            sublabel={bundle}
            trailing={value(hotUpdater.getChannel())}
            accessory='none'
            onPress={() => copy(bundle, 'other')}
          />
        ) : null}
        <GroupedListRow
          icon={SmartphoneIcon}
          label={i18n.t('appInfo_system')}
          sublabel={deviceName()}
          trailing={value(systemText())}
          accessory='none'
          onPress={() => copy(`${deviceName()} · ${systemText()}`, 'other')}
        />
        <GroupedListRow
          icon={CloudIcon}
          label={i18n.t('appInfo_server')}
          sublabel={serverDetail}
          trailing={value(serverText)}
          accessory='none'
          onPress={() => copy(`${serverText} (${serverDetail})`, 'other')}
        />
      </GroupedListSection>
      <GroupedListSection title={i18n.t('account_title')}>
        <GroupedListRow
          icon={UserRoundIcon}
          label={i18n.t('appInfo_accountId')}
          sublabel={accountId ?? i18n.t('appInfo_noAccount')}
          accessory='none'
          disabled={!accountId}
          onPress={accountId ? () => copy(accountId, 'account_id') : undefined}
        />
        <GroupedListRow
          icon={WalletIcon}
          label={i18n.t('appInfo_purchasesId')}
          sublabel={purchasesId ?? i18n.t('appInfo_checking')}
          accessory='none'
          disabled={!purchasesId}
          onPress={
            purchasesId ? () => copy(purchasesId, 'purchases_id') : undefined
          }
        />
      </GroupedListSection>
      <GroupedListSection footer={i18n.t('appInfo_copyAllFooter')}>
        <GroupedListRow
          icon={CopyIcon}
          iconColor={theme.colors.accent}
          label={i18n.t('appInfo_copyAll')}
          accessory='none'
          onPress={() => copy(allDetails, 'all')}
        />
      </GroupedListSection>
    </GroupedList>
  )
}
