import useToday from '@/hooks/useToday'
import { analytics } from '@/lib/analytics'
import Haptics from '@/lib/haptics'
import usePet from '@/stores/pet'
import { localDayKey } from '@/features/pet/lib/dayKeys'
import type { PetPickerSave } from '@/features/pet/lib/pickerSave'
import { usePetSession } from '@/features/pet/stores/petSession'

export default function useSavePetChoice() {
  const todayKey = localDayKey(useToday())
  return (action: PetPickerSave) => {
    if (action.kind === 'none') return
    const { adopt, changeAppearance } = usePet.getState()
    if (action.kind === 'adopt') {
      adopt({
        species: action.species,
        coat: action.coat,
        name: action.name,
        today: todayKey,
      })
      analytics.capture('pet_adopted', {
        species: action.species,
        coat: action.coat,
      })
    } else {
      changeAppearance({ species: action.species, coat: action.coat })
      analytics.capture('pet_appearance_changed', {
        species: action.species,
        coat: action.coat,
      })
    }
    usePetSession.getState().requestEntrance(action.species)
    Haptics.success()
  }
}
