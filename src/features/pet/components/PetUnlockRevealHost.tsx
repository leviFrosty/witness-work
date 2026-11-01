import { type ComponentProps, useEffect } from 'react'
import { useNavigation } from '@react-navigation/native'
import type PetUnlockRevealComponent from '@/features/pet/components/PetUnlockReveal'
import usePetLife from '@/features/pet/hooks/usePetLife'
import { petDisplayName } from '@/features/pet/lib/names'
import { showPetUnlockToasts } from '@/features/pet/lib/unlockToasts'
import {
  endPetUnlockReveal,
  settlePetUnlocks,
  usePetUnlockNews,
} from '@/features/pet/stores/petUnlockNews'
import useTakeoverTurn from '@/hooks/useTakeoverTurn'
import { analytics } from '@/lib/analytics'
import type { RootStackNavigation } from '@/types/rootStack'

export default function PetUnlockRevealHost() {
  const navigation = useNavigation<RootStackNavigation>()
  const revealing = usePetUnlockNews((s) => s.revealing)
  const toasting = usePetUnlockNews((s) => s.toasting)
  useEffect(() => {
    if (!toasting) return
    usePetUnlockNews.setState({ toasting: null })
    showPetUnlockToasts(toasting.items, toasting.petName, toasting.expiresAt)
  }, [toasting])
  const { pet } = usePetLife()
  const turn = useTakeoverTurn('pet-unlock', revealing !== null && pet !== null)
  if (!turn.active || !revealing || !pet) return null

  return (
    <PetUnlockReveal
      key={revealing}
      item={revealing}
      petName={petDisplayName(pet)}
      onClose={(action) => {
        settlePetUnlocks([revealing])
        endPetUnlockReveal()
        analytics.capture('pet_unlock_reveal_closed', { action })
        if (action === 'decorate')
          navigation.navigate('PetRoom', { focus: revealing })
      }}
    />
  )
}

function PetUnlockReveal(
  props: ComponentProps<typeof PetUnlockRevealComponent>
) {
  const Reveal: typeof PetUnlockRevealComponent =
    require('@/features/pet/components/PetUnlockReveal').default
  return <Reveal {...props} />
}
