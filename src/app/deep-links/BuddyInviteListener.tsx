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

const opensInvite = (url: string) =>
  isInviteLink(url) || (isWeb && !!appLinkFragment(url, 'buddyInvite'))

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

    linkOpened(pendingLink)
    setPendingLink(null)
  }, [enabled, pendingLink, retry, onboarded, takingOver])

  return null
}
