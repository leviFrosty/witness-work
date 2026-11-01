import { useEffect, useState } from 'react'
import * as Linking from 'expo-linking'
import { launchURL } from '@/lib/launchLinks'
import { navigationRef } from '@/features/contacts/lib/linking'
import { isHandoffLink } from '@/lib/serverAccount/handoff'
import { useIsTakingOver, useTakeoverHold } from '@/hooks/useTakeoverTurn'
import { usePreferences } from '@/stores/preferences'

export default function HandoffLinkListener() {
  const onboarded = usePreferences((s) => s.onboardingComplete)
  const takingOver = useIsTakingOver()
  const [pendingLink, setPendingLink] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  useTakeoverHold('handoff-link', pendingLink !== null && onboarded)

  useEffect(() => {
    void launchURL().then((url) => {
      if (url && isHandoffLink(url)) setPendingLink(url)
    })
    const subscription = Linking.addEventListener('url', ({ url }) => {
      if (isHandoffLink(url)) setPendingLink(url)
    })
    return () => subscription.remove()
  }, [])

  useEffect(() => {
    if (!pendingLink || (onboarded && takingOver)) return
    if (!navigationRef.isReady()) {
      const timer = setTimeout(() => setRetry((count) => count + 1), 300)
      return () => clearTimeout(timer)
    }
    navigationRef.navigate('Sign In With QR Code', {
      entry: 'link',
      link: pendingLink,
    })
    setPendingLink(null)
  }, [pendingLink, retry, onboarded, takingOver])

  return null
}
