import i18n from '@/lib/locales'
import { toast } from '@/stores/toasts'
import confirmNeutral from '@/features/territories/lib/confirmNeutral'
import useTerritorySharing, {
  type TerritoryBuddy,
} from '@/features/territories/hooks/useTerritorySharing'
import type { TerritoryStreet } from '@/features/territories/types/territory'

export default function useHandOffStreet(
  territoryId: string,
  onDone: () => void
) {
  const { actions } = useTerritorySharing()

  const handOff = async (street: TerritoryStreet, buddy: TerritoryBuddy) => {
    if (!(await actions.handOff(territoryId, street.id, buddy.inboxId))) return
    toast.undo({
      title: i18n.t('territories.share.handedOff_toast', {
        street: street.name,
        name: buddy.name,
      }),
      onUndo: () => void actions.endHandoff(territoryId, street.id),
    })
    onDone()
  }

  return (street: TerritoryStreet, buddy: TerritoryBuddy) =>
    confirmNeutral({
      title: i18n.t('territories.share.handOffConfirm_title', {
        street: street.name,
        name: buddy.name,
      }),
      description: i18n.t('territories.share.handOffConfirm_description', {
        street: street.name,
        name: buddy.name,
      }),
      confirmLabel: i18n.t('territories.share.handOffConfirm'),
      onConfirm: () => void handOff(street, buddy),
    })
}
