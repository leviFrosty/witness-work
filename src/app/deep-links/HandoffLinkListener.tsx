import { useEffect, useState } from 'react'
import { addLinkListener, launchURL } from '@/lib/launchLinks'
import { navigationRef } from '@/features/contacts/lib/linking'
import { isHandoffLink } from '@/lib/serverAccount/handoff'
import { useIsTakingOver, useTakeoverHold } from '@/hooks/useTakeoverTurn'
import { usePreferences } from '@/stores/preferences'

/**
 * Routes Set Up Another Device links (`https://ww-proxy.leviwilkerson.com/h#1…`
 * or `https://witnesswork.app/accounts/handoff#1…`), opened from the system
 * camera, to Sign In with QR Code. A cold-start link waits until navigation is
 * ready instead of being dropped. During onboarding it opens over the welcome
 * flow at once, since signing in is how a new phone starts; after onboarding it
 * waits until nothing is taking over the screen (ADR 0021).
 */
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
    const subscription = addLinkListener((url) => {
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
