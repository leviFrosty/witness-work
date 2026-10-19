import { useEffect, useState } from 'react'
import { Platform, View } from 'react-native'
import { useIsFocused } from '@react-navigation/native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import ActionButton from '@/components/ui/ActionButton'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import Haptics from '@/lib/haptics'
import i18n from '@/lib/locales'
import usePet, { cleanPetName } from '@/stores/pet'
import { PET_NAME_MAX_LENGTH } from '@/types/pet'
import type { RootStackParamList } from '@/types/rootStack'
import PetNameField from '@/features/pet/components/PetNameField'
import { speciesName } from '@/features/pet/lib/names'
import usePetSheetInsets from '@/features/pet/hooks/usePetSheetInsets'

type Props = NativeStackScreenProps<RootStackParamList, 'PetRename'>

/**
 * Renames the companion: one field with the species name as its placeholder.
 * Saving an empty name removes it, so the card shows the species name. The
 * sheet's own dismissal cancels.
 */
export default function PetRenameScreen({ navigation }: Props) {
  const theme = useTheme()
  const sheetInsets = usePetSheetInsets()
  const pet = usePet((s) => s.pet)
  const [name, setName] = useState(pet?.name ?? '')
  const sheetColor = theme.colors.sheet
  useEffect(() => {
    navigation.setOptions({ contentStyle: { backgroundColor: sheetColor } })
  }, [navigation, sheetColor])

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
    <View
      style={{
        paddingHorizontal: 20,
        paddingTop: sheetInsets.top,
        paddingBottom: sheetInsets.bottom,
        gap: 18,
        backgroundColor: theme.colors.sheet,
        // iOS sizes the sheet to this content; Android shows it full screen.
        flex: Platform.OS === 'android' ? 1 : undefined,
      }}
    >
      <Text
        accessibilityRole='header'
        style={{
          fontSize: theme.fontSize('xl'),
          fontFamily: theme.fonts.bold,
        }}
      >
        {i18n.t('pet.rename.title')}
      </Text>
      <PetNameField
        value={name}
        onChangeText={setName}
        placeholder={speciesName(pet.species)}
        maxLength={PET_NAME_MAX_LENGTH}
        autoFocus
        onSubmitEditing={save}
      />
      <ActionButton disabled={!changed} onPress={save}>
        {i18n.t('pet.picker.save')}
      </ActionButton>
    </View>
  )
}
