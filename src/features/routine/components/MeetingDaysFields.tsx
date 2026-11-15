import InputRowSelect from '@/components/ui/inputs/InputRowSelect'
import i18n from '@/lib/locales'
import {
  meetingDaysFrom,
  midweekMeetingDay,
  PREP_LEAD_DAY_OPTIONS,
  validPrepLeadDays,
  weekendMeetingDay,
} from '@/lib/routine/habits'
import {
  dayOptions,
  fromOption,
  MIDWEEK_DAYS,
  NO_DAY,
  WEEKEND_DAYS,
} from '@/features/routine/lib/weekdays'

type MeetingDayRowProps = {
  meetingDays: readonly number[]
  onChange: (days: number[]) => void
  indented?: boolean
  lastInSection?: boolean
}

export function MidweekMeetingRow({
  meetingDays,
  onChange,
  indented,
  lastInSection,
}: MeetingDayRowProps) {
  const weekend = weekendMeetingDay(meetingDays)
  return (
    <InputRowSelect
      label={i18n.t('routine.meetings.midweek')}
      indented={indented}
      lastInSection={lastInSection}
      selectProps={{
        data: dayOptions(MIDWEEK_DAYS, i18n.t('none')),
        value: midweekMeetingDay(meetingDays) ?? NO_DAY,
        onChange: ({ value }) =>
          onChange(meetingDaysFrom(fromOption(value), weekend)),
      }}
    />
  )
}

export function WeekendMeetingRow({
  meetingDays,
  onChange,
  indented,
  lastInSection,
}: MeetingDayRowProps) {
  const midweek = midweekMeetingDay(meetingDays)
  return (
    <InputRowSelect
      label={i18n.t('routine.meetings.weekend')}
      indented={indented}
      lastInSection={lastInSection}
      selectProps={{
        data: dayOptions(WEEKEND_DAYS, i18n.t('none')),
        value: weekendMeetingDay(meetingDays) ?? NO_DAY,
        onChange: ({ value }) =>
          onChange(meetingDaysFrom(midweek, fromOption(value))),
      }}
    />
  )
}

export const prepStartLabel = (days: number): string =>
  days === 0
    ? i18n.t('routine.meetings.meetingDay')
    : i18n.t('routine.meetings.daysBefore', { count: days })

export type Meeting = 'midweek' | 'weekend'

type PrepStartRowProps = {
  meeting: Meeting
  value: number
  onChange: (days: number) => void
  indented?: boolean
  lastInSection?: boolean
}

export function PrepStartRow({
  meeting,
  value,
  onChange,
  indented,
  lastInSection,
}: PrepStartRowProps) {
  return (
    <InputRowSelect
      label={i18n.t('routine.meetings.prepStart')}
      info={i18n.t('routine.meetings.prepStartInfo')}
      indented={indented}
      lastInSection={lastInSection}
      selectProps={{
        data: PREP_LEAD_DAY_OPTIONS.map((days) => ({
          label: prepStartLabel(days),
          value: days,
        })),
        value: validPrepLeadDays(value),
        onChange: ({ value: days }) => onChange(days),
        accessibilityLabel: i18n.t(
          meeting === 'midweek'
            ? 'routine.meetings.midweekPrepStart'
            : 'routine.meetings.weekendPrepStart'
        ),
      }}
    />
  )
}
