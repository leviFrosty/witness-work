import { refundOn } from '@/features/pet/lib/currency'
import { PRICE_CUT } from '@/features/pet/lib/prices'
import { storedPurchases } from '@/features/pet/lib/unlocks'
import type { PetRecord } from '@/types/pet'

export const untoldPriceDrop = (
  pet: Pick<PetRecord, 'purchases'> | null,
  settled: string | null
): number =>
  !pet || settled === PRICE_CUT ? 0 : refundOn(storedPurchases(pet))
