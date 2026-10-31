import {
  Cloud as CloudIcon,
  Download as DownloadIcon,
  Smartphone as SmartphoneIcon,
} from 'lucide-react-native'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import ActionButton from '@/components/ui/ActionButton'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import FoldPane from '@/components/ui/layout/FoldPane'
import useTheme from '@/contexts/theme'
import { analytics } from '@/lib/analytics'
import i18n from '@/lib/locales'
import type { WebCloudSyncClient } from '@/app/web-cloud-sync/webCloudSyncClient'
import {
  isWaitingState,
  type WebCloudSyncState,
} from '@/app/web-cloud-sync/webCloudSyncGate'
import { useWebCloudSync } from '@/app/web-cloud-sync/useWebCloudSync'

type Props = {
  /** As the signed-in account (`createWebCloudSyncClient`). */
  client: WebCloudSyncClient
  /** This browser's own Cloud Sync slot id, which doesn't count. */
  ownSlotId: string | null
  /** Another device is on Cloud Sync, or the account has no phone: go on. */
  onReady: () => void
  /** Signing out is the web sign-in's. */
  onSignOut: () => void
}

type LocaleKey = Parameters<typeof i18n.t>[0]

const COPY: Record<
  Exclude<WebCloudSyncState, 'ready'>,
  { title: LocaleKey; body: LocaleKey; icon: typeof CloudIcon }
> = {
  turnOn: {
    title: 'webCloudSync_turnOnTitle',
    body: 'webCloudSync_turnOnBody',
    icon: CloudIcon,
  },
  waiting: {
    title: 'webCloudSync_waitingTitle',
    body: 'webCloudSync_waitingBody',
    icon: SmartphoneIcon,
  },
  updatePhone: {
    title: 'webCloudSync_updatePhoneTitle',
    body: 'webCloudSync_updatePhoneBody',
    icon: DownloadIcon,
  },
}

/**
 * After signing in on the web, when the account's data isn't on Cloud Sync yet
 * (ADR 0040 §5): asks the account's phones to turn it on, then waits for one
 * to. The web stores data only through Cloud Sync (ADR 0037 §2).
 */
export default function WebCloudSyncScreen({
  client,
  ownSlotId,
  onReady,
  onSignOut,
}: Props) {
  const theme = useTheme()
  const { state, turnOn, turningOn } = useWebCloudSync({
    client,
    ownSlotId,
    onReady,
  })
  const copy = state && state !== 'ready' ? COPY[state] : null

  const signOut = () => {
    analytics.capture('cloud_sync_web_gate_action', {
      action: 'sign_out',
      state,
    })
    onSignOut()
  }

  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <FoldPane contentStyle={styles.content}>
        {copy ? (
          <>
            <View
              style={[
                styles.iconCircle,
                { backgroundColor: theme.colors.card },
              ]}
            >
              <copy.icon size={36} color={theme.colors.accent} />
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
                {i18n.t(copy.title)}
              </Text>
              <Text
                style={{
                  fontSize: theme.fontSize('md'),
                  color: theme.colors.textAlt,
                  textAlign: 'center',
                }}
              >
                {i18n.t(copy.body)}
              </Text>
            </View>
            {isWaitingState(state) ? (
              // One stop for a screen reader, not the label and the spinner's
              // own "In progress".
              <View
                accessible
                accessibilityRole='progressbar'
                accessibilityLabel={i18n.t('webCloudSync_checking')}
              >
                <ActivityIndicator color={theme.colors.textAlt} />
              </View>
            ) : null}
          </>
        ) : (
          <ActivityIndicator
            size='large'
            color={theme.colors.textAlt}
            accessibilityLabel={i18n.t('webCloudSync_loading')}
          />
        )}
        <View style={styles.actions}>
          {state === 'turnOn' && (
            <View style={styles.primary}>
              <ActionButton
                onPress={turnOn}
                loading={turningOn}
                disabled={turningOn}
              >
                <Text
                  style={{
                    fontSize: theme.fontSize('lg'),
                    lineHeight: 24,
                    color: theme.colors.textInverse,
                    fontFamily: theme.fonts.bold,
                  }}
                >
                  {i18n.t('webCloudSync_turnOn')}
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
              {i18n.t('webCloudSync_signOut')}
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
