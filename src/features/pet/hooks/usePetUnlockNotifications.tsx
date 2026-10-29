import { useShallow } from 'zustand/react/shallow'
import PetUnlockArt from '@/features/pet/components/PetUnlockArt'
import { ROOM_TAB_ICONS } from '@/features/pet/components/roomTabIcons'
import { petDisplayName } from '@/features/pet/lib/names'
import {
  petUnlockKey,
  unlockedPart,
  unlockTab,
  unlockTrayText,
} from '@/features/pet/lib/unlockNews'
import {
  revealPetUnlock,
  settlePetUnlocks,
  usePetUnlockNews,
} from '@/features/pet/stores/petUnlockNews'
import { analytics } from '@/lib/analytics'
import i18n from '@/lib/locales'
import usePet from '@/stores/pet'
import { toastKeys, useToasts } from '@/stores/toasts'
import type { NotificationItem } from '@/types/notifications'

/**
 * Pet items that opened up and that the User hasn't looked at, one tray item
 * each: opened while the app wasn't in front or at launch, or an unlock toast
 * that left without being opened or swiped away. View opens the full-screen
 * reveal. Leaves out an item whose toast or reveal is on screen; Decorate Room
 * settles them all.
 */
export default function usePetUnlockNotifications(): NotificationItem[] {
  const unseen = usePetUnlockNews((s) => s.unseen)
  const revealing = usePetUnlockNews((s) => s.revealing)
  const pet = usePet((s) => s.pet)
  const onScreen = useToasts(useShallow((s) => toastKeys(s.toasts)))
  if (!pet) return []
  const name = petDisplayName(pet)

  return unseen
    .filter(
      ({ item }) => item !== revealing && !onScreen.includes(petUnlockKey(item))
    )
    .map(({ item, at }): NotificationItem => {
      const text = unlockTrayText(item, name)
      return {
        id: petUnlockKey(item),
        kind: 'pet_unlock',
        at,
        icon: ROOM_TAB_ICONS[unlockTab(unlockedPart(item).part)],
        art: (size) => <PetUnlockArt item={item} size={size} />,
        tone: 'accent',
        title: text.title,
        description: text.description,
        actions: [
          {
            id: 'view',
            label: i18n.t('view'),
            onPress: () => {
              analytics.capture('unlock_opened_from_tray', {
                kind: 'pet_item',
              })
              revealPetUnlock(item)
            },
          },
        ],
        onDismiss: () => settlePetUnlocks([item]),
      }
    })
}
