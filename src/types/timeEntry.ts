import type { RichText } from '@/types/richText'

export type TimeEntry = {
  id: string
  hours: number
  minutes: number
  date: Date

  categoryId?: string

  tag?: string

  credit?: boolean

  rollover?: boolean

  rolloverGroupId?: string

  note?: string

  noteDoc?: RichText

  updatedAt?: number
}

export type LegacyTimeEntry = TimeEntry & {
  ldc?: boolean
}

export type TimeEntryTombstone = {
  id: string
  deletedAt: number

  importUndone?: true
}

export type PlanTombstone = {
  id: string
  deletedAt: number
}

export type TimeEntriesByMonth = {
  [month: string]: TimeEntry[]
}

export type TimeEntriesByYear = {
  [year: string]: TimeEntriesByMonth
}

export type MinuteDisplayFormat = 'short' | 'decimal'

export type PlanLocation = {
  name?: string
  address?: string
  latitude?: number
  longitude?: number
}

export type BuddyShareRef = {
  from: string
  shareId: string
}

export type LinkedShare = BuddyShareRef & {
  rev?: number

  ownMinutes?: true
}

export type DayPlan = {
  id: string
  date: Date
  minutes: number

  categoryId?: string

  startTimeInMinutes?: number

  anytime?: boolean

  title?: string
  location?: PlanLocation
  note?: string

  noteDoc?: RichText

  buddies?: string[]

  buddyShare?: LinkedShare

  notifyMe?: boolean

  notifications?: import('@/types/visit').Notification[]

  reminderOffsetMinutes?: number

  source?: 'manual' | 'recommendation'

  savedOn?: string

  updatedAt?: number
}

export enum RecurringPlanFrequencies {
  WEEKLY = 0,
  BI_WEEKLY = 1,
  MONTHLY = 2,
  MONTHLY_BY_WEEKDAY = 3,
}

export type MonthlyByWeekdayConfig = {
  weekday: number
  weekOfMonth: number
}

export type RecurringPlanOverride = {
  date: Date
  minutes: number

  startTimeInMinutes?: number

  anytime?: boolean
  note?: string

  noteDoc?: RichText
}

export type RecurringPlan = {
  id: string
  startDate: Date
  minutes: number

  categoryId?: string

  startTimeInMinutes?: number

  anytime?: boolean

  title?: string
  location?: PlanLocation
  recurrence: {
    frequency: RecurringPlanFrequencies
    interval: number
    endDate: Date | null

    monthlyByWeekdayConfig?: MonthlyByWeekdayConfig
  }
  note?: string

  noteDoc?: RichText
  deletedDates?: Date[]
  overrides?: RecurringPlanOverride[]

  notifyMe?: boolean

  reminderOffsetMinutes?: number

  savedOn?: string

  updatedAt?: number
}

export type PlanListItem =
  | { type: 'day'; date: Date; plan: DayPlan }
  | { type: 'recurring'; date: Date; plan: RecurringPlan }
