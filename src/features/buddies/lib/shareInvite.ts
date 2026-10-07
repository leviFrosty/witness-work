import { Share } from 'react-native'
import i18n from '@/lib/locales'
import { logger } from '@/lib/logger'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import { refreshBuddyAvatarThumbnail } from '@/features/buddies/lib/buddyProfile'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

export function shareInviteLink(link: string) {
  return Share.share({
    message: i18n.t('buddies_inviteShareMessage', { link }),
  })
}

/** Creates a fresh single-use invite and opens the share sheet for it. */
export async function createAndShareInvite() {
  await shareInviteLink(await buddiesEngine.createInvite())
}

/**
 * Starts Buddies from outside its screen, where the caller has already
 * explained it (setup). Returns `inviteId`'s link while that invite is still
 * open; otherwise readies the Profile photo so it travels with the invite,
 * creates a single-use invite (registering this device's inbox on first use),
 * and counts the Buddies intro as seen, so Buddies opens on its list. Share the
 * result with `shareInviteLink`.
 */
export async function startBuddiesInvite(
  inviteId?: string | null
): Promise<{ inviteId: string | null; link: string }> {
  const open = inviteId ? buddiesEngine.inviteLinkFor(inviteId) : null
  if (inviteId && open) return { inviteId, link: open }
  await refreshBuddyAvatarThumbnail().catch((error) =>
    logger.warn('[buddies] avatar thumbnail', error)
  )
  const link = await buddiesEngine.createInvite()
  useBuddies.setState({ onboardingComplete: true })
  const created = useBuddies
    .getState()
    .outgoingInvites.find(
      (invite) => buddiesEngine.inviteLinkFor(invite.inviteId) === link
    )
  return { inviteId: created?.inviteId ?? null, link }
}
