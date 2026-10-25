import type { PetVisit } from '@/types/pet'
import { usePetSession } from '@/features/pet/stores/petSession'

/** Today's visits, or the dev harness's made-up ones in their place. */
export default function useShownPetVisits(
  visits: readonly PetVisit[]
): readonly PetVisit[] {
  const override = usePetSession((s) =>
    __DEV__ ? s.devOverride?.visits : null
  )
  return override ?? visits
}
