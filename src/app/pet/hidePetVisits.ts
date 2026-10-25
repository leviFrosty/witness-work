import i18n from '@/lib/locales'
import { toast } from '@/stores/toasts'
import type { PetVisit } from '@/types/pet'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

/**
 * Stops a visiting pet's buddy's pets from visiting (their own Buddies
 * setting), with an Undo that puts back what they had.
 */
export function hidePetVisits(visit: PetVisit): void {
  const before = useBuddies
    .getState()
    .buddies.find((buddy) => buddy.inboxId === visit.inboxId)
    ?.overrides?.petVisits
  buddiesEngine.setPetVisits(visit.inboxId, false)
  toast.undo({
    title: i18n.t('pet.visitor.hidden', { name: visit.buddyName }),
    onUndo: () => {
      void buddiesEngine
        .setBuddySetting(visit.inboxId, 'petVisits', before)
        .catch(() => {
          // Saved here; the next change or sync writes the roster.
        })
    },
  })
}
