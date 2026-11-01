import { useEffect } from 'react'
import { Platform, ScrollView } from 'react-native'
import { useIsFocused } from '@react-navigation/native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { isHomeSectionShown, setHomeSectionShown } from '@/lib/homeSections'
import i18n from '@/lib/locales'
import usePet from '@/stores/pet'
import { usePreferences } from '@/stores/preferences'
import { SPECIES } from '@/features/pet/art'
import type { RootStackParamList } from '@/types/rootStack'
import PetBuddyVisitsSection from '@/app/pet/PetBuddyVisitsSection'
import PetRewardsSection from '@/app/pet/PetRewardsSection'
import useBuddiesEnabled from '@/features/buddies/hooks/useBuddiesEnabled'
import { cssColor } from '@/features/pet/art/gameUi'
import {
  GameRow,
  GameSection,
  GameSwitchRow,
} from '@/features/pet/components/GameRows'
import {
  GameSheetHeader,
  useGameSheetBackground,
} from '@/features/pet/components/GameSheet'
import useGamePalette from '@/features/pet/hooks/useGamePalette'
import usePetSheetInsets from '@/features/pet/hooks/usePetSheetInsets'
import { coatName, speciesName } from '@/features/pet/lib/names'

type Props = NativeStackScreenProps<RootStackParamList, 'PetSettings'>

export default function PetSettingsScreen({ navigation }: Props) {
  const palette = useGamePalette()
  const sheetInsets = usePetSheetInsets()
  const buddiesEnabled = useBuddiesEnabled()
  const homeScreenElements = usePreferences((s) => s.homeScreenElements)
  const petPromptDismissed = usePreferences((s) => s.petPromptDismissed)
  const pet = usePet((s) => s.pet)
  useGameSheetBackground(palette)

  const hasPet = pet !== null
  const focused = useIsFocused()
  useEffect(() => {
    if (!hasPet && focused) navigation.goBack()
  }, [hasPet, focused, navigation])
  if (!pet) return null

  const coats = SPECIES[pet.species].coatIds.length > 1
  const look = coats
    ? `${speciesName(pet.species)} · ${coatName(pet.species, pet.coat)}`
    : speciesName(pet.species)

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: cssColor(palette.paper) }}
      contentContainerStyle={{
        paddingHorizontal: 20,
        paddingTop: sheetInsets.top - 8,

        paddingBottom: Platform.OS === 'ios' ? 24 : sheetInsets.bottom + 8,
        gap: 20,
      }}
    >
      <GameSheetHeader
        title={i18n.t('pet.settings.title')}
        palette={palette}
        onBack={() => navigation.goBack()}
      />
      <GameSection title={i18n.t('pet.settings.petTitle')} palette={palette}>
        <GameRow
          label={i18n.t('pet.settings.name')}
          value={pet.name || speciesName(pet.species)}
          onPress={() => navigation.navigate('PetRename')}
          palette={palette}
        />
        <GameRow
          label={i18n.t('pet.details.change')}
          value={look}
          onPress={() => navigation.navigate('PetPicker', { mode: 'change' })}
          palette={palette}
        />
      </GameSection>
      <GameSection palette={palette}>
        <GameSwitchRow
          label={i18n.t('pet.settings.showOnHome')}
          value={isHomeSectionShown('pet', {
            homeScreenElements,
            petPromptDismissed,
            hasPet,
          })}
          onValueChange={(shown) => setHomeSectionShown('pet', shown)}
          palette={palette}
        />
      </GameSection>
      <PetRewardsSection palette={palette} />
      {buddiesEnabled && <PetBuddyVisitsSection palette={palette} />}
    </ScrollView>
  )
}
