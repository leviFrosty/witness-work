import { useSyncExternalStore } from 'react'
import { Platform } from 'react-native'
import { useKeyChangedElsewhere } from '@/lib/accountKey/keyChangedElsewhere'
import { webAccount } from '@/lib/serverAccount'

const isWeb = Platform.OS === 'web'
const signedIn = () => webAccount?.state().status === 'signedIn'
const never = () => () => undefined

/**
 * Whether a browser shows Settings → Account: signed in, or signed out because
 * the account key changed on another device (it says how to sign back in).
 * Always false on phones, which show it by their key store.
 */
export default function useWebAccountShown(): boolean {
  const signedInHere = useSyncExternalStore(
    webAccount?.subscribe ?? never,
    signedIn
  )
  const keyChanged = useKeyChangedElsewhere(
    (state) => isWeb && state.signedOut !== null
  )
  return signedInHere || keyChanged
}
