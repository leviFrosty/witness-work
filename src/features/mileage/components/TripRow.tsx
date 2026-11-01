import { View } from 'react-native'
import SwipeableRow from '@/components/ui/SwipeableRow'
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
import useAccessibilityTextSize from '@/hooks/useAccessibilityTextSize'
import type { RootStackNavigation } from '@/types/rootStack'
import type { Trip } from '@/types/mileage'
import RichNote from '@/components/RichNote'
import Avatar from '@/components/ui/Avatar'
import { hasNote } from '@/lib/richText/notes'
import type { CarPerson } from '@/lib/mileage/people'
import { personLabel } from '@/features/mileage/lib/personLabel'

type Props = {
  trip: Trip

  vehicleName?: string

  loggedBy?: CarPerson
}

export default function TripRow({ trip, vehicleName, loggedBy }: Props) {
  const theme = useTheme()
  const cardStyle = useCardStyle()
  const navigation = useNavigation<RootStackNavigation>()
  const actions = useTripActions()
  const format = useMileageFormatter()
  const cost = estimateTrip(trip, useMileageIndex()).cost
  const largeText = useAccessibilityTextSize()
  const author = loggedBy && personLabel(loggedBy)
  const subtitle = [
    author,
    vehicleName,
    trip.roundTrip && i18n.t('mileage.roundTrip'),
  ].filter(Boolean)

  return (
    <SwipeableRow
      onSwipeableWillOpen={() => Haptics.light()}
      containerStyle={{
        backgroundColor: theme.colors.background,
        borderRadius: cardStyle.borderRadius,
      }}
      renderTrailingActions={() => (
        <SwipeableDelete size='xs' style={{ flexDirection: 'row' }} />
      )}
      onSwipeableOpen={(side, swipeable) => {
        if (side !== 'trailing') return
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
        accessibilityLabel={[
          formatDate(fromDateKey(trip.date)),
          format.distance(trip.distanceMiles),
          author && i18n.t('mileage.loggedByA11y', { name: author }),
        ]
          .filter(Boolean)
          .join(', ')}
      >
        {}
        <View
          style={{
            ...cardStyle,
            paddingVertical: 12,
            paddingHorizontal: 15,
            flexDirection: largeText ? 'column' : 'row',
            alignItems: largeText ? 'stretch' : 'center',
            gap: 12,
          }}
        >
          <View style={{ flex: largeText ? undefined : 1, gap: 4 }}>
            <Text style={{ fontFamily: theme.fonts.semiBold }}>
              {formatDate(fromDateKey(trip.date), { style: 'medium' })}
            </Text>
            {subtitle.length > 0 && (
              <View
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
              >
                {loggedBy && (
                  <Avatar
                    avatar={loggedBy.avatar}
                    name={loggedBy.name}
                    background={loggedBy.color}
                    size={18}
                  />
                )}
                <Text
                  style={{
                    flexShrink: 1,
                    color: theme.colors.textAlt,
                    fontSize: theme.fontSize('sm'),
                  }}
                  numberOfLines={largeText ? undefined : 1}
                >
                  {subtitle.join(' · ')}
                </Text>
              </View>
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
    </SwipeableRow>
  )
}
