import { Alert, View } from 'react-native'
import Text from '@/components/ui/MyText'
import useServiceReport from '@/stores/serviceReport'
import { useCallback } from 'react'
import { Swipeable } from 'react-native-gesture-handler'
import i18n from '@/lib/locales'
import useTheme from '@/contexts/theme'
import Haptics from '@/lib/haptics'
import SwipeableDelete from '@/components/ui/swipeableActions/Delete'
import SwipeableEdit from '@/components/ui/swipeableActions/Edit'
import { RecurringPlan, RecurringPlanFrequencies } from '@/lib/serviceReport'
import moment from 'moment'
import { useFormattedMinutes } from '@/lib/minutes'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Copyeable from '@/components/ui/Copyeable'
import { formatStartTime } from '@/lib/normalizeDate'
import { useCardStyle } from '@/components/ui/Card'

const RecurringPlanRow = (props: {
  plan: RecurringPlan
  date: Date
  onPress?: () => void
}) => {
  const theme = useTheme()
  const cardStyle = useCardStyle()
  const {
    deleteRecurringPlan,
    deleteSingleEventFromRecurringPlan,
    deleteEventAndFutureEvents,
  } = useServiceReport()

  // Check if there's an override for this specific date
  const dateOverride = props.plan.overrides?.find((override) =>
    moment(override.date).isSame(props.date, 'day')
  )

  // Use override data if it exists, otherwise use plan data
  const displayMinutes = dateOverride
    ? dateOverride.minutes
    : props.plan.minutes
  const displayNote = dateOverride ? dateOverride.note : props.plan.note
  const displayStartTimeInMinutes =
    dateOverride?.startTimeInMinutes ?? props.plan.startTimeInMinutes
  const formattedTime = useFormattedMinutes(displayMinutes)
  const hasOverride = !!dateOverride
  const isToday = moment(props.date).isSame(moment(), 'day')

  const getFrequencyText = (freq: RecurringPlanFrequencies) => {
    switch (freq) {
      case RecurringPlanFrequencies.WEEKLY:
        return i18n.t('weekly')
      case RecurringPlanFrequencies.BI_WEEKLY:
        return i18n.t('biWeekly')
      case RecurringPlanFrequencies.MONTHLY:
        return i18n.t('monthly')
      case RecurringPlanFrequencies.MONTHLY_BY_WEEKDAY:
        return i18n.t('monthlyByWeekday')
      default:
        return i18n.t('unknown')
    }
  }

  const handleSwipeOpen = useCallback(
    (direction: 'left' | 'right', swipeable: Swipeable) => {
      if (direction === 'left') {
        if (props.onPress) {
          props.onPress()
        }
        swipeable.reset()
      } else {
        Alert.alert(
          i18n.t('deletePlan_title'),
          i18n.t('deletePlan_description'),
          [
            {
              text: i18n.t('cancel'),
              style: 'cancel',
              onPress: () => swipeable.reset(),
            },
            {
              text: i18n.t('deleteThisPlan'),
              onPress: () => {
                swipeable.reset()
                deleteSingleEventFromRecurringPlan(props.plan.id, props.date)
              },
            },
            {
              text: i18n.t('deleteThisAndFollowingPlans'),
              onPress: () => {
                swipeable.reset()
                deleteEventAndFutureEvents(props.plan.id, props.date)
              },
            },
            {
              text: i18n.t('deleteAllPlans'),
              onPress: () => {
                swipeable.reset()
                deleteRecurringPlan(props.plan.id)
              },
            },
          ]
        )
      }
    },
    [
      deleteEventAndFutureEvents,
      deleteRecurringPlan,
      deleteSingleEventFromRecurringPlan,
      props,
    ]
  )

  return (
    <Swipeable
      onSwipeableWillOpen={() => Haptics.light()}
      containerStyle={{
        backgroundColor: theme.colors.background,
        borderRadius: cardStyle.borderRadius,
      }}
      renderLeftActions={() => <SwipeableEdit />}
      renderRightActions={() => <SwipeableDelete />}
      onSwipeableOpen={(direction, swipeable) =>
        handleSwipeOpen(direction, swipeable)
      }
    >
      <Button
        onPress={props.onPress}
        style={{
          ...cardStyle,
          paddingVertical: 12,
          paddingHorizontal: 15,
        }}
      >
        {/* Header Row - Date and Time */}
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 10,
            gap: 10,
          }}
        >
          <View
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Text
              style={{
                fontFamily: theme.fonts.semiBold,
                color: theme.colors.text,
                flexShrink: 1,
              }}
              numberOfLines={1}
              ellipsizeMode='tail'
            >
              {moment(props.date).format('LL')}
              {' · '}
              {formatStartTime(displayStartTimeInMinutes)}
            </Text>
            {isToday && <Badge size='xs'>{i18n.t('today')}</Badge>}
          </View>
          <Text
            style={{
              color: theme.colors.textAlt,
              fontSize: theme.fontSize('sm'),
            }}
            numberOfLines={1}
          >
            {formattedTime.formatted}
          </Text>
        </View>

        {/* Badges Row */}
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: 6,
            marginBottom: 8,
          }}
        >
          <Badge color={theme.colors.accent} size='xs'>
            <Text
              style={{
                fontFamily: theme.fonts.semiBold,
                color: theme.colors.textInverse,
              }}
            >
              {getFrequencyText(props.plan.recurrence.frequency)}
            </Text>
          </Badge>
          {hasOverride && (
            <Badge color={theme.colors.warn} size='xs'>
              <Text
                style={{
                  fontFamily: theme.fonts.semiBold,
                  color: theme.colors.textInverse,
                }}
              >
                {i18n.t('override')}
              </Text>
            </Badge>
          )}
        </View>

        {/* Schedule Info */}
        <View style={{ marginBottom: displayNote ? 8 : 0 }}>
          <Text
            style={{
              color: theme.colors.textAlt,
              fontSize: theme.fontSize('xs'),
              fontFamily: theme.fonts.semiBold,
              marginBottom: 2,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}
          >
            {i18n.t('recurring')} {i18n.t('schedule')}
          </Text>
          <Text
            style={{
              color: theme.colors.textAlt,
              fontSize: theme.fontSize('sm'),
              lineHeight: theme.fontSize('sm') * 1.3,
            }}
          >
            {moment(props.plan.startDate).format('L')}
            {props.plan.recurrence.endDate &&
              ` - ${moment(props.plan.recurrence.endDate).format('L')}`}
          </Text>
        </View>

        {/* Note Section */}
        {displayNote && (
          <View
            style={{
              backgroundColor: theme.colors.backgroundLighter,
              borderRadius: theme.numbers.borderRadiusSm,
              padding: 10,
            }}
          >
            <Text
              style={{
                color: theme.colors.textAlt,
                fontSize: theme.fontSize('xs'),
                fontFamily: theme.fonts.semiBold,
                marginBottom: 4,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}
            >
              {i18n.t('note')}
            </Text>
            <Copyeable
              textProps={{
                style: {
                  color: theme.colors.text,
                  fontSize: theme.fontSize('sm'),
                  lineHeight: theme.fontSize('sm') * 1.4,
                },
              }}
            >
              {displayNote}
            </Copyeable>
          </View>
        )}
      </Button>
    </Swipeable>
  )
}

export default RecurringPlanRow
