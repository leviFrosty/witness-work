import { View } from 'react-native'
import Button from '@/components/ui/Button'
import useTheme from '@/contexts/theme'
import type { PetSpecies } from '@/types/pet'
import { SPECIES } from '@/features/pet/art'
import { coatName } from '@/features/pet/lib/names'

const SIZE = 30

/**
 * The species' coats as round swatches (patterned coats in slices). Nothing for
 * a one-coat species.
 */
export default function PetCoatSwatches({
  species,
  coat,
  onSelect,
}: {
  species: PetSpecies
  coat: string
  onSelect: (coat: string) => void
}) {
  const theme = useTheme()
  const { coatIds, coats } = SPECIES[species]
  if (coatIds.length < 2) return null
  return (
    <View
      accessibilityRole='radiogroup'
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}
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
              padding: 2,
              borderRadius: SIZE,
              borderWidth: 2,
              borderColor: selected ? theme.colors.accent : 'transparent',
            }}
          >
            <View
              style={{
                width: SIZE,
                height: SIZE,
                borderRadius: SIZE / 2,
                overflow: 'hidden',
                flexDirection: 'row',
                borderWidth: 1,
                borderColor: theme.colors.border,
              }}
            >
              {coats[id].swatch.map((color, i) => (
                <View key={i} style={{ flex: 1, backgroundColor: color }} />
              ))}
            </View>
          </Button>
        )
      })}
    </View>
  )
}
