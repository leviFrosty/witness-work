import { View } from 'react-native'
import MapFindContacts from '@/features/map/components/MapFindContacts'
import MapTodayRouteButton from '@/features/map/components/MapTodayRouteButton'

export default function MapTopChips({
  top,
  start,
  end,
  searchExpanded,
  onFound,
  todayRoute,
  onBottom,
}: {
  top: number

  start: number

  end: number
  searchExpanded: boolean

  onFound: () => void

  todayRoute: { stopCount: number; onPress: () => void } | null

  onBottom: (bottom: number) => void
}) {
  return (
    <View
      pointerEvents='box-none'
      onLayout={(e) =>
        onBottom(e.nativeEvent.layout.y + e.nativeEvent.layout.height)
      }
      style={{
        position: 'absolute',
        top,
        left: start,
        right: end,
        alignItems: 'flex-end',
      }}
    >
      <View
        pointerEvents='box-none'
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          justifyContent: 'flex-end',
          gap: 8,
        }}
      >
        <MapFindContacts hidden={searchExpanded} onFound={onFound} />
        {!searchExpanded && todayRoute && (
          <MapTodayRouteButton {...todayRoute} />
        )}
      </View>
    </View>
  )
}
