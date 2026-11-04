import { useEffect, useRef, useState } from 'react'
import { ScrollView } from 'react-native'
import {
  type RouteProp,
  useNavigation,
  useRoute,
} from '@react-navigation/native'
import { CircleAlert as CircleAlertIcon } from 'lucide-react-native'
import ContentColumn from '@/components/ui/layout/ContentColumn'
import Wrapper from '@/components/ui/layout/Wrapper'
import { platformKey } from '@/app/account/attestationCopy'
import { useKeyChangeStatus } from '@/app/account/keyChange/status'
import i18n from '@/lib/locales'
import { usePreferences } from '@/stores/preferences'
import type { RootStackNavigation, RootStackParamList } from '@/types/rootStack'
import HandoffStatus from '@/features/settings/components/account/handoff/HandoffStatus'
import SignedInStatus from '@/features/settings/components/account/handoff/SignedInStatus'
import PasskeySignInCantUnlock from '@/features/settings/components/account/passkeySignIn/PasskeySignInCantUnlock'
import PasskeySignInChoices from '@/features/settings/components/account/passkeySignIn/PasskeySignInChoices'
import UseRecoveryKeySheet from '@/features/settings/components/account/UseRecoveryKeySheet'
import useAttestationSupport from '@/features/settings/hooks/useAttestationSupport'
import usePasskeySignIn from '@/features/settings/hooks/usePasskeySignIn'
import { completeOnboardingFromRestore } from '@/features/settings/lib/completeOnboardingFromRestore'

/** About a stack push's slide. */
const OPEN_AFTER_MS = 400

/**
 * Sign In with a Passkey, on a new phone (ADR 0038 §6): the passkey sheet opens
 * at once, and the other phone's QR code and the recovery key stay offered. A
 * passkey that can't unlock here says so and hands over to those two, which
 * then let it unlock next time.
 */
const SignInWithPasskeyScreen = () => {
  const navigation = useNavigation<RootStackNavigation>()
  const route =
    useRoute<RouteProp<RootStackParamList, 'Sign In With Passkey'>>()
  const entry = route.params?.entry ?? 'settings'
  const support = useAttestationSupport()
  const unverifiable = support === 'unsupported'
  // A key change on this device is continued or discarded before signing in
  // to another account (docs/account-key-change.md).
  const keyChangeStage = useKeyChangeStatus((status) => status.stage)
  const blocked = unverifiable || keyChangeStage !== null
  const { outcome, start, back } = usePasskeySignIn(entry)
  const [recovering, setRecovering] = useState(false)

  // The User chose a passkey to get here: its sheet opens once, after the
  // screen has slid in.
  const opened = useRef(false)
  useEffect(() => {
    if (opened.current || support === null || blocked) return
    const timer = setTimeout(() => {
      opened.current = true
      void start()
    }, OPEN_AFTER_MS)
    return () => clearTimeout(timer)
  }, [support, blocked, start])

  const otherPhone = () => navigation.replace('Sign In With QR Code', { entry })
  const recoveryKey = () => setRecovering(true)

  const content = () => {
    if (
      unverifiable ||
      (typeof outcome === 'object' &&
        outcome.status === 'failed' &&
        outcome.reason === 'unverified')
    )
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
            testID: 'passkey-sign-in-unverified-done',
          }}
          testID='passkey-sign-in-unverified'
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
            testID: 'passkey-sign-in-key-change-done',
          }}
          testID='passkey-sign-in-key-change-unfinished'
        />
      )
    }
    if (outcome === 'running' || support === null)
      return (
        <HandoffStatus
          loading
          body={i18n.t('handoff_signingIn')}
          testID='passkey-sign-in-running'
        />
      )
    if (outcome === 'choices' || outcome.status === 'failed')
      return (
        <PasskeySignInChoices
          onPasskey={() => void start()}
          onOtherPhone={otherPhone}
          onRecoveryKey={recoveryKey}
        />
      )
    switch (outcome.status) {
      case 'done':
        return (
          <SignedInStatus
            restore={outcome.restore}
            rejoined={outcome.rejoined}
            via='passkey'
            onboarding={entry === 'onboarding'}
            onDone={() => navigation.goBack()}
          />
        )
      case 'cantUnlock':
        return (
          <PasskeySignInCantUnlock
            prf={outcome.prf}
            onOtherPhone={otherPhone}
            onRecoveryKey={recoveryKey}
            onTryAgain={() => void start()}
          />
        )
      case 'declined':
        return (
          <HandoffStatus
            title={i18n.t('handoff_replaceDeclinedTitle')}
            body={i18n.t('handoff_replaceDeclinedBody')}
            primary={{
              label: i18n.t('handoff_tryAgain'),
              onPress: back,
              testID: 'passkey-sign-in-declined-back',
            }}
            testID='passkey-sign-in-declined'
          />
        )
      default:
        return null
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
        {/* Keeps to the leading side of iPhone Duo's fold when half open. */}
        <ContentColumn>{content()}</ContentColumn>
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

export default SignInWithPasskeyScreen
