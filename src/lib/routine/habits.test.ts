import { describe, expect, it } from 'vitest'
import {
  allDone,
  canLogOn,
  midweekMeetingDay,
  routineEntryId,
  todayItems,
  weekdayOf,
  weekendMeetingDay,
  type RoutineSettings,
} from '@/lib/routine/habits'
import { routineCoinsOf, routineEarned } from '@/lib/routine/coins'
import { ROUTINE_HABITS, type RoutineEntry } from '@/types/routine'

const entry = (
  habit: RoutineEntry['habit'],
  on: string,
  patch: Partial<RoutineEntry> = {}
): RoutineEntry => ({
  id: routineEntryId(habit, on),
  habit,
  on,
  updatedAt: 1,
  ...patch,
})

const settings = (patch: Partial<RoutineSettings> = {}): RoutineSettings => ({
  habits: ROUTINE_HABITS,
  meetingDays: [3, 0],
  personalStudyGoal: { kind: 'perWeek', times: 1 },
  worshipDay: 1,
  ...patch,
})

const habitsOf = (items: ReturnType<typeof todayItems>) =>
  items.map(({ habit, done }) => `${habit}${done ? '✓' : ''}`)

describe('routine habits', () => {
  it('reads weekdays from day keys', () => {
    expect(weekdayOf('2026-11-02')).toBe(1)
    expect(weekdayOf('2026-11-08')).toBe(0)
  })

  it('keys daily habits by day and weekly habits by their Monday', () => {
    expect(routineEntryId('bibleReading', '2026-11-05')).toBe(
      'bibleReading:2026-11-05'
    )
    expect(routineEntryId('midweekPrep', '2026-11-05')).toBe(
      'midweekPrep:2026-11-02'
    )
    expect(routineEntryId('worship', '2026-11-08')).toBe('worship:2026-11-02')
  })

  it('splits meeting days into midweek and weekend', () => {
    expect(midweekMeetingDay([0, 3])).toBe(3)
    expect(weekendMeetingDay([0, 3])).toBe(0)
    expect(midweekMeetingDay([6])).toBeNull()
  })

  it('shows meeting prep from two days before the meeting through its day', () => {
    expect(habitsOf(todayItems(settings(), [], '2026-11-02'))).toEqual([
      'bibleReading',
      'personalStudy',
      'midweekPrep',
      'worship',
    ])
    expect(habitsOf(todayItems(settings(), [], '2026-11-05'))).not.toContain(
      'midweekPrep'
    )
    expect(habitsOf(todayItems(settings(), [], '2026-11-07'))).toContain(
      'weekendPrep'
    )
  })

  it('shows weekly prep all week when no meeting day is set', () => {
    const items = todayItems(settings({ meetingDays: [] }), [], '2026-11-05')
    expect(habitsOf(items)).toContain('midweekPrep')
    expect(habitsOf(items)).toContain('weekendPrep')
  })

  it('keeps a weekly habit done on its day and hides it later that week', () => {
    const entries = [entry('worship', '2026-11-02')]
    expect(habitsOf(todayItems(settings(), entries, '2026-11-02'))).toContain(
      'worship✓'
    )
    expect(
      habitsOf(todayItems(settings(), entries, '2026-11-03'))
    ).not.toContain('worship')
  })

  it('asks for personal study until the week reaches its goal', () => {
    const entries = [entry('personalStudy', '2026-11-03')]
    expect(
      habitsOf(todayItems(settings(), entries, '2026-11-04'))
    ).not.toContain('personalStudy')
    expect(
      habitsOf(
        todayItems(
          settings({ personalStudyGoal: { kind: 'perWeek', times: 2 } }),
          entries,
          '2026-11-04'
        )
      )
    ).toContain('personalStudy')
    expect(
      habitsOf(
        todayItems(
          settings({ personalStudyGoal: { kind: 'days', days: [2] } }),
          [],
          '2026-11-04'
        )
      )
    ).not.toContain('personalStudy')
  })

  it('is all done once every shown habit is checked', () => {
    const only = settings({ habits: ['bibleReading'] })
    expect(allDone(todayItems(only, [], '2026-11-05'))).toBe(false)
    expect(
      allDone(
        todayItems(only, [entry('bibleReading', '2026-11-05')], '2026-11-05')
      )
    ).toBe(true)
  })

  it('logs back to the start of last week, never ahead', () => {
    expect(canLogOn('2026-10-26', '2026-11-05')).toBe(true)
    expect(canLogOn('2026-10-25', '2026-11-05')).toBe(false)
    expect(canLogOn('2026-11-06', '2026-11-05')).toBe(false)
  })
})

describe('routine coins', () => {
  it('pays each habit since adoption and a finished plan', () => {
    const earned = routineEarned({
      entries: [
        entry('bibleReading', '2026-10-31'),
        entry('bibleReading', '2026-11-01'),
        entry('personalStudy', '2026-11-02'),
        entry('midweekPrep', '2026-11-03'),
        entry('weekendPrep', '2026-11-04'),
        entry('worship', '2026-11-04'),
      ],
      plans: [
        {
          id: 'run',
          kind: 'canonical',
          startedOn: '2025-11-01',
          finishedOn: '2026-11-04',
          updatedAt: 1,
        },
      ],
      adoptedOn: '2026-11-01',
      today: '2026-11-05',
    })
    expect(earned.habits.bibleReading).toBe(1)
    expect(earned.plansFinished).toBe(1)
    expect(routineCoinsOf(earned)).toBe(4 + 4 + 5 + 5 + 5 + 500)
  })
})
