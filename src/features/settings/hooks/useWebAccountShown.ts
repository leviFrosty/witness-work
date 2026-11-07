import { useSyncExternalStore } from 'react'
import { webAccount } from '@/lib/serverAccount'

const signedIn = () => webAccount?.state().status === 'signedIn'
const never = () => () => undefined

export default function useWebAccountShown(): boolean {
  return useSyncExternalStore(webAccount?.subscribe ?? never, signedIn)
}
