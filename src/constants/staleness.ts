import { StalenessBreakpoints } from '@/types/staleness'

export const DEFAULT_STALENESS_BREAKPOINTS: StalenessBreakpoints = {
  weekDays: 7,
  monthDays: 30,
}

export const MIN_STALENESS_DAYS = 1

export const MIN_STALENESS_GAP_DAYS = 2

const clampDays = (value: unknown, fallback: number): number => {
  const n =
    typeof value === 'number' && Number.isFinite(value)
      ? Math.round(value)
      : fallback
  return Math.max(MIN_STALENESS_DAYS, n)
}

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
