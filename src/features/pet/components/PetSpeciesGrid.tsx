import { View } from 'react-native'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import useAccessibilityTextSize, {
  FIT_ONE_LINE,
} from '@/hooks/useAccessibilityTextSize'
import { PET_SPECIES_IDS, type PetSpecies } from '@/types/pet'
import { GAME_FRAME_INSET, type GamePalette } from '@/features/pet/art/gameUi'
import { GameFrame, gamePixelScale } from '@/features/pet/components/GamePixels'
import { speciesName } from '@/features/pet/lib/names'
import type { PetChoice } from '@/features/pet/lib/pickerSave'
import PetSpriteTile from '@/features/pet/render/PetSpriteTile'
import { defaultCoatFor } from '@/types/pet'

export default function PetSpeciesGrid({
  choice,
  onSelect,
  palette,
}: {
  choice: PetChoice
  onSelect: (species: PetSpecies) => void
  palette: GamePalette
}) {
  const theme = useTheme()
  const scale = gamePixelScale()
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
              paddingHorizontal: 2,
            }}
          >
            <Button
              accessibilityRole='radio'
              accessibilityState={{ selected }}
              accessibilityLabel={speciesName(species)}
              onPress={() => onSelect(species)}
              pointerEffect='tint'
            >
              <GameFrame
                kind={selected ? 'cardPicked' : 'card'}
                palette={palette}
                style={{
                  alignItems: 'center',
                  gap: 6,
                  padding: GAME_FRAME_INSET.card * scale,
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
                      ? theme.fonts.bold
                      : theme.fonts.semiBold,
                    color: selected ? palette.ink : palette.inkAlt,
                  }}
                >
                  {speciesName(species)}
                </Text>
              </GameFrame>
            </Button>
          </View>
        )
      })}
    </View>
  )
}
