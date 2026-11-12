import confirmDestructive from '@/lib/confirmDestructive'
import i18n from '@/lib/locales'
import { useTerritoryPrivacy } from '@/hooks/useTerritoryPrivacy'
import { toast } from '@/stores/toasts'
import useTerritorySharing from '@/features/territories/hooks/useTerritorySharing'
import { deleteCardPhoto } from '@/features/territories/lib/cardPhoto'
import {
  checkOutAgain,
  finishTerritory,
  reopenTerritory,
  removeStreet,
  sharesWithOthers,
  updateStreet,
  workingStreets,
} from '@/features/territories/lib/doors'
import { formatDoorAddress } from '@/features/territories/lib/territoryTitle'
import { useTerritories } from '@/features/territories/stores/territories'
import type { Territory } from '@/features/territories/types/territory'

export default function useTerritoryActions() {
  const update = useTerritories((state) => state.update)
  const remove = useTerritories((state) => state.remove)
  const { actions } = useTerritorySharing()
  const privacy = useTerritoryPrivacy()

  const requestReturn = (territory: Territory) => {
    const unworked = workingStreets(territory).filter(
      (street) => street.workedAt === undefined
    ).length
    confirmDestructive({
      title: i18n.t('territories.finish_title'),
      description: [
        unworked > 0 &&
          i18n.t('territories.finish_unworked', { count: unworked }),
        i18n.t(
          privacy
            ? 'territories.finish_descriptionPrivacy'
            : 'territories.finish_description'
        ),
        sharesWithOthers(territory) &&
          i18n.t('territories.share.finishEndsSharing'),
      ]
        .filter(Boolean)
        .join(' '),
      confirmLabel: i18n.t('territories.finish'),
      onConfirm: () => {
        if (territory.shared) {
          void actions.returnTerritory(territory.id).then((returned) => {
            if (returned) toast.success(i18n.t('territories.finished_toast'))
          })
          return
        }
        update(territory.id, (current) =>
          finishTerritory(current, Date.now(), formatDoorAddress)
        )
        toast.success(i18n.t('territories.finished_toast'))
      },
    })
  }

  const reopen = (territory: Territory) => {
    update(territory.id, reopenTerritory)
    toast.info(i18n.t('territories.reopened_toast'))
  }

  const requestCheckOutAgain = (territory: Territory) =>
    confirmDestructive({
      title: i18n.t('territories.checkOutAgain_title', {
        number: territory.number,
      }),
      description: i18n.t('territories.checkOutAgain_description'),
      confirmLabel: i18n.t('territories.checkOutAgain'),
      onConfirm: () => {
        update(territory.id, (current) => checkOutAgain(current, Date.now()))
        toast.success(i18n.t('territories.checkedOutAgain_toast'))
      },
    })

  const requestDelete = (territory: Territory) =>
    confirmDestructive({
      title: i18n.t('territories.delete_title'),
      description: i18n.t('territories.delete_description'),
      onConfirm: () =>
        void (async () => {
          if (
            territory.shared &&
            !(await actions.returnTerritory(territory.id))
          )
            return
          void deleteCardPhoto(territory.photo)
          remove(territory.id)
        })(),
    })

  const requestDeleteStreet = (
    territory: Territory,
    streetId: string,
    onDeleted?: () => void
  ) =>
    confirmDestructive({
      title: i18n.t('territories.deleteStreet_title'),
      description: i18n.t('territories.deleteStreet_description'),
      onConfirm: () => {
        update(territory.id, (current) => removeStreet(current, streetId))
        onDeleted?.()
      },
    })

  const setStreetWorked = (
    territory: Territory,
    streetId: string,
    worked: boolean
  ) =>
    update(territory.id, (current) =>
      updateStreet(current, streetId, (street) =>
        worked
          ? { ...street, workedAt: Date.now(), workedBy: undefined }
          : { ...street, workedAt: undefined }
      )
    )

  return {
    requestReturn,
    reopen,
    requestCheckOutAgain,
    requestDelete,
    requestDeleteStreet,
    setStreetWorked,
  }
}
