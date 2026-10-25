import { View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import ContextMenu from '@/components/ui/ContextMenu'
import { ChevronForwardIcon } from '@/components/ui/DirectionalIcon'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import { analytics } from '@/lib/analytics'
import type { PetVisit } from '@/types/pet'
import type { RootStackNavigation } from '@/types/rootStack'
import {
  openPetVisitActivity,
  petVisitDetail,
  petVisitMenu,
  visitingPetName,
} from '@/features/pet/lib/visits'
import PetSpriteTile from '@/features/pet/render/PetSpriteTile'

/**
 * One visiting pet: its picture, name, and whose it is with what the User does
 * with them today. Tapping opens that Plan or Follow-up; a long press has the
 * visiting pet's menu.
 */
export default function PetVisitRow({
  visit,
  seed,
  onHideVisit,
}: {
  visit: PetVisit
  /** Its idle timing, so neighbouring rows don't bob in step. */
  seed: number
  onHideVisit?: (visit: PetVisit) => void
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
          <Text numberOfLines={1} style={{ fontFamily: theme.fonts.semiBold }}>
            {visitingPetName(visit)}
          </Text>
          <Text
            numberOfLines={1}
            style={{
              fontSize: theme.fontSize('sm'),
              color: theme.colors.textAlt,
            }}
          >
            {petVisitDetail(visit)}
          </Text>
        </View>
        <LucideIcon
          icon={ChevronForwardIcon}
          size={16}
          color={theme.colors.textAlt}
        />
      </View>
    </ContextMenu>
  )
}
