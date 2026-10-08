import { useEffect, useState } from 'react'
import * as Linking from 'expo-linking'
import { navigationRef } from '@/features/contacts/lib/linking'
import useBuddiesEnabled from '@/features/buddies/hooks/useBuddiesEnabled'
import { isInviteLink } from '@/features/buddies/lib/inviteLink'
import { useIsTakingOver, useTakeoverHold } from '@/hooks/useTakeoverTurn'
import { usePreferences } from '@/stores/preferences'

/**
 * Routes `https://ww-proxy.leviwilkerson.com/b#1…` invite links to the
 * pre-accept screen. A cold-start link waits until the feature flag resolves
 * and navigation is ready instead of being dropped, and until onboarding is
 * done and nothing is taking over the screen (ADR 0021).
 */
export default function BuddyInviteListener() {
  const enabled = useBuddiesEnabled()
  const onboarded = usePreferences((s) => s.onboardingComplete)
  const takingOver = useIsTakingOver()
  const [pendingLink, setPendingLink] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  useTakeoverHold('invite-link', pendingLink !== null && enabled)

  useEffect(() => {
    void Linking.getInitialURL().then((url) => {
      if (url && isInviteLink(url)) setPendingLink(url)
    })
    const subscription = Linking.addEventListener('url', ({ url }) => {
      if (isInviteLink(url)) setPendingLink(url)
    })
    return () => subscription.remove()
  }, [])

  useEffect(() => {
    if (!enabled || !pendingLink || !onboarded || takingOver) return
    if (!navigationRef.isReady()) {
      const timer = setTimeout(() => setRetry((count) => count + 1), 300)
      return () => clearTimeout(timer)
    }
    navigationRef.navigate('Buddy Invite', { link: pendingLink })
    setPendingLink(null)
  }, [enabled, pendingLink, retry, onboarded, takingOver])

  return null
}
