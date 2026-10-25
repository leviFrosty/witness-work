import { useEffect } from 'react'
import { FlatList, Platform, StyleSheet, View } from 'react-native'
import { useIsFocused } from '@react-navigation/native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import type { PetVisit } from '@/types/pet'
import type { RootStackParamList } from '@/types/rootStack'
import PetSheetClose from '@/features/pet/components/PetSheetClose'
import PetVisitRow from '@/features/pet/components/PetVisitRow'
import usePetSheetInsets from '@/features/pet/hooks/usePetSheetInsets'
import useShownPetVisits from '@/features/pet/hooks/useShownPetVisits'

type Props = NativeStackScreenProps<RootStackParamList, 'PetVisits'> & {
  /** Buddies' pets visiting today. */
  visits: readonly PetVisit[]
  /** Hides a visiting pet's buddy's pets (the Buddies setting). */
  onHideVisit?: (visit: PetVisit) => void
}

/**
 * Every buddy's pet visiting today, earliest first, in one scrolling list, so
 * any number fits. A row opens that Plan or Follow-up; a long press has the
 * visiting pet's menu. Closes once nobody is visiting.
 */
export default function PetVisitsScreen({
  navigation,
  visits: realVisits,
  onHideVisit,
}: Props) {
  const theme = useTheme()
  const sheetInsets = usePetSheetInsets()
  const visits = useShownPetVisits(realVisits)
  const sheetColor = theme.colors.sheet
  useEffect(() => {
    navigation.setOptions({ contentStyle: { backgroundColor: sheetColor } })
  }, [navigation, sheetColor])

  // The last one hidden, or the day moved on: nothing left to list.
  const focused = useIsFocused()
  const empty = visits.length === 0
  useEffect(() => {
    if (empty && focused) navigation.goBack()
  }, [empty, focused, navigation])

  return (
    <>
      <FlatList
        data={visits}
        keyExtractor={(visit) => visit.inboxId}
        style={{ flex: 1, backgroundColor: theme.colors.sheet }}
        contentContainerStyle={{
          paddingHorizontal: 20,
          // iOS adds the bottom inset below the sheet itself.
          paddingBottom: Platform.OS === 'ios' ? 24 : sheetInsets.bottom + 8,
        }}
        // The title stays put, so rows scroll under it (and never under
        // Android's close button beside it).
        stickyHeaderIndices={[0]}
        ListHeaderComponent={
          <View
            style={{
              paddingTop: sheetInsets.top,
              paddingBottom: 14,
              paddingEnd: Platform.OS === 'android' ? 44 : 0,
              backgroundColor: theme.colors.sheet,
            }}
          >
            <Text
              accessibilityRole='header'
              style={{
                fontSize: theme.fontSize('xl'),
                fontFamily: theme.fonts.bold,
              }}
            >
              {i18n.t('pet.visitor.todayTitle')}
            </Text>
          </View>
        }
        renderItem={({ item, index }) => {
          const first = index === 0
          const last = index === visits.length - 1
          const radius = theme.numbers.borderRadiusMd
          return (
            <View
              style={{
                backgroundColor: theme.colors.backgroundLighter,
                borderTopStartRadius: first ? radius : 0,
                borderTopEndRadius: first ? radius : 0,
                borderBottomStartRadius: last ? radius : 0,
                borderBottomEndRadius: last ? radius : 0,
                borderTopWidth: first ? 0 : StyleSheet.hairlineWidth,
                borderColor: theme.colors.border,
                overflow: 'hidden',
              }}
            >
              <PetVisitRow
                visit={item}
                seed={index * 131}
                onHideVisit={onHideVisit}
              />
            </View>
          )
        }}
      />
      <PetSheetClose />
    </>
  )
}
