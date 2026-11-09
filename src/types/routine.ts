export const ROUTINE_HABITS = [
  'bibleReading',
  'personalStudy',
  'midweekPrep',
  'weekendPrep',
  'worship',
] as const
export type RoutineHabit = (typeof ROUTINE_HABITS)[number]

export const WEEKLY_HABITS: readonly RoutineHabit[] = [
  'midweekPrep',
  'weekendPrep',
  'worship',
]

export const isRoutineHabit = (value: unknown): value is RoutineHabit =>
  typeof value === 'string' &&
  (ROUTINE_HABITS as readonly string[]).includes(value)

export const isWeeklyHabit = (habit: RoutineHabit): boolean =>
  WEEKLY_HABITS.includes(habit)

export interface RoutineEntry {
  id: string
  habit: RoutineHabit

  on: string

  run?: string

  portions?: number[]
  updatedAt: number
}

export const READING_PLAN_KINDS = [
  'canonical',
  'chronological',
  'custom',
] as const
export type ReadingPlanKind = (typeof READING_PLAN_KINDS)[number]

export interface ReadingPlanRun {
  id: string
  kind: ReadingPlanKind

  startBook?: number

  chaptersPerDay?: number
  startedOn: string

  finishBy?: string

  finishedOn?: string
  updatedAt: number
}

export type RoutineTombstone = { id: string; deletedAt: number }

export type RoutineSnapshot = {
  routineEntries: RoutineEntry[]
  readingPlans: ReadingPlanRun[]
  deletedRoutineRecords: RoutineTombstone[]
}

export type PersonalStudyGoal =
  | { kind: 'perWeek'; times: number }
  | { kind: 'days'; days: number[] }

export const DEFAULT_PERSONAL_STUDY_GOAL: PersonalStudyGoal = {
  kind: 'perWeek',
  times: 1,
}

export type WorshipKind = 'family' | 'personal'

export const DEFAULT_ROUTINE_HABITS: readonly RoutineHabit[] = ROUTINE_HABITS
