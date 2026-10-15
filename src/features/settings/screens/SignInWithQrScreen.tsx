import { useState } from 'react'
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
import i18n from '@/lib/locales'
import type { RootStackNavigation, RootStackParamList } from '@/types/rootStack'
import HandoffCode from '@/features/settings/components/account/handoff/HandoffCode'
import HandoffScanPanel from '@/features/settings/components/account/handoff/HandoffScanPanel'
import HandoffStatus, {
  HandoffTextButton,
} from '@/features/settings/components/account/handoff/HandoffStatus'
import { handoffFailureMessage } from '@/features/settings/components/account/handoff/handoffCopy'
import UseRecoveryKeySheet from '@/features/settings/components/account/UseRecoveryKeySheet'
import useClaimHandoff from '@/features/settings/hooks/useClaimHandoff'

const LINK_PROBLEM = {
  notHandoff: 'handoff_scanNotHandoff',
  version: 'handoff_scanVersion',
  damaged: 'handoff_scanDamaged',
} as const

/**
 * Sign In with QR Code, on the new phone: scan the other phone's code (or open
 * its link), compare the code both show, and once the other phone allows it,
 * this phone uses the account. A recovery key is the way in without the other
 * phone.
 */
const SignInWithQrScreen = () => {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const route =
    useRoute<RouteProp<RootStackParamList, 'Sign In With QR Code'>>()
  const entry = route.params?.entry ?? 'settings'
  const { session, state, linkProblem, completion, scanned, reset } =
    useClaimHandoff(entry, route.params?.link)
  const [recovering, setRecovering] = useState(false)

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

  const content = () => {
    if (completion !== 'idle' && completion !== 'running') {
      if (completion.outcome === 'done')
        return (
          <HandoffStatus
            icon={CircleCheckIcon}
            tone='success'
            title={i18n.t('handoff_newDoneTitle')}
            body={i18n.t('handoff_newDoneBody')}
            detail={i18n.t('handoff_newDoneData')}
            primary={{
              label: i18n.t(entry === 'onboarding' ? 'continue' : 'done'),
              onPress: () => navigation.goBack(),
              testID: 'handoff-done',
            }}
            testID='handoff-new-done'
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
      return (
        <HandoffStatus
          icon={completion.reason === 'offline' ? WifiOffIcon : CircleAlertIcon}
          tone='error'
          title={i18n.t('handoff_failedTitle')}
          body={
            completion.reason === 'replace_failed'
              ? i18n.t(
                  completion.removalPending
                    ? 'buddies_deleteAllPending'
                    : 'account_replaceFailedBody'
                )
              : handoffFailureMessage('new', completion.reason)
          }
          primary={scanAgain}
          secondary={recoveryKeyAction}
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
            primary={scanAgain}
            secondary={recoveryKeyAction}
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
      />
    </Wrapper>
  )
}

export default SignInWithQrScreen
