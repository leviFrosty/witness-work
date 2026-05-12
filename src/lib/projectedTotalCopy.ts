import moment from 'moment'
import type {
  ProjectedTotalScope,
  ProjectedTotalState,
} from '@/lib/projectedTotal'

export type PeriodTense = 'past' | 'present' | 'future'

const STATE_BY_TENSE: Record<PeriodTense, ReadonlySet<ProjectedTotalState>> = {
  past: new Set<ProjectedTotalState>([
    'empty',
    'logged_over_goal',
    'unreachable_gap',
  ]),
  present: new Set<ProjectedTotalState>([
    'empty',
    'logged_over_goal',
    'projected_over_goal',
    'reachable_gap',
    'unreachable_gap',
  ]),
  future: new Set<ProjectedTotalState>([
    'empty',
    'projected_over_goal',
    'reachable_gap',
    'unreachable_gap',
  ]),
}

export const getStatusKey = (
  state: ProjectedTotalState,
  tense: PeriodTense
): string => {
  const tenseToUse = STATE_BY_TENSE[tense].has(state) ? tense : 'present'
  return `projectedTotal.status.${tenseToUse}.${state}`
}

export type MarkupSegment = { text: string; bold: boolean }

export const segmentBoldMarkup = (input: string): MarkupSegment[] => {
  const segments: MarkupSegment[] = []
  const re = /\*\*(.+?)\*\*/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = re.exec(input)) !== null) {
    if (match.index > lastIndex) {
      segments.push({
        text: input.slice(lastIndex, match.index),
        bold: false,
      })
    }
    segments.push({ text: match[1], bold: true })
    lastIndex = re.lastIndex
  }
  if (lastIndex < input.length) {
    segments.push({ text: input.slice(lastIndex), bold: false })
  }
  return segments
}

const periodBounds = (
  scope: ProjectedTotalScope
): { start: moment.Moment; end: moment.Moment } => {
  if (scope.kind === 'month') {
    const m = moment.utc({ year: scope.year, month: scope.month, day: 1 })
    return { start: m.clone().startOf('month'), end: m.clone().endOf('month') }
  }
  const start = moment.utc({ year: scope.serviceYear, month: 8, day: 1 })
  const end = moment
    .utc({ year: scope.serviceYear + 1, month: 7, day: 1 })
    .endOf('month')
  return { start, end }
}

export const getPeriodTense = (
  scope: ProjectedTotalScope,
  today: Date
): PeriodTense => {
  const { start, end } = periodBounds(scope)
  const t = moment.utc(today)
  if (t.isBefore(start, 'day')) return 'future'
  if (t.isAfter(end, 'day')) return 'past'
  return 'present'
}
