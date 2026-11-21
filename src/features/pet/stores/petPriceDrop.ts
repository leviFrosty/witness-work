import { create } from 'zustand'
import { createJSONStorage } from 'zustand/middleware'
import { keepPersistedState, persist } from '@/stores/persist'
import { MmkvStorage } from '@/stores/mmkv'

type PetPriceDropState = {
  settled: string | null
}

export const usePetPriceDrop = create<PetPriceDropState>()(
  persist((): PetPriceDropState => ({ settled: null }), {
    name: 'petPriceDrop',
    version: 1,
    migrate: keepPersistedState,
    storage: createJSONStorage(() => MmkvStorage),
  })
)

export const settlePriceDrop = (cut: string) =>
  usePetPriceDrop.setState({ settled: cut })
