import moment from 'moment'
import type { MenuAction } from '@react-native-menu/menu'
import type { TimeEntriesByYear } from '@/types/timeEntry'

/** Months listed flat at the top of the menu, newest first. */
const RECENT_MONTH_COUNT = 12

export type ReportMonth = { month: number; year: number }

/** `YYYY-MM` menu id; `month` is 0-indexed like Moment. */
export const reportMonthId = ({ month, year }: ReportMonth): string =>
  moment({ year, month }).format('YYYY-MM')

export const parseReportMonthId = (id: string): ReportMonth => {
  const m = moment(id, 'YYYY-MM')
  return { month: m.month(), year: m.year() }
}

/** Oldest month holding at least one Time Entry, or null when there are none. */
export const getEarliestReportMonth = (
  serviceReports: TimeEntriesByYear
): ReportMonth | null => {
  let earliest: ReportMonth | null = null
  for (const [yearKey, months] of Object.entries(serviceReports)) {
    for (const [monthKey, entries] of Object.entries(months)) {
      if (!entries?.length) continue
      const candidate = { year: Number(yearKey), month: Number(monthKey) }
      if (
        !earliest ||
        candidate.year < earliest.year ||
        (candidate.year === earliest.year && candidate.month < earliest.month)
      ) {
        earliest = candidate
      }
    }
  }
  return earliest
}

/**
 * Native menu for jumping the report screen to any month. The last 12 months
 * are listed flat (the common case); anything older, back to the earliest month
 * with Time Entries or the selected month, nests under a submenu per year so
 * the menu stays short.
 */
export const buildReportMonthMenu = ({
  now,
  earliest,
  selected,
}: {
  now: Date
  earliest: ReportMonth | null
  selected: ReportMonth
}): MenuAction[] => {
  const selectedId = reportMonthId(selected)
  const action = (m: moment.Moment, format: string): MenuAction => {
    const id = m.format('YYYY-MM')
    return {
      id,
      title: m.format(format),
      state: id === selectedId ? 'on' : 'off',
    }
  }

  const current = moment(now).startOf('month')
  const recent: MenuAction[] = []
  for (let i = 0; i < RECENT_MONTH_COUNT; i++) {
    recent.push(action(moment(current).subtract(i, 'months'), 'MMMM YYYY'))
  }

  const oldestRecent = moment(current).subtract(
    RECENT_MONTH_COUNT - 1,
    'months'
  )
  const floor = [earliest, selected]
    .filter((m): m is ReportMonth => m !== null)
    .map((m) => moment({ year: m.year, month: m.month }))
    .reduce((a, b) => (a.isBefore(b) ? a : b), oldestRecent)

  const olderByYear = new Map<number, MenuAction[]>()
  for (
    const m = moment(oldestRecent).subtract(1, 'month');
    !m.isBefore(floor);
    m.subtract(1, 'month')
  ) {
    const months = olderByYear.get(m.year()) ?? []
    months.push(action(m, 'MMMM'))
    olderByYear.set(m.year(), months)
  }

  const older: MenuAction[] = [...olderByYear].map(([year, subactions]) => ({
    id: `year-${year}`,
    title: String(year),
    state: subactions.some((a) => a.state === 'on') ? 'on' : 'off',
    subactions,
  }))

  return older.length
    ? [
        ...recent,
        { id: 'older', title: '', displayInline: true, subactions: older },
      ]
    : recent
}
