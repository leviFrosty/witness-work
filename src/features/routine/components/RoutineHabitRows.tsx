import { Fragment, type ReactElement } from 'react'
import InputRowSwitch from '@/components/ui/inputs/InputRowSwitch'
import { habitName } from '@/lib/routine/habitNames'
import {
  type PersonalStudyGoal,
  ROUTINE_HABITS,
  type RoutineHabit,
  type WorshipKind,
} from '@/types/routine'
import {
  MidweekMeetingRow,
  PrepStartRow,
  WeekendMeetingRow,
} from '@/features/routine/components/MeetingDaysFields'
import PersonalStudyGoalFields from '@/features/routine/components/PersonalStudyGoalFields'
import WorshipFields from '@/features/routine/components/WorshipFields'
import { HABIT_ICONS } from '@/features/routine/lib/habitIcons'

export const toggledHabits = (
  habits: readonly RoutineHabit[],
  habit: RoutineHabit,
  on: boolean
): RoutineHabit[] =>
  ROUTINE_HABITS.filter((other) =>
    other === habit ? on : habits.includes(other)
  )

export type RoutineFieldValues = {
  habits: RoutineHabit[]
  meetingDays: number[]
  midweekPrepLeadDays: number
  weekendPrepLeadDays: number
  worshipKind: WorshipKind
  worshipDay: number | null
  personalStudyGoal: PersonalStudyGoal
}

export type RoutineFieldChange = Partial<Omit<RoutineFieldValues, 'habits'>>

export default function RoutineHabitRows({
  values,
  onToggleHabit,
  onChange,
  renderReading,
}: {
  values: RoutineFieldValues
  onToggleHabit: (habit: RoutineHabit, on: boolean) => void
  onChange: (change: RoutineFieldChange) => void
  renderReading: (lastInSection: boolean) => ReactElement
}) {
  const { habits, meetingDays, worshipKind } = values
  const rows: ((last: boolean) => ReactElement)[] = []
  for (const habit of ROUTINE_HABITS) {
    const on = habits.includes(habit)
    rows.push((last) => (
      <InputRowSwitch
        key={habit}
        label={habitName(habit, worshipKind)}
        leftIcon={HABIT_ICONS[habit]}
        value={on}
        onValueChange={(next) => onToggleHabit(habit, next)}
        lastInSection={last}
      />
    ))
    if (!on) continue
    if (habit === 'bibleReading')
      rows.push((last) => (
        <Fragment key='reading'>{renderReading(last)}</Fragment>
      ))
    if (habit === 'personalStudy')
      rows.push((last) => (
        <PersonalStudyGoalFields
          key='studyGoal'
          goal={values.personalStudyGoal}
          onChange={(personalStudyGoal) => onChange({ personalStudyGoal })}
          indented
          lastInSection={last}
        />
      ))
    if (habit === 'midweekPrep')
      rows.push(
        () => (
          <MidweekMeetingRow
            key='midweekMeeting'
            meetingDays={meetingDays}
            onChange={(days) => onChange({ meetingDays: days })}
            indented
          />
        ),
        (last) => (
          <PrepStartRow
            key='midweekPrepStart'
            meeting='midweek'
            value={values.midweekPrepLeadDays}
            onChange={(days) => onChange({ midweekPrepLeadDays: days })}
            indented
            lastInSection={last}
          />
        )
      )
    if (habit === 'weekendPrep')
      rows.push(
        () => (
          <WeekendMeetingRow
            key='weekendMeeting'
            meetingDays={meetingDays}
            onChange={(days) => onChange({ meetingDays: days })}
            indented
          />
        ),
        (last) => (
          <PrepStartRow
            key='weekendPrepStart'
            meeting='weekend'
            value={values.weekendPrepLeadDays}
            onChange={(days) => onChange({ weekendPrepLeadDays: days })}
            indented
            lastInSection={last}
          />
        )
      )
    if (habit === 'worship')
      rows.push((last) => (
        <WorshipFields
          key='worshipFields'
          kind={worshipKind}
          day={values.worshipDay}
          onKindChange={(kind) => onChange({ worshipKind: kind })}
          onDayChange={(day) => onChange({ worshipDay: day })}
          indented
          lastInSection={last}
        />
      ))
  }
  return <>{rows.map((row, index) => row(index === rows.length - 1))}</>
}
