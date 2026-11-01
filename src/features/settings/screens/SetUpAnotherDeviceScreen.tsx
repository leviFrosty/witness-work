import { useState } from 'react'
import { ScrollView } from 'react-native'
import {
  useNavigation,
  useRoute,
  type RouteProp,
} from '@react-navigation/native'
import {
  CircleCheckBig as CircleCheckIcon,
  CircleAlert as CircleAlertIcon,
  WifiOff as WifiOffIcon,
} from 'lucide-react-native'
import Wrapper from '@/components/ui/layout/Wrapper'
import { platformKey } from '@/app/account/attestationCopy'
import { approveHandoff, type OfferStartProblem } from '@/app/account/handoff'
import { confirmDeviceOwner } from '@/lib/deviceOwner'
import i18n, { type TranslationKey } from '@/lib/locales'
import { logger } from '@/lib/logger'
import type { OfferSession } from '@/lib/serverAccount/handoffSession'
import { toast } from '@/stores/toasts'
import type { RootStackNavigation, RootStackParamList } from '@/types/rootStack'
import HandoffQrPanel from '@/features/settings/components/account/handoff/HandoffQrPanel'
import HandoffApproval from '@/features/settings/components/account/handoff/HandoffApproval'
import HandoffStatus from '@/features/settings/components/account/handoff/HandoffStatus'
import { handoffFailureMessage } from '@/features/settings/components/account/handoff/handoffCopy'
import {
  FINAL_FAILURES,
  RETRYABLE_PROBLEMS,
} from '@/features/settings/components/account/handoff/handoffEnding'
import useOfferHandoff from '@/features/settings/hooks/useOfferHandoff'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

const PROBLEM: Record<OfferStartProblem, TranslationKey> = {
  unsupported: 'account_updateRequired',
  unavailable: 'handoff_problemUnavailable',
  unverified: platformKey(
    'handoff_failUnverifiedOld',
    'handoff_failUnverifiedOldAndroid'
  ),
  verifyLater: 'handoff_failVerifyLater',
  updateRequired: 'handoff_failUpdate',
  offline: 'handoff_problemOffline',
}

const SetUpAnotherDeviceScreen = () => {
  const navigation = useNavigation<RootStackNavigation>()
  const route =
    useRoute<RouteProp<RootStackParamList, 'Set Up Another Device'>>()
  const { start, session, state, newCode } = useOfferHandoff(
    route.params?.entry ?? 'settings',
    route.params
  )

  const hasBuddies = useBuddies((state) => state.buddies.length > 0)

  const [confirming, setConfirming] = useState(false)

  const allow = async (offer: OfferSession, device: string) => {
    if (confirming) return
    setConfirming(true)
    try {
      const outcome = await approveHandoff(offer, {
        confirmOwner: () =>
          confirmDeviceOwner(i18n.t('handoff_unlockPrompt', { device })),
      })
      if (outcome === 'failed') toast.error(i18n.t('handoff_unlockFailed'))
    } catch (error) {
      logger.warn('[handoff] allowing failed', error)
    } finally {
      setConfirming(false)
    }
  }

  const newCodeAction = {
    label: i18n.t('handoff_newCode'),
    onPress: newCode,
    testID: 'handoff-new-code',
  }

  const content = () => {
    if (start.phase === 'problem')
      return (
        <HandoffStatus
          icon={start.problem === 'offline' ? WifiOffIcon : CircleAlertIcon}
          tone='error'
          body={i18n.t(PROBLEM[start.problem])}
          primary={
            RETRYABLE_PROBLEMS.has(start.problem)
              ? {
                  label: i18n.t('handoff_tryAgain'),
                  onPress: newCode,
                  testID: 'handoff-try-again',
                }
              : {
                  label: i18n.t('done'),
                  onPress: () => navigation.goBack(),
                  testID: 'handoff-problem-done',
                }
          }
          testID='handoff-problem'
        />
      )
    if (!session || !state || state.step === 'idle' || state.step === 'opening')
      return <HandoffStatus loading body={i18n.t('handoff_preparing')} />
    switch (state.step) {
      case 'waiting':
        return (
          <HandoffQrPanel
            link={state.link}
            expiresAt={state.expiresAt}
            onNewCode={newCode}
          />
        )
      case 'confirm':
      case 'sending':
        return (
          <HandoffApproval
            hello={state.hello}
            code={state.code}
            sending={state.step === 'sending' || confirming}
            sendFailed={state.step === 'confirm' && state.sendFailed}
            onAllow={() => void allow(session, state.hello.deviceName)}
            onDecline={() => void session.decline()}
          />
        )
      case 'sent':
        return (
          <HandoffStatus
            loading
            body={i18n.t('handoff_sending', { device: state.hello.deviceName })}
            testID='handoff-sent'
          />
        )
      case 'done':
        return (
          <HandoffStatus
            icon={CircleCheckIcon}
            tone='success'
            title={i18n.t('handoff_oldDoneTitle', {
              device: state.hello.deviceName,
            })}
            body={i18n.t(
              hasBuddies
                ? 'handoff_oldDoneBody'
                : 'handoff_oldDoneBodyNoBuddies'
            )}
            primary={{
              label: i18n.t('done'),
              onPress: () => navigation.goBack(),
              testID: 'handoff-done',
            }}
            testID='handoff-old-done'
          />
        )
      case 'declined':
        return (
          <HandoffStatus
            title={i18n.t('handoff_declinedTitle')}
            body={
              state.hello
                ? i18n.t('handoff_declinedBody', {
                    device: state.hello.deviceName,
                  })
                : undefined
            }
            primary={newCodeAction}
            testID='handoff-declined'
          />
        )
      case 'cancelled':
        return <HandoffStatus loading />
      case 'failed':
        return (
          <HandoffStatus
            icon={state.reason === 'offline' ? WifiOffIcon : CircleAlertIcon}
            tone='error'
            title={i18n.t('handoff_oldFailedTitle')}
            body={handoffFailureMessage('old', state.reason)}
            primary={
              FINAL_FAILURES.has(state.reason)
                ? {
                    label: i18n.t('done'),
                    onPress: () => navigation.goBack(),
                    testID: 'handoff-failed-done',
                  }
                : newCodeAction
            }
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
    </Wrapper>
  )
}

export default SetUpAnotherDeviceScreen
