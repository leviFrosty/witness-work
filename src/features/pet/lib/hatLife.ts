import type { PetPurchase } from '@/types/pet'

const FIG_ITEM = 'hat:fig'

export const FIG_STAGE_DAYS = [0, 3, 8, 16, 30, 50] as const

export function figStageOf(daysOut: number): number {
  let stage = 0
  FIG_STAGE_DAYS.forEach((days, i) => {
    if (daysOut >= days) stage = i
  })
  return stage
}

export function figGrowth(
  purchases: readonly PetPurchase[],
  days: ReadonlySet<string>
): number | undefined {
  const bought = purchases.find((purchase) => purchase.item === FIG_ITEM)
  if (!bought) return undefined
  let since = 0
  for (const day of days) if (day >= bought.on) since++
  return figStageOf(since)
}
