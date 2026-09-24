import { Share } from 'react-native'
import i18n from '@/lib/locales'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'

export function shareInviteLink(link: string) {
  return Share.share({
    message: i18n.t('buddies_inviteShareMessage', { link }),
  })
}

/** Creates a fresh single-use invite and opens the share sheet for it. */
export async function createAndShareInvite() {
  await shareInviteLink(await buddiesEngine.createInvite())
}
