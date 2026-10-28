import { useState } from 'react'
import { View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import i18n from '@/lib/locales'
import { PET_NAME_MAX_LENGTH } from '@/types/pet'
import type { RootStackParamList } from '@/types/rootStack'
import usePet from '@/stores/pet'
import PetCoatSwatches from '@/features/pet/components/PetCoatSwatches'
import PetIntro from '@/features/pet/components/PetIntro'
import PetNameField from '@/features/pet/components/PetNameField'
import PetSpeciesGrid from '@/features/pet/components/PetSpeciesGrid'
import { GameButton } from '@/features/pet/components/GameControls'
import GameSheet from '@/features/pet/components/GameSheet'
import useGamePalette from '@/features/pet/hooks/useGamePalette'
import {
  choiceForSpecies,
  initialPetChoice,
  petPickerSave,
} from '@/features/pet/lib/pickerSave'
import { speciesName } from '@/features/pet/lib/names'
import useSavePetChoice from '@/features/pet/hooks/useSavePetChoice'

type Props = NativeStackScreenProps<RootStackParamList, 'PetPicker'>

/**
 * Adopt a companion or change its look: the five animals, the chosen one's
 * coats, and (adopting) an optional name. One primary action; the sheet's own
 * dismissal cancels. Adopting then shows a short intro in the same sheet.
 */
export default function PetPickerScreen({ route, navigation }: Props) {
  const palette = useGamePalette()
  const current = usePet((s) => s.pet)
  const [choice, setChoice] = useState(() =>
    initialPetChoice(current, route.params?.species)
  )
  const [name, setName] = useState('')
  const save = useSavePetChoice()
  // Set once Adopt is pressed, so the intro stays up with the new pet.
  const [showIntro, setShowIntro] = useState(false)
  const adopting = route.params?.mode !== 'change' || !current
  const action = petPickerSave({ ...choice, name }, current)

  if (showIntro && current)
    return (
      <GameSheet>
        <PetIntro pet={current} onDone={() => navigation.goBack()} />
      </GameSheet>
    )

  return (
    <GameSheet
      title={i18n.t(
        adopting ? 'pet.picker.adoptTitle' : 'pet.picker.changeTitle'
      )}
    >
      <View style={{ marginHorizontal: -2 }}>
        <PetSpeciesGrid
          choice={choice}
          onSelect={(species) => setChoice(choiceForSpecies(species, current))}
          palette={palette}
        />
      </View>
      <PetCoatSwatches
        species={choice.species}
        coat={choice.coat}
        onSelect={(coat) => setChoice({ ...choice, coat })}
        palette={palette}
      />
      {adopting && (
        <PetNameField
          value={name}
          onChangeText={setName}
          placeholder={speciesName(choice.species)}
          maxLength={PET_NAME_MAX_LENGTH}
          palette={palette}
        />
      )}
      <GameButton
        label={i18n.t(adopting ? 'pet.picker.adopt' : 'pet.picker.save')}
        disabled={action.kind === 'none'}
        onPress={() => {
          save(action)
          if (action.kind === 'adopt') setShowIntro(true)
          else navigation.goBack()
        }}
        palette={palette}
      />
    </GameSheet>
  )
}
