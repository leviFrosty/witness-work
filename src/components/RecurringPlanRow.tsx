import { Alert, View } from 'react-native'
import Text from './MyText'
import useServiceReport from '../stores/serviceReport'
import { useCallback } from 'react'
import { Swipeable } from 'react-native-gesture-handler'
import i18n from '../lib/locales'
import useTheme from '../contexts/theme'
import Haptics from '../lib/haptics'
import SwipeableDelete from './swipeableActions/Delete'
import SwipeableEdit from './swipeableActions/Edit'
import { RecurringPlan, RecurringPlanFrequencies } from '../lib/serviceReport'
import moment from 'moment'
import { useFormattedMinutes } from '../lib/minutes'
import Button from './Button'
import Badge from './Badge'
import Copyeable from './Copyeable'

const RecurringPlanRow = (props: {
  plan: RecurringPlan
  date: Date
  onPress?: () => void
}) => {
  const theme = useTheme()
  const {
    deleteRecurringPlan,
    deleteSingleEventFromRecurringPlan,
    deleteEventAndFutureEvents,
  } = useServiceReport()

  const formattedTime = useFormattedMinutes(props.plan.minutes)

  const getFrequencyText = (freq: RecurringPlanFrequencies) => {
    switch (freq) {
      case RecurringPlanFrequencies.WEEKLY:
        return i18n.t('weekly')
      case RecurringPlanFrequencies.BI_WEEKLY:
        return i18n.t('biWeekly')
      case RecurringPlanFrequencies.MONTHLY:
        return i18n.t('monthly')
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
        borderRadius: theme.numbers.borderRadiusSm,
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
          backgroundColor: theme.colors.card,
          padding: 15,
          borderRadius: theme.numbers.borderRadiusSm,
          gap: 10,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            flexGrow: 1,
          }}
        >
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Text
              style={{
                fontFamily: theme.fonts.semiBold,
              }}
            >
              {moment(props.date).format('LL')}
            </Text>
          </View>
          <Text style={{ fontFamily: theme.fonts.semiBold }}>
            {formattedTime.formatted}
          </Text>
        </View>
        <View>
          <View
            style={{
              flexDirection: 'row',
              gap: 5,
              alignItems: 'center',
            }}
          >
            <Badge color={theme.colors.accent}>
              <Text
                style={{
                  fontFamily: theme.fonts.semiBold,
                  textTransform: 'uppercase',
                  fontSize: theme.fontSize('xs'),
                  color: theme.colors.textInverse,
                }}
              >
                {getFrequencyText(props.plan.recurrence.frequency)}
              </Text>
            </Badge>
            <Text
              style={{
                color: theme.colors.textAlt,
                fontSize: theme.fontSize('sm'),
              }}
            >
              {i18n.t('recurring')} ({moment(props.plan.startDate).format('L')}
              {props.plan.recurrence.endDate &&
                ` - ${moment(props.plan.recurrence.endDate).format('L')}`}
              )
            </Text>
          </View>
        </View>
        {props.plan.note && (
          <View>
            <View
              style={{
                flexDirection: 'row',
                gap: 5,
                alignItems: 'flex-start',
              }}
            >
              <Text
                style={{
                  color: theme.colors.textAlt,
                  fontSize: theme.fontSize('sm'),
                  fontFamily: theme.fonts.semiBold,
                }}
              >
                {i18n.t('note')}:
              </Text>
              <Copyeable
                textProps={{
                  style: {
                    color: theme.colors.textAlt,
                    fontSize: theme.fontSize('sm'),
                    flex: 1,
                  },
                }}
              >
                {props.plan.note}
              </Copyeable>
            </View>
          </View>
        )}
      </Button>
    </Swipeable>
  )
}

export default RecurringPlanRow
