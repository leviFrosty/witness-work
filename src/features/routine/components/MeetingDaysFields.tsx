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

export default function MeetingDaysFields({
  meetingDays,
  onChange,
  lastInSection,
}: {
  meetingDays: readonly number[]
  onChange: (days: number[]) => void
  lastInSection?: boolean
}) {
  const midweek = midweekMeetingDay(meetingDays)
  const weekend = weekendMeetingDay(meetingDays)
  const none = i18n.t('none')
  return (
    <>
      <InputRowSelect
        label={i18n.t('routine.meetings.midweek')}
        info={i18n.t('routine.meetings.info')}
        selectProps={{
          data: dayOptions(MIDWEEK_DAYS, none),
          value: midweek ?? NO_DAY,
          onChange: ({ value }) =>
            onChange(meetingDaysFrom(fromOption(value), weekend)),
        }}
      />
      <InputRowSelect
        label={i18n.t('routine.meetings.weekend')}
        lastInSection={lastInSection}
        selectProps={{
          data: dayOptions(WEEKEND_DAYS, none),
          value: weekend ?? NO_DAY,
          onChange: ({ value }) =>
            onChange(meetingDaysFrom(midweek, fromOption(value))),
        }}
      />
    </>
  )
}
