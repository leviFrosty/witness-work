import { View } from 'react-native'
import { Swipeable } from 'react-native-gesture-handler'
import { useNavigation } from '@react-navigation/native'
import useTheme from '@/contexts/theme'
import Haptics from '@/lib/haptics'
import i18n from '@/lib/locales'
import Text from '@/components/ui/MyText'
import ContextMenu from '@/components/ui/ContextMenu'
import SwipeableDelete from '@/components/ui/swipeableActions/Delete'
import { useCardStyle } from '@/components/ui/Card'
import { formatDate } from '@/lib/dates'
import { estimateTrip, fromDateKey } from '@/lib/mileage/calc'
import useTripActions from '@/features/mileage/hooks/useTripActions'
import useMileageFormatter from '@/features/mileage/hooks/useMileageFormatter'
import useMileageIndex from '@/features/mileage/hooks/useMileageIndex'
import type { RootStackNavigation } from '@/types/rootStack'
import type { Trip } from '@/types/mileage'
import RichNote from '@/components/RichNote'
import { hasNote } from '@/lib/richText/notes'

type Props = {
  trip: Trip
  /** Shown when the user has more than one car. */
  vehicleName?: string
}

/** Tap for details, long-press for actions, swipe to delete. */
export default function TripRow({ trip, vehicleName }: Props) {
  const theme = useTheme()
  const cardStyle = useCardStyle()
  const navigation = useNavigation<RootStackNavigation>()
  const actions = useTripActions()
  const format = useMileageFormatter()
  const cost = estimateTrip(trip, useMileageIndex()).cost
  const subtitle = [
    vehicleName,
    trip.roundTrip && i18n.t('mileage.roundTrip'),
  ].filter(Boolean)

  return (
    <Swipeable
      onSwipeableWillOpen={() => Haptics.light()}
      containerStyle={{
        backgroundColor: theme.colors.background,
        borderRadius: cardStyle.borderRadius,
      }}
      renderRightActions={() => (
        <SwipeableDelete size='xs' style={{ flexDirection: 'row' }} />
      )}
      onSwipeableOpen={(direction, swipeable) => {
        if (direction !== 'right') return
        swipeable.reset()
        actions.requestDelete(trip)
      }}
    >
      <ContextMenu
        actions={actions.menu(trip)}
        hoverRadius={cardStyle.borderRadius}
        onPress={() =>
          navigation.navigate('MileageTripDetails', { tripId: trip.id })
        }
        accessibilityLabel={`${formatDate(fromDateKey(trip.date))}, ${format.distance(trip.distanceMiles)}`}
      >
        <View
          style={{
            ...cardStyle,
            paddingVertical: 12,
            paddingHorizontal: 15,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={{ fontFamily: theme.fonts.semiBold }}>
              {formatDate(fromDateKey(trip.date), { style: 'medium' })}
            </Text>
            {subtitle.length > 0 && (
              <Text
                style={{
                  color: theme.colors.textAlt,
                  fontSize: theme.fontSize('sm'),
                }}
                numberOfLines={1}
              >
                {subtitle.join(' · ')}
              </Text>
            )}
            {hasNote(trip) ? (
              <RichNote
                note={trip}
                numberOfLines={2}
                interactive={false}
                linkCards={false}
                thumbnails
                style={{
                  color: theme.colors.textAlt,
                  fontSize: theme.fontSize('sm'),
                }}
              />
            ) : null}
          </View>
          <View style={{ alignItems: 'flex-end', gap: 4 }}>
            <Text style={{ fontFamily: theme.fonts.semiBold }}>
              {format.distance(trip.distanceMiles)}
            </Text>
            {cost !== undefined && (
              <Text
                style={{
                  color: theme.colors.textAlt,
                  fontSize: theme.fontSize('sm'),
                }}
              >
                {format.cost(cost)}
              </Text>
            )}
          </View>
        </View>
      </ContextMenu>
    </Swipeable>
  )
}
