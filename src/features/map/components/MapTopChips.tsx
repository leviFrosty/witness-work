import { View } from 'react-native'
import MapFindContacts from '@/features/map/components/MapFindContacts'
import MapTodayRouteButton from '@/features/map/components/MapTodayRouteButton'

/**
 * The chips in the map's top trailing corner: Find contacts and today's route.
 * They wrap onto a second row when they don't fit, and report where they end,
 * so pin cards stay below them.
 */
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
  /** Room left for the search button and the controls under it. */
  start: number
  /** Room left on the trailing side, e.g. for the inspector. */
  end: number
  searchExpanded: boolean
  /** Find contacts put Contacts on the map. */
  onFound: () => void
  /** Today's route, while it has stops. */
  todayRoute: { stopCount: number; onPress: () => void } | null
  /** Where the chips end, in the map's points from its top. */
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
