import { View } from 'react-native'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import type { PetVisit } from '@/types/pet'
import { petVisitDetail, visitingPetName } from '@/features/pet/lib/visits'
import PetSpriteTile from '@/features/pet/render/PetSpriteTile'

/**
 * A visiting pet as iOS lifts it above its long-press menu: the pet, large,
 * with its name and whose it is, so it's clear which one the menu is for.
 */
export default function PetVisitPreview({ visit }: { visit: PetVisit }) {
  const theme = useTheme()
  return (
    <View
      style={{
        width: 240,
        alignItems: 'center',
        gap: 8,
        padding: 16,
        backgroundColor: theme.colors.card,
      }}
    >
      <PetSpriteTile
        species={visit.pet.species}
        coat={visit.pet.coat}
        size={96}
      />
      <View style={{ alignItems: 'center', gap: 2 }}>
        <Text
          numberOfLines={1}
          style={{
            fontSize: theme.fontSize('lg'),
            fontFamily: theme.fonts.semiBold,
          }}
        >
          {visitingPetName(visit)}
        </Text>
        <Text
          numberOfLines={2}
          style={{
            fontSize: theme.fontSize('sm'),
            color: theme.colors.textAlt,
            textAlign: 'center',
          }}
        >
          {petVisitDetail(visit)}
        </Text>
      </View>
    </View>
  )
}
