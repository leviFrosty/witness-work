import moment from 'moment'
import type {
  ContextMenuAction,
  ContextMenuSubmenu,
} from '@/components/ui/ContextMenu.types'
import type { TimeEntriesByYear } from '@/types/timeEntry'
import { formatDisplay } from '@/lib/dates'

const RECENT_MONTH_COUNT = 12

export type ReportMonth = { month: number; year: number }

export const reportMonthId = ({ month, year }: ReportMonth): string =>
  moment({ year, month }).format('YYYY-MM')

export const parseReportMonthId = (id: string): ReportMonth => {
  const m = moment(id, 'YYYY-MM')
  return { month: m.month(), year: m.year() }
}

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

export const buildReportMonthMenu = ({
  now,
  earliest,
  selected,
  onSelect,
}: {
  now: Date
  earliest: ReportMonth | null
  selected: ReportMonth
  onSelect: (month: ReportMonth) => void
}): [ContextMenuAction[], ContextMenuSubmenu[]] => {
  const selectedId = reportMonthId(selected)
  const action = (m: moment.Moment, format: string): ContextMenuAction => {
    const id = m.format('YYYY-MM')
    return {
      id,
      title: formatDisplay(m, format),
      checked: id === selectedId,
      onPress: () => onSelect(parseReportMonthId(id)),
    }
  }

  const current = moment(now).startOf('month')
  const recent: ContextMenuAction[] = []
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

  const olderByYear = new Map<number, ContextMenuAction[]>()
  for (
    const m = moment(oldestRecent).subtract(1, 'month');
    !m.isBefore(floor);
    m.subtract(1, 'month')
  ) {
    const months = olderByYear.get(m.year()) ?? []
    months.push(action(m, 'MMMM'))
    olderByYear.set(m.year(), months)
  }

  const older = [...olderByYear].map(
    ([year, actions]): ContextMenuSubmenu => ({
      id: `year-${year}`,
      title: String(year),
      actions,
    })
  )

  return [recent, older]
}
