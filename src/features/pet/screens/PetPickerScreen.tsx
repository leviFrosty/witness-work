import { useEffect, useState } from 'react'
import { Platform, View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import ActionButton from '@/components/ui/ActionButton'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { PET_NAME_MAX_LENGTH } from '@/types/pet'
import type { RootStackParamList } from '@/types/rootStack'
import usePet from '@/stores/pet'
import PetCoatSwatches from '@/features/pet/components/PetCoatSwatches'
import PetIntro from '@/features/pet/components/PetIntro'
import PetNameField from '@/features/pet/components/PetNameField'
import PetSpeciesGrid from '@/features/pet/components/PetSpeciesGrid'
import PetSheetClose from '@/features/pet/components/PetSheetClose'
import {
  choiceForSpecies,
  initialPetChoice,
  petPickerSave,
} from '@/features/pet/lib/pickerSave'
import { speciesName } from '@/features/pet/lib/names'
import useSavePetChoice from '@/features/pet/hooks/useSavePetChoice'
import usePetSheetInsets from '@/features/pet/hooks/usePetSheetInsets'

type Props = NativeStackScreenProps<RootStackParamList, 'PetPicker'>

/**
 * Adopt a companion or change its look: the five animals, the chosen one's
 * coats, and (adopting) an optional name. One primary action; the sheet's own
 * dismissal cancels. Adopting then shows a short intro in the same sheet.
 */
export default function PetPickerScreen({ route, navigation }: Props) {
  const theme = useTheme()
  const sheetInsets = usePetSheetInsets()
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
  // The sheet's bottom inset (below this content on iOS) in the same colour.
  const sheetColor = theme.colors.sheet
  useEffect(() => {
    navigation.setOptions({ contentStyle: { backgroundColor: sheetColor } })
  }, [navigation, sheetColor])

  const sheetStyle = {
    paddingHorizontal: 20,
    paddingTop: sheetInsets.top,
    paddingBottom: sheetInsets.bottom,
    gap: 18,
    backgroundColor: theme.colors.sheet,
    // iOS sizes the sheet to this content; Android shows it full screen.
    flex: Platform.OS === 'android' ? 1 : undefined,
  }

  if (showIntro && current)
    return (
      <View style={sheetStyle}>
        <PetIntro pet={current} onDone={() => navigation.goBack()} />
      </View>
    )

  return (
    <View style={sheetStyle}>
      <Text
        accessibilityRole='header'
        style={{
          fontSize: theme.fontSize('xl'),
          fontFamily: theme.fonts.bold,
        }}
      >
        {i18n.t(adopting ? 'pet.picker.adoptTitle' : 'pet.picker.changeTitle')}
      </Text>
      <View style={{ marginHorizontal: -5 }}>
        <PetSpeciesGrid
          choice={choice}
          onSelect={(species) => setChoice(choiceForSpecies(species, current))}
        />
      </View>
      <PetCoatSwatches
        species={choice.species}
        coat={choice.coat}
        onSelect={(coat) => setChoice({ ...choice, coat })}
      />
      {adopting && (
        <PetNameField
          value={name}
          onChangeText={setName}
          placeholder={speciesName(choice.species)}
          maxLength={PET_NAME_MAX_LENGTH}
        />
      )}
      <ActionButton
        disabled={action.kind === 'none'}
        onPress={() => {
          save(action)
          if (action.kind === 'adopt') setShowIntro(true)
          else navigation.goBack()
        }}
      >
        {i18n.t(adopting ? 'pet.picker.adopt' : 'pet.picker.save')}
      </ActionButton>
      <PetSheetClose />
    </View>
  )
}
