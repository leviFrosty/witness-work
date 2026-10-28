import { useEffect, useState } from 'react'
import { useIsFocused } from '@react-navigation/native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import Haptics from '@/lib/haptics'
import i18n from '@/lib/locales'
import usePet, { cleanPetName } from '@/stores/pet'
import { PET_NAME_MAX_LENGTH } from '@/types/pet'
import type { RootStackParamList } from '@/types/rootStack'
import { GameButton } from '@/features/pet/components/GameControls'
import GameSheet from '@/features/pet/components/GameSheet'
import PetNameField from '@/features/pet/components/PetNameField'
import useGamePalette from '@/features/pet/hooks/useGamePalette'
import { speciesName } from '@/features/pet/lib/names'

type Props = NativeStackScreenProps<RootStackParamList, 'PetRename'>

/**
 * Renames the companion: one field with the species name as its placeholder.
 * Saving an empty name removes it, so the card shows the species name. The
 * sheet's own dismissal cancels.
 */
export default function PetRenameScreen({ navigation }: Props) {
  const palette = useGamePalette()
  const pet = usePet((s) => s.pet)
  const [name, setName] = useState(pet?.name ?? '')

  const hasPet = pet !== null
  // Closes once it's on top again, so it never pops a screen above it.
  const focused = useIsFocused()
  useEffect(() => {
    if (!hasPet && focused) navigation.goBack()
  }, [hasPet, focused, navigation])
  if (!pet) return null

  const changed = cleanPetName(name) !== pet.name
  const save = () => {
    if (!changed) return
    usePet.getState().rename(name)
    Haptics.success()
    navigation.goBack()
  }

  return (
    <GameSheet title={i18n.t('pet.rename.title')}>
      <PetNameField
        value={name}
        onChangeText={setName}
        placeholder={speciesName(pet.species)}
        maxLength={PET_NAME_MAX_LENGTH}
        autoFocus
        onSubmitEditing={save}
        palette={palette}
      />
      <GameButton
        label={i18n.t('pet.picker.save')}
        disabled={!changed}
        onPress={save}
        palette={palette}
      />
    </GameSheet>
  )
}
