import { Alert, View } from 'react-native'
import Text from '@/components/MyText'
import useServiceReport from '@/stores/serviceReport'
import { useCallback } from 'react'
import { Swipeable } from 'react-native-gesture-handler'
import i18n from '@/lib/locales'
import useTheme from '@/contexts/theme'
import Haptics from '@/lib/haptics'
import SwipeableDelete from '@/components/swipeableActions/Delete'
import SwipeableEdit from '@/components/swipeableActions/Edit'
import { DayPlan } from '@/types/serviceReport'
import { useFormattedMinutes } from '@/lib/minutes'
import Button from '@/components/Button'
import moment from 'moment'
import Copyeable from '@/components/Copyeable'
import Badge from '@/components/Badge'
import { formatStartTime } from '@/lib/normalizeDate'
import { useCardStyle } from '@/components/Card'

const DayPlanRow = (props: {
  plan: DayPlan
  date: Date
  onPress?: () => void
}) => {
  const theme = useTheme()
  const cardStyle = useCardStyle()
  const { deleteDayPlan } = useServiceReport()

  const formattedTime = useFormattedMinutes(props.plan.minutes)
  const isToday = moment(props.date).isSame(moment(), 'day')

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
              text: i18n.t('delete'),
              style: 'destructive',
              onPress: () => {
                swipeable.reset()
                deleteDayPlan(props.plan.id)
              },
            },
          ]
        )
      }
    },
    [deleteDayPlan, props]
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
            marginBottom: props.plan.note ? 8 : 0,
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
              {formatStartTime(props.plan.startTimeInMinutes)}
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

        {/* Note Section */}
        {props.plan.note && (
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
              {props.plan.note}
            </Copyeable>
          </View>
        )}
      </Button>
    </Swipeable>
  )
}

export default DayPlanRow
