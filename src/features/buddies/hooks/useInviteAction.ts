import { useEffect, useRef, useState } from 'react'
import { Share } from 'react-native'
import i18n from '@/lib/locales'
import { alertBuddiesError } from '@/features/buddies/lib/buddiesErrorAlert'
import {
  shareInviteLink,
  startBuddiesInvite,
} from '@/features/buddies/lib/shareInvite'

/**
 * Invite a Buddy from the Buddies screen: makes an invite and opens the share
 * sheet. One at a time, so a double tap can't use two of the five spots, and an
 * invite whose sheet was dismissed is offered again instead of making another.
 * `inviting` while the invite is being made.
 */
export default function useInviteAction() {
  const [inviting, setInviting] = useState(false)
  const busy = useRef(false)
  const unsentInviteId = useRef<string | null>(null)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const invite = async () => {
    if (busy.current) return
    busy.current = true
    setInviting(true)
    try {
      const { inviteId, link } = await startBuddiesInvite(
        unsentInviteId.current
      )
      unsentInviteId.current = inviteId
      if (mounted.current) setInviting(false)
      const { action } = await shareInviteLink(link)
      if (action === Share.sharedAction) unsentInviteId.current = null
    } catch (error) {
      alertBuddiesError(i18n.t('buddies_errorInviteTitle'), error)
    } finally {
      busy.current = false
      if (mounted.current) setInviting(false)
    }
  }

  return { invite, inviting }
}
