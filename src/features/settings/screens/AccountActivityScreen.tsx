import { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  View,
} from 'react-native'
import { useIsFocused } from '@react-navigation/native'
import { FlashList } from '@shopify/flash-list'
import {
  Ban as BanIcon,
  Download as DownloadIcon,
  Fingerprint as FingerprintIcon,
  KeyRound as KeyRoundIcon,
  QrCode as QrCodeIcon,
  Send as SendIcon,
  ShieldAlert as ShieldAlertIcon,
  ShieldCheck as ShieldCheckIcon,
  Trash2 as Trash2Icon,
  UserPlus as UserPlusIcon,
  Users as UsersIcon,
  UserX as UserXIcon,
} from 'lucide-react-native'
import type { AppIcon } from '@/components/ui/LucideIcon'
import { LogInIcon, LogOutIcon } from '@/components/ui/DirectionalIcon'
import Wrapper from '@/components/ui/layout/Wrapper'
import Section from '@/components/ui/inputs/Section'
import InputRowButton from '@/components/ui/inputs/InputRowButton'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import SettingsInputLayout from '@/features/settings/components/shared/SettingsInputLayout'
import LoadStatus from '@/features/settings/components/account/activity/LoadStatus'
import {
  activityDetail,
  activityRows,
  activityTitle,
  isSuspiciousActivity,
} from '@/features/settings/components/account/activity/activityCopy'
import {
  type LoadFailure,
  loadFailure,
} from '@/features/settings/components/account/activity/loadState'
import {
  type AccountActivityContext,
  loadAccountActivity,
} from '@/app/account/accountActivity'
import type {
  ActivityEntry,
  ActivityKind,
} from '@/lib/serverAccount/activityClient'
import { analytics } from '@/lib/analytics'
import { addForegroundListener } from '@/lib/appLifecycle'
import { addReconnectListener } from '@/lib/http/online'
import { formatDateTime } from '@/lib/dates'
import i18n from '@/lib/locales'
import { logger } from '@/lib/logger'

const ICONS: Record<ActivityKind, AppIcon> = {
  'account.created': UserPlusIcon,
  'session.opened': LogInIcon,
  'session.signed_out': LogOutIcon,
  'session.revoked': LogOutIcon,
  'session.replaced': LogOutIcon,
  'session.refresh_reused': ShieldAlertIcon,
  'handoff.sent': SendIcon,
  'backup.deleted': Trash2Icon,
  'backup.downloaded': DownloadIcon,
  'account.suspended': BanIcon,
  'account.reinstated': ShieldCheckIcon,
  'buddies.inbox_linked': UsersIcon,
  'buddies.deleted': UserXIcon,
  'passkey.added': FingerprintIcon,
  'passkey.removed': FingerprintIcon,
  'device.approved': QrCodeIcon,
  'account.key_changed': KeyRoundIcon,
}

type Loaded = {
  entries: ActivityEntry[]
  nextCursor: string | null
  context: AccountActivityContext
}

/**
 * Settings → Account → Account Activity (ADR 0028): the account's security
 * history, newest first, 50 entries a page, with device names opened from their
 * sealed labels and "this device" named as such. A reused refresh token is
 * flagged. Reads the first page again on focus, on returning to the app, and on
 * pull to refresh.
 */
const AccountActivityScreen = () => {
  const theme = useTheme()
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [loading, setLoading] = useState(true)
  const [failure, setFailure] = useState<LoadFailure | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [moreFailed, setMoreFailed] = useState(false)
  // Pull to refresh, until its first page is in.
  const [refreshing, setRefreshing] = useState(false)
  // Bumped to read the first page again: Try Again, pull to refresh, or a
  // return to the app.
  const [reloads, setReloads] = useState(0)
  const focused = useIsFocused()
  const latest = useRef(0)
  const reported = useRef(false)

  useEffect(() => {
    if (!focused) return
    const run = ++latest.current
    setLoading(true)
    loadAccountActivity(null)
      .then((page) => {
        if (run !== latest.current) return
        setLoaded(page)
        setFailure(null)
        setMoreFailed(false)
        if (!reported.current) {
          reported.current = true
          analytics.capture('account_activity_viewed', {
            entries: page.entries.length,
            suspicious: page.entries.some(isSuspiciousActivity),
          })
        }
      })
      .catch((error: unknown) => {
        if (run !== latest.current) return
        logger.warn('[account] reading activity failed', error)
        setFailure(loadFailure(error))
      })
      .finally(() => {
        if (run !== latest.current) return
        setLoading(false)
        setRefreshing(false)
      })
  }, [focused, reloads])

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

  const refreshControl = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true)
        setReloads((count) => count + 1)
      }}
      tintColor={theme.colors.accent}
    />
  )

  // Promise chains, not try/finally, which React Compiler can't compile yet.
  const loadMore = ({ retry = false } = {}) => {
    if (!loaded?.nextCursor || loadingMore || (moreFailed && !retry)) return
    setMoreFailed(false)
    const run = latest.current
    setLoadingMore(true)
    loadAccountActivity(loaded.nextCursor)
      .then((page) => {
        if (run !== latest.current) return
        setLoaded({
          entries: [...loaded.entries, ...page.entries],
          nextCursor: page.nextCursor,
          context: page.context,
        })
      })
      .catch((error: unknown) => {
        logger.warn('[account] reading older activity failed', error)
        if (run === latest.current) setMoreFailed(true)
      })
      .finally(() => {
        if (run === latest.current) setLoadingMore(false)
      })
  }

  const sublabel = (entry: ActivityEntry) => {
    const when = formatDateTime(entry.createdAt, { style: 'medium' })
    const detail = activityDetail(entry)
    return detail ? `${when}\n${detail}` : when
  }

  if (!loaded || failure)
    return (
      <SettingsInputLayout>
        <Wrapper insets='bottom'>
          <View style={{ paddingTop: 30 }}>
            <LoadStatus
              loading={loading}
              message={
                failure === 'offline'
                  ? i18n.t('accountActivity_offline')
                  : i18n.t('accountActivity_loadFailed')
              }
              onRetry={() => setReloads((count) => count + 1)}
            />
          </View>
        </Wrapper>
      </SettingsInputLayout>
    )

  const { entries, context } = loaded
  const rows = activityRows(entries)
  return (
    <SettingsInputLayout>
      <Wrapper insets='bottom'>
        {entries.length === 0 ? (
          <ScrollView refreshControl={refreshControl}>
            <Text
              style={{
                color: theme.colors.textAlt,
                textAlign: 'center',
                paddingTop: 30,
              }}
            >
              {i18n.t('accountActivity_empty')}
            </Text>
          </ScrollView>
        ) : (
          <Section
            animateRows={false}
            style={{ flex: 1, marginTop: 30, marginBottom: 16 }}
          >
            <FlashList
              data={rows}
              keyExtractor={(row) => row.entry.id}
              onEndReached={() => loadMore()}
              onEndReachedThreshold={0.5}
              refreshControl={refreshControl}
              renderItem={({ item: { entry, count }, index }) => {
                const suspicious = isSuspiciousActivity(entry)
                return (
                  <InputRowButton
                    leftIcon={ICONS[entry.kind]}
                    leftIconColor={suspicious ? theme.colors.error : undefined}
                    label={activityTitle(entry, context, count)}
                    sublabel={sublabel(entry)}
                    lastInSection={
                      index === rows.length - 1 && !loaded.nextCursor
                    }
                  />
                )
              }}
              ListFooterComponent={
                loaded.nextCursor ? (
                  moreFailed ? (
                    <InputRowButton
                      label={i18n.t('accountActivity_loadMoreFailed')}
                      sublabel={i18n.t('accountActivity_retry')}
                      onPress={() => loadMore({ retry: true })}
                      lastInSection
                    />
                  ) : (
                    <View style={{ paddingVertical: 16 }}>
                      <ActivityIndicator color={theme.colors.textAlt} />
                    </View>
                  )
                ) : null
              }
            />
          </Section>
        )}
      </Wrapper>
    </SettingsInputLayout>
  )
}

export default AccountActivityScreen
