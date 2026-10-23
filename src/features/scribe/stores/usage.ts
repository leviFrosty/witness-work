import { create } from 'zustand'
import { createJSONStorage } from 'zustand/middleware'
import { keepPersistedState, persist } from '@/stores/persist'
import { MmkvStorage } from '@/stores/mmkv'
import type { UsageSnapshotWire } from '@/features/scribe/lib/wire'

interface ScribeUsageStoreState {
  /** The newest snapshot by `asOf`, from any response that carried one. */
  snapshot: UsageSnapshotWire | null
  /** In memory: a `GET /usage` is running. */
  loading: boolean
  /** In memory: the last `GET /usage` failed. */
  failed: boolean
  /** In memory: when `GET /usage` last started. */
  fetchedAt: number
}

/**
 * The account's latest usage snapshot. Every `done.meter`, transcribe `usage`
 * and `limit_reached` body lands here; the newest `asOf` wins. Only the
 * snapshot is saved (device-only MMKV), so the screens have something to show
 * before the first read of a launch.
 */
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

/** Keeps `snapshot` if it's newer than what's stored. */
export function noteUsage(snapshot: UsageSnapshotWire | null): void {
  if (!snapshot) return
  const current = useScribeUsageStore.getState().snapshot
  if (current && current.asOf > snapshot.asOf) return
  useScribeUsageStore.setState({ snapshot })
}
