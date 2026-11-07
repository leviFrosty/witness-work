import { View } from 'react-native'
import {
  type PropsWithChildren,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { encodeRecoveryKey } from '@/lib/accountKey/recoveryKey'
import { webAccountKey } from '@/lib/accountKey/webAccountKey'
import i18n from '@/lib/locales'
import { webAccount } from '@/lib/serverAccount'
import { webSignInLater } from '@/lib/serverAccount/webSignInMark'
import { reloadPage } from '@/lib/serverAccount/webTabs'
import { toast } from '@/stores/toasts'
import InlineNotice from '@/components/ui/InlineNotice'
import LaunchSplash from '@/app/launch/LaunchSplash'
import ApprovedBy from '@/app/web-sign-in/components/ApprovedBy'
import CloudSyncStep from '@/app/web-sign-in/components/CloudSyncStep'
import RecoveryKeyGate from '@/app/web-sign-in/components/RecoveryKeyGate'
import SignInPage from '@/app/web-sign-in/components/SignInPage'
import WebSignInRoot from '@/app/web-sign-in/WebSignInRoot'
import WebSignInScreen from '@/app/web-sign-in/WebSignInScreen'
import { addPasskeyWithToasts } from '@/app/web-sign-in/addPasskeyWithToasts'
import { createAccountOffer } from '@/app/web-sign-in/createAccountOffer'
import { webSignIn } from '@/app/web-sign-in/webSignInRuntime'
import { endSignInAgain, useSignInAgain } from '@/app/web-sign-in/signInAgain'
import { webSignUp } from '@/app/web-sign-in/webSignUpRuntime'

const KEY_WAIT_MS = 10_000

if (!webAccount) throw new Error('The web sign-in gate is web only')
const account = webAccount

export default function WebSignInGate({ children }: PropsWithChildren) {
  const flow = webSignIn()
  const accountState = useSyncExternalStore(account.subscribe, account.state)
  const state = useSyncExternalStore(flow.subscribe, flow.state)
  const signUp = webSignUp()
  const signUpState = useSyncExternalStore(signUp.subscribe, signUp.state)
  const [withoutAccount] = useState(webSignInLater.read)
  const accountKey = useSyncExternalStore(
    webAccountKey.subscribe,
    webAccountKey.current
  )
  const keyPending =
    accountState.status === 'signedIn' &&
    signUpState.recoveryKey !== null &&
    accountKey === null

  const resumed = useRef(false)
  useEffect(() => {
    if (accountState.status === 'loading' || resumed.current) return
    resumed.current = true
    void flow.resume(
      accountState.status === 'signedIn' ? accountState.accountId : null
    )
  }, [accountState, flow])

  const signedInAs =
    accountState.status === 'signedIn' ? accountState.accountId : null
  useEffect(() => {
    if (accountState.status === 'loading') return
    void signUp.resume(signedInAs)
  }, [accountState.status, signedInAs, signUp])

  useEffect(() => {
    if (accountState.status === 'signedIn') webSignInLater.clear()
  }, [accountState.status])

  const storageWait =
    keyPending || (accountState.status !== 'loading' && !signUpState.ready)
  const [keyStuck, setKeyStuck] = useState(false)
  useEffect(() => {
    if (!storageWait) {
      setKeyStuck(false)
      return
    }
    if (keyPending) void webAccountKey.load()
    const timer = setTimeout(() => setKeyStuck(true), KEY_WAIT_MS)
    return () => clearTimeout(timer)
  }, [storageWait, keyPending])

  useEffect(() => {
    if (state.wrapSaved) toast.success(i18n.t('webSignIn_passkeyUnlocks'))
  }, [state.wrapSaved])

  const signingInAgain = useSignInAgain((s) => s.open)
  useEffect(() => {
    if (state.approvedBy !== null || state.cloudSync) endSignInAgain()
  }, [state.approvedBy, state.cloudSync])

  const onlyAccount =
    signingInAgain && accountState.status === 'signedIn'
      ? accountState.accountId
      : null
  useEffect(() => flow.onlyAccount(onlyAccount), [flow, onlyAccount])

  if (storageWait && keyStuck)
    return (
      <WebSignInRoot>
        <SignInPage title={i18n.t('webSignUp_recoveryTitle')}>
          <View testID='web-sign-up-key-stuck'>
            <InlineNotice
              message={i18n.t('webSignUp_keyStuck')}
              onRetry={reloadPage}
            />
          </View>
        </SignInPage>
      </WebSignInRoot>
    )

  if (
    accountState.status === 'loading' ||
    !signUpState.ready ||
    (accountState.status === 'signedIn' && signUpState.busy) ||
    keyPending
  )
    return <LaunchSplash />

  if (accountState.status === 'signedIn') {
    if (signUpState.recoveryKey && accountKey)
      return (
        <WebSignInRoot>
          <RecoveryKeyGate
            recoveryKey={encodeRecoveryKey(accountKey)}
            signInOnly={signUpState.recoveryKey.signInOnly}
            onSaved={signUp.confirmRecoveryKey}
          />
        </WebSignInRoot>
      )
    if (state.approvedBy !== null)
      return (
        <WebSignInRoot>
          <ApprovedBy
            deviceName={state.approvedBy}
            canAddPasskey={state.canAddPasskey}
            onContinue={flow.dismissApproved}
            onThatWasntMe={flow.thatWasntMe}
            onAddPasskey={addPasskeyWithToasts}
          />
        </WebSignInRoot>
      )
    const key = state.cloudSync ? webAccountKey.current() : null
    if (key)
      return (
        <WebSignInRoot>
          <CloudSyncStep
            accountKey={key}
            onReady={flow.cloudSyncChecked}
            onSignOut={() => void account.signOut()}
          />
        </WebSignInRoot>
      )
    if (signingInAgain)
      return (
        <WebSignInRoot>
          <WebSignInScreen
            flow={flow}
            state={state}
            signUp={signUp}
            signUpState={signUpState}
            ended={null}
            keptData={false}
            canSignUp={false}
            notice={i18n.t('stepUp_signInAgainNotice')}
            onLeave={endSignInAgain}
          />
        </WebSignInRoot>
      )
    return children
  }

  const offer = createAccountOffer({
    dev: __DEV__,
    keptData: accountState.keptData,
    withoutAccount,
  })
  if (offer.open) return children

  return (
    <WebSignInRoot>
      <WebSignInScreen
        flow={flow}
        state={state}
        signUp={signUp}
        signUpState={signUpState}
        ended={accountState.ended ?? state.ended}
        changedAt={accountState.changedAt ?? null}
        keptData={accountState.keptData}
        canSignUp={offer.offered}
      />
    </WebSignInRoot>
  )
}
