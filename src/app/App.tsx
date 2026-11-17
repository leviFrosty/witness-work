import '../../env'
import '@/lib/locales'
import 'react-native-gesture-handler'
import LaunchSplash from '@/app/launch/LaunchSplash'
import { useStorageUnlock } from '@/app/launch/useStorageUnlock'
import '@/app/buddies/buddiesBackgroundSync'
import '@/lib/analyticsConsent'
import { initializeApp } from '@/app/initializeApp'
import WebAppLockBoundary from '@/app/app-lock/WebAppLockBoundary'
import WebSignInGate from '@/app/web-sign-in/WebSignInGate'
import UnlockedApp from '@/app/launch/UnlockedAppLoader'

initializeApp()

export default function App() {
  if (!useStorageUnlock()) return <LaunchSplash />
  return (
    <WebSignInGate>
      <WebAppLockBoundary>
        <UnlockedApp />
      </WebAppLockBoundary>
    </WebSignInGate>
  )
}
