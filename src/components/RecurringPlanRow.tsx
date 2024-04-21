import { Alert, View } from 'react-native'
import Text from './MyText'
import useServiceReport from '../stores/serviceReport'
import { useCallback } from 'react'
import { Swipeable } from 'react-native-gesture-handler'
import i18n from '../lib/locales'
import useTheme from '../contexts/theme'
import Haptics from '../lib/haptics'
import SwipeableDelete from './swipeableActions/Delete'
import XView from './layout/XView'
import { RecurringPlan, RecurringPlanFrequencies } from '../lib/serviceReport'
import moment from 'moment'

const RecurringPlanRow = (props: { plan: RecurringPlan }) => {
  const theme = useTheme()
  const { deleteRecurringPlan } = useServiceReport()

  const hours = Math.floor(props.plan.minutes / 60)
  const minutes = props.plan.minutes % 60

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
    (
      direction: 'left' | 'right',
      swipeable: Swipeable,
      plan: RecurringPlan
    ) => {
      if (direction === 'right') {
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
              text: i18n.t('delete'),
              style: 'destructive',
              onPress: () => {
                swipeable.reset()
                deleteRecurringPlan(plan.id)
              },
            },
          ]
        )
      }
    },
    [deleteRecurringPlan]
  )

  return (
    <Swipeable
      key={props.plan.id}
      onSwipeableWillOpen={() => Haptics.light()}
      containerStyle={{
        backgroundColor: theme.colors.background,
        borderRadius: theme.numbers.borderRadiusSm,
      }}
      renderRightActions={() => (
        <SwipeableDelete size='xs' style={{ flexDirection: 'row' }} />
      )}
      onSwipeableOpen={(direction, swipeable) =>
        handleSwipeOpen(direction, swipeable, props.plan)
      }
    >
      <View
        style={{
          backgroundColor: theme.colors.card,
          padding: 15,
          borderRadius: theme.numbers.borderRadiusSm,
          gap: 5,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            gap: 10,
            alignItems: 'center',
          }}
        >
          <View style={{ flexDirection: 'column', gap: 5 }}>
            <View style={{ gap: 2 }}>
              <Text
                style={{
                  fontSize: theme.fontSize('sm'),
                  color: theme.colors.textAlt,
                }}
              >
                {i18n.t('startDate')}
              </Text>
              <Text style={{ fontFamily: theme.fonts.semiBold }}>
                {moment(props.plan.startDate).format('L')}
              </Text>
            </View>
            {props.plan.recurrence.endDate && (
              <View>
                <Text
                  style={{
                    fontSize: theme.fontSize('sm'),
                    color: theme.colors.textAlt,
                  }}
                >
                  {i18n.t('endDate')}
                </Text>
                <Text
                  style={{
                    fontFamily: theme.fonts.semiBold,
                  }}
                >
                  {moment(props.plan.recurrence.endDate).format('L')}
                </Text>
              </View>
            )}
            <View>
              <Text
                style={{
                  fontSize: theme.fontSize('sm'),
                  color: theme.colors.textAlt,
                }}
              >
                {i18n.t('frequency')}
              </Text>
              <Text
                style={{
                  fontFamily: theme.fonts.semiBold,
                }}
              >
                {getFrequencyText(props.plan.recurrence.frequency)}
              </Text>
            </View>
          </View>
          <XView style={{ gap: 15 }}>
            <XView style={{ gap: 5 }}>
              <Text style={{ fontSize: theme.fontSize('sm') }}>{hours}</Text>
              <Text style={{ fontSize: theme.fontSize('sm') }}>
                {i18n.t('hours')}
              </Text>
            </XView>
            <XView style={{ gap: 5 }}>
              <Text style={{ fontSize: theme.fontSize('sm') }}>{minutes}</Text>
              <Text style={{ fontSize: theme.fontSize('sm') }}>
                {i18n.t('minutes')}
              </Text>
            </XView>
          </XView>
        </View>
        {props.plan.note && (
          <View style={{ gap: 2 }}>
            <Text
              style={{
                fontSize: theme.fontSize('sm'),
                color: theme.colors.textAlt,
              }}
            >
              {i18n.t('note')}
            </Text>
            <Text style={{ fontFamily: theme.fonts.semiBold }}>
              {props.plan.note}
            </Text>
          </View>
        )}
      </View>
    </Swipeable>
  )
}

export default RecurringPlanRow
