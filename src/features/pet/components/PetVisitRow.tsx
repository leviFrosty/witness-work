import { View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import ContextMenu from '@/components/ui/ContextMenu'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import { analytics } from '@/lib/analytics'
import type { PetVisit } from '@/types/pet'
import type { RootStackNavigation } from '@/types/rootStack'
import type { GamePalette } from '@/features/pet/art/gameUi'
import { GameIcon } from '@/features/pet/components/GameControls'
import {
  openPetVisitActivity,
  petVisitDetail,
  petVisitMenu,
  visitingPetName,
} from '@/features/pet/lib/visits'
import PetSpriteTile from '@/features/pet/render/PetSpriteTile'

export default function PetVisitRow({
  visit,
  seed,
  onHideVisit,
  palette,
}: {
  visit: PetVisit

  seed: number
  onHideVisit?: (visit: PetVisit) => void
  palette: GamePalette
}) {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  return (
    <ContextMenu
      actions={petVisitMenu(visit, {
        navigation,
        surface: 'details',
        onHide: onHideVisit,
      })}
      onPress={() => {
        analytics.capture('pet_visitor_action', {
          action: 'activity',
          activity: visit.activity.type,
          from: 'details',
        })
        openPetVisitActivity(navigation, visit.activity)
      }}
      accessibilityLabel={`${visitingPetName(visit)}, ${petVisitDetail(visit)}`}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          minHeight: 56,
          paddingHorizontal: 12,
          paddingVertical: 8,
        }}
      >
        <PetSpriteTile
          species={visit.pet.species}
          coat={visit.pet.coat}
          size={36}
          seed={seed}
        />
        <View style={{ flex: 1, gap: 2 }}>
          <Text
            numberOfLines={1}
            style={{ fontFamily: theme.fonts.semiBold, color: palette.ink }}
          >
            {visitingPetName(visit)}
          </Text>
          <Text
            numberOfLines={1}
            style={{ fontSize: theme.fontSize('sm'), color: palette.inkAlt }}
          >
            {petVisitDetail(visit)}
          </Text>
        </View>
        <GameIcon name='forward' color={palette.inkAlt} />
      </View>
    </ContextMenu>
  )
}
