import { useEffect } from 'react'
import { Platform, ScrollView, View } from 'react-native'
import { useIsFocused } from '@react-navigation/native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import i18n from '@/lib/locales'
import type { PetVisit } from '@/types/pet'
import type { RootStackParamList } from '@/types/rootStack'
import { cssColor } from '@/features/pet/art/gameUi'
import { GameSection } from '@/features/pet/components/GameRows'
import {
  GameSheetHeader,
  useGameSheetBackground,
} from '@/features/pet/components/GameSheet'
import PetVisitRow from '@/features/pet/components/PetVisitRow'
import useGamePalette from '@/features/pet/hooks/useGamePalette'
import usePetSheetInsets from '@/features/pet/hooks/usePetSheetInsets'
import useShownPetVisits from '@/features/pet/hooks/useShownPetVisits'

type Props = NativeStackScreenProps<RootStackParamList, 'PetVisits'> & {
  /** Buddies' pets visiting today. */
  visits: readonly PetVisit[]
  /** Hides a visiting pet's buddy's pets (the Buddies setting). */
  onHideVisit?: (visit: PetVisit) => void
}

/**
 * Every buddy's pet visiting today, earliest first, on one scrolling panel, so
 * any number fits. A row opens that Plan or Follow-up; a long press has the
 * visiting pet's menu. Closes once nobody is visiting.
 */
export default function PetVisitsScreen({
  navigation,
  visits: realVisits,
  onHideVisit,
}: Props) {
  const palette = useGamePalette()
  const sheetInsets = usePetSheetInsets()
  const visits = useShownPetVisits(realVisits)
  const paper = cssColor(palette.paper)
  useGameSheetBackground(palette)

  // The last one hidden, or the day moved on: nothing left to list.
  const focused = useIsFocused()
  const empty = visits.length === 0
  useEffect(() => {
    if (empty && focused) navigation.goBack()
  }, [empty, focused, navigation])

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: paper }}
      contentContainerStyle={{
        paddingHorizontal: 20,
        // iOS adds the bottom inset below the sheet itself.
        paddingBottom: Platform.OS === 'ios' ? 24 : sheetInsets.bottom + 8,
      }}
      // The title stays put, so rows scroll under it.
      stickyHeaderIndices={[0]}
    >
      <View
        style={{
          paddingTop: sheetInsets.top - 8,
          paddingBottom: 14,
          backgroundColor: paper,
        }}
      >
        <GameSheetHeader
          title={i18n.t('pet.visitor.todayTitle')}
          palette={palette}
        />
      </View>
      <GameSection palette={palette}>
        {visits.map((visit, index) => (
          <PetVisitRow
            key={visit.inboxId}
            visit={visit}
            seed={index * 131}
            onHideVisit={onHideVisit}
            palette={palette}
          />
        ))}
      </GameSection>
    </ScrollView>
  )
}
