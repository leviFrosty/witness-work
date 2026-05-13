export type ServiceReport = {
  id: string
  hours: number
  minutes: number
  date: Date
  ldc?: boolean
  /** User input tag, solely for the purpose of displaying on the UI. */
  tag?: string
  /** Used to denote the current tag is credit time, similar to LDC. */
  credit?: boolean
  /**
   * True when the entry was created by the Time Rollover system to move
   * fractional minutes between months toward an annual goal. Pairs of these
   * entries cancel out across month boundaries.
   */
  rollover?: boolean
  /**
   * Shared id linking the two halves of a rollover (the negative entry on the
   * source month's last day and the positive entry on the destination month's
   * first day). Used to delete the pair atomically and keep the math balanced.
   */
  rolloverGroupId?: string
  /** Optional note for the service report. */
  note?: string
  /**
   * Epoch ms of the most recent change on this record. Populated by store
   * actions for iCloud merge. Optional for historical records that predate sync
   * — backfilled lazily.
   */
  updatedAt?: number
}

/**
 * Tombstone written when a service report is deleted so it propagates across
 * devices.
 */
export type ServiceReportTombstone = {
  id: string
  deletedAt: number
}

/** 0-indexed month key, 0-11 */
export type ServiceYear = {
  [month: string]: ServiceReport[]
}

/** Service reports, where each key is a year (january-december) */
export type ServiceReportsByYears = {
  [year: string]: ServiceYear
}

/**
 * Choose how to display formatted minutes.
 *
 * @short 13 Hrs 30 Mins
 * @decimal 13.5
 */
export type MinuteDisplayFormat = 'short' | 'decimal'

export type DayPlan = {
  id: string
  date: Date
  minutes: number
  /**
   * Local-wall-clock start time as minutes since midnight (0–1439). Independent
   * of timezone — `date` carries the calendar day, this carries the time. When
   * undefined, treat as noon (720) via `getStartTimeInMinutes`.
   */
  startTimeInMinutes?: number
  note?: string
  /**
   * Whether the user opted this plan into a local notification. Defaults false;
   * the global preference `planAlwaysNotify` flips the default for newly
   * created plans.
   */
  notifyMe?: boolean
  /**
   * Scheduled local notifications for this plan. IDs are device-local — they
   * are still synced via iCloud last-writer-wins, but consumers must treat
   * remote IDs as opaque (they cannot be cancelled from another device).
   */
  notifications?: import('@/types/conversation').Notification[]
  /**
   * Origin of this plan. `'recommendation'` is stamped by the Assistant when
   * the engine inserts plans on the user's behalf; treated as `'manual'` when
   * unset, including for all plans that predate this field.
   */
  source?: 'manual' | 'recommendation'
  /** Epoch ms of the most recent change. Used for iCloud merge. */
  updatedAt?: number
}

export enum RecurringPlanFrequencies {
  WEEKLY,
  BI_WEEKLY,
  MONTHLY,
  MONTHLY_BY_WEEKDAY,
}

// For monthly by weekday patterns (e.g., "first Monday of the month")
export type MonthlyByWeekdayConfig = {
  weekday: number // 0-6 (Sunday-Saturday)
  weekOfMonth: number // 1-4 for first, second, third, fourth week, or -1 for last week
}

export type RecurringPlanOverride = {
  date: Date
  minutes: number
  /**
   * When set, overrides the parent recurring plan's start time for this
   * instance. Undefined means inherit from the parent plan.
   */
  startTimeInMinutes?: number
  note?: string
}

export type RecurringPlan = {
  id: string
  startDate: Date
  minutes: number
  /**
   * Local-wall-clock start time as minutes since midnight (0–1439). Applies to
   * every instance unless an override sets its own. When undefined, treat as
   * noon (720) via `getStartTimeInMinutes`.
   */
  startTimeInMinutes?: number
  recurrence: {
    frequency: RecurringPlanFrequencies
    interval: number
    endDate: Date | null
    // For MONTHLY_BY_WEEKDAY frequency only
    monthlyByWeekdayConfig?: MonthlyByWeekdayConfig
  }
  note?: string
  deletedDates?: Date[]
  overrides?: RecurringPlanOverride[]
  /** Epoch ms of the most recent change. Used for iCloud merge. */
  updatedAt?: number
}
