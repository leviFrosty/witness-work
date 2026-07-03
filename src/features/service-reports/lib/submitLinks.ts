import links from '@/constants/links'

export type NwPublisherReport = {
  sharedInMinistry: boolean
  /** Whole or decimal hours of standard time (excludes credit). */
  hours?: number
  /** Whole-hour credit time. */
  credit?: number
  bibleStudies?: number | null
  remarks?: string
}

/**
 * Builds the NW Publisher universal link, per NW Publisher support:
 *
 * https://nwpublisher.com/report/sharedInMinistry=true:hours=50:bibleStudies=8:credit=17:remarks=bethel+work
 *
 * - Colon-delimited `key=value` pairs; keys are case-sensitive.
 * - Every variable is optional; omit rather than sending 0.
 * - `remarks` uses `+` for spaces and cannot contain colons (the delimiter).
 * - NW Publisher only accepts the previous month's report — callers gate on that;
 *   the link itself carries no month.
 */
export const buildNwPublisherLink = (report: NwPublisherReport): string => {
  const parts = [`sharedInMinistry=${report.sharedInMinistry}`]

  if (report.hours) {
    parts.push(`hours=${report.hours}`)
  }
  if (report.bibleStudies) {
    parts.push(`bibleStudies=${report.bibleStudies}`)
  }
  if (report.credit) {
    parts.push(`credit=${report.credit}`)
  }
  if (report.remarks) {
    const remarks = encodeURI(report.remarks.replaceAll(':', '-'))
      .replaceAll('%20', '+')
      .replaceAll('%0A', '+')
    parts.push(`remarks=${remarks}`)
  }

  return `${links.nwpublisherSubmitReport}${parts.join(':')}`
}

export type HourglassReport = {
  /** 1-indexed month (January = 1), unlike JS/moment's 0-indexed months. */
  month: number
  year: number
  /**
   * Total ministry minutes. Checkbox-mode publishers send 1 to indicate sharing
   * in the ministry.
   */
  minutes: number
  studies?: number | null
  remarks?: string
}

/**
 * Builds the Hourglass universal link, per Hourglass support:
 *
 * https://app.hourglass-app.com/report/submit?month=8&year=2026&minutes=3000
 *
 * - `month`, `year`, `minutes` are required query params.
 * - `studies` and `remarks` are optional; omitted when empty.
 */
export const buildHourglassLink = (report: HourglassReport): string => {
  const params = [
    `month=${report.month}`,
    `year=${report.year}`,
    `minutes=${report.minutes}`,
  ]

  if (report.studies) {
    params.push(`studies=${report.studies}`)
  }
  if (report.remarks) {
    params.push(`remarks=${encodeURIComponent(report.remarks)}`)
  }

  return `${links.hourglassBase}${params.join('&')}`
}
