import { View } from 'react-native'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import useAccessibilityTextSize, {
  FIT_ONE_LINE,
} from '@/hooks/useAccessibilityTextSize'
import { PET_SPECIES_IDS, type PetSpecies } from '@/types/pet'
import { speciesName } from '@/features/pet/lib/names'
import type { PetChoice } from '@/features/pet/lib/pickerSave'
import PetSpriteTile from '@/features/pet/render/PetSpriteTile'
import { defaultCoatFor } from '@/types/pet'

/**
 * The five animals in a 3-column grid (2 at accessibility text sizes, where the
 * names shrink to their tile), each idling; the chosen one ringed.
 */
export default function PetSpeciesGrid({
  choice,
  onSelect,
}: {
  choice: PetChoice
  onSelect: (species: PetSpecies) => void
}) {
  const theme = useTheme()
  const largeText = useAccessibilityTextSize()
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 10 }}>
      {PET_SPECIES_IDS.map((species, i) => {
        const selected = species === choice.species
        return (
          <View
            key={species}
            style={{
              width: largeText ? '50%' : '33.333%',
              paddingHorizontal: 5,
            }}
          >
            <Button
              accessibilityRole='radio'
              accessibilityState={{ selected }}
              accessibilityLabel={speciesName(species)}
              onPress={() => onSelect(species)}
              style={{
                alignItems: 'center',
                gap: 6,
                paddingVertical: 10,
                borderRadius: theme.numbers.borderRadiusMd,
                borderWidth: 2,
                borderColor: selected ? theme.colors.accent : 'transparent',
                backgroundColor: theme.colors.backgroundLighter,
              }}
            >
              <PetSpriteTile
                species={species}
                coat={selected ? choice.coat : defaultCoatFor(species)}
                size={64}
                mood={selected ? 'joy' : 'happy'}
                seed={i * 700}
              />
              <Text
                numberOfLines={1}
                {...(largeText ? FIT_ONE_LINE : undefined)}
                style={{
                  fontSize: theme.fontSize('sm'),
                  fontFamily: selected
                    ? theme.fonts.semiBold
                    : theme.fonts.regular,
                }}
              >
                {speciesName(species)}
              </Text>
            </Button>
          </View>
        )
      })}
    </View>
  )
}
