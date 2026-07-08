import {
  Calendar1 as Calendar1Icon,
  Repeat as RepeatIcon,
} from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import { Alert, View } from 'react-native'
import { Swipeable } from 'react-native-gesture-handler'
import moment from 'moment'
import Text from '@/components/ui/MyText'
import useServiceReport from '@/stores/serviceReport'
import i18n from '@/lib/locales'
import useTheme from '@/contexts/theme'
import Haptics from '@/lib/haptics'
import SwipeableDelete from '@/components/ui/swipeableActions/Delete'
import SwipeableEdit from '@/components/ui/swipeableActions/Edit'
import { DayPlan } from '@/types/timeEntry'
import { useFormattedMinutes } from '@/lib/minutes'
import Button from '@/components/ui/Button'
import Copyeable from '@/components/ui/Copyeable'
import Badge from '@/components/ui/Badge'
import {
  formatDate,
  formatStartTime,
  formatWeekdayDayCompact,
  formatWeekdayMonthDayCompact,
} from '@/lib/dates'
import { useCardStyle } from '@/components/ui/Card'
import {
  DEFAULT_START_TIME_IN_MINUTES,
  getStartTimeInMinutes,
} from '@/lib/normalizeDate'
import {
  getEffectiveMinutesForRecurringPlan,
  getEffectiveNoteForRecurringPlan,
  getEffectiveStartTimeInMinutesForRecurringPlan,
  RecurringPlan,
} from '@/lib/recurrence'

export type PlanListItem =
  | {
      type: 'day'
      date: Date
      plan: DayPlan
    }
  | {
      type: 'recurring'
      date: Date
      plan: RecurringPlan
    }

export const getPlanItemStartTime = (item: PlanListItem): number => {
  if (item.type === 'day') {
    return getStartTimeInMinutes(item.plan)
  }

  return getEffectiveStartTimeInMinutesForRecurringPlan(item.plan, item.date)
}

const PlanKindIcon = (props: { recurring: boolean }) => {
  const theme = useTheme()
  const oneTime = !props.recurring

  return (
    <View
      style={{
        width: 38,
        height: 38,
        borderRadius: theme.numbers.borderRadiusMd,
        borderWidth: 1,
        borderColor: oneTime ? theme.colors.accent : theme.colors.border,
        backgroundColor: oneTime
          ? theme.colors.accentTranslucent
          : theme.colors.backgroundLighter,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <LucideIcon
        icon={props.recurring ? RepeatIcon : Calendar1Icon}
        size={15}
        color={oneTime ? theme.colors.accent : theme.colors.textAlt}
      />
    </View>
  )
}

const PlanRow = (props: {
  item: PlanListItem
  onPress?: () => void
  dateDisplay?: 'full' | 'monthList'
  contextMonth?: number
  contextYear?: number
}) => {
  const theme = useTheme()
  const cardStyle = useCardStyle()
  const {
    deleteDayPlan,
    deleteRecurringPlan,
    deleteSingleEventFromRecurringPlan,
    deleteEventAndFutureEvents,
  } = useServiceReport()

  const isRecurring = props.item.type === 'recurring'
  const plan = props.item.plan
  const date = props.item.date
  const recurringPlan = isRecurring ? (plan as RecurringPlan) : null
  const dayPlan = !isRecurring ? (plan as DayPlan) : null
  const displayMinutes = recurringPlan
    ? getEffectiveMinutesForRecurringPlan(recurringPlan, date)
    : (dayPlan?.minutes ?? 0)
  const displayNote = recurringPlan
    ? getEffectiveNoteForRecurringPlan(recurringPlan, date)
    : dayPlan?.note
  const displayStartTimeInMinutes = recurringPlan
    ? getEffectiveStartTimeInMinutesForRecurringPlan(recurringPlan, date)
    : dayPlan?.startTimeInMinutes
  const formattedDuration = useFormattedMinutes(displayMinutes)
  const dateMoment = moment(date)
  const isToday = dateMoment.isSame(moment(), 'day')
  const showContextFreeDate =
    props.dateDisplay === 'monthList' &&
    props.contextMonth !== undefined &&
    props.contextYear !== undefined &&
    dateMoment.month() === props.contextMonth &&
    dateMoment.year() === props.contextYear
  const dateLabel =
    props.dateDisplay === 'monthList'
      ? showContextFreeDate
        ? formatWeekdayDayCompact(dateMoment)
        : formatWeekdayMonthDayCompact(dateMoment)
      : formatDate(date)

  const handleSwipeOpen = (
    direction: 'left' | 'right',
    swipeable: Swipeable
  ) => {
    if (direction === 'left') {
      props.onPress?.()
      swipeable.reset()
      return
    }

    if (props.item.type === 'day') {
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
              deleteDayPlan(props.item.plan.id)
            },
          },
        ]
      )
      return
    }

    Alert.alert(i18n.t('deletePlan_title'), i18n.t('deletePlan_description'), [
      {
        text: i18n.t('cancel'),
        style: 'cancel',
        onPress: () => swipeable.reset(),
      },
      {
        text: i18n.t('deleteThisPlan'),
        onPress: () => {
          swipeable.reset()
          deleteSingleEventFromRecurringPlan(
            props.item.plan.id,
            props.item.date
          )
        },
      },
      {
        text: i18n.t('deleteThisAndFollowingPlans'),
        onPress: () => {
          swipeable.reset()
          deleteEventAndFutureEvents(props.item.plan.id, props.item.date)
        },
      },
      {
        text: i18n.t('deleteAllPlans'),
        onPress: () => {
          swipeable.reset()
          deleteRecurringPlan(props.item.plan.id)
        },
      },
    ])
  }

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
          paddingHorizontal: 14,
        }}
      >
        <View
          style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}
        >
          <PlanKindIcon recurring={isRecurring} />
          <View style={{ flex: 1, gap: 8 }}>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: 10,
              }}
            >
              <Text
                style={{
                  fontFamily: theme.fonts.semiBold,
                  color: theme.colors.text,
                  flex: 1,
                }}
                numberOfLines={1}
                ellipsizeMode='tail'
              >
                {dateLabel}
                {' · '}
                {formatStartTime(
                  displayStartTimeInMinutes ?? DEFAULT_START_TIME_IN_MINUTES
                )}
              </Text>
              <Text
                style={{
                  color: theme.colors.textAlt,
                  fontSize: theme.fontSize('sm'),
                }}
                numberOfLines={1}
              >
                {formattedDuration.formatted}
              </Text>
            </View>

            {displayNote && (
              <Copyeable
                textProps={{
                  style: {
                    color: theme.colors.textAlt,
                    fontSize: theme.fontSize('sm'),
                    lineHeight: theme.fontSize('sm') * 1.4,
                  },
                }}
              >
                {displayNote}
              </Copyeable>
            )}

            {isToday && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                <Badge size='xs'>{i18n.t('today')}</Badge>
              </View>
            )}
          </View>
        </View>
      </Button>
    </Swipeable>
  )
}

export default PlanRow
