import { Publisher } from '@/types/publisher'

export const DEFAULT_MILESTONES_BY_PUBLISHER: Record<Publisher, number[]> = {
  publisher: [],
  regularAuxiliary: [],
  regularPioneer: [30, 50, 100, 200, 350],
  circuitOverseer: [100, 200, 300, 400, 500],
  specialPioneer: [],
  custom: [],
}

export const getEffectiveMilestones = (
  publisher: Publisher,
  overrides: number[] | null,
  annualGoalHours: number
): number[] => {
  const base =
    overrides !== null ? overrides : DEFAULT_MILESTONES_BY_PUBLISHER[publisher]

  const combined: number[] = []
  for (const v of base) {
    if (typeof v !== 'number' || !isFinite(v)) continue
    combined.push(v)
  }
  if (annualGoalHours > 0) combined.push(annualGoalHours)

  const filtered = combined.filter((v) => v > 0 && v <= annualGoalHours)
  const unique = Array.from(new Set(filtered))
  unique.sort((a, b) => a - b)
  return unique
}

export const getMilestoneHitState = (
  milestones: number[],
  minutesCompleted: number
): {
  hit: number[]
  next: number | null
  totalHit: number
  total: number
} => {
  const hit: number[] = []
  let next: number | null = null
  for (const m of milestones) {
    if (minutesCompleted >= m * 60) {
      hit.push(m)
    } else if (next === null) {
      next = m
    }
  }
  return {
    hit,
    next,
    totalHit: hit.length,
    total: milestones.length,
  }
}

export const milestoneLabelRows = (
  positions: number[],
  minGap: number
): (0 | 1 | null)[] => {
  const last = [-Infinity, -Infinity]
  return positions.map((position) => {
    const row = ([0, 1] as const).find((r) => position - last[r] >= minGap)
    if (row === undefined) return null
    last[row] = position
    return row
  })
}

export const milestoneCelebrationKey = (serviceYear: number): string =>
  String(serviceYear)

export const validateMilestoneValue = (
  value: number,
  annualGoalHours: number
): number => {
  if (!isFinite(value) || value < 0) return 0
  const ceiling = Math.max(0, annualGoalHours - 1)
  if (value > ceiling) return ceiling
  return value
}
