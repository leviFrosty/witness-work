import { Alert, View } from 'react-native'
import Text from './MyText'
import useServiceReport, { DayPlan } from '../stores/serviceReport'
import { useCallback } from 'react'
import { Swipeable } from 'react-native-gesture-handler'
import i18n from '../lib/locales'
import useTheme from '../contexts/theme'
import Haptics from '../lib/haptics'
import SwipeableDelete from './swipeableActions/Delete'
import XView from './layout/XView'

const DayPlanRow = (props: { plan: DayPlan }) => {
  const theme = useTheme()
  const { deleteDayPlan } = useServiceReport()

  const hours = Math.floor(props.plan.minutes / 60)
  const minutes = props.plan.minutes % 60

  const handleSwipeOpen = useCallback(
    (direction: 'left' | 'right', swipeable: Swipeable, plan: DayPlan) => {
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
                deleteDayPlan(plan.id)
              },
            },
          ]
        )
      }
    },
    [deleteDayPlan]
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
          gap: 10,
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
          <Text style={{ fontFamily: theme.fonts.semiBold }}>
            {i18n.t('oneTime')}
          </Text>
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

export default DayPlanRow
