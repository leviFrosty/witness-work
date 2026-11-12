import i18n from '@/lib/locales'
import { isSpaceError } from '@/lib/sharedSpaces/client'
import { toast } from '@/stores/toasts'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'
import { TerritorySharingError } from '@/app/territories/engine/types'
import {
  SHARING_FAILURE_TEXT,
  sharingFailure,
} from '@/app/territories/sharingFailure'
import { territoryInvitations } from '@/app/territories/territoriesService'
import { TerritoryInvitationError } from '@/app/territories/territoryInvitations'

const territoryLabel = (key: string) => {
  const invite = useBuddies.getState().carInvites[key]
  return (
    invite?.territory?.title ||
    invite?.name ||
    i18n.t('territories.share.aTerritory')
  )
}

export function territoryJoinErrorMessage(error: unknown): string {
  if (
    error instanceof TerritoryInvitationError ||
    (error instanceof TerritorySharingError && error.code === 'invalid_invite')
  )
    return i18n.t('buddies_carInviteClosed')
  if (isSpaceError(error))
    switch (error.code) {
      case 'not_found':
      case 'forbidden':
      case 'gone':
      case 'conflict':
      case 'stale_key':
        return i18n.t('buddies_carInviteClosed')
    }
  return i18n.t(SHARING_FAILURE_TEXT[sharingFailure(error)])
}

export async function joinTerritoryInvite(key: string): Promise<boolean> {
  if (territoryInvitations.isAnswering(key)) return false
  const territory = territoryLabel(key)
  const toastKey = `territory-join:${key}`
  const joining = territoryInvitations.join(key)
  toast.info(i18n.t('territories.share.joining', { territory }), {
    key: toastKey,
  })
  try {
    await joining
  } catch (error) {
    toast.error(i18n.t('territories.share.joinFailed', { territory }), {
      key: toastKey,
      message: territoryJoinErrorMessage(error),
    })
    return false
  }
  toast.success(i18n.t('territories.share.joined_toast', { territory }), {
    key: toastKey,
  })
  return true
}

export async function declineTerritoryInvite(key: string): Promise<void> {
  await territoryInvitations.decline(key).catch(() => {})
}
