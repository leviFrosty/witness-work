import type { PetVisit } from '@/types/pet'
import { usePetSession } from '@/features/pet/stores/petSession'

export default function useShownPetVisits(
  visits: readonly PetVisit[]
): readonly PetVisit[] {
  const override = usePetSession((s) =>
    __DEV__ ? s.devOverride?.visits : null
  )
  return override ?? visits
}
