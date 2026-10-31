import { useEffect, useRef } from 'react'
import { Alert, ScrollView } from 'react-native'
import {
  useNavigation,
  usePreventRemove,
  useRoute,
  type RouteProp,
} from '@react-navigation/native'
import {
  CircleAlert as CircleAlertIcon,
  CircleCheckBig as CircleCheckIcon,
  Clock as ClockIcon,
  WifiOff as WifiOffIcon,
} from 'lucide-react-native'
import ContentColumn from '@/components/ui/layout/ContentColumn'
import Wrapper from '@/components/ui/layout/Wrapper'
import HandoffStatus from '@/features/settings/components/account/handoff/HandoffStatus'
import KeyChangeIntro from '@/features/settings/components/account/keyChange/KeyChangeIntro'
import KeyChangeNewKey from '@/features/settings/components/account/keyChange/KeyChangeNewKey'
import KeyChangeProgress from '@/features/settings/components/account/keyChange/KeyChangeProgress'
import useDevicesTooOldForKeyChange from '@/features/settings/hooks/useDevicesTooOldForKeyChange'
import useKeyChangeFlow from '@/features/settings/hooks/useKeyChangeFlow'
import type { KeyChangeProblem } from '@/features/settings/lib/keyChangeFlow'
import { analytics } from '@/lib/analytics'
import i18n, { type TranslationKey } from '@/lib/locales'
import type { RootStackNavigation, RootStackParamList } from '@/types/rootStack'

const PROBLEM: Record<KeyChangeProblem, TranslationKey> = {
  offline: 'accountKeyChange_problemOffline',
  server: 'accountKeyChange_problemServer',
  mismatch: 'accountKeyChange_problemMismatch',
  sessionTooNew: 'accountKeyChange_problemSessionTooNew',
  stepUpRequired: 'accountKeyChange_problemStepUp',
}

/** Nothing to try again: the screen only closes. */
const FINAL: ReadonlySet<KeyChangeProblem> = new Set([
  'mismatch',
  'sessionTooNew',
])

/**
 * Change Account Key (ADR 0039): what changes, the new recovery key with "I've
 * saved it", then the change stage by stage. Leaving before the key changes
 * discards the new key; a change that started finishes on its own.
 */
const ChangeAccountKeyScreen = () => {
  const navigation = useNavigation<RootStackNavigation>()
  const route = useRoute<RouteProp<RootStackParamList, 'Change Account Key'>>()
  const entry = route.params?.entry ?? 'settings'
  const { flow, state } = useKeyChangeFlow(entry === 'resume')
  const tooOld = useDevicesTooOldForKeyChange()

  useEffect(() => {
    analytics.capture('account_key_change_opened', { entry })
  }, [entry])

  // Nothing to go back to mid-change: leaving would only hide it. Holds every
  // way out (header Back, Android back, iPhone Duo's system Back, the iPad
  // sidebar) until the step lands. Leaving the new recovery key discards it,
  // so that asks first.
  const busy =
    state.step === 'loading' ||
    state.step === 'preparing' ||
    state.step === 'changing'
  const showingKey = state.step === 'recoveryKey'
  usePreventRemove(busy || showingKey, ({ data }) => {
    if (busy) return
    Alert.alert(
      i18n.t('accountKeyChange_discardTitle'),
      i18n.t('accountKeyChange_leaveBody'),
      [
        { text: i18n.t('cancel'), style: 'cancel' },
        {
          text: i18n.t('accountKeyChange_resumeDiscard'),
          style: 'destructive',
          onPress: () => navigation.dispatch(data.action),
        },
      ]
    )
  })
  useEffect(() => {
    navigation.setOptions({ gestureEnabled: !busy && !showingKey })
  }, [navigation, busy, showingKey])

  // Opened anew while still showing (navigating to the screen already on top
  // gives it new params), a change that ended starts fresh instead of showing
  // the last visit's outcome. Coming back from a sheet or link over it keeps
  // what it showed.
  const params = route.params
  const openedWith = useRef(params)
  useEffect(() => {
    if (openedWith.current === params) return
    openedWith.current = params
    if (flow.restart() && params?.entry === 'resume')
      void flow.resume().catch(() => undefined)
  }, [flow, params])

  const done = {
    label: i18n.t('done'),
    onPress: () => navigation.goBack(),
    testID: 'key-change-done',
  }

  const content = () => {
    switch (state.step) {
      case 'loading':
        return <HandoffStatus loading testID='key-change-loading' />
      case 'intro':
        return (
          <KeyChangeIntro
            tooOld={tooOld}
            ownerFailed={state.ownerFailed === true}
            onStart={() => void flow.begin()}
          />
        )
      case 'preparing':
        return (
          <HandoffStatus
            loading
            title={i18n.t('accountKeyChange_preparing')}
            detail={i18n.t('accountKeyChange_preparingDetail')}
            testID='key-change-preparing'
          />
        )
      case 'recoveryKey':
        return (
          <KeyChangeNewKey
            recoveryKey={state.recoveryKey}
            saved={state.saved}
            onSavedChange={(saved) => flow.setSaved(saved)}
            onChange={() => void flow.change()}
          />
        )
      case 'changing':
        return <KeyChangeProgress stage={state.stage} />
      case 'done':
        return (
          <HandoffStatus
            icon={CircleCheckIcon}
            tone='success'
            title={i18n.t('accountKeyChange_doneTitle')}
            body={i18n.t('accountKeyChange_doneBody')}
            primary={done}
            testID='key-change-done-status'
          />
        )
      case 'finishing':
        return (
          <HandoffStatus
            icon={ClockIcon}
            title={i18n.t('accountKeyChange_finishingTitle')}
            body={i18n.t('accountKeyChange_finishingBody')}
            primary={done}
            secondary={{
              label: i18n.t('handoff_tryAgain'),
              onPress: () => void flow.retry(),
              testID: 'key-change-retry',
            }}
            testID='key-change-finishing'
          />
        )
      case 'lostRace':
        return (
          <HandoffStatus
            icon={CircleAlertIcon}
            tone='error'
            title={i18n.t('accountKeyChange_lostTitle')}
            body={i18n.t('accountKeyChange_lostBody')}
            primary={done}
            testID='key-change-lost'
          />
        )
      case 'problem':
        return (
          <HandoffStatus
            icon={state.problem === 'offline' ? WifiOffIcon : CircleAlertIcon}
            tone='error'
            body={i18n.t(PROBLEM[state.problem])}
            primary={
              FINAL.has(state.problem)
                ? done
                : {
                    label: i18n.t('handoff_tryAgain'),
                    onPress: () => void flow.retry(),
                    testID: 'key-change-retry',
                  }
            }
            testID='key-change-problem'
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
        <ContentColumn>{content()}</ContentColumn>
      </ScrollView>
    </Wrapper>
  )
}

export default ChangeAccountKeyScreen
