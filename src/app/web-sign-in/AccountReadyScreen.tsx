import { useEffect, useSyncExternalStore } from 'react'
import {
  CloudOff as CloudOffIcon,
  RefreshCw as RefreshIcon,
} from 'lucide-react-native'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import ActionButton from '@/components/ui/ActionButton'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import FoldPane from '@/components/ui/layout/FoldPane'
import useTheme from '@/contexts/theme'
import { analytics } from '@/lib/analytics'
import i18n from '@/lib/locales'
import { webAccount } from '@/lib/serverAccount'
import { usePreferences } from '@/stores/preferences'
import {
  firstSyncStallReason,
  onFirstSyncChange,
  retryFirstSync,
  stallReasonShown,
} from '@/app/sync/webFirstSync'
import { useWebOnboardingHold } from '@/app/sync/useWebOnboardingHold'

/**
 * The web, before onboarding, while its first Cloud Sync decision runs
 * (`useWebOnboardingHold`): the account's data comes first, so onboarding
 * doesn't answer for an account a phone already set up. When it can't finish
 * for now, Retry, or sign out, and why when it isn't the connection: the
 * server's switch is off, or another device's data can't be read here.
 */
export default function AccountReadyScreen() {
  const theme = useTheme()
  const stalled = useWebOnboardingHold() === 'stalled'
  const recorded = useSyncExternalStore(onFirstSyncChange, firstSyncStallReason)
  const cloudSyncConfigEnabled = usePreferences(
    (s) => s.cloudSyncConfig?.enabled
  )
  const syncIssue = usePreferences((s) => s.iCloudSyncIssue)
  const reason = stallReasonShown({
    recorded,
    cloudSyncConfigEnabled,
    syncIssue,
  })

  useEffect(() => {
    if (stalled)
      analytics.capture('web_account_ready_stalled', {
        reason: reason ?? 'other',
      })
  }, [stalled, reason])

  const retry = () => {
    analytics.capture('web_account_ready_action', { action: 'retry' })
    retryFirstSync()
  }
  const signOut = () => {
    analytics.capture('web_account_ready_action', { action: 'sign_out' })
    void webAccount?.signOut()
  }

  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <FoldPane contentStyle={styles.content}>
        <View
          style={[styles.iconCircle, { backgroundColor: theme.colors.card }]}
        >
          {stalled ? (
            <CloudOffIcon size={36} color={theme.colors.accent} />
          ) : (
            <RefreshIcon size={36} color={theme.colors.accent} />
          )}
        </View>
        <View style={styles.text}>
          <Text
            accessibilityRole='header'
            style={{
              fontSize: theme.fontSize('xl'),
              fontFamily: theme.fonts.bold,
              textAlign: 'center',
            }}
          >
            {i18n.t(
              stalled ? 'webAccountReady_stalledTitle' : 'webAccountReady_title'
            )}
          </Text>
          <Text
            style={{
              fontSize: theme.fontSize('md'),
              color: theme.colors.textAlt,
              textAlign: 'center',
            }}
          >
            {i18n.t(
              !stalled
                ? 'webAccountReady_body'
                : reason === 'paused'
                  ? 'webAccountReady_stalledBodyPaused'
                  : reason === 'unreadable'
                    ? 'webAccountReady_stalledBodyUnreadable'
                    : 'webAccountReady_stalledBody'
            )}
          </Text>
        </View>
        {!stalled && (
          // One stop for a screen reader, not the label and the spinner's own
          // "In progress".
          <View
            accessible
            accessibilityRole='progressbar'
            accessibilityLabel={i18n.t('webAccountReady_title')}
          >
            <ActivityIndicator color={theme.colors.textAlt} />
          </View>
        )}
        <View style={styles.actions}>
          {stalled && (
            <View style={styles.primary}>
              <ActionButton onPress={retry}>
                <Text
                  style={{
                    fontSize: theme.fontSize('lg'),
                    lineHeight: 24,
                    color: theme.colors.textInverse,
                    fontFamily: theme.fonts.bold,
                  }}
                >
                  {i18n.t('webAccountReady_retry')}
                </Text>
              </ActionButton>
            </View>
          )}
          <Button
            accessibilityRole='button'
            onPress={signOut}
            style={styles.secondary}
          >
            <Text
              style={{
                fontSize: theme.fontSize('md'),
                color: theme.colors.accent,
                fontFamily: theme.fonts.semiBold,
              }}
            >
              {i18n.t('webSignOut_button')}
            </Text>
          </Button>
        </View>
      </FoldPane>
    </View>
  )
}

const styles = StyleSheet.create({
  container: StyleSheet.absoluteFill,
  content: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    padding: 30,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    gap: 8,
    maxWidth: 420,
  },
  actions: {
    alignSelf: 'stretch',
    alignItems: 'center',
    gap: 12,
  },
  // Wide enough to read as the main action. Its label's line height makes it
  // 48pt tall.
  primary: {
    minWidth: 220,
  },
  secondary: {
    minHeight: 48,
    minWidth: 120,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
