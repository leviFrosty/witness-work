import { useRef, useState } from 'react'
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
import { useFoldColumn } from '@/components/ui/layout/FoldPane'
import { approveBrowser } from '@/app/account/approval'
import { confirmDeviceOwner } from '@/lib/deviceOwner'
import i18n from '@/lib/locales'
import { logger } from '@/lib/logger'
import { appApprovalOrigins } from '@/lib/serverAccount/approvalRuntime'
import type { PhoneApproval } from '@/lib/serverAccount/approvalSession'
import { toast } from '@/stores/toasts'
import type { RootStackNavigation, RootStackParamList } from '@/types/rootStack'
import BrowserApproval from '@/features/settings/components/account/approval/BrowserApproval'
import {
  type ApprovalAction,
  approvalView,
  readScannedApproval,
} from '@/features/settings/components/account/approval/approvalView'
import HandoffStatus from '@/features/settings/components/account/handoff/HandoffStatus'
import QrScanPanel from '@/features/settings/components/account/handoff/QrScanPanel'
import useApproveBrowser from '@/features/settings/hooks/useApproveBrowser'

const COLUMN_WIDTH = 480

/**
 * Sign In on a Computer, on a phone with the account: scan the code the web app
 * shows, check the browser, where it is, and the code both show, then YES
 * (after Face ID, Touch ID or the passcode) sends the account key to it, or NO
 * ends it. Codes are only read from this scanner, never from an opened link.
 * Leaving the screen ends a claim the User hasn't answered.
 */
const SignInOnComputerScreen = () => {
  const navigation = useNavigation<RootStackNavigation>()
  const route =
    useRoute<RouteProp<RootStackParamList, 'Sign In on a Computer'>>()
  // A development build can hand in a code, since simulators can't scan.
  const fed = __DEV__ ? route.params?.link : undefined
  const { start, session, state, scan, scanAgain, retry, host } =
    useApproveBrowser(route.params?.entry ?? 'settings', fed)
  // YES asks the device's owner first; the key goes only once they confirm.
  const [confirming, setConfirming] = useState(false)
  // A second tap before the re-render must not open a second prompt.
  const confirmingRef = useRef(false)
  const foldColumn = useFoldColumn(COLUMN_WIDTH)

  const allow = async (approval: PhoneApproval) => {
    if (confirmingRef.current) return
    confirmingRef.current = true
    setConfirming(true)
    try {
      const outcome = await approveBrowser(approval, {
        confirmOwner: () => confirmDeviceOwner(i18n.t('approval_unlockPrompt')),
      })
      if (outcome === 'failed') toast.error(i18n.t('approval_unlockFailed'))
    } catch (error) {
      logger.warn('[approval] approving failed', error)
    } finally {
      confirmingRef.current = false
      setConfirming(false)
    }
  }

  const action = (kind: ApprovalAction) =>
    ({
      scanAgain: {
        label: i18n.t('handoff_scanAgain'),
        onPress: scanAgain,
        testID: 'approval-scan-again',
      },
      tryAgain: {
        label: i18n.t('handoff_tryAgain'),
        onPress: retry,
        testID: 'approval-try-again',
      },
      done: {
        label: i18n.t('done'),
        onPress: () => navigation.goBack(),
        testID: 'approval-done',
      },
    })[kind]

  const content = () => {
    const view = approvalView(start, state)
    switch (view.kind) {
      case 'scan':
        return (
          <QrScanPanel
            read={(data) => {
              const read = readScannedApproval(data, appApprovalOrigins())
              if (!read.ok) return read.problem
              scan(read.link)
              return null
            }}
            hint='approval_scanHint'
            deniedBody='approval_cameraDeniedBody'
            problem={view.problem}
            testIDPrefix='approval'
          />
        )
      case 'loading':
        return (
          <HandoffStatus
            loading
            body={view.body ? i18n.t(view.body) : undefined}
            testID='approval-loading'
          />
        )
      case 'confirm':
        return (
          <BrowserApproval
            state={view.state}
            host={host}
            sending={view.sending || confirming}
            onAllow={() => session && void allow(session)}
            onDecline={() => void session?.decline()}
          />
        )
      case 'approved':
        return (
          <HandoffStatus
            icon={CircleCheckIcon}
            tone='success'
            title={i18n.t('approval_doneTitle')}
            body={i18n.t('approval_doneBody', { browser: view.browser })}
            primary={action('done')}
            testID='approval-approved'
          />
        )
      case 'ended':
        return (
          <HandoffStatus
            icon={
              view.tone === 'neutral'
                ? undefined
                : view.offline
                  ? WifiOffIcon
                  : CircleAlertIcon
            }
            tone={view.tone}
            title={view.title && i18n.t(view.title)}
            body={i18n.t(view.body)}
            primary={action(view.primary)}
            testID='approval-ended'
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
        <View
          style={[
            {
              flexGrow: 1,
              justifyContent: 'center',
              width: '100%',
              maxWidth: COLUMN_WIDTH,
              alignSelf: 'center',
            },
            foldColumn,
          ]}
        >
          {content()}
        </View>
      </ScrollView>
    </Wrapper>
  )
}

export default SignInOnComputerScreen
