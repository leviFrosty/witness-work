import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, View } from 'react-native'
import { FlashList } from '@shopify/flash-list'
import {
  Ban as BanIcon,
  Download as DownloadIcon,
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
 * flagged.
 */
const AccountActivityScreen = () => {
  const theme = useTheme()
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [loading, setLoading] = useState(true)
  const [failure, setFailure] = useState<LoadFailure | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [moreFailed, setMoreFailed] = useState(false)
  const latest = useRef(0)

  const loadFirst = useCallback(async () => {
    const run = ++latest.current
    setLoading(true)
    try {
      const page = await loadAccountActivity(null)
      if (run !== latest.current) return
      setLoaded(page)
      setFailure(null)
      setMoreFailed(false)
      return page
    } catch (error) {
      if (run !== latest.current) return
      logger.warn('[account] reading activity failed', error)
      setFailure(loadFailure(error))
    } finally {
      if (run === latest.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadFirst().then((page) => {
      if (page)
        analytics.capture('account_activity_viewed', {
          entries: page.entries.length,
          suspicious: page.entries.some(isSuspiciousActivity),
        })
    })
  }, [loadFirst])

  const loadMore = async ({ retry = false } = {}) => {
    if (!loaded?.nextCursor || loadingMore || (moreFailed && !retry)) return
    setMoreFailed(false)
    const run = latest.current
    setLoadingMore(true)
    try {
      const page = await loadAccountActivity(loaded.nextCursor)
      if (run !== latest.current) return
      setLoaded({
        entries: [...loaded.entries, ...page.entries],
        nextCursor: page.nextCursor,
        context: page.context,
      })
    } catch (error) {
      logger.warn('[account] reading older activity failed', error)
      if (run === latest.current) setMoreFailed(true)
    } finally {
      if (run === latest.current) setLoadingMore(false)
    }
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
              onRetry={() => void loadFirst()}
            />
          </View>
        </Wrapper>
      </SettingsInputLayout>
    )

  const { entries, context } = loaded
  return (
    <SettingsInputLayout>
      <Wrapper insets='bottom'>
        {entries.length === 0 ? (
          <Text
            style={{
              color: theme.colors.textAlt,
              textAlign: 'center',
              paddingTop: 30,
            }}
          >
            {i18n.t('accountActivity_empty')}
          </Text>
        ) : (
          <Section
            animateRows={false}
            style={{ flex: 1, marginTop: 30, marginBottom: 16 }}
          >
            <FlashList
              data={entries}
              keyExtractor={(entry) => entry.id}
              onEndReached={() => void loadMore()}
              onEndReachedThreshold={0.5}
              renderItem={({ item, index }) => {
                const suspicious = isSuspiciousActivity(item)
                return (
                  <InputRowButton
                    leftIcon={ICONS[item.kind]}
                    leftIconColor={suspicious ? theme.colors.error : undefined}
                    label={activityTitle(item, context)}
                    sublabel={sublabel(item)}
                    lastInSection={
                      index === entries.length - 1 && !loaded.nextCursor
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
                      onPress={() => void loadMore({ retry: true })}
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
