import { StalenessBreakpoints } from '@/types/staleness'

/** Mirrors the historical hardcoded thresholds: one week / one month. */
export const DEFAULT_STALENESS_BREAKPOINTS: StalenessBreakpoints = {
  weekDays: 7,
  monthDays: 30,
}

export const MIN_STALENESS_DAYS = 1

/**
 * The stale threshold must sit at least this far above the recent threshold —
 * otherwise the middle bucket collapses and the three time-based colors stop
 * being distinguishable.
 */
export const MIN_STALENESS_GAP_DAYS = 2

const clampDays = (value: unknown, fallback: number): number => {
  const n =
    typeof value === 'number' && Number.isFinite(value)
      ? Math.round(value)
      : fallback
  return Math.max(MIN_STALENESS_DAYS, n)
}

/**
 * Clamps persisted breakpoints into a sane, ordered shape. Persisted values can
 * arrive malformed (older snapshots applied via iCloud sync, hand-edited
 * backups) or momentarily inverted while the user is typing in settings, and
 * the staleness classifiers assume `monthDays >= weekDays +
 * MIN_STALENESS_GAP_DAYS` — so every consumer reads through this instead of
 * trusting the raw preference. There is deliberately no upper bound.
 */
export function normalizeStalenessBreakpoints(
  breakpoints: Partial<StalenessBreakpoints> | undefined
): StalenessBreakpoints {
  const weekDays = clampDays(
    breakpoints?.weekDays,
    DEFAULT_STALENESS_BREAKPOINTS.weekDays
  )
  const monthDays = clampDays(
    breakpoints?.monthDays,
    DEFAULT_STALENESS_BREAKPOINTS.monthDays
  )
  return {
    weekDays,
    monthDays: Math.max(monthDays, weekDays + MIN_STALENESS_GAP_DAYS),
  }
}
