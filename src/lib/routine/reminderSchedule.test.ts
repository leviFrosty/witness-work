import { describe, expect, it } from 'vitest'
import { routineEntryId } from '@/lib/routine/habits'
import {
  routineReminderDates,
  routineReminderSources,
  type RoutineReminderPreferences,
} from '@/lib/routine/reminderSchedule'
import { buildReminderSchedule } from '@/lib/reminderSchedule'
import { ROUTINE_HABITS, type RoutineEntry } from '@/types/routine'

const prefs = (
  patch: Partial<RoutineReminderPreferences> = {}
): RoutineReminderPreferences => ({
  routineEnabled: true,
  routineReminders: true,
  routineReminderTime: 19 * 60,
  routineHabits: ['bibleReading'],
  meetingDays: [3, 0],
  personalStudyGoal: { kind: 'perWeek', times: 1 },
  worshipDay: null,
  ...patch,
})

const read = (on: string): RoutineEntry => ({
  id: routineEntryId('bibleReading', on),
  habit: 'bibleReading',
  on,
  updatedAt: 1,
})

const NOW = new Date(2026, 10, 5, 9).getTime()

describe('routine reminders', () => {
  it('stays off unless Routine and its reminder are both on', () => {
    expect(routineReminderSources([], prefs({ routineEnabled: false }))).toBe(
      undefined
    )
    expect(
      routineReminderSources([], prefs({ routineEnabled: undefined }))
    ).toBe(undefined)
    expect(routineReminderSources([], prefs({ routineReminders: false }))).toBe(
      undefined
    )
    expect(routineReminderSources([], prefs({ routineHabits: [] }))).toBe(
      undefined
    )
  })

  it('reminds each day at the chosen time with what is still open', () => {
    const sources = routineReminderSources([], prefs())!
    const dates = routineReminderDates(sources, NOW)
    expect(dates).toHaveLength(7)
    expect(dates[0]).toEqual({
      date: new Date(2026, 10, 5, 19, 0),
      day: '2026-11-05',
      habits: ['bibleReading'],
    })
  })

  it('skips a day once everything is done', () => {
    const sources = routineReminderSources([read('2026-11-05')], prefs())!
    const days = routineReminderDates(sources, NOW).map(({ day }) => day)
    expect(days).not.toContain('2026-11-05')
    expect(days).toContain('2026-11-06')
  })

  it('lists only the open habits in the scheduled notification', () => {
    const schedule = buildReminderSchedule({
      contacts: [],
      visits: [],
      plans: [],
      visitOffset: { amount: 1, unit: 'hours' },
      planOffset: { amount: 1, unit: 'hours' },
      routine: {
        ...routineReminderSources(
          [read('2026-11-05')],
          prefs({ routineHabits: [...ROUTINE_HABITS] })
        )!,
        worshipKind: 'personal',
      },
      now: NOW,
    })
    const today = schedule.find((reminder) => reminder.day === '2026-11-05')
    expect(today).toMatchObject({
      id: 'witness-work-routine-2026-11-05',
      kind: 'routine',
      worshipKind: 'personal',
    })
    expect(today?.habits).not.toContain('bibleReading')
    expect(today?.habits).toContain('personalStudy')
  })
})
