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
  note?: string
}
