import {
  MIN_INSIGHT_VISITS,
  monthOf,
  parseCellKey,
  type TerritoryTally,
} from '@/features/territories/lib/visitTally'

export type InsightBucket = {
  spoke: number
  notHome: number
  total: number
  rate: number
  weightedSpoke: number
  weightedTotal: number
}

export type InsightSlot = { day: number; hour: number }

export type TerritoryInsights = {
  total: number
  rate: number
  leansOnPast: boolean
  ready: boolean
  remaining: number
  byHour: InsightBucket[]
  byDay: InsightBucket[]
  grid: InsightBucket[][]
  bestDay?: number
  bestHour?: number
  bestSlot?: InsightSlot
  worstDay?: number
  worstHour?: number
  worstSlot?: InsightSlot
  hours: [number, number]
}

export const MIN_BUCKET_VISITS = 5
export const MIN_SLOT_VISITS = 3

const MIN_CHART_HOURS = 8
const DEFAULT_HOURS: [number, number] = [9, 17]

const HALF_LIFE_MONTHS = 6
const SEASON_WEIGHT = 0.6
const SEASON_AFTER_MONTHS = 10
const FLOOR_WEIGHT = 0.2
const RECENT_MONTHS = 3
const LEANS_ON_PAST = 0.25

export function visitWeight(month: number, nowMonth: number): number {
  const age = Math.max(0, nowMonth - month)
  const recency = 0.5 ** (age / HALF_LIFE_MONTHS)
  const apart = Math.abs((month % 12) - (nowMonth % 12))
  const sameSeason = Math.min(apart, 12 - apart) <= 1
  const season = sameSeason && age >= SEASON_AFTER_MONTHS ? SEASON_WEIGHT : 0
  return Math.max(recency, season, FLOOR_WEIGHT)
}

const EMPTY_BUCKET: InsightBucket = {
  spoke: 0,
  notHome: 0,
  total: 0,
  rate: 0,
  weightedSpoke: 0,
  weightedTotal: 0,
}

const add = (
  a: InsightBucket,
  spoke: number,
  notHome: number,
  weight: number
): InsightBucket => {
  const weightedSpoke = a.weightedSpoke + spoke * weight
  const weightedTotal = a.weightedTotal + (spoke + notHome) * weight
  return {
    spoke: a.spoke + spoke,
    notHome: a.notHome + notHome,
    total: a.total + spoke + notHome,
    weightedSpoke,
    weightedTotal,
    rate: weightedTotal > 0 ? weightedSpoke / weightedTotal : 0,
  }
}

const merge = (buckets: InsightBucket[]) =>
  buckets.reduce(
    (sum, b) => ({
      spoke: sum.spoke + b.spoke,
      notHome: sum.notHome + b.notHome,
      total: sum.total + b.total,
      weightedSpoke: sum.weightedSpoke + b.weightedSpoke,
      weightedTotal: sum.weightedTotal + b.weightedTotal,
      rate:
        sum.weightedTotal + b.weightedTotal > 0
          ? (sum.weightedSpoke + b.weightedSpoke) /
            (sum.weightedTotal + b.weightedTotal)
          : 0,
    }),
    EMPTY_BUCKET
  )

function pickIndex(
  buckets: readonly InsightBucket[],
  min: number,
  better: (a: InsightBucket, b: InsightBucket) => boolean
): number | undefined {
  let pick: number | undefined
  buckets.forEach((b, index) => {
    if (b.total < min) return
    if (pick === undefined || better(b, buckets[pick])) pick = index
  })
  return pick
}

export const bestIndex = (buckets: readonly InsightBucket[], min: number) =>
  pickIndex(
    buckets,
    min,
    (a, b) => a.rate > b.rate || (a.rate === b.rate && a.total > b.total)
  )

export const worstIndex = (buckets: readonly InsightBucket[], min: number) =>
  pickIndex(
    buckets,
    min,
    (a, b) => a.rate < b.rate || (a.rate === b.rate && a.total > b.total)
  )

const unlessSame = (
  worst: number | undefined,
  best: number | undefined,
  buckets: readonly InsightBucket[]
) =>
  worst !== undefined &&
  best !== undefined &&
  worst !== best &&
  buckets[worst].rate < buckets[best].rate
    ? worst
    : undefined

export function chartHours(byHour: readonly InsightBucket[]): [number, number] {
  const used = byHour.flatMap((b, hour) => (b.total > 0 ? [hour] : []))
  if (used.length === 0) return DEFAULT_HOURS
  let first = Math.min(...used)
  let last = Math.max(...used)
  while (last - first + 1 < MIN_CHART_HOURS) {
    if (first > 0) first -= 1
    if (last - first + 1 < MIN_CHART_HOURS && last < 23) last += 1
  }
  return [first, last]
}

export function territoryInsights(
  tallies: readonly Pick<TerritoryTally, 'cells'>[],
  { now, min = MIN_INSIGHT_VISITS }: { now: number; min?: number }
): TerritoryInsights {
  const nowMonth = monthOf(now)
  const grid = Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, () => EMPTY_BUCKET)
  )
  let recent = 0
  for (const tally of tallies)
    for (const [key, [spoke, notHome]] of Object.entries(tally.cells)) {
      const cell = parseCellKey(key)
      if (!cell) continue
      grid[cell.day][cell.hour] = add(
        grid[cell.day][cell.hour],
        spoke,
        notHome,
        visitWeight(cell.month, nowMonth)
      )
      if (nowMonth - cell.month < RECENT_MONTHS) recent += spoke + notHome
    }
  const byDay = grid.map(merge)
  const byHour = Array.from({ length: 24 }, (_, hour) =>
    merge(grid.map((row) => row[hour]))
  )
  const all = merge(byDay)
  const total = all.total

  const slots = grid.flatMap((row, day) =>
    row.map((_, hour): InsightSlot => ({ day, hour }))
  )
  const slotBuckets = slots.map(({ day, hour }) => grid[day][hour])
  const bestSlotIndex = bestIndex(slotBuckets, MIN_SLOT_VISITS)
  const worstSlotIndex = unlessSame(
    worstIndex(slotBuckets, MIN_SLOT_VISITS),
    bestSlotIndex,
    slotBuckets
  )
  const bestDay = bestIndex(byDay, MIN_BUCKET_VISITS)
  const bestHour = bestIndex(byHour, MIN_BUCKET_VISITS)

  return {
    total,
    rate: all.rate,
    leansOnPast: total > 0 && recent / total < LEANS_ON_PAST,
    ready: total >= min,
    remaining: Math.max(0, min - total),
    byHour,
    byDay,
    grid,
    bestDay,
    bestHour,
    bestSlot: bestSlotIndex === undefined ? undefined : slots[bestSlotIndex],
    worstDay: unlessSame(worstIndex(byDay, MIN_BUCKET_VISITS), bestDay, byDay),
    worstHour: unlessSame(
      worstIndex(byHour, MIN_BUCKET_VISITS),
      bestHour,
      byHour
    ),
    worstSlot: worstSlotIndex === undefined ? undefined : slots[worstSlotIndex],
    hours: chartHours(byHour),
  }
}

export const slotLift = (
  bucket: InsightBucket | undefined,
  average: number
): number | undefined =>
  bucket && bucket.total >= MIN_SLOT_VISITS ? bucket.rate - average : undefined

const MIN_LIFT_SCALE = 0.1

export type LiftScale = { above: number; below: number }

export function liftScale(
  grid: readonly InsightBucket[][],
  average: number
): LiftScale {
  const scale = { above: MIN_LIFT_SCALE, below: MIN_LIFT_SCALE }
  for (const row of grid)
    for (const bucket of row) {
      const lift = slotLift(bucket, average)
      if (lift === undefined) continue
      if (lift > 0) scale.above = Math.max(scale.above, lift)
      else scale.below = Math.max(scale.below, -lift)
    }
  return scale
}

const LIFT_CURVE = 1.8

export const liftIntensity = (lift: number, scale: LiftScale) =>
  Math.min(1, Math.abs(lift) / (lift < 0 ? scale.below : scale.above)) **
  LIFT_CURVE
