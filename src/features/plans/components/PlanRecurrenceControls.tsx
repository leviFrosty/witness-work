import { View } from 'react-native'
import { Repeat as RepeatIcon } from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import Select from '@/components/ui/Select'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { RecurringPlanFrequencies } from '@/lib/serviceReport'

const frequencyOptions = [
  { label: i18n.t('weekly'), value: RecurringPlanFrequencies.WEEKLY },
  { label: i18n.t('bi-weekly'), value: RecurringPlanFrequencies.BI_WEEKLY },
  { label: i18n.t('monthly'), value: RecurringPlanFrequencies.MONTHLY },
  {
    label: i18n.t('monthlyByWeekday'),
    value: RecurringPlanFrequencies.MONTHLY_BY_WEEKDAY,
  },
]

const weekdayOptions = [
  { label: i18n.t('sunday'), value: 0 },
  { label: i18n.t('monday'), value: 1 },
  { label: i18n.t('tuesday'), value: 2 },
  { label: i18n.t('wednesday'), value: 3 },
  { label: i18n.t('thursday'), value: 4 },
  { label: i18n.t('friday'), value: 5 },
  { label: i18n.t('saturday'), value: 6 },
]

const weekOfMonthOptions = [
  { label: i18n.t('firstWeek'), value: 1 },
  { label: i18n.t('secondWeek'), value: 2 },
  { label: i18n.t('thirdWeek'), value: 3 },
  { label: i18n.t('fourthWeek'), value: 4 },
  { label: i18n.t('lastWeek'), value: -1 },
]

/**
 * How a recurring plan repeats, compact enough to live in the Plan dock. The
 * Recurring toggle right above names it, so the picker takes the full width.
 */
const PlanRecurrenceControls = (props: {
  frequency: RecurringPlanFrequencies
  setFrequency: (frequency: RecurringPlanFrequencies) => void
  weekday: number
  setWeekday: (weekday: number) => void
  weekOfMonth: number
  setWeekOfMonth: (weekOfMonth: number) => void
}) => {
  const theme = useTheme()
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <LucideIcon icon={RepeatIcon} size={18} color={theme.colors.textAlt} />
        <View style={{ flex: 1 }}>
          <Select
            data={frequencyOptions}
            accessibilityLabel={i18n.t('recurrence')}
            placeholder={
              frequencyOptions.find((f) => f.value === props.frequency)?.label
            }
            onChange={({ value }) => props.setFrequency(value)}
            value={props.frequency.toString()}
          />
        </View>
      </View>
      {props.frequency === RecurringPlanFrequencies.MONTHLY_BY_WEEKDAY && (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Select
              data={weekOfMonthOptions}
              accessibilityLabel={i18n.t('selectWeekOfMonth')}
              placeholder={
                weekOfMonthOptions.find((w) => w.value === props.weekOfMonth)
                  ?.label
              }
              onChange={({ value }) => props.setWeekOfMonth(value)}
              value={props.weekOfMonth.toString()}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Select
              data={weekdayOptions}
              accessibilityLabel={i18n.t('selectWeekday')}
              placeholder={weekdayOptions[props.weekday]?.label}
              onChange={({ value }) => props.setWeekday(value)}
              value={props.weekday.toString()}
            />
          </View>
        </View>
      )}
    </View>
  )
}

export default PlanRecurrenceControls
