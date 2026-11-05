import { useEffect, useState } from 'react'
import { Platform } from 'react-native'
import { appLinkFragment } from '@/constants/appLinks'
import { addLinkListener, launchURL, linkOpened } from '@/lib/launchLinks'
import { navigationRef } from '@/features/contacts/lib/linking'
import useBuddiesEnabled from '@/features/buddies/hooks/useBuddiesEnabled'
import { isInviteLink } from '@/features/buddies/lib/inviteLink'
import { useIsTakingOver, useTakeoverHold } from '@/hooks/useTakeoverTurn'
import { usePreferences } from '@/stores/preferences'

const isWeb = Platform.OS === 'web'

/**
 * Whether `url` opens the pre-accept screen. On the web, an invite link whose
 * fragment doesn't read (cut short, a later version) opens it too, and the
 * screen says the link isn't valid: the web app opened it from its own address,
 * so nothing else would tell the User.
 */
const opensInvite = (url: string) =>
  isInviteLink(url) || (isWeb && !!appLinkFragment(url, 'buddyInvite'))

/**
 * Routes invite links (`https://ww-proxy.leviwilkerson.com/b#1…` or
 * `https://witnesswork.app/buddies/invite#1…`) to the pre-accept screen. The
 * URL must be an invite link from its start (`isInviteLink`), not merely carry
 * one, as `witnesswork://x?u=https://…` would. A cold-start link waits until
 * the feature flag resolves and navigation is ready instead of being dropped,
 * and until onboarding is done and nothing is taking over the screen (ADR
 * 0021).
 */
export default function BuddyInviteListener() {
  const enabled = useBuddiesEnabled()
  const onboarded = usePreferences((s) => s.onboardingComplete)
  const takingOver = useIsTakingOver()
  const [pendingLink, setPendingLink] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  useTakeoverHold('invite-link', pendingLink !== null && enabled)

  useEffect(() => {
    void launchURL('buddy-invite').then((url) => {
      if (url && opensInvite(url)) setPendingLink(url)
    })
    const subscription = addLinkListener((url) => {
      if (opensInvite(url)) setPendingLink(url)
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
    // On the web, it then never comes back after a remount or reload.
    linkOpened(pendingLink)
    setPendingLink(null)
  }, [enabled, pendingLink, retry, onboarded, takingOver])

  return null
}
