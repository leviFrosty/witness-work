import { useEffect, useState } from 'react'
import { ScrollView, View } from 'react-native'
import {
  useNavigation,
  useRoute,
  type RouteProp,
} from '@react-navigation/native'
import {
  CircleAlert as CircleAlertIcon,
  WifiOff as WifiOffIcon,
} from 'lucide-react-native'
import Wrapper from '@/components/ui/layout/Wrapper'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import { platformKey } from '@/app/account/attestationCopy'
import { useKeyChangeStatus } from '@/app/account/keyChange/status'
import { holdPasskeySignIn } from '@/app/account/passkeySignIn'
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
import SignedInStatus from '@/features/settings/components/account/handoff/SignedInStatus'
import UseRecoveryKeySheet from '@/features/settings/components/account/UseRecoveryKeySheet'
import useAttestationSupport from '@/features/settings/hooks/useAttestationSupport'
import useClaimHandoff from '@/features/settings/hooks/useClaimHandoff'
import { completeOnboardingFromRestore } from '@/features/settings/lib/completeOnboardingFromRestore'
import { usePreferences } from '@/stores/preferences'
import { buddiesErrorMessage } from '@/features/buddies/lib/buddiesErrors'

const LINK_PROBLEM = {
  notHandoff: 'handoff_scanNotHandoff',
  version: 'handoff_scanVersion',
  damaged: 'handoff_scanDamaged',
} as const

const FINAL = new Set<HandoffFailure | 'replace_failed'>([
  'unverified',
  'updateRequired',
])

const SignInWithQrScreen = () => {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const route =
    useRoute<RouteProp<RootStackParamList, 'Sign In With QR Code'>>()
  const entry = route.params?.entry ?? 'settings'
  const support = useAttestationSupport()
  const unverifiable = support === 'unsupported'

  const keyChangeStage = useKeyChangeStatus((status) => status.stage)
  const blocked = unverifiable || keyChangeStage !== null

  const { session, state, linkProblem, completion, scanned, retry, reset } =
    useClaimHandoff(
      entry,
      support === null || blocked ? undefined : route.params?.link
    )
  const [recovering, setRecovering] = useState(false)

  useEffect(() => holdPasskeySignIn(), [])

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
    if (keyChangeStage !== null) {
      const committed =
        keyChangeStage !== 'pending' && keyChangeStage !== 'confirmed'
      return (
        <HandoffStatus
          icon={CircleAlertIcon}
          title={i18n.t(
            committed
              ? 'accountKeyChange_finishing'
              : 'accountKeyChange_resumeTitle'
          )}
          body={i18n.t(
            committed
              ? 'accountKeyChange_finishingBody'
              : 'accountKeyChange_unfinishedSwitchBody'
          )}
          primary={{
            label: i18n.t('done'),
            onPress: () => navigation.goBack(),
            testID: 'handoff-key-change-done',
          }}
          testID='handoff-key-change-unfinished'
        />
      )
    }
    if (support === null && route.params?.link)
      return <HandoffStatus loading body={i18n.t('handoff_connecting')} />
    if (completion !== 'idle' && completion !== 'running') {
      if (completion.outcome === 'done')
        return (
          <SignedInStatus
            restore={completion.restore}
            rejoined={completion.rejoined}
            onboarding={entry === 'onboarding'}
            onDone={() => navigation.goBack()}
          />
        )
      if (completion.outcome === 'declined')
        return (
          <HandoffStatus
            title={i18n.t('handoff_replaceDeclinedTitle')}
            body={i18n.t('handoff_replaceDeclinedBody')}
            primary={scanAgain}
            testID='handoff-replace-declined'
          />
        )

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
            completeOnboardingFromRestore('account_backup')
        }}
      />
    </Wrapper>
  )
}

export default SignInWithQrScreen
