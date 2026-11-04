import {
  type PropsWithChildren,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { webAccountKey } from '@/lib/accountKey/webAccountKey'
import i18n from '@/lib/locales'
import { webAccount } from '@/lib/serverAccount'
import { webSignInLater } from '@/lib/serverAccount/webSignInMark'
import { toast } from '@/stores/toasts'
import LaunchSplash from '@/app/launch/LaunchSplash'
import ApprovedBy from '@/app/web-sign-in/components/ApprovedBy'
import CloudSyncStep from '@/app/web-sign-in/components/CloudSyncStep'
import WebSignInRoot from '@/app/web-sign-in/WebSignInRoot'
import WebSignInScreen from '@/app/web-sign-in/WebSignInScreen'
import { addPasskeyWithToasts } from '@/app/web-sign-in/addPasskeyWithToasts'
import { createAccountOffer } from '@/app/web-sign-in/createAccountOffer'
import { webSignIn } from '@/app/web-sign-in/webSignInRuntime'
import { endSignInAgain, useSignInAgain } from '@/app/web-sign-in/signInAgain'

if (!webAccount) throw new Error('The web sign-in gate is web only')
const account = webAccount

/**
 * Web: the app only once this browser is signed in (ADR 0037 §2, ADR 0038 §8).
 * Signed out, the sign-in screen; just signed in, "Approved by …" after a
 * phone, then the Cloud Sync screen (ADR 0040 §5).
 */
export default function WebSignInGate({ children }: PropsWithChildren) {
  const flow = webSignIn()
  const accountState = useSyncExternalStore(account.subscribe, account.state)
  const state = useSyncExternalStore(flow.subscribe, flow.state)
  const [chosen, setChosen] = useState(webSignInLater.read)

  const resumed = useRef(false)
  useEffect(() => {
    if (accountState.status === 'loading' || resumed.current) return
    resumed.current = true
    void flow.resume(
      accountState.status === 'signedIn' ? accountState.accountId : null
    )
  }, [accountState, flow])

  // Signed in: Create an Account's choice no longer applies.
  useEffect(() => {
    if (accountState.status === 'signedIn') webSignInLater.clear()
  }, [accountState.status])

  useEffect(() => {
    if (state.wrapSaved) toast.success(i18n.t('webSignIn_passkeyUnlocks'))
  }, [state.wrapSaved])

  // Sign In Again ends once the new session opened: "Approved by …" or the
  // Cloud Sync screen comes next, as after any sign-in.
  const signingInAgain = useSignInAgain((s) => s.open)
  useEffect(() => {
    if (state.approvedBy !== null || state.cloudSync) endSignInAgain()
  }, [state.approvedBy, state.cloudSync])
  // Only this browser's account signs in again: another would wipe its data.
  const onlyAccount =
    signingInAgain && accountState.status === 'signedIn'
      ? accountState.accountId
      : null
  useEffect(() => flow.onlyAccount(onlyAccount), [flow, onlyAccount])

  if (accountState.status === 'loading') return <LaunchSplash />

  if (accountState.status === 'signedIn') {
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
            ended={null}
            keptData={false}
            notice={i18n.t('stepUp_signInAgainNotice')}
            onLeave={endSignInAgain}
          />
        </WebSignInRoot>
      )
    return children
  }

  // Until web sign-up: a dev-only way in without an account, never into
  // an account's kept data.
  const offer = createAccountOffer({
    dev: __DEV__,
    keptData: accountState.keptData,
    chosen,
  })
  if (offer.open) return children

  return (
    <WebSignInRoot>
      <WebSignInScreen
        flow={flow}
        state={state}
        ended={accountState.ended ?? state.ended}
        keptData={accountState.keptData}
        onCreateAccount={
          offer.offered
            ? () => {
                webSignInLater.write()
                setChosen(true)
              }
            : undefined
        }
      />
    </WebSignInRoot>
  )
}
