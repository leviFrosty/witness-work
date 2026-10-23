import { View } from 'react-native'
import MapDueChip from '@/features/map/components/MapDueChip'
import MapFindContacts from '@/features/map/components/MapFindContacts'
import MapTodayRouteButton from '@/features/map/components/MapTodayRouteButton'

/**
 * The chips along the map's top, beside the search: Find contacts, the due chip
 * and today's route. They wrap onto a second row when they don't fit, and
 * report where they end, so pin cards stay below them.
 */
export default function MapTopChips({
  top,
  start,
  end,
  searchExpanded,
  onFound,
  due,
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
  /** The due chip, while Contacts in view are due. */
  due: {
    overdue: number
    thisWeek: number
    active: boolean
    onPress: () => void
  } | null
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
        alignItems: 'center',
      }}
    >
      <View
        pointerEvents='box-none'
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: 8,
        }}
      >
        <MapFindContacts hidden={searchExpanded} onFound={onFound} />
        {!searchExpanded && due && <MapDueChip {...due} />}
        {!searchExpanded && todayRoute && (
          <MapTodayRouteButton {...todayRoute} />
        )}
      </View>
    </View>
  )
}
