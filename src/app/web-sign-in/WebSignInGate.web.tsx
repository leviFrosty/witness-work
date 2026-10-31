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
import { toast } from '@/stores/toasts'
import LaunchSplash from '@/app/launch/LaunchSplash'
import ApprovedBy from '@/app/web-sign-in/components/ApprovedBy'
import CloudSyncStep from '@/app/web-sign-in/components/CloudSyncStep'
import WebSignInRoot from '@/app/web-sign-in/WebSignInRoot'
import WebSignInScreen from '@/app/web-sign-in/WebSignInScreen'
import { addPasskeyWithToasts } from '@/app/web-sign-in/addPasskeyWithToasts'
import { webSignIn } from '@/app/web-sign-in/webSignInRuntime'

/**
 * Placeholder until web sign-up: Create an Account opens the app in this tab
 * without an account, as the web did before sign-in. Web sign-up replaces it.
 */
const LATER_KEY = 'ww-web-sign-in-later'

const later = {
  read: () => {
    try {
      return globalThis.sessionStorage?.getItem(LATER_KEY) === '1'
    } catch {
      return false
    }
  },
  write: () => {
    try {
      globalThis.sessionStorage?.setItem(LATER_KEY, '1')
    } catch {
      // This page load only.
    }
  },
}

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
  const [skipped, setSkipped] = useState(later.read)

  const resumed = useRef(false)
  useEffect(() => {
    if (accountState.status === 'loading' || resumed.current) return
    resumed.current = true
    void flow.resume(accountState.status === 'signedIn')
  }, [accountState.status, flow])

  useEffect(() => {
    if (state.wrapSaved) toast.success(i18n.t('webSignIn_passkeyUnlocks'))
  }, [state.wrapSaved])

  if (accountState.status === 'loading') return <LaunchSplash />

  if (accountState.status === 'signedIn') {
    if (state.approvedBy !== null)
      return (
        <WebSignInRoot>
          <ApprovedBy
            deviceName={state.approvedBy}
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
    return children
  }

  if (skipped) return children

  return (
    <WebSignInRoot>
      <WebSignInScreen
        flow={flow}
        state={state}
        ended={accountState.ended ?? state.ended}
        keptData={accountState.keptData}
        onCreateAccount={() => {
          later.write()
          setSkipped(true)
        }}
      />
    </WebSignInRoot>
  )
}
