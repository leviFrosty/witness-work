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
import { approveHandoff } from '@/app/account/handoff'
import i18n from '@/lib/locales'
import type { RootStackNavigation, RootStackParamList } from '@/types/rootStack'
import HandoffQrPanel from '@/features/settings/components/account/handoff/HandoffQrPanel'
import HandoffApproval from '@/features/settings/components/account/handoff/HandoffApproval'
import HandoffStatus from '@/features/settings/components/account/handoff/HandoffStatus'
import { handoffFailureMessage } from '@/features/settings/components/account/handoff/handoffCopy'
import useOfferHandoff from '@/features/settings/hooks/useOfferHandoff'

/**
 * Set Up Another Device, on the phone that has the account: a QR code for the
 * new phone, then "Allow … to sign in?" with the code both show. Leaving the
 * screen cancels the code.
 */
const SetUpAnotherDeviceScreen = () => {
  const navigation = useNavigation<RootStackNavigation>()
  const route =
    useRoute<RouteProp<RootStackParamList, 'Set Up Another Device'>>()
  const { start, session, state, newCode } = useOfferHandoff(
    route.params?.entry ?? 'settings'
  )

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
          body={i18n.t(
            start.problem === 'offline'
              ? 'handoff_problemOffline'
              : start.problem === 'unavailable'
                ? 'handoff_problemUnavailable'
                : 'account_updateRequired'
          )}
          primary={
            start.problem === 'unsupported'
              ? undefined
              : {
                  label: i18n.t('handoff_tryAgain'),
                  onPress: newCode,
                  testID: 'handoff-try-again',
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
            sending={state.step === 'sending'}
            onAllow={() => void approveHandoff(session)}
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
            body={i18n.t('handoff_oldDoneBody')}
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
            primary={newCodeAction}
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
