import { create } from 'zustand'
import { createJSONStorage } from 'zustand/middleware'
import { keepPersistedState, persist } from '@/stores/persist'
import { MmkvStorage } from '@/stores/mmkv'
import type { UsageSnapshotWire } from '@/features/scribe/lib/wire'

interface ScribeUsageStoreState {
  snapshot: UsageSnapshotWire | null

  loading: boolean

  failed: boolean

  fetchedAt: number
}

export const useScribeUsageStore = create<ScribeUsageStoreState>()(
  persist<
    ScribeUsageStoreState,
    [],
    [],
    Pick<ScribeUsageStoreState, 'snapshot'>
  >(() => ({ snapshot: null, loading: false, failed: false, fetchedAt: 0 }), {
    name: 'scribe-usage',
    version: 1,
    migrate: keepPersistedState,
    storage: createJSONStorage(() => MmkvStorage),
    partialize: (state) => ({ snapshot: state.snapshot }),
  })
)

export function noteUsage(snapshot: UsageSnapshotWire | null): void {
  if (!snapshot) return
  const current = useScribeUsageStore.getState().snapshot
  if (current && current.asOf > snapshot.asOf) return
  useScribeUsageStore.setState({ snapshot })
}
