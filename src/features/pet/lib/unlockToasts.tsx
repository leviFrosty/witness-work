import PetUnlockArt from '@/features/pet/components/PetUnlockArt'
import { petUnlockKey, unlockText } from '@/features/pet/lib/unlockNews'
import {
  revealPetUnlock,
  settlePetUnlocks,
} from '@/features/pet/stores/petUnlockNews'
import { analytics } from '@/lib/analytics'
import { toast, toastSettlesUnlock } from '@/stores/toasts'
import type { RoomItemId } from '@/types/pet'

export function showPetUnlockToasts(
  items: readonly RoomItemId[],
  petName: string,
  expiresAt?: number
) {
  for (const item of items) {
    const text = unlockText(item, petName)
    toast.unlock({
      key: petUnlockKey(item),
      ...text,
      art: (size) => <PetUnlockArt item={item} size={size} />,
      expiresAt,
      onShow: () =>
        analytics.capture('unlock_toast_shown', { kind: 'pet_item' }),
      onOpen: () => revealPetUnlock(item),
      onClose: (reason) => {
        analytics.capture('unlock_toast_closed', {
          kind: 'pet_item',
          outcome: reason,
        })
        if (toastSettlesUnlock(reason)) settlePetUnlocks([item])
      },
    })
  }
}
