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
  visits: readonly PetVisit[]

  onHideVisit?: (visit: PetVisit) => void
}

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

        paddingBottom: Platform.OS === 'ios' ? 24 : sheetInsets.bottom + 8,
      }}
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
