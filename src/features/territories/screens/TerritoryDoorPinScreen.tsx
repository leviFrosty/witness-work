import { useEffect, useState } from 'react'
import { View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { inputLayout } from '@/components/ui/inputs/InputLayout'
import { useFoldColumn } from '@/components/ui/layout/FoldPane'
import Header from '@/components/ui/layout/Header'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import TerritoryHeaderSave from '@/features/territories/components/TerritoryHeaderSave'
import TerritoryLocationField from '@/features/territories/components/TerritoryLocationField'
import { pinCentre, setDoorPin } from '@/features/territories/lib/doorPins'
import { updateStreet } from '@/features/territories/lib/doors'
import { formatDoorAddress } from '@/features/territories/lib/territoryTitle'
import {
  useTerritories,
  useTerritory,
} from '@/features/territories/stores/territories'
import type { RootStackParamList } from '@/types/rootStack'

type Props = NativeStackScreenProps<RootStackParamList, 'TerritoryDoorPin'>

export default function TerritoryDoorPinScreen({ route, navigation }: Props) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const { territoryId, streetId, doorId } = route.params
  const territory = useTerritory(territoryId)
  const update = useTerritories((state) => state.update)
  const street = territory?.streets.find((had) => had.id === streetId)
  const door = street?.doors.find((had) => had.id === doorId)
  const [coordinate, setCoordinate] = useState(door?.coordinate)
  const column = useFoldColumn(inputLayout.contentMaxWidth)

  useEffect(() => {
    if (!door) navigation.goBack()
  }, [door, navigation])

  if (!territory || !street || !door) return null

  const others = street.doors.flatMap((had) =>
    had.id !== doorId && had.coordinate
      ? [{ id: had.id, coordinate: had.coordinate }]
      : []
  )

  const save = () => {
    update(territoryId, (current) =>
      updateStreet(current, streetId, (had) =>
        setDoorPin(had, doorId, coordinate)
      )
    )
    navigation.goBack()
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Header
        buttonType='back'
        title={i18n.t(
          door.coordinate
            ? 'territories.pins.movePin'
            : 'territories.pins.addPin'
        )}
        rightElement={
          <TerritoryHeaderSave onPress={save} testID='door-pin-save' />
        }
      />
      <View
        style={[
          {
            flex: 1,
            width: '100%',
            maxWidth: inputLayout.contentMaxWidth,
            alignSelf: 'center',
            padding: inputLayout.horizontalPadding,
            paddingBottom: insets.bottom + 12,
          },
          column,
        ]}
      >
        <Text
          testID='door-pin-address'
          numberOfLines={2}
          style={{
            fontFamily: theme.fonts.semiBold,
            fontSize: theme.fontSize('lg'),
            paddingHorizontal: 5,
            paddingBottom: 12,
          }}
        >
          {formatDoorAddress(street, door)}
        </Text>
        <View
          testID='door-pin-map'
          style={{
            flex: 1,
            backgroundColor: theme.colors.card,
            borderRadius: inputLayout.sectionRadius,
            borderCurve: 'continuous',
          }}
        >
          <TerritoryLocationField
            fill
            coordinate={coordinate}
            onChange={setCoordinate}
            onClear={() => setCoordinate(undefined)}
            around={coordinate ?? pinCentre(territory, street)}
            otherPins={others}
            pinId={doorId}
            hints={{
              empty: i18n.t('territories.pins.placeHint'),
              placed: i18n.t('territories.pins.placedHint'),
            }}
          />
        </View>
      </View>
    </View>
  )
}
