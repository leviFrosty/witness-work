/**
 * A single logged session of field-ministry time on a given date (hours and
 * minutes, optional category, optional note, optional credit flag). The
 * granular record the user adds, edits, or deletes.
 *
 * Distinct from the monthly "Service Report" aggregate — that is derived from a
 * collection of `TimeEntry` records and is not stored directly. See
 * `CONTEXT.md` glossary.
 */
export type TimeEntry = {
  id: string
  hours: number
  minutes: number
  date: Date
  /**
   * Reference to a user-defined `Category` record (`types/category.ts`). When
   * set, the entry counts as that category and inherits its `isCredit`
   * attribute. Replaces the legacy `tag: string` field — all writers must use
   * `categoryId` going forward.
   *
   * The LDC builtin Category (`LDC_BUILTIN_CATEGORY_ID`) is what legacy `ldc:
   * true` entries get rewritten to during the LDC collapse migration. After
   * that migration there is no longer a separate "LDC" boolean — LDC is just a
   * credit-bearing Category like Bethel or Hospital.
   */
  categoryId?: string
  /**
   * Legacy free-text category name. Retained on the type so the one-time
   * migration in `src/lib/categories.ts` can read it from persisted state; new
   * code must not write to this field. Dropped by the migration on first run.
   *
   * @deprecated Use `categoryId` and look up the Category record instead.
   */
  tag?: string
  /**
   * Per-entry credit flag. Historically authoritative; now derived from the
   * referenced `Category.isCredit` once `categoryId` is set. Still written by
   * the LDC path and read by legacy/unmigrated entries during the transition
   * window. Readers should prefer `Category.isCredit` when `categoryId` is
   * present.
   */
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
  /** Optional note for the entry. */
  note?: string
  /**
   * Epoch ms of the most recent change on this record. Populated by store
   * actions for iCloud merge. Optional for historical records that predate sync
   * — backfilled lazily.
   */
  updatedAt?: number
}

/**
 * Pre-LDC-collapse TimeEntry shape. The canonical `TimeEntry` no longer carries
 * the `ldc` boolean — LDC is now a builtin Category (see
 * `src/constants/categories.ts`). This type is used by migration code that
 * needs to read persisted state from before the collapse ran. Keep this narrow:
 * nothing in the runtime should consume `ldc` outside the migration step + the
 * iCloud field-rename shim.
 *
 * @deprecated For migration/sync-renames only. Do not write new code that reads
 *   the `ldc` field.
 */
export type LegacyTimeEntry = TimeEntry & {
  ldc?: boolean
}

/**
 * Tombstone written when a time entry is deleted so it propagates across
 * devices.
 */
export type TimeEntryTombstone = {
  id: string
  deletedAt: number
}

/** 0-indexed month key, 0-11 */
export type TimeEntriesByMonth = {
  [month: string]: TimeEntry[]
}

/** Time entries grouped by year (January–December months underneath). */
export type TimeEntriesByYear = {
  [year: string]: TimeEntriesByMonth
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
   * Reference to a user-defined `Category` record (`types/category.ts`) —
   * surfaced in the UI as the Plan's "Type". Unlike Time Entries, Plans carry
   * no stamped `credit` boolean: the Category is the single source of truth for
   * whether the planned minutes forecast as Credit Time, derived at read time
   * (`isPlanCreditTime`). Absent or dangling (Category deleted) → forecasts
   * Standard. See ADR 0005.
   */
  categoryId?: string
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
  notifications?: import('@/types/visit').Notification[]
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
   * Reference to a user-defined `Category` record — the pattern's "Type".
   * Pattern-level only: `RecurringPlanOverride` cannot change it (skip the
   * instance and create a Day Plan instead). Same derive-at-read-time semantics
   * as `DayPlan.categoryId`. See ADR 0005.
   */
  categoryId?: string
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
