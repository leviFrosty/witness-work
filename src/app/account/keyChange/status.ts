import { create } from 'zustand'
import type { KeyChangeStage } from '@/lib/accountKey/keyChangeRecord'

/**
 * Where this device's account key change is, for the screens: the stage its
 * record is at, or null when there's none. Fed by the engine (`index.ts`).
 */
export const useKeyChangeStatus = create<{ stage: KeyChangeStage | null }>(
  () => ({ stage: null })
)
