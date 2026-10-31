import { useEffect, useState } from 'react'
import { ScrollView, View } from 'react-native'
import {
  useNavigation,
  useRoute,
  type RouteProp,
} from '@react-navigation/native'
import {
  CircleAlert as CircleAlertIcon,
  CircleCheckBig as CircleCheckIcon,
  WifiOff as WifiOffIcon,
} from 'lucide-react-native'
import Wrapper from '@/components/ui/layout/Wrapper'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import { platformKey } from '@/app/account/attestationCopy'
import { analytics } from '@/lib/analytics'
import i18n from '@/lib/locales'
import type { HandoffFailure } from '@/lib/serverAccount/handoffSession'
import type { RootStackNavigation, RootStackParamList } from '@/types/rootStack'
import HandoffCode from '@/features/settings/components/account/handoff/HandoffCode'
import HandoffScanPanel from '@/features/settings/components/account/handoff/HandoffScanPanel'
import HandoffStatus, {
  HandoffTextButton,
} from '@/features/settings/components/account/handoff/HandoffStatus'
import { handoffFailureMessage } from '@/features/settings/components/account/handoff/handoffCopy'
import UseRecoveryKeySheet from '@/features/settings/components/account/UseRecoveryKeySheet'
import useAttestationSupport from '@/features/settings/hooks/useAttestationSupport'
import useClaimHandoff from '@/features/settings/hooks/useClaimHandoff'
import { completeOnboardingFromRestore } from '@/features/settings/lib/completeOnboardingFromRestore'
import { usePreferences } from '@/stores/preferences'
import { buddiesErrorMessage } from '@/features/buddies/lib/buddiesErrors'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

const LINK_PROBLEM = {
  notHandoff: 'handoff_scanNotHandoff',
  version: 'handoff_scanVersion',
  damaged: 'handoff_scanDamaged',
} as const

/**
 * Failures scanning again or a recovery key can't fix: the device can't be
 * verified, or the app needs an update.
 */
const FINAL = new Set<HandoffFailure | 'replace_failed'>([
  'unverified',
  'updateRequired',
])

/**
 * Sign In with QR Code, on the new phone: scan the other phone's code (or open
 * its link), compare the code both show, and once the other phone allows it,
 * this phone uses the account. A recovery key is the way in without the other
 * phone. A device that can never attest is told so first, before it claims the
 * other phone's code.
 */
const SignInWithQrScreen = () => {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const route =
    useRoute<RouteProp<RootStackParamList, 'Sign In With QR Code'>>()
  const entry = route.params?.entry ?? 'settings'
  const support = useAttestationSupport()
  // The account's buddies, once Buddies started here and synced them.
  const hasBuddies = useBuddies((state) => state.buddies.length > 0)
  const unverifiable = support === 'unsupported'
  // An opened link waits until it's known this device can sign in.
  const { session, state, linkProblem, completion, scanned, retry, reset } =
    useClaimHandoff(
      entry,
      support === null || unverifiable ? undefined : route.params?.link
    )
  const [recovering, setRecovering] = useState(false)

  useEffect(() => {
    if (unverifiable)
      analytics.capture('handoff_failed', { role: 'new', reason: 'unverified' })
  }, [unverifiable])

  const recoveryKeyAction = {
    label: i18n.t('handoff_useRecoveryKey'),
    onPress: () => setRecovering(true),
    testID: 'handoff-use-recovery-key',
  }
  const scanAgain = {
    label: i18n.t('handoff_scanAgain'),
    onPress: reset,
    testID: 'handoff-scan-again',
  }
  const failureActions = (reason: HandoffFailure | 'replace_failed') =>
    FINAL.has(reason)
      ? {
          primary: {
            label: i18n.t('done'),
            onPress: () => navigation.goBack(),
            testID: 'handoff-failed-done',
          },
        }
      : { primary: scanAgain, secondary: recoveryKeyAction }

  const content = () => {
    if (unverifiable)
      return (
        <HandoffStatus
          icon={CircleAlertIcon}
          tone='error'
          title={i18n.t('account_unverifiedTitle')}
          body={i18n.t(
            platformKey(
              'handoff_signInUnverified',
              'handoff_signInUnverifiedAndroid'
            )
          )}
          primary={{
            label: i18n.t('done'),
            onPress: () => navigation.goBack(),
            testID: 'handoff-unverified-done',
          }}
          testID='handoff-unverified'
        />
      )
    if (support === null && route.params?.link)
      return <HandoffStatus loading body={i18n.t('handoff_connecting')} />
    if (completion !== 'idle' && completion !== 'running') {
      if (completion.outcome === 'done') {
        const restored = completion.restore.outcome === 'restored'
        // Cloud Sync is bringing the data down (ADR 0030): like a restore,
        // the remaining onboarding steps would only set up what it replaces.
        const synced = completion.restore.outcome === 'synced'
        return (
          <HandoffStatus
            icon={CircleCheckIcon}
            tone='success'
            title={i18n.t('handoff_newDoneTitle')}
            body={i18n.t(
              hasBuddies
                ? 'handoff_newDoneBody'
                : 'handoff_newDoneBodyNoBuddies'
            )}
            detail={i18n.t(
              restored
                ? 'handoff_newDoneRestored'
                : synced
                  ? completion.restore.outcome === 'synced' &&
                    completion.restore.combine
                    ? 'handoff_newDoneSyncedCombine'
                    : 'handoff_newDoneSynced'
                  : completion.restore.outcome === 'none'
                    ? 'handoff_newDoneData'
                    : 'handoff_newDoneRestoreLater'
            )}
            primary={{
              label: i18n.t(entry === 'onboarding' ? 'continue' : 'done'),
              onPress: () => {
                // The restored records replace what the remaining steps
                // would set up, as a backup file's restore does.
                // A link opened from the welcome screen arrives as `link`,
                // still during onboarding.
                if (
                  (restored || synced) &&
                  !usePreferences.getState().onboardingComplete
                )
                  completeOnboardingFromRestore()
                navigation.goBack()
              },
              testID: 'handoff-done',
            }}
            testID='handoff-new-done'
          />
        )
      }
      if (completion.outcome === 'declined')
        return (
          <HandoffStatus
            title={i18n.t('handoff_replaceDeclinedTitle')}
            body={i18n.t('handoff_replaceDeclinedBody')}
            primary={scanAgain}
            testID='handoff-replace-declined'
          />
        )
      // The key is here; only signing in with it failed for now.
      if (completion.retryable && completion.reason !== 'replace_failed')
        return (
          <HandoffStatus
            icon={
              completion.reason === 'offline' ? WifiOffIcon : CircleAlertIcon
            }
            tone='error'
            title={i18n.t('handoff_failedTitle')}
            body={
              completion.reason === 'server'
                ? i18n.t('handoff_signInRetryServer')
                : handoffFailureMessage('new', completion.reason)
            }
            primary={{
              label: i18n.t('handoff_tryAgain'),
              onPress: retry,
              testID: 'handoff-retry',
            }}
            secondary={scanAgain}
            testID='handoff-failed-retryable'
          />
        )
      return (
        <HandoffStatus
          icon={completion.reason === 'offline' ? WifiOffIcon : CircleAlertIcon}
          tone='error'
          title={i18n.t('handoff_failedTitle')}
          body={
            completion.reason !== 'replace_failed'
              ? handoffFailureMessage('new', completion.reason)
              : completion.removalPending
                ? buddiesErrorMessage(completion.removalPending)
                : i18n.t('account_replaceFailedBody')
          }
          {...failureActions(completion.reason)}
          testID='handoff-failed'
        />
      )
    }
    if (!session || !state) {
      if (linkProblem)
        return (
          <HandoffStatus
            icon={CircleAlertIcon}
            tone='error'
            body={i18n.t(LINK_PROBLEM[linkProblem])}
            primary={scanAgain}
            secondary={recoveryKeyAction}
            testID='handoff-link-problem'
          />
        )
      return (
        <View style={{ gap: 12, alignItems: 'center' }}>
          <HandoffScanPanel onOffer={scanned} />
          <HandoffTextButton {...recoveryKeyAction} />
        </View>
      )
    }
    switch (state.step) {
      case 'idle':
      case 'claiming':
        return <HandoffStatus loading body={i18n.t('handoff_connecting')} />
      case 'waiting':
        return (
          <View
            style={{ alignItems: 'center', gap: 16 }}
            testID='handoff-confirm-on-other'
          >
            <Text
              accessibilityRole='header'
              style={{
                fontSize: theme.fontSize('xl'),
                fontFamily: theme.fonts.bold,
                textAlign: 'center',
              }}
            >
              {i18n.t('handoff_confirmOnOther')}
            </Text>
            <HandoffCode code={state.code} />
            <Text style={{ textAlign: 'center', maxWidth: 320 }}>
              {i18n.t('handoff_confirmOnOtherBody')}
            </Text>
          </View>
        )
      case 'received':
      case 'finishing':
      case 'done':
        return (
          <HandoffStatus
            loading
            body={i18n.t('handoff_signingIn')}
            testID='handoff-signing-in'
          />
        )
      case 'cancelled':
        return (
          <HandoffStatus
            title={i18n.t('handoff_replaceDeclinedTitle')}
            body={i18n.t('handoff_replaceDeclinedBody')}
            primary={scanAgain}
          />
        )
      case 'failed':
        return (
          <HandoffStatus
            icon={state.reason === 'offline' ? WifiOffIcon : CircleAlertIcon}
            tone='error'
            title={i18n.t('handoff_failedTitle')}
            body={handoffFailureMessage('new', state.reason)}
            {...failureActions(state.reason)}
            testID='handoff-failed'
          />
        )
    }
  }

  return (
    <Wrapper insets='bottom' style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'center',
          padding: 24,
          paddingBottom: 40,
        }}
      >
        {content()}
      </ScrollView>
      <UseRecoveryKeySheet
        open={recovering}
        onClose={() => setRecovering(false)}
        onDone={() => navigation.goBack()}
        onRestored={() => {
          if (!usePreferences.getState().onboardingComplete)
            completeOnboardingFromRestore()
        }}
      />
    </Wrapper>
  )
}

export default SignInWithQrScreen
