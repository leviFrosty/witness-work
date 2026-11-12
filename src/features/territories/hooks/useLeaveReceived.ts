import confirmDestructive from '@/lib/confirmDestructive'
import i18n from '@/lib/locales'
import { toast } from '@/stores/toasts'
import confirmNeutral from '@/features/territories/lib/confirmNeutral'
import useTerritorySharing from '@/features/territories/hooks/useTerritorySharing'
import { isReceivedLive } from '@/features/territories/lib/sharing'
import { territoryTitle } from '@/features/territories/lib/territoryTitle'
import { useTerritories } from '@/features/territories/stores/territories'
import type { Territory } from '@/features/territories/types/territory'

export default function useLeaveReceived(
  territory: Territory,
  heldStreetId?: string
) {
  const remove = useTerritories((state) => state.remove)
  const { actions } = useTerritorySharing()
  const received = territory.received
  const live = isReceivedLive(territory)
  const handoff = received?.kind === 'handoff' || heldStreetId !== undefined
  const name = received?.from.name ?? ''
  const street =
    (heldStreetId
      ? territory.streets.find((each) => each.id === heldStreetId)
      : territory.streets[0]
    )?.name ?? ''

  const removeCopy = () => {
    remove(territory.id)
    toast.success(i18n.t('territories.share.left_toast'))
  }

  const leave = async () => {
    if (!(await actions.leave(territory.id))) return
    toast.success(i18n.t('territories.share.left_toast'))
  }

  const giveBack = async () => {
    for (const streetId of heldStreetId
      ? [heldStreetId]
      : (received?.streetIds ?? []))
      if (!(await actions.endHandoff(territory.id, streetId))) return
    toast.success(i18n.t('territories.share.left_toast'))
  }

  return () =>
    !live || !territory.shared
      ? removeCopy()
      : handoff
        ? confirmNeutral({
            title: i18n.t('territories.share.giveBack_title', { street, name }),
            description: i18n.t('territories.share.giveBack_description', {
              name,
            }),
            confirmLabel: i18n.t('territories.share.giveBack'),
            onConfirm: () => void giveBack(),
          })
        : confirmDestructive({
            title: i18n.t('territories.share.leave_title', {
              territory: territoryTitle(territory),
            }),
            description: i18n.t('territories.share.leave_description', {
              name,
            }),
            confirmLabel: i18n.t('territories.share.leave'),
            onConfirm: () => void leave(),
          })
}
