import { useEffect, useState } from 'react'
import * as Linking from 'expo-linking'
import { navigationRef } from '@/features/contacts/lib/linking'
import useBuddiesEnabled from '@/features/buddies/hooks/useBuddiesEnabled'
import { isInviteLink } from '@/features/buddies/lib/inviteLink'

/**
 * Routes `https://ww-proxy.leviwilkerson.com/b#1…` invite links to the
 * pre-accept screen. A cold-start link waits until the feature flag resolves
 * and navigation is ready instead of being dropped.
 */
export default function BuddyInviteListener() {
  const enabled = useBuddiesEnabled()
  const [pendingLink, setPendingLink] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)

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
    if (!enabled || !pendingLink) return
    if (!navigationRef.isReady()) {
      const timer = setTimeout(() => setRetry((count) => count + 1), 300)
      return () => clearTimeout(timer)
    }
    navigationRef.navigate('Buddy Invite', { link: pendingLink })
    setPendingLink(null)
  }, [enabled, pendingLink, retry])

  return null
}
