import { Pressable, View } from 'react-native'
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated'
import moment from 'moment'
import Card from '@/components/ui/Card'
import Text from '@/components/ui/MyText'
import PointerHover from '@/components/ui/PointerHover'
import GoalBar from '@/components/GoalBar'
import useTheme from '@/contexts/theme'
import { formatWeekdayMonthDayCompact } from '@/lib/dates'
import Haptics from '@/lib/haptics'
import i18n, { TranslationKey } from '@/lib/locales'
import { formatMinutes, formatMinutesCompact } from '@/lib/minutes'
import { segmentBoldMarkup } from '@/lib/projectedTotalCopy'
import type { CalendarMonth } from '@/lib/monthlyGoals'
import { usePreferences } from '@/stores/preferences'
import type { PlanMonth } from '@/features/onboarding/hooks/usePlanMonth'
import {
  monthWeeks,
  orderedWeekdays,
} from '@/features/onboarding/lib/planMonth'
import PlanDaySlider from '@/features/onboarding/components/plan-month/PlanDaySlider'

const WEEKDAY_KEYS: readonly TranslationKey[] = [
  'availability.weekday.sun',
  'availability.weekday.mon',
  'availability.weekday.tue',
  'availability.weekday.wed',
  'availability.weekday.thu',
  'availability.weekday.fri',
  'availability.weekday.sat',
]

const CELL_HEIGHT = 34

type Props = {
  target: CalendarMonth
  plan: PlanMonth
  serviceDays: readonly number[]
  startOfWeek: number

  selectedDay: number | null
  onSelectDay: (day: number | null) => void

  onChangeDay: (day: number, minutes: number) => void
}

const PlanMonthPreview = ({
  target,
  plan,
  serviceDays,
  startOfWeek,
  selectedDay,
  onSelectDay,
  onChangeDay,
}: Props) => {
  const theme = useTheme()
  const { timeDisplayFormat } = usePreferences()
  const format = (minutes: number) =>
    formatMinutes(minutes, timeDisplayFormat).formatted
  const monthName = moment({ ...target, day: 1 }).format('MMMM')
  const weeks = monthWeeks(target, startOfWeek)
  const hasPlan = plan.plans.length > 0
  const dateOf = (day: number) => moment({ ...target, day })
  const selectedMinutes =
    selectedDay === null
      ? 0
      : (plan.plans.find((p) => p.day === selectedDay)?.minutes ?? 0)

  const status = (() => {
    if (plan.alreadyOnTrack) {
      return i18n.t('planMonth.status.onTrack', { month: monthName })
    }
    if (serviceDays.length === 0 && !hasPlan) {
      return i18n.t('planMonth.status.pickDays')
    }
    if (!hasPlan) {
      return i18n.t('planMonth.status.noDaysLeft', { month: monthName })
    }
    return i18n.t(
      plan.reachesGoal
        ? 'planMonth.status.reachesGoal'
        : 'planMonth.status.shortOfGoal',
      {
        projected: format(plan.projectedMinutes),
        goal: format(plan.goalMinutes),
      }
    )
  })()

  return (
    <Card style={{ gap: 14 }}>
      <GoalBar
        loggedMinutes={plan.loggedMinutes}
        plannedMinutes={plan.plannedMinutes}
        goalMinutes={plan.goalMinutes}
        size='md'
      />

      <View style={{ gap: 4 }}>
        <View
          style={{ flexDirection: 'row' }}
          accessibilityElementsHidden
          importantForAccessibility='no-hide-descendants'
        >
          {orderedWeekdays(startOfWeek).map((weekday) => (
            <Text
              key={weekday}
              numberOfLines={1}
              style={{
                flex: 1,
                textAlign: 'center',
                fontSize: theme.fontSize('xs'),
                fontFamily: theme.fonts.semiBold,
                color: serviceDays.includes(weekday)
                  ? theme.colors.accent
                  : theme.colors.textAlt,
              }}
            >
              {i18n.t(WEEKDAY_KEYS[weekday])}
            </Text>
          ))}
        </View>
        {weeks.map((week, row) => (
          <View key={row} style={{ flexDirection: 'row', gap: 4 }}>
            {week.map((cell, col) => {
              if (!cell) {
                return <View key={col} style={{ flex: 1 }} />
              }
              const minutes = plan.minutesByDay.get(cell.day)
              const isLogged = plan.loggedDays.has(cell.day)
              const isServiceDay =
                !isLogged && serviceDays.includes(cell.weekday)

              const editable =
                !isLogged &&
                !plan.alreadyOnTrack &&
                !plan.savedDays.has(cell.day)
              const isSelected = selectedDay === cell.day
              return (
                <PointerHover key={col} effect='highlight' enabled={editable}>
                  <Pressable
                    disabled={!editable}
                    onPress={() => {
                      Haptics.selection()
                      onSelectDay(isSelected ? null : cell.day)
                    }}
                    accessibilityRole='button'
                    accessibilityLabel={formatWeekdayMonthDayCompact(
                      dateOf(cell.day)
                    )}
                    accessibilityValue={
                      minutes ? { text: format(minutes) } : undefined
                    }
                    accessibilityState={{
                      selected: isSelected,
                      disabled: !editable,
                    }}
                    style={{
                      flex: 1,
                      height: CELL_HEIGHT,
                      borderRadius: theme.numbers.borderRadiusSm,
                      backgroundColor: isServiceDay
                        ? theme.colors.accentTranslucent
                        : 'transparent',
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: isLogged ? 0.35 : 1,
                    }}
                  >
                    {minutes ? (
                      <Animated.View
                        key={`${cell.day}-${minutes}`}
                        entering={ZoomIn.duration(220)}
                        style={{
                          position: 'absolute',
                          inset: 0,
                          borderRadius: theme.numbers.borderRadiusSm,
                          backgroundColor: theme.colors.accent,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Text
                          numberOfLines={1}
                          adjustsFontSizeToFit
                          style={{
                            fontSize: theme.fontSize('xs'),
                            fontFamily: theme.fonts.bold,
                            color: theme.colors.textInverse,
                          }}
                        >
                          {formatMinutesCompact(minutes)}
                        </Text>
                      </Animated.View>
                    ) : (
                      <Text
                        style={{
                          fontSize: theme.fontSize('xs'),
                          color: theme.colors.textAlt,
                        }}
                      >
                        {cell.day}
                      </Text>
                    )}
                    {isSelected ? (
                      <View
                        pointerEvents='none'
                        style={{
                          position: 'absolute',
                          inset: -3,
                          borderRadius: theme.numbers.borderRadiusSm + 3,
                          borderWidth: 2,
                          borderColor: theme.colors.text,
                        }}
                      />
                    ) : null}
                  </Pressable>
                </PointerHover>
              )
            })}
          </View>
        ))}
      </View>

      {selectedDay !== null ? (
        <Animated.View entering={FadeIn.duration(180)} style={{ gap: 2 }}>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'baseline',
            }}
          >
            <Text
              style={{
                fontSize: theme.fontSize('sm'),
                fontFamily: theme.fonts.semiBold,
              }}
            >
              {formatWeekdayMonthDayCompact(dateOf(selectedDay))}
            </Text>
            <Text
              style={{
                fontSize: theme.fontSize('md'),
                fontFamily: theme.fonts.bold,
                color: selectedMinutes
                  ? theme.colors.accent
                  : theme.colors.textAlt,
              }}
            >
              {selectedMinutes
                ? format(selectedMinutes)
                : i18n.t('planMonth.editor.none')}
            </Text>
          </View>
          <PlanDaySlider
            key={selectedDay}
            minutes={selectedMinutes}
            onChange={(minutes) => onChangeDay(selectedDay, minutes)}
            accessibilityLabel={i18n.t('planMonth.editor.a11y', {
              date: formatWeekdayMonthDayCompact(dateOf(selectedDay)),
            })}
            accessibilityValueText={
              selectedMinutes
                ? format(selectedMinutes)
                : i18n.t('planMonth.editor.none')
            }
          />
        </Animated.View>
      ) : null}

      <Text
        style={{
          fontSize: theme.fontSize('sm'),
          color: theme.colors.text,
          lineHeight: theme.fontSize('sm') * 1.4,
        }}
      >
        {segmentBoldMarkup(status).map((segment, i) => (
          <Text
            key={i}
            style={{
              fontSize: theme.fontSize('sm'),
              fontFamily: segment.bold ? theme.fonts.bold : undefined,
            }}
          >
            {segment.text}
          </Text>
        ))}
        {hasPlan && selectedDay === null ? (
          <Text
            style={{
              fontSize: theme.fontSize('sm'),
              color: theme.colors.textAlt,
            }}
          >
            {` ${i18n.t('planMonth.status.tapToEdit')}`}
          </Text>
        ) : null}
      </Text>
    </Card>
  )
}

export default PlanMonthPreview
