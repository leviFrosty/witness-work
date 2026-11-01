import { View } from 'react-native'
import Button from '@/components/ui/Button'
import { MIN_TOUCH_TARGET } from '@/components/ui/touchTarget'
import type { PetSpecies } from '@/types/pet'
import { SPECIES } from '@/features/pet/art'
import { cssColor, type GamePalette } from '@/features/pet/art/gameUi'
import { GameFrame, gamePixelScale } from '@/features/pet/components/GamePixels'
import { coatName } from '@/features/pet/lib/names'

const SWATCH = 12

export default function PetCoatSwatches({
  species,
  coat,
  onSelect,
  palette,
}: {
  species: PetSpecies
  coat: string
  onSelect: (coat: string) => void
  palette: GamePalette
}) {
  const scale = gamePixelScale()
  const size = SWATCH * scale
  const { coatIds, coats } = SPECIES[species]
  if (coatIds.length < 2) return null
  return (
    <View
      accessibilityRole='radiogroup'
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 2 }}
    >
      {coatIds.map((id) => {
        const selected = id === coat
        return (
          <Button
            key={id}
            accessibilityRole='radio'
            accessibilityState={{ selected }}
            accessibilityLabel={coatName(species, id)}
            onPress={() => onSelect(id)}
            pointerEffect='highlight'
            style={{
              width: Math.max(size + 4 * scale, MIN_TOUCH_TARGET),
              height: Math.max(size + 4 * scale, MIN_TOUCH_TARGET),
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <GameFrame
              kind={selected ? 'cardPicked' : 'card'}
              palette={palette}
              style={{ padding: 2 * scale }}
            >
              <View
                style={{
                  width: size - 2 * scale,
                  height: size - 2 * scale,
                  margin: scale,
                  flexDirection: 'row',
                  borderWidth: scale / 2,
                  borderColor: cssColor(palette.cardEdge),
                }}
              >
                {coats[id].swatch.map((color, i) => (
                  <View key={i} style={{ flex: 1, backgroundColor: color }} />
                ))}
              </View>
            </GameFrame>
          </Button>
        )
      })}
    </View>
  )
}
