import { useSyncExternalStore } from 'react'
import { webAccount } from '@/lib/serverAccount'

const signedIn = () => webAccount?.state().status === 'signedIn'
const never = () => () => undefined

/**
 * Whether a browser shows Settings → Account: signed in. A browser signed out
 * (a key change elsewhere included) sees the sign-in screen instead. Always
 * false on phones, which show it by their key store.
 */
export default function useWebAccountShown(): boolean {
  return useSyncExternalStore(webAccount?.subscribe ?? never, signedIn)
}
