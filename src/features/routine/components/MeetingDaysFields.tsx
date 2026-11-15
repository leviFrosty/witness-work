import InputRowSelect from '@/components/ui/inputs/InputRowSelect'
import i18n from '@/lib/locales'
import {
  meetingDaysFrom,
  midweekMeetingDay,
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
  info?: boolean
  indented?: boolean
  lastInSection?: boolean
}

export function MidweekMeetingRow({
  meetingDays,
  onChange,
  info = true,
  indented,
  lastInSection,
}: MeetingDayRowProps) {
  const weekend = weekendMeetingDay(meetingDays)
  return (
    <InputRowSelect
      label={i18n.t('routine.meetings.midweek')}
      info={info ? i18n.t('routine.meetings.info') : undefined}
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
  info = true,
  indented,
  lastInSection,
}: MeetingDayRowProps) {
  const midweek = midweekMeetingDay(meetingDays)
  return (
    <InputRowSelect
      label={i18n.t('routine.meetings.weekend')}
      info={info ? i18n.t('routine.meetings.info') : undefined}
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

export default function MeetingDaysFields({
  meetingDays,
  onChange,
  lastInSection,
}: {
  meetingDays: readonly number[]
  onChange: (days: number[]) => void
  lastInSection?: boolean
}) {
  return (
    <>
      <MidweekMeetingRow meetingDays={meetingDays} onChange={onChange} />
      <WeekendMeetingRow
        meetingDays={meetingDays}
        onChange={onChange}
        info={false}
        lastInSection={lastInSection}
      />
    </>
  )
}
